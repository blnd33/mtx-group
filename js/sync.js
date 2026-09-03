/* =====================================================================
   MTX GROUP — Sync client

   Local-first sync against the server in /server. IndexedDB stays the
   source of truth for everything the app reads, so the till keeps working
   with no connection. This module:

     - queues local writes (js/db.js records them in `_outbox`)
     - pushes them to the server when there's a connection
     - pulls the server's changes down and applies them locally
     - handles login (online) and caches a PIN so login works offline too

   It is INERT until a server is enabled in Settings. With sync off, none
   of this runs and the app behaves exactly as the offline-only build.

   Device-level config (server URL, tokens, clock skew, PIN salt) lives in
   localStorage — it follows the machine, not the shop. Per-store sync
   cursors and the PIN cache live in the store's own `_syncmeta`.

   DEFAULT-ON for the production site: a brand-new browser/phone has never
   touched Settings, so without this it would stay 100% local — which is
   exactly what looks like "my data isn't on my other device", not a
   deliberate offline choice. Every page served from mtx-group.net (or a
   *.mtx-group.net subdomain) is wired to a real server, so the very first
   load there configures Sync against that same origin automatically — pick
   a store, sign in, done. This fires at most once per browser: as soon as
   `mtx.sync.enabled` has any value (including explicitly turned off via
   Settings → Server & Sync → Disconnect), it's left alone forever after.
   Any other host — localhost dev, the Electron build, another install of
   this codebase — is untouched, exactly as before. ===================== */
(function bootstrapDefaultSync() {
  try {
    if (typeof location === 'undefined' || localStorage.getItem('mtx.sync.enabled') !== null) return;
    if (!/(^|\.)mtx-group\.net$/.test(location.hostname)) return;
    localStorage.setItem('mtx.sync.url', location.origin);
    localStorage.setItem('mtx.sync.enabled', '1');
  } catch (e) { /* private browsing, storage blocked — falls back to local-only */ }
})();

