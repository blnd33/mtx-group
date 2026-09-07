'use strict';
/* End-to-end HTTP test: boots the real Express app against an in-memory
   PostgreSQL and drives it over fetch — login, token auth, sync pull/push,
   user creation. Run: npm run htest */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-for-production-use-only-please';
process.env.STORES = 'melora';
process.env.CORS_ORIGIN = '*';

const assert = require('assert');
const Module = require('module');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');

const mem = newDb();
mem.public.registerFunction({ name: 'now', returns: 'timestamptz', implementation: () => new Date() });
const memPg = mem.adapters.createPg();

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'pg') return memPg;
  return origLoad.call(this, request, ...rest);
};

const { buildSchemaSQL } = require('../src/schema');
const db = require('../src/db');
const { createApp } = require('../src/server');

let passed = 0;
const out = [];
async function test(name, fn) {
  try { await fn(); out.push(`  ok    ${name}`); passed++; }
  catch (e) { out.push(`  FAIL  ${name}\n        ${e.stack || e.message}`); process.exitCode = 1; }
}

(async () => {
  await db.query('melora', buildSchemaSQL());
  await db.query('melora',
    `INSERT INTO users (id, name, role, active, pin_hash) VALUES ($1,$2,$3,true,$4)`,
    ['u_admin', 'Owner Admin', 'Super Admin', bcrypt.hashSync('1234', 8)]);

  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = (r) => r.json();

  await test('GET /api/health is ok', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.strictEqual(r.status, 200);
    const body = await j(r);
    assert.strictEqual(body.stores.melora.db, 'ok');
  });

  await test('GET /api/stores/melora/users lists the admin (no secrets)', async () => {
    const body = await j(await fetch(`${base}/api/stores/melora/users`));
    assert.strictEqual(body.users[0].name, 'Owner Admin');
    assert.ok(!('pin_hash' in body.users[0]));
  });

  await test('login with a wrong PIN is 401', async () => {
    const r = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: 'melora', userId: 'u_admin', pin: '0000' }),
    });
    assert.strictEqual(r.status, 401);
  });

  let token;
  await test('login with the right PIN returns a token', async () => {
    const body = await j(await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: 'melora', userId: 'u_admin', pin: '1234' }),
    }));
    assert.ok(body.token);
    assert.strictEqual(body.store, 'melora');
    assert.strictEqual(body.user.role, 'Super Admin');
    token = body.token;
  });

  const authed = (path, opts = {}) => fetch(`${base}${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(opts.headers || {}) },
  });

  await test('sync/pull without a token is 401', async () => {
    assert.strictEqual((await fetch(`${base}/api/sync/pull`)).status, 401);
  });

  let cursor = 0;
  await test('sync/pull with a token returns the seeded admin, no more', async () => {
    const body = await j(await authed('/api/sync/pull?since=0'));
    assert.ok(body.changes.users.some((u) => u.id === 'u_admin'));
    cursor = body.cursor;
  });

  await test('sync/push stores a product and it comes back on the next pull', async () => {
    const push = await j(await authed('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes: [
        { store: 'products', id: 'p9', data: { id: 'p9', name: 'Crystal Bowl', price: 62000 }, mtime: Date.now() },
      ] }),
    }));
    assert.strictEqual(push.applied.length, 1);
    assert.strictEqual(push.conflicts.length, 0);

    const body = await j(await authed(`/api/sync/pull?since=${cursor}`));
    const p9 = body.changes.products.find((p) => p.id === 'p9');
    assert.strictEqual(p9.data.name, 'Crystal Bowl');
  });

  await test('POST /api/users creates a cashier that shows up in the feed', async () => {
    const created = await j(await authed('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bawan H.', role: 'Cashier', pin: '4321' }),
    }));
    assert.ok(created.id);

    const login = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: 'melora', userId: created.id, pin: '4321' }),
    });
    assert.strictEqual(login.status, 200, 'new cashier can log in');

    const feed = await j(await authed('/api/sync/pull?since=0'));
    const bawan = feed.changes.users.find((u) => u.data.name === 'Bawan H.');
    assert.ok(bawan, 'new user in the sync feed');
    assert.ok(!('pin_hash' in bawan.data) && !('pin' in bawan.data), 'feed carries no PIN');
  });

  await test('a cashier token cannot create users', async () => {
    const login = await j(await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: 'melora', userId: (await j(await authed('/api/users'))).users.find((u) => u.role === 'Cashier').id, pin: '4321' }),
    }));
    const r = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nope', pin: '9999' }),
    });
    assert.strictEqual(r.status, 403);
  });

  /* POST /api/erase over real HTTP. The unit test in erase.test.js covers the
     SQL; this covers the seam it cannot — the route being reachable, the role
     gate, the typed confirmation, and req.store coming off the token. */
  await test('POST /api/erase needs the confirmation to match the store', async () => {
    const r = await authed('/api/erase', { method: 'POST', body: JSON.stringify({ confirm: 'wrong' }) });
    assert.strictEqual(r.status, 400);
    assert.match((await j(r)).error, /confirm must equal "melora"/);
  });

  await test('a cashier token cannot erase', async () => {
    const cashier = (await j(await authed('/api/users'))).users.find((u) => u.role === 'Cashier');
    const login = await j(await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: 'melora', userId: cashier.id, pin: '4321' }),
    }));
    const r = await fetch(`${base}/api/erase`, {
      method: 'POST',
      headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'melora' }),
    });
    assert.strictEqual(r.status, 403);
  });

  await test('POST /api/erase without a token is 401', async () => {
    const r = await fetch(`${base}/api/erase`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'melora' }),
    });
    assert.strictEqual(r.status, 401);
  });

  await test('POST /api/erase clears trading data and tells terminals to delete', async () => {
    await j(await authed('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes: [
        { store: 'products', id: 'ep1', data: { id: 'ep1', name: 'Serum' }, mtime: Date.now() },
        { store: 'sales', id: 'es1', data: { id: 'es1', no: 1001, total: 99 }, mtime: Date.now() },
      ] }),
    }));

    const r = await authed('/api/erase', { method: 'POST', body: JSON.stringify({ confirm: 'melora' }) });
    assert.strictEqual(r.status, 200, 'route exists and is reachable');
    const body = await j(r);
    assert.ok(body.cleared.products >= 1 && body.cleared.sales >= 1, 'reports what it cleared');

    const feed = await j(await authed('/api/sync/pull?since=0'));
    const live = ['products', 'sales', 'customers'].flatMap((s) => feed.changes[s] || []).filter((c) => !c.deleted);
    assert.deepStrictEqual(live, [], 'a terminal syncing from zero is told to delete everything');
    assert.ok((feed.changes.users || []).some((u) => !u.deleted), 'staff logins survive');
  });

  server.close();
  Module._load = origLoad;
  console.log(out.join('\n'));
  console.log(`\n${passed}/${out.length} checks passed.`);
})().catch((e) => { console.error(e); process.exit(1); });
