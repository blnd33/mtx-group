'use strict';
/* Runs the REAL browser sync code (js/db.js + js/sync.js) in Node against the
   real Express server (on pg-mem), with fake IndexedDB / localStorage / DOM
   shims. Proves the local-first loop: local write -> outbox -> push -> server,
   and server change -> pull -> local store, plus conflicts, offline queueing
   and offline PIN login.

   Run: npm run ctest */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-for-production-use-only-please';
process.env.STORES = 'melora';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
require('fake-indexeddb/auto');

/* --- server on an in-memory Postgres --- */
const mem = newDb();
mem.public.registerFunction({ name: 'now', returns: 'timestamptz', implementation: () => new Date() });
const memPg = mem.adapters.createPg();
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'pg' ? memPg : origLoad.call(this, req, ...rest); };

const { buildSchemaSQL } = require('../src/schema');
const db = require('../src/db');
const { createApp } = require('../src/server');

/* --- browser shims --- */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const nav = { onLine: true };
Object.defineProperty(global, 'navigator', { value: nav, configurable: true });
global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.window = global;

let passed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); results.push('  ok    ' + name); passed++; }
  catch (e) { results.push('  FAIL  ' + name + '\n        ' + (e.stack || e.message)); process.exitCode = 1; }
}

function loadClient(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', file), 'utf8');
  (0, eval)(src); // eslint-disable-line no-eval
}

