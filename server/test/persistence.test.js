'use strict';
/* Real client scripts in independent browser contexts, real Express routes,
   and in-memory PostgreSQL. Nothing contacts or edits the production site. */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'persistence-test-secret-not-for-production';
process.env.STORES = 'melora';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { webcrypto } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');
const { newDb } = require('pg-mem');
const bcrypt = require('bcryptjs');
const mem = newDb();
mem.public.registerFunction({ name: 'now', returns: 'timestamptz', implementation: () => new Date() });
const pg = mem.adapters.createPg();
const originalLoad = Module._load;
Module._load = function (name, ...args) { return name === 'pg' ? pg : originalLoad.call(this, name, ...args); };
const db = require('../src/db');
const { buildSchemaSQL } = require('../src/schema');
const { createApp } = require('../src/server');
Module._load = originalLoad;

const clients = [];
let baseUrl;
function browser(origin = 'https://mtx-group.net') {
  const storage = new Map();
  const c = {
    console, URL, TextEncoder, Uint8Array, crypto: webcrypto, btoa, atob, AbortController,
    indexedDB: new IDBFactory(),
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin, hash: '' }, navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {},
    // Tests drive sync explicitly. Keep real request timeouts, suppress only
    // the automatic debounce so each race is controlled by its fetch hook.
    setTimeout: (fn, ms) => ms === 1500 ? null : setTimeout(fn, ms),
    clearTimeout, setInterval, clearInterval,
    Tenant: { id: 'melora', dbName() { return 'mtx_' + this.id; } },
    Store: { bust() {} },
    async fetch(url, options) {
      if (c.beforeFetch) await c.beforeFetch(url, options);
      const u = new URL(url);
      const response = await fetch(baseUrl + u.pathname + u.search, options);
      if (c.afterFetch) await c.afterFetch(url, options, response);
      return response;
    },
  };
  c.window = c;
  vm.createContext(c);
  c.load = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js', file), 'utf8'), c);
  c.load('db.js'); c.load('sync.js');
  c.clearStorage = async () => {
    c.Sync.stop(); c.DB.close(); storage.clear();
    // Clearing browser site data destroys both IndexedDB and localStorage.
    c.indexedDB = new IDBFactory();
  };
  clients.push(c);
  return c;
}
async function signIn(c) {
  await c.Sync.login('melora', 'u_admin', '1234');
  await c.Sync.cycle({ silent: true });
}
let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log('  ok    ' + name); }
  catch (e) { console.error('  FAIL  ' + name, e); process.exitCode = 1; }
}

