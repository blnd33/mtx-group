/* =====================================================================
   MTX GROUP — Sync client

   Local-first sync against the server in /server. IndexedDB stays the
   source of truth for everything the app reads, so the till keeps working
   with no connection. This module:

     - queues local writes (js/db.js records them in `_outbox`)
     - pushes them to the server when there's a connection
     - pulls the server's changes down and applies them locally
     - handles login (online) and caches a PIN so login works offline too

   On mtx-group.net the server connection is mandatory and comes from the
   website address, so a fresh browser always reconnects after sign-in.
   Local desktop/development installs can still configure sync in Settings.

   Device-level config (server URL, tokens, clock skew, PIN salt) lives in
   localStorage — it follows the machine, not the shop. Per-store sync
   cursors and the PIN cache live in the store's own `_syncmeta`.
   ===================================================================== */
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
  let flight = null;
  let generation = 0;

  function emit() {
    for (const fn of listeners) { try { fn(state); } catch (e) { /* ignore */ } }
  }
  function setStatus(s, err) {
    state.status = s;
    if (err !== undefined) state.lastError = err;
    emit();
  }

  /* ---------------- config ---------------- */
  const required = () => {
    try { return ['mtx-group.net', 'www.mtx-group.net'].includes(new URL(location.origin).hostname); }
    catch (e) { return false; }
  };
  const configured = () => required() || lsGet(LS.enabled) === '1';
  const serverUrl = () => required() ? location.origin
    : lsGet(LS.url) || (typeof location !== 'undefined' ? location.origin : '');
  function setServer(url, enabled) {
    if (required()) {
      if (!enabled || (url || '').replace(/\/+$/, '') !== location.origin) {
        throw new Error('This website always uses its server. The connection cannot be disabled.');
      }
      return;
    }
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
  function checkContext(ctx) {
    if (ctx && (ctx.generation !== generation || ctx.store !== currentStore())) {
      const e = new Error('Store changed — sync cancelled'); e.code = 'CANCELLED'; throw e;
    }
  }

  /* ---------------- clock skew ---------------- */
  function applyServerTime(serverTime) {
    if (!serverTime) return;
    const skew = serverTime - Date.now();
    lsSet(LS.skew, String(Math.round(skew)));
    if (window.DB) DB.setClockSkew(skew);
  }
  if (window.DB) DB.setClockSkew(Number(lsGet(LS.skew)) || 0);

  /* ---------------- HTTP ---------------- */
  async function api(path, { method = 'GET', body, store, auth = true, context } = {}) {
    checkContext(context);
    if (!configured()) { const e = new Error('Sync is off'); e.code = 'OFF'; throw e; }
    const headers = { 'content-type': 'application/json' };
    if (auth) {
      const t = token(store);
      if (!t) { const e = new Error('Not signed in to the server'); e.code = 'NOAUTH'; throw e; }
      headers.authorization = 'Bearer ' + t;
    }
    let res;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      res = await fetch(serverUrl() + path, { method, headers, cache: 'no-store', signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined });
    } catch (netErr) {
      const e = new Error('Cannot reach the server'); e.code = 'NET'; throw e;
    } finally {
      clearTimeout(timeout);
    }
    checkContext(context);
    if (res.status === 401) { const e = new Error('Session expired — sign in again'); e.code = 'UNAUTH'; throw e; }
    if (res.status === 403) { const e = new Error('Not allowed'); e.code = 'FORBIDDEN'; throw e; }
    if (!res.ok) {
      const msg = await res.json().then((j) => j.error).catch(() => null);
      throw new Error(msg || ('Server error ' + res.status));
    }
    const result = await res.json();
    checkContext(context);
    return result;
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
  function signOut(store) { setToken(store || currentStore(), null); setStatus('needs-login'); }

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
  async function pushOnce(store, context) {
    checkContext(context);
    const entries = await DB.pendingChanges();
    checkContext(context);
    if (!entries.length) return { pushed: 0 };
    const BATCH = 300;
    let pushed = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const changes = [];
      for (const { entry: e, data: rec } of slice) {
        if (e.op === 'del') { changes.push({ store: e.store, id: e.id, deleted: true, mtime: e.mtime }); continue; }
        if (rec == null) { changes.push({ store: e.store, id: e.id, deleted: true, mtime: e.mtime }); continue; }
        const data = e.store === 'settings' ? rec.value : rec;
        changes.push({ store: e.store, id: e.id, data, mtime: e.mtime });
      }
      const r = await api('/api/sync/push', { method: 'POST', store, body: { changes }, context });
      const conflicts = r.conflicts || [];
      const accepted = [...(r.applied || []), ...conflicts.filter((c) => c.reason === 'stale'
        || c.reason === 'server-owned' || (c.store === 'users' && c.reason === 'unknown-store'))];
      const keys = new Set(accepted.map((a) => a.store + ':' + a.id));
      // A rejected version may have been pulled before our current cursor.
      // Re-read the feed so the winning server version is restored locally.
      if (conflicts.some((c) => c.reason === 'stale')) await DB.meta('cursor:' + store, { cursor: 0 });
      checkContext(context);
      await DB.acknowledge(slice.map((item) => item.entry).filter((e) => keys.has(e.key)));
      checkContext(context);
      if (slice.some((item) => !keys.has(item.entry.key))) throw new Error('The server did not accept all changes. Unsaved changes remain queued.');
      pushed += (r.applied || []).length;
    }
    return { pushed };
  }

  /* ---------------- pull ---------------- */
  async function pullOnce(store, onProgress, context) {
    checkContext(context);
    let m = (await DB.meta('cursor:' + store)) || { cursor: 0 };
    checkContext(context);
    let applied = 0;
    for (let guard = 0; guard < 100000; guard++) {
      const r = await api('/api/sync/pull?since=' + m.cursor + '&limit=1000', { store, context });
      applyServerTime(r.serverTime);
      applied += await DB.applyPage(store, r);
      checkContext(context);
      if (onProgress) onProgress(applied);
      m = { cursor: r.cursor };
      if (!r.hasMore) break;
    }
    return { applied };
  }

  /* ---------------- the cycle ---------------- */
  function cycle(opts = {}) {
    if (flight) return flight;
    const job = runCycle(opts);
    flight = job;
    const finish = () => { if (flight === job) flight = null; };
    job.then(finish, finish);
    return job;
  }

  async function runCycle(opts) {
    const store = currentStore();
    const context = { store, generation };
    if (!configured() || !store) throw new Error('Select a store and connect to the server first');
    if (!token(store)) {
      setStatus('needs-login');
      const e = new Error('Sign in to the server to upload your changes'); e.code = 'NOAUTH'; throw e;
    }

    state.busy = true;
    state.initial = !!opts.initial;
    try {
      setStatus('syncing');
      if (required()) {
        await DB.prepareServerCache(store);
        checkContext(context);
      }
      let applied = 0;
      // Drain edits made while an earlier upload was in flight as well.
      for (let round = 0; round < 10; round++) {
        if (!navigator.onLine) { const e = new Error('Offline — changes are waiting to upload'); e.code = 'NET'; throw e; }
        await pushOnce(store, context);
        checkContext(context);
        applied += (await pullOnce(store, opts.onProgress, context)).applied;
        checkContext(context);
        // Mark the download complete before the final queue check. An edit
        // committed during this metadata write still needs another upload.
        await DB.meta('ready:' + store, true);
        checkContext(context);
        state.queued = await DB.outboxCount();
        checkContext(context);
        if (!state.queued) break;
      }
      if (state.queued) { const e = new Error('Changes are still waiting to upload'); e.code = 'PENDING'; throw e; }
      state.lastSyncAt = Date.now();
      setStatus('synced', null);
      if (applied && window.Store) {
        Store.bust();
        const route = ((location.hash || '').replace('#/', '').split('?')[0]) || '';
        // Don't yank the screen out from under a cashier mid-sale.
        if (window.App && App.user && App.route && !state.initial && route !== 'pos' && route !== 'catpos') App.route();
      }
      return { applied };
    } catch (err) {
      checkContext(context);
      state.queued = await DB.outboxCount().catch(() => state.queued);
      checkContext(context);
      if (err.code === 'UNAUTH' || err.code === 'NOAUTH') setStatus('needs-login', err.message);
      else if (err.code === 'NET' || !navigator.onLine) setStatus('offline', err.message);
      else if (err.code === 'PENDING') setStatus('pending', err.message);
      else setStatus('error', err.message);
      if (!opts.silent) console.warn('[sync]', err.message);
      throw err;
    } finally {
      if (context.generation === generation) {
        state.busy = false;
        state.initial = false;
        emit();
      }
    }
  }

  /* Reset the cursor and re-download everything (repair / first run). */
  async function fullResync(onProgress) {
    if (flight) await flight;
    const store = currentStore();
    if (!store) throw new Error('Select a store first');
    await DB.meta('cursor:' + store, { cursor: 0 });
    return cycle({ onProgress, initial: true });
  }

  /* One-time: queue every local record for upload. Use when connecting an
     install that already has data the server hasn't seen. */
  async function uploadLocal(onProgress) {
    if (flight) await flight;
    await DB.enqueueAll();
    state.queued = await DB.outboxCount();
    emit();
    return cycle({ onProgress });
  }

  /* Erase this store's trading data on the SERVER.

     Without this, "Erase Everything" only clears the browser: the next pull
     re-downloads the lot from the server and it looks as if the button did
     nothing. The server tombstones the rows, so every other terminal clears
     itself down on its next sync too.

     Returns the per-table counts the server reported. */
  async function eraseServer() {
    const store = currentStore();
    if (!store) throw new Error('No store selected');
    try {
      return await api('/api/erase', { method: 'POST', store, body: { confirm: store } });
    } catch (e) {
      /* A 404 here means the server is running an older build. Express reads
         static files from disk on every request, so a `git pull` updates the
         app immediately — but Node keeps its required modules in memory, so
         the routes stay whatever they were at boot until it is restarted.
         That combination (new page, old API) is easy to misread as the button
         being broken, so say what it actually is. */
      if (/^not found$/i.test(e.message) || /404/.test(e.message)) {
        const err = new Error('the server is still running the old build — it needs restarting (pm2 restart mtx-server)');
        err.code = 'NOROUTE';
        throw err;
      }
      throw e;
    }
  }

  /* Turn sync off on this device and forget its server state. Local
     business data is left untouched. */
  async function disconnect() {
    if (required()) throw new Error('This website always stays connected to its server.');
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
    state.queued = 0; state.lastSyncAt = 0; state.lastError = null;
    setStatus(navigator.onLine ? 'idle' : 'offline');
    timer = setInterval(() => cycle({ silent: true }).catch(() => {}), 5000);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    cycle({ silent: true }).catch(() => {});
  }
  function stop() {
    generation++;
    flight = null;
    state.busy = false;
    state.initial = false;
    clearTimeout(nudgeT);
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  }
  /* Debounced kick after a local write. */
  function nudge() {
    if (!configured()) return;
    if (!state.busy || state.status === 'synced') setStatus(!token() ? 'needs-login' : navigator.onLine ? 'pending' : 'offline');
    const store = currentStore();
    DB.outboxCount().then((count) => {
      if (store === currentStore()) {
        state.queued = count;
        if (count && state.status === 'synced') setStatus('pending');
        else emit();
      }
    }).catch(() => {});
    clearTimeout(nudgeT);
    nudgeT = setTimeout(() => cycle({ silent: true }).catch(() => {}), 1500);
  }

  return {
    on(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    getState: () => state,
    configured, required, serverUrl, setServer, deviceId, token, testConnection,
    listUsers, login, signOut, hasOfflinePin, verifyPinOffline, saveUser, deleteUser,
    start, stop, cycle, nudge, fullResync, uploadLocal, disconnect,
    eraseServer,
  };
})();
window.Sync = Sync;