const Sync = (() => {
  const LS = {
    enabled: 'mtx.sync.enabled',
    url: 'mtx.sync.url',
    skew: 'mtx.sync.skew',
    salt: 'mtx.sync.pinsalt',
    device: 'mtx.sync.deviceId',
    token: (store) => 'mtx.sync.token.' + store,
  };
  const lsGet = (k, d = '') => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  const state = { status: 'off', queued: 0, lastSyncAt: 0, lastError: null, busy: false, initial: false };
  const listeners = new Set();
  let timer = null;
  let nudgeT = null;

  function emit() {
    for (const fn of listeners) { try { fn(state); } catch (e) { /* ignore */ } }
  }
  function setStatus(s, err) {
    state.status = s;
    if (err !== undefined) state.lastError = err;
    emit();
  }

  /* ---------------- config ---------------- */
  const configured = () => lsGet(LS.enabled) === '1';
  const serverUrl = () => lsGet(LS.url) || (typeof location !== 'undefined' ? location.origin : '');
  function setServer(url, enabled) {
    lsSet(LS.url, (url || '').replace(/\/+$/, ''));
    lsSet(LS.enabled, enabled ? '1' : null);
  }
  function deviceId() {
    let d = lsGet(LS.device);
    if (!d) { d = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase(); lsSet(LS.device, d); }
    return d;
  }
  const token = (store) => lsGet(LS.token(store || currentStore()));
  const setToken = (store, t) => lsSet(LS.token(store), t || null);
  const currentStore = () => (window.Tenant && Tenant.id) || null;

  /* ---------------- clock skew ---------------- */
  function applyServerTime(serverTime) {
    if (!serverTime) return;
    const skew = serverTime - Date.now();
    lsSet(LS.skew, String(Math.round(skew)));
    if (window.DB) DB.setClockSkew(skew);
  }
  if (window.DB) DB.setClockSkew(Number(lsGet(LS.skew)) || 0);

  /* ---------------- HTTP ---------------- */
  async function api(path, { method = 'GET', body, store, auth = true } = {}) {
    if (!configured()) { const e = new Error('Sync is off'); e.code = 'OFF'; throw e; }
    const headers = { 'content-type': 'application/json' };
    if (auth) {
      const t = token(store);
      if (!t) { const e = new Error('Not signed in to the server'); e.code = 'NOAUTH'; throw e; }
      headers.authorization = 'Bearer ' + t;
    }
    let res;
    try {
      res = await fetch(serverUrl() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (netErr) {
      const e = new Error('Cannot reach the server'); e.code = 'NET'; throw e;
    }
    if (res.status === 401) { const e = new Error('Session expired — sign in again'); e.code = 'UNAUTH'; throw e; }
    if (res.status === 403) { const e = new Error('Not allowed'); e.code = 'FORBIDDEN'; throw e; }
    if (!res.ok) {
      const msg = await res.json().then((j) => j.error).catch(() => null);
      throw new Error(msg || ('Server error ' + res.status));
    }
    return res.json();
  }

  async function testConnection() {
    const r = await fetch(serverUrl() + '/api/health').then((x) => x.json());
    return r;
  }

  /* ---------------- auth ---------------- */
  async function listUsers(store) {
    const r = await api('/api/stores/' + encodeURIComponent(store) + '/users', { auth: false });
    return r.users || [];
  }
  async function login(store, userId, pin) {
    const r = await api('/api/login', { method: 'POST', auth: false, body: { store, userId, pin } });
    setToken(store, r.token);
    applyServerTime(r.serverTime);
    await cachePin(store, userId, pin); // so this user can sign in offline next time
    return r;
  }
  function signOut(store) { setToken(store || currentStore(), null); }

  /* User management — the server hashes PINs, so these never go through the
     generic sync push. Caller should run a cycle() afterward to pull the
     change into the local `users` store. */
  async function saveUser(store, body) {
    if (body.id) { await api('/api/users/' + encodeURIComponent(body.id), { method: 'PATCH', store, body }); return { id: body.id }; }
    return api('/api/users', { method: 'POST', store, body });
  }
  async function deleteUser(store, id) {
    return api('/api/users/' + encodeURIComponent(id), { method: 'PATCH', store, body: { deleted: true } });
  }

  /* ---- offline PIN: PBKDF2-SHA256, per-device salt, no dependency ---- */
  function deviceSalt() {
    let b64 = lsGet(LS.salt);
    if (!b64) {
      const rnd = crypto.getRandomValues(new Uint8Array(16));
      b64 = btoa(String.fromCharCode.apply(null, rnd));
      lsSet(LS.salt, b64);
    }
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
  async function derivePin(pin) {
    const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: deviceSalt(), iterations: 100000, hash: 'SHA-256' }, mat, 256);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(bits)));
  }
  async function cachePin(store, userId, pin) {
    const map = (await DB.meta('pins:' + store)) || {};
    map[userId] = await derivePin(pin);
    await DB.meta('pins:' + store, map);
  }
  async function hasOfflinePin(store, userId) {
    const map = (await DB.meta('pins:' + store)) || {};
    return !!map[userId];
  }
  async function verifyPinOffline(store, userId, pin) {
    const map = (await DB.meta('pins:' + store)) || {};
    if (!map[userId]) return false;
    return map[userId] === await derivePin(pin);
  }

  /* ---------------- push ---------------- */
  async function pushOnce(store) {
    const entries = await DB.outbox();
    if (!entries.length) return { pushed: 0 };
    const BATCH = 300;
    let pushed = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const changes = [];
      for (const e of slice) {
        if (e.op === 'del') { changes.push({ store: e.store, id: e.id, deleted: true, mtime: e.mtime }); continue; }
        const rec = await DB.get(e.store, e.id);
        if (rec == null) { changes.push({ store: e.store, id: e.id, deleted: true, mtime: e.mtime }); continue; }
        const data = e.store === 'settings' ? rec.value : rec;
        changes.push({ store: e.store, id: e.id, data, mtime: e.mtime });
      }
      const r = await api('/api/sync/push', { method: 'POST', store, body: { changes } });
      // Applied, or lost a conflict, or server-owned — in every case stop
      // pushing it. A lost conflict is fixed by the pull that follows.
      for (const a of (r.applied || [])) await DB.outboxDelete(a.store + ':' + a.id);
      for (const c of (r.conflicts || [])) await DB.outboxDelete(c.store + ':' + c.id);
      pushed += (r.applied || []).length;
    }
    return { pushed };
  }

  /* ---------------- pull ---------------- */
  async function pullOnce(store, onProgress) {
    let m = (await DB.meta('cursor:' + store)) || { cursor: 0 };
    let applied = 0;
    for (let guard = 0; guard < 100000; guard++) {
      const r = await api('/api/sync/pull?since=' + m.cursor + '&limit=1000', { store });
      applyServerTime(r.serverTime);
      const groups = Object.keys(r.changes || {});
      if (groups.length) {
        await DB.applyRemote(async () => {
          for (const s of groups) {
            for (const row of r.changes[s]) {
              applied++;
              if (row.deleted) { await DB.del(s, row.id).catch(() => {}); continue; }
              if (s === 'settings') await DB.put('settings', { key: row.id, value: row.data });
              else await DB.put(s, row.data);
            }
          }
        });
        if (onProgress) onProgress(applied);
      }
      m = { cursor: r.cursor };
      await DB.meta('cursor:' + store, m);
      if (!r.hasMore) break;
    }
    return { applied };
  }

  /* ---------------- the cycle ---------------- */
  async function cycle(opts = {}) {
    const store = currentStore();
    if (!configured() || !store) return;
    if (state.busy) return;
    if (!token(store)) { setStatus('needs-login'); return; }

    state.busy = true;
    state.initial = !!opts.initial;
    try {
      setStatus('syncing');
      await pushOnce(store);
      const { applied } = await pullOnce(store, opts.onProgress);
      state.lastSyncAt = Date.now();
      state.queued = await DB.outboxCount();
      setStatus('synced', null);
      if (applied && window.Store) {
        Store.bust();
        const route = ((location.hash || '').replace('#/', '').split('?')[0]) || '';
        // Don't yank the screen out from under a cashier mid-sale.
        if (window.App && App.route && route !== 'pos' && route !== 'catpos') App.route();
      }
      return { applied };
    } catch (err) {
      state.queued = await DB.outboxCount().catch(() => state.queued);
      if (err.code === 'UNAUTH' || err.code === 'NOAUTH') setStatus('needs-login', err.message);
      else if (err.code === 'NET' || !navigator.onLine) setStatus('offline', err.message);
      else setStatus('error', err.message);
      if (!opts.silent) console.warn('[sync]', err.message);
      throw err;
    } finally {
      state.busy = false;
      state.initial = false;
      emit();
    }
  }

  /* Reset the cursor and re-download everything (repair / first run). */
  async function fullResync(onProgress) {
    const store = currentStore();
    if (!store) return;
    await DB.meta('cursor:' + store, { cursor: 0 });
    return cycle({ onProgress, initial: true });
  }

  /* One-time: queue every local record for upload. Use when connecting an
     install that already has data the server hasn't seen. */
  async function uploadLocal(onProgress) {
    await DB.enqueueAll();
    state.queued = await DB.outboxCount();
    emit();
    return cycle({ onProgress });
  }

  /* Turn sync off on this device and forget its server state. Local
     business data is left untouched. */
  async function disconnect() {
    stop();
    const store = currentStore();
    if (store) {
      setToken(store, null);
      await DB.metaDelete('cursor:' + store).catch(() => {});
    }
    lsSet(LS.enabled, null);
    await DB.outboxClear().catch(() => {});
    setStatus('off');
  }

  /* ---------------- scheduling ---------------- */
  const onOnline = () => cycle({ silent: true }).catch(() => {});
  const onVisible = () => { if (!document.hidden) cycle({ silent: true }).catch(() => {}); };

  function start() {
    stop();
    if (!configured()) { setStatus('off'); return; }
    setStatus(navigator.onLine ? 'idle' : 'offline');
    timer = setInterval(() => cycle({ silent: true }).catch(() => {}), 20000);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    cycle({ silent: true }).catch(() => {});
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  }
  /* Debounced kick after a local write. */
  function nudge() {
    if (!configured()) return;
    clearTimeout(nudgeT);
    nudgeT = setTimeout(() => cycle({ silent: true }).catch(() => {}), 1500);
  }

  return {
    on(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    getState: () => state,
    configured, serverUrl, setServer, deviceId, token, testConnection,
    listUsers, login, signOut, hasOfflinePin, verifyPinOffline, saveUser, deleteUser,
    start, stop, cycle, nudge, fullResync, uploadLocal, disconnect,
  };
})();
window.Sync = Sync;