(async () => {
  await db.query('melora', buildSchemaSQL());
  await db.query('melora', 'INSERT INTO users (id,name,role,active,pin_hash) VALUES ($1,$2,$3,true,$4)',
    ['u_admin', 'Owner Admin', 'Super Admin', bcrypt.hashSync('1234', 4)]);
  const server = createApp().listen(0);
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  try {
    const chrome = browser();
    const edge = browser();
    await test('production always connects; local preferences cannot disable or redirect it', async () => {
      assert.equal(chrome.Sync.configured(), true);
      chrome.localStorage.setItem('mtx.sync.enabled', '0');
      chrome.localStorage.setItem('mtx.sync.url', 'https://old.invalid');
      assert.equal(chrome.Sync.serverUrl(), 'https://mtx-group.net');
      assert.throws(() => chrome.Sync.setServer('', false), /cannot be disabled/);
      await assert.rejects(chrome.Sync.disconnect(), /always stays connected/);
      assert.equal(browser('https://www.mtx-group.net').Sync.required(), true);
      assert.equal(browser('http://localhost:5588').Sync.required(), false);
    });
    await test('no server session rejects sync instead of reporting success', async () => {
      await assert.rejects(chrome.Sync.cycle(), /Sign in to the server/);
      assert.equal(chrome.Sync.getState().status, 'needs-login');
      assert.equal(chrome.Sync.getState().lastSyncAt, 0);
    });
    await test('a product added in Chrome appears in a separate Edge browser', async () => {
      await signIn(chrome);
      await chrome.DB.put('products', { id: 'shared', name: 'New product', stock: 5 });
      assert.equal(chrome.Sync.getState().status, 'pending');
      await chrome.Sync.cycle();
      assert.equal(chrome.Sync.getState().status, 'synced');
      await signIn(edge);
      assert.equal((await edge.DB.get('products', 'shared')).name, 'New product');
    });
    await test('clearing all Chrome storage restores saved data after login, without configuration', async () => {
      await chrome.clearStorage();
      assert.equal(chrome.Sync.configured(), true);
      assert.equal(await chrome.DB.get('products', 'shared'), undefined);
      assert.equal(chrome.Sync.token(), '');
      await signIn(chrome);
      assert.equal((await chrome.DB.get('products', 'shared')).stock, 5);
      assert.equal(await chrome.DB.meta('ready:melora'), true);
    });
    await test('offline writes remain queued and never report saved until uploaded', async () => {
      chrome.navigator.onLine = false;
      await chrome.DB.put('products', { id: 'offline', name: 'Waiting' });
      await assert.rejects(chrome.Sync.cycle({ silent: true }), /Offline/);
      assert.equal(chrome.Sync.getState().status, 'offline');
      assert.equal(await chrome.DB.outboxCount(), 1);
      assert.equal((await db.query('melora', "SELECT id FROM products WHERE id = 'offline'")).rowCount, 0);
      chrome.navigator.onLine = true;
      await chrome.Sync.cycle();
      await edge.Sync.cycle();
      assert.equal((await edge.DB.get('products', 'offline')).name, 'Waiting');
    });
    await test('a server failure keeps the edit queued for a successful retry', async () => {
      await chrome.DB.put('products', { id: 'retry', name: 'Retry me' });
      chrome.beforeFetch = () => { throw new Error('connection lost'); };
      await assert.rejects(chrome.Sync.cycle({ silent: true }), /Cannot reach/);
      assert.equal(await chrome.DB.outboxCount(), 1);
      assert.notEqual(chrome.Sync.getState().status, 'synced');
      chrome.beforeFetch = null;
      await chrome.Sync.cycle();
      assert.equal(await chrome.DB.outboxCount(), 0);
    });
    await test('an expired session keeps edits queued until server sign-in', async () => {
      chrome.localStorage.setItem('mtx.sync.token.melora', 'expired');
      await chrome.DB.put('products', { id: 'session', name: 'Needs login' });
      await assert.rejects(chrome.Sync.cycle({ silent: true }), /Session expired/);
      assert.equal(chrome.Sync.getState().status, 'needs-login');
      assert.equal(await chrome.DB.outboxCount(), 1);
      await signIn(chrome);
      assert.equal(await chrome.DB.outboxCount(), 0);
    });
    await test('editing the same record during its upload retains and uploads the newer edit', async () => {
      await chrome.DB.put('products', { id: 'race', name: 'First edit' });
      let intercepted = false;
      chrome.afterFetch = async (url) => {
        if (url.endsWith('/api/sync/push') && !intercepted) {
          intercepted = true;
          await chrome.DB.put('products', { id: 'race', name: 'Second edit' });
        }
      };
      await chrome.Sync.cycle(); chrome.afterFetch = null;
      assert.equal((await chrome.DB.get('products', 'race')).name, 'Second edit');
      assert.equal((await db.query('melora', "SELECT data FROM products WHERE id = 'race'")).rows[0].data.name, 'Second edit');
      assert.equal(await chrome.DB.outboxCount(), 0);
    });
    await test('an edit made during a download is neither overwritten nor omitted from upload', async () => {
      let intercepted = false;
      chrome.afterFetch = async (url) => {
        if (url.includes('/api/sync/pull') && !intercepted) {
          intercepted = true;
          await chrome.DB.put('products', { id: 'shared', name: 'Edited during pull', stock: 7 });
        }
      };
      await chrome.Sync.fullResync(); chrome.afterFetch = null;
      await edge.Sync.cycle();
      assert.equal((await edge.DB.get('products', 'shared')).stock, 7);
      assert.equal(await chrome.DB.outboxCount(), 0);
    });
    await test('concurrent Sync now calls wait for the same actual upload', async () => {
      await chrome.DB.put('products', { id: 'join', name: 'One upload' });
      let release, reached;
      const held = new Promise((r) => { release = r; });
      const started = new Promise((r) => { reached = r; });
      chrome.beforeFetch = async (url) => { if (url.endsWith('/push')) { reached(); await held; } };
      const first = chrome.Sync.cycle();
      await started;
      const second = chrome.Sync.cycle();
      assert.equal(first, second);
      assert.equal(chrome.Sync.getState().status, 'syncing');
      release(); await Promise.all([first, second]); chrome.beforeFetch = null;
    });
    await test('switching stores while a response is in flight cannot write into the other store', async () => {
      chrome.afterFetch = async (url) => {
        if (url.includes('/pull')) {
          chrome.afterFetch = null;
          chrome.Sync.stop(); chrome.DB.close(); chrome.Tenant.id = 'bangeen';
        }
      };
      await assert.rejects(chrome.Sync.fullResync(), /Store changed/);
      assert.equal((await chrome.DB.all('products')).length, 0);
      assert.equal(await chrome.DB.meta('cursor:melora'), undefined);
      chrome.DB.close(); chrome.Tenant.id = 'melora';
    });
    await test('an edit during final bookkeeping is uploaded before sync reports success', async () => {
      const original = chrome.DB.meta;
      let intercepted = false;
      chrome.DB.meta = async function (key, value) {
        const result = await original(key, value);
        if (key === 'ready:melora' && value === true && !intercepted) {
          intercepted = true;
          await chrome.DB.put('products', { id: 'last-moment', name: 'Late edit' });
        }
        return result;
      };
      try { await chrome.Sync.cycle(); } finally { chrome.DB.meta = original; }
      assert.equal(await chrome.DB.outboxCount(), 0);
      assert.equal((await db.query('melora', "SELECT data FROM products WHERE id = 'last-moment'")).rows[0].data.name, 'Late edit');
    });
    await test('a rejected stale edit restores the server version even when its sequence was already read', async () => {
      await db.query('melora', "UPDATE products SET data = $1::jsonb, client_mtime = $2, seq = nextval('change_seq') WHERE id = 'race'",
        [JSON.stringify({ id: 'race', name: 'Server winner' }), Date.now() + 60000]);
      await chrome.Sync.cycle();
      assert.equal((await chrome.DB.get('products', 'race')).name, 'Server winner');
      await chrome.DB.put('products', { id: 'race', name: 'Stale overwrite' });
      await chrome.Sync.cycle();
      assert.equal((await chrome.DB.get('products', 'race')).name, 'Server winner');
    });
    await test('a legacy local-only catalogue is archived, then replaced by the server copy', async () => {
      const old = browser('http://localhost:5588');
      await old.DB.put('products', { id: 'old-browser-only', name: 'Old local data' });
      old.location.origin = 'https://mtx-group.net';
      await signIn(old);
      assert.equal(await old.DB.get('products', 'old-browser-only'), undefined);
      assert.equal((await old.DB.meta('before-server-connection')).data.products[0].id, 'old-browser-only');
      assert.equal((await old.DB.get('products', 'shared')).stock, 7);
      assert.equal((await db.query('melora', "SELECT id FROM products WHERE id = 'old-browser-only'")).rowCount, 0);
    });
    await test('bulk writes commit their outbox together and roll back on invalid data', async () => {
      const isolated = browser();
      await assert.rejects(isolated.DB.bulk('products', [{ id: 'must-rollback' }, { name: 'missing key' }]));
      assert.equal(await isolated.DB.get('products', 'must-rollback'), undefined);
      assert.equal(await isolated.DB.outboxCount(), 0);
    });
    await test('an upload-queue failure cannot leave a record saved only locally', async () => {
      const isolated = browser();
      isolated.crypto = { randomUUID() { throw new Error('queue failed'); } };
      await assert.rejects(isolated.DB.put('products', { id: 'no-queue' }), /queue failed/);
      assert.equal(await isolated.DB.get('products', 'no-queue'), undefined);
      assert.equal(await isolated.DB.outboxCount(), 0);
    });
    await test('failed initial download leaves the user at login, not in an empty store', async () => {
      const fresh = browser();
      fresh.load('app.js');
      let displayed = false;
      fresh.document.createElement = () => ({ remove() {} });
      fresh.document.body = { appendChild() {} };
      fresh.document.getElementById = () => { displayed = true; throw new Error('Must not open the app'); };
      fresh.Sync.cycle = async () => { throw new Error('download failed'); };
      await assert.rejects(fresh.App.enterApp(), /not finished downloading/);
      assert.equal(displayed, false);
      assert.equal(await fresh.DB.meta('ready:melora'), undefined);
    });
  } finally {
    for (const c of clients) { c.Sync.stop(); c.DB.close(); }
    await new Promise((resolve) => server.close(resolve));
    await db.closeAll();
  }
  console.log(`\n${passed}/${total} persistence checks passed.`);
})().catch((e) => { console.error(e); process.exit(1); });
