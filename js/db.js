/* =====================================================================
   MTX GROUP — Offline database layer (IndexedDB)

   A tiny promise-based wrapper. All business data is stored 100% locally
   so the POS keeps working with no internet connection.

   MULTI-STORE: the database NAME comes from the active tenant, so Melora
   and Bangeen Crystal each get a physically separate database
   (mtx_melora / mtx_bangeen). Nothing is shared — not products, not
   sales, not staff accounts, not settings. Switching store calls close()
   and the next query opens the other database.

   SYNC (optional): when a server is configured (see js/sync.js), every
   local write is also recorded in the `_outbox` store so it can be pushed
   to the server, and `_syncmeta` holds per-store sync cursors and the
   offline-login PIN cache. With no server configured these two stores
   stay empty and nothing else changes — the app is exactly as offline as
   it always was.
   ===================================================================== */
const DB = (() => {
  const VERSION = 2;
  /* Business data — the only stores that get exported, wiped or restored. */
  const STORES = [
    'products', 'categories', 'sales', 'customers', 'suppliers',
    'expenses', 'stockMoves', 'users', 'purchases', 'payments', 'settings', 'logs'
  ];
  /* Sync bookkeeping — never exported, never part of a backup or reset. */
  const SYNC_STORES = ['_outbox', '_syncmeta'];

  let _db = null;
  let _name = null;

  /* serverTime − Date.now() at the last contact, so every write is stamped
     with a clock all terminals agree on. Set by js/sync.js. */
  let _skew = 0;

  const syncEnabled = () => {
    try { return !!(window.Sync && window.Sync.configured && window.Sync.configured()); }
    catch (e) { return false; }
  };
  const pkOf = (store, val) => (store === 'settings' ? val && val.key : val && val.id);

  function open() {
    return new Promise((resolve, reject) => {
      const name = window.Tenant ? Tenant.dbName() : 'mtx_none';
      // A different shop is active than the one we hold open — drop it first.
      if (_db && _name !== name) { try { _db.close(); } catch (e) { /* already gone */ } _db = null; }
      if (_db) return resolve(_db);
      const req = indexedDB.open(name, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        [...STORES, ...SYNC_STORES].forEach((s) => {
          if (!db.objectStoreNames.contains(s)) {
            const key = (s === 'settings' || s === '_outbox' || s === '_syncmeta') ? 'key' : 'id';
            db.createObjectStore(s, { keyPath: key });
          }
        });
      };
      req.onsuccess = () => { _db = req.result; _name = name; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  const shouldQueue = (store, id) => !SYNC_STORES.includes(store) && store !== 'users'
    && !(store === 'settings' && ['invoiceSeq', 'seeded'].includes(id));
  const pending = (store, id, op) => ({ key: store + ':' + id, store, id: String(id),
    op, mtime: api.now(), revision: crypto.randomUUID() });
  const completed = (t) => new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(true);
    t.onabort = t.onerror = () => reject(t.error || new Error('Database transaction failed'));
  });

  /* Save the record and its upload intent together: both commit or neither does. */
  async function write(store, rows, op = 'put') {
    const queue = syncEnabled() && !SYNC_STORES.includes(store);
    const db = await open();
    const t = db.transaction(queue ? [store, '_outbox'] : [store], 'readwrite');
    const done = completed(t);
    try {
      for (const row of rows) {
        const id = op === 'del' ? row : pkOf(store, row);
        if (op === 'del') t.objectStore(store).delete(id);
        else t.objectStore(store).put(row);
        if (queue && id != null && shouldQueue(store, id)) t.objectStore('_outbox').put(pending(store, id, op));
      }
    } catch (err) {
      t.abort();
      await done.catch(() => {});
      throw err;
    }
    await done;
    if (queue) notifyWrite();
    return true;
  }
  function notifyWrite() {
    try { window.Sync && window.Sync.nudge && window.Sync.nudge(); } catch (e) { /* ignore */ }
  }

  const api = {
    /* Release the handle so the next call opens whichever shop is now active. */
    close() {
      if (_db) { try { _db.close(); } catch (e) { /* already gone */ } }
      _db = null; _name = null;
    },
    /* The database the next query will use — not just the one held open, so
       this stays truthful in the gap between a store switch and the first
       query that reopens the handle. */
    name: () => _name || (window.Tenant ? Tenant.dbName() : null),

    /* ---- sync plumbing (used by js/sync.js) ---- */
    setClockSkew(ms) { _skew = Number(ms) || 0; },
    now() { return Date.now() + _skew; },
    /* A formerly local-only browser must not mix its old catalogue with the
       server's catalogue. Keep a recoverable snapshot, retain queued writes,
       and rebuild the visible cache from the first authenticated download. */
    async prepareServerCache(store) {
      const db = await open();
      const t = db.transaction([...STORES, '_outbox', '_syncmeta'], 'readwrite');
      const done = completed(t);
      const meta = t.objectStore('_syncmeta');
      const cursor = meta.get('cursor:' + store);
      cursor.onsuccess = () => {
        if (cursor.result) return;
        const prepared = meta.get('prepared:' + store);
        prepared.onsuccess = () => {
          if (prepared.result) return;
          const queued = t.objectStore('_outbox').getAll();
          queued.onsuccess = () => {
            const keys = new Set(queued.result.map((e) => e.key));
            const backup = { meta: { app: 'MTX Group POS', store, exportedAt: Date.now() }, data: {} };
            let left = STORES.length;
            for (const s of STORES) {
              const rows = t.objectStore(s).getAll();
              rows.onsuccess = () => {
                backup.data[s] = rows.result;
                for (const row of rows.result) {
                  const id = pkOf(s, row);
                  if (!keys.has(s + ':' + id) && !(s === 'settings' && id === 'invoiceSeq')) t.objectStore(s).delete(id);
                }
                if (--left === 0) {
                  if (Object.values(backup.data).some((rows) => rows.length)) meta.put({ key: 'before-server-connection', value: backup });
                  meta.put({ key: 'prepared:' + store, value: true });
                }
              };
            }
          };
        };
      };
      await done;
    },
    /* Snapshot payloads and their upload revisions in the same transaction. */
    async pendingChanges() {
      const db = await open();
      const t = db.transaction([...STORES, '_outbox'], 'readonly');
      const done = completed(t);
      const changes = [];
      const r = t.objectStore('_outbox').getAll();
      r.onsuccess = () => {
        for (const entry of r.result) {
          const item = { entry, data: null };
          changes.push(item);
          if (entry.op !== 'del') {
            const get = t.objectStore(entry.store).get(entry.id);
            get.onsuccess = () => { item.data = get.result; };
          }
        }
      };
      await done;
      return changes;
    },
    /* An acknowledgement for an older edit must not remove a newer edit. */
    async acknowledge(entries) {
      const db = await open();
      const t = db.transaction('_outbox', 'readwrite');
      const done = completed(t);
      const os = t.objectStore('_outbox');
      for (const entry of entries) {
        const r = os.get(entry.key);
        r.onsuccess = () => {
          const current = r.result;
          if (current && current.revision === entry.revision && current.mtime === entry.mtime && current.op === entry.op) os.delete(entry.key);
        };
      }
      await done;
    },
    /* Apply a pull and advance its cursor atomically. Local pending edits win
       until they have been uploaded, even when made during the network fetch. */
    async applyPage(store, page) {
      const groups = Object.keys(page.changes || {});
      if (groups.some((s) => !STORES.includes(s))) throw new Error('Unknown data type from server');
      const db = await open();
      const t = db.transaction([...groups, '_outbox', '_syncmeta'], 'readwrite');
      const done = completed(t);
      let applied = 0;
      for (const s of groups) for (const row of page.changes[s]) {
        const r = t.objectStore('_outbox').get(s + ':' + row.id);
        r.onsuccess = () => {
          if (r.result) return;
          if (row.deleted) t.objectStore(s).delete(row.id);
          else t.objectStore(s).put(s === 'settings' ? { key: row.id, value: row.data } : row.data);
          applied++;
        };
      }
      t.objectStore('_syncmeta').put({ key: 'cursor:' + store, value: { cursor: page.cursor } });
      await done;
      return applied;
    },
    async outbox() { return api.all('_outbox'); },
    async outboxCount() {
      const db = await open();
      const t = db.transaction('_outbox', 'readonly');
      const done = completed(t);
      const r = t.objectStore('_outbox').count();
      await done;
      return r.result;
    },
    async outboxDelete(key) { return api.del('_outbox', key); },
    async outboxClear() { return api.clear('_outbox'); },
    /* Queue every current record of a store (or all business stores) for
       upload — used once when first connecting an install that already has
       local data. */
    async enqueueAll(store) {
      const list = store ? [store] : STORES;
      const db = await open();
      const t = db.transaction([...list, '_outbox'], 'readwrite');
      const done = completed(t);
      for (const s of list) {
        const r = t.objectStore(s).getAll();
        r.onsuccess = () => r.result.forEach((v) => {
          const id = pkOf(s, v);
          if (id != null && shouldQueue(s, id)) t.objectStore('_outbox').put(pending(s, id, 'put'));
        });
      }
      await done;
      notifyWrite();
    },
    /* key/value bag for sync cursors, tokens-adjacent metadata, PIN cache. */
    async meta(key, value) {
      if (value === undefined) {
        const r = await api.get('_syncmeta', key); return r ? r.value : undefined;
      }
      return api.put('_syncmeta', { key, value });
    },
    async metaDelete(key) { return api.del('_syncmeta', key); },

    /* ---- record CRUD ---- */
    async put(store, val) {
      await write(store, [val]);
      return val;
    },
    async bulk(store, arr) {
      return write(store, arr);
    },
    async get(store, id) {
      const os = await tx(store);
      return new Promise((res, rej) => {
        const r = os.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async all(store) {
      const os = await tx(store);
      return new Promise((res, rej) => {
        const r = os.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
      });
    },
    async del(store, id) {
      return write(store, [id], 'del');
    },
    async clear(store) {
      const db = await open();
      const t = db.transaction(store, 'readwrite');
      const done = completed(t);
      t.objectStore(store).clear();
      return done;
    },
    // Settings helpers (key/value) — go through put(), so they queue for sync too.
    async setting(key, val) {
      if (val === undefined) {
        const r = await api.get('settings', key); return r ? r.value : undefined;
      }
      return api.put('settings', { key, value: val });
    },
    // Full backup / restore — stamped with the shop it came from so a backup
    // can't be restored into the wrong store by accident. Sync stores are
    // deliberately excluded.
    async exportAll() {
      const t = window.Tenant ? Tenant.get() : null;
      const out = {
        meta: { app: 'MTX Group POS', store: t ? t.id : null, storeName: t ? t.name : '', version: VERSION, exportedAt: Date.now() },
        data: {}
      };
      for (const s of STORES) out.data[s] = await api.all(s);
      return out;
    },
    async importAll(json) {
      for (const s of STORES) {
        if (!json.data[s]) continue;
        await api.clear(s);
        await api.bulk(s, json.data[s]);
      }
      return true;
    },
    async wipe() { for (const s of [...STORES, ...SYNC_STORES]) await api.clear(s); return true; },

    /* ---------------- Whole-system backup ----------------
       One file covering EVERY store, not just the one you're signed into.
       Restoring it puts the whole install back exactly as it was when the
       file was made — products, sales, invoices, customers, suppliers,
       expenses, stock movements, staff and settings, for every shop.

       The dashboard and reports are not stored separately: they are computed
       from sales, products and expenses, so backing those up backs them up.

       Each shop lives in its own database, so this walks the stores one at a
       time and always returns to the one you started on, even on error. */
    async exportSystem(onProgress) {
      if (!window.Tenant) throw new Error('No stores registered');
      const started = Tenant.id;
      const out = {
        meta: {
          app: 'MTX Group Retail Suite', kind: 'system', version: VERSION,
          exportedAt: Date.now(), stores: STORES_REG().map((s) => s.id),
        },
        stores: {},
      };
      try {
        for (const s of STORES_REG()) {
          if (onProgress) onProgress(s.name);
          await Tenant.set(s.id);
          const one = {};
          for (const st of STORES) one[st] = await api.all(st);
          out.stores[s.id] = { name: s.name, data: one };
        }
      } finally {
        if (started) await Tenant.set(started);
      }
      return out;
    },

    /* Restore a whole-system file. Every shop in the file is wiped and
       rewritten, so the install lands exactly on the snapshot — anything
       recorded since is gone. Shops in the file that this build doesn't
       know about are skipped and reported back. */
    async importSystem(json, onProgress) {
      if (!json || json.meta?.kind !== 'system' || !json.stores) {
        throw new Error('That is not a whole-system backup file');
      }
      const started = Tenant.id;
      const done = [], skipped = [];
      try {
        for (const [id, block] of Object.entries(json.stores)) {
          if (!Tenant.find(id)) { skipped.push(id); continue; }
          if (onProgress) onProgress(block.name || id);
          await Tenant.set(id);
          await api.wipe();
          const data = block.data || block;
          for (const st of STORES) if (data[st]) await api.bulk(st, data[st]);
          done.push(block.name || id);
        }
      } finally {
        if (started) await Tenant.set(started);
      }
      return { done, skipped };
    },

    stores: STORES
  };
  /* Read lazily: js/stores.js loads after this file. */
  const STORES_REG = () => (window.STORES || []);
  return api;
})();
window.DB = DB;