(async () => {
  await db.query('melora', buildSchemaSQL());
  await db.query('melora',
    'INSERT INTO users (id, name, role, active, pin_hash) VALUES ($1,$2,$3,true,$4)',
    ['u_admin', 'Owner Admin', 'Super Admin', bcrypt.hashSync('1234', 8)]);

  const server = createApp().listen(0);
  const baseUrl = 'http://127.0.0.1:' + server.address().port;

  global.location = { origin: baseUrl, hash: '' };
  global.Tenant = { id: 'melora', dbName: () => 'mtx_melora' };
  global.Store = { bust() {} };

  loadClient('db.js');
  loadClient('sync.js');

  await test('sync is inert until configured', async () => {
    assert.strictEqual(Sync.configured(), false);
    await DB.put('products', { id: 'p0', name: 'Pre-config' });
    assert.strictEqual(await DB.outboxCount(), 0, 'no outbox entries while sync is off');
  });

  Sync.setServer(baseUrl, true);

  await test('online login stores a token and caches the PIN', async () => {
    const r = await Sync.login('melora', 'u_admin', '1234');
    assert.ok(r.token);
    assert.ok(Sync.token('melora'));
    assert.strictEqual(await Sync.hasOfflinePin('melora', 'u_admin'), true);
  });

  await test('a local write lands in the outbox', async () => {
    await DB.put('products', { id: 'p1', name: 'Crystal Vase', price: 78000, stock: 4 });
    const box = await DB.outbox();
    assert.ok(box.find((e) => e.key === 'products:p1' && e.op === 'put'));
  });

  await test('cycle() pushes the outbox to the server and clears it', async () => {
    await Sync.cycle();
    assert.strictEqual(await DB.outboxCount(), 0);
    const { rows } = await db.query('melora', "SELECT data FROM products WHERE id = 'p1'");
    assert.strictEqual(rows[0].data.name, 'Crystal Vase');
  });

  await test('cycle() pulls server changes into the local store', async () => {
    // a change that only exists on the server
    await db.query('melora',
      `INSERT INTO categories (id, data, client_mtime) VALUES ('c1', $1::jsonb, $2)`,
      [JSON.stringify({ id: 'c1', name: 'Chandeliers', icon: '💡' }), Date.now()]);
    await Sync.cycle();
    const cat = await DB.get('categories', 'c1');
    assert.ok(cat && cat.name === 'Chandeliers');
  });

  await test('full re-download rebuilds the local store from the server', async () => {
    await DB.del('products', 'p1');            // wipe locally (also queues a delete...)
    await DB.outboxClear();                    // ...which we drop, to simulate a cold cache
    assert.strictEqual(await DB.get('products', 'p1'), undefined);
    await Sync.fullResync();
    const back = await DB.get('products', 'p1');
    assert.ok(back && back.name === 'Crystal Vase', 'product came back from the server');
  });

  await test('stale write loses the conflict and is dropped from the outbox', async () => {
    // server gets a fresh version (mtime far in the future)
    await db.query('melora',
      `UPDATE products SET data = $1::jsonb, client_mtime = $2, seq = nextval('change_seq') WHERE id = 'p1'`,
      [JSON.stringify({ id: 'p1', name: 'Crystal Vase', price: 80000, stock: 1 }), Date.now() + 60000]);
    // local makes an older edit
    DB.setClockSkew(-120000);       // pretend this terminal's clock is 2 min behind
    await DB.put('products', { id: 'p1', name: 'STALE EDIT', price: 1, stock: 999 });
    DB.setClockSkew(0);
    await Sync.cycle();
    assert.strictEqual(await DB.outboxCount(), 0, 'stale entry removed');
    const p1 = await DB.get('products', 'p1');
    assert.strictEqual(p1.name, 'Crystal Vase', 'server version won locally after the pull');
    assert.strictEqual(p1.stock, 1);
  });

  await test('writes queue while offline and drain when back online', async () => {
    nav.onLine = false;
    await DB.put('customers', { id: 'cu9', name: 'Offline Buyer', debt: 0 });
    await DB.put('customers', { id: 'cu10', name: 'Another', debt: 0 });
    assert.strictEqual(await DB.outboxCount(), 2);
    try { await Sync.cycle(); } catch (e) { /* fetch fails offline-ish; entries stay */ }
    nav.onLine = true;
    await Sync.cycle();
    assert.strictEqual(await DB.outboxCount(), 0);
    const { rows } = await db.query('melora', "SELECT count(*)::int n FROM customers WHERE id IN ('cu9','cu10')");
    assert.strictEqual(rows[0].n, 2);
  });

  await test('offline PIN login works after one online login; wrong PIN fails', async () => {
    nav.onLine = false;
    assert.strictEqual(await Sync.verifyPinOffline('melora', 'u_admin', '1234'), true);
    assert.strictEqual(await Sync.verifyPinOffline('melora', 'u_admin', '9999'), false);
    assert.strictEqual(await Sync.verifyPinOffline('melora', 'ghost', '1234'), false);
    nav.onLine = true;
  });

  /* ---- staying signed in: no sign-out / sign-in just to sync ---- */
  const jwt = require('jsonwebtoken');
  const TOKEN_KEY = 'mtx.sync.token.melora';
  const expired = () => jwt.sign({ sub: 'u_admin', name: 'Owner Admin', role: 'Super Admin', store: 'melora',
    exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
  const realFetch = global.fetch;
  let logins = 0;
  global.fetch = (url, opts) => { if (String(url).endsWith('/api/login')) logins++; return realFetch(url, opts); };

  await test('an expired server session renews itself — no sign-out needed', async () => {
    localStorage.setItem(TOKEN_KEY, expired());
    const before = localStorage.getItem(TOKEN_KEY);
    await DB.put('products', { id: 'p_exp', name: 'Sold after 12h', price: 1000, stock: 1 });
    await Sync.cycle();
    assert.strictEqual(await DB.outboxCount(), 0, 'the change uploaded');
    assert.notStrictEqual(localStorage.getItem(TOKEN_KEY), before, 'a fresh session was opened');
    assert.strictEqual(Sync.getState().status, 'synced');
    const { rows } = await db.query('melora', "SELECT data FROM products WHERE id = 'p_exp'");
    assert.strictEqual(rows[0].data.name, 'Sold after 12h');
  });

  await test('signing in on the offline PIN connects by itself once online', async () => {
    Sync.signOut('melora');                         // no server session at all
    Sync.remember('melora', 'u_admin', '1234');     // what the offline sign-in does
    await DB.put('products', { id: 'p_off', name: 'Rung up offline', price: 500, stock: 2 });
    await Sync.cycle();
    assert.ok(localStorage.getItem(TOKEN_KEY), 'a session was opened without a second sign-in');
    assert.strictEqual(await DB.outboxCount(), 0);
    assert.strictEqual(Sync.getState().status, 'synced');
  });

  await test('a PIN the server rejects is dropped: asks to sign in, never keeps knocking', async () => {
    await db.query('melora', "UPDATE users SET pin_hash = $1 WHERE id = 'u_admin'", [bcrypt.hashSync('5555', 8)]);
    localStorage.setItem(TOKEN_KEY, expired());
    await assert.rejects(Sync.cycle(), (e) => e.code === 'UNAUTH');
    assert.strictEqual(Sync.getState().status, 'needs-login');
    logins = 0;
    await assert.rejects(Sync.cycle());
    await assert.rejects(Sync.cycle());
    assert.strictEqual(logins, 0, 'no further sign-in attempts with the old PIN');
    await db.query('melora', "UPDATE users SET pin_hash = $1 WHERE id = 'u_admin'", [bcrypt.hashSync('1234', 8)]);
  });

  await test('an unreachable server shows offline, not "sign in", and reconnects on the next cycle', async () => {
    Sync.signOut('melora');
    Sync.remember('melora', 'u_admin', '1234');     // signed in on the offline PIN
    global.fetch = (url, opts) => {
      if (String(url).endsWith('/api/login')) { logins++; return Promise.reject(new Error('ECONNREFUSED')); }
      return realFetch(url, opts);
    };
    logins = 0;
    await assert.rejects(Sync.cycle(), (e) => e.code === 'NET');
    assert.strictEqual(Sync.getState().status, 'offline');
    await assert.rejects(Sync.cycle(), (e) => e.code === 'NET');
    assert.strictEqual(logins, 2, 'nothing reached the server, so no reason to wait');
    global.fetch = realFetch;                        // server back
    await Sync.cycle();
    assert.ok(localStorage.getItem(TOKEN_KEY), 'connected without a second sign-in');
    assert.strictEqual(Sync.getState().status, 'synced');
  });

  await test('a server that refuses sign-in (rate limit) backs off instead of hammering', async () => {
    Sync.signOut('melora');
    Sync.remember('melora', 'u_admin', '1234');
    global.fetch = (url, opts) => {
      if (String(url).endsWith('/api/login')) {
        logins++;
        return Promise.resolve(new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }));
      }
      return realFetch(url, opts);
    };
    logins = 0;
    await assert.rejects(Sync.cycle());
    await assert.rejects(Sync.cycle());
    await assert.rejects(Sync.cycle());
    assert.strictEqual(logins, 1, 'one attempt, then a pause — shops share one IP and sign-in is rate-limited');
    assert.strictEqual(Sync.getState().status, 'offline', 'still not asking anyone to sign in');
    global.fetch = realFetch;
  });

  await test('signing out forgets the PIN — sync cannot sign itself back in', async () => {
    Sync.remember('melora', 'u_admin', '1234');     // fresh remember clears the back-off
    await Sync.cycle();                              // proves it would work...
    Sync.signOut('melora');                          // ...until they sign out
    await assert.rejects(Sync.cycle(), (e) => e.code === 'NOAUTH');
    assert.strictEqual(localStorage.getItem(TOKEN_KEY), null);
    assert.strictEqual(Sync.getState().status, 'needs-login');
  });
  global.fetch = realFetch;

  await test('disconnect turns sync off and clears the queue', async () => {
    await DB.put('logs', { id: 'l1', ts: Date.now(), user: 'x', type: 'login', action: 'signed in' });
    await Sync.disconnect();
    assert.strictEqual(Sync.configured(), false);
    assert.strictEqual(await DB.outboxCount(), 0);
    // local data is untouched
    assert.ok(await DB.get('products', 'p1'));
  });

  server.close();
  Module._load = origLoad;
  console.log(results.join('\n'));
  console.log('\n' + passed + '/' + results.length + ' checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
