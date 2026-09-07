# MTX Group Retail Suite — sync server

Puts the two stores online. Each store gets its **own PostgreSQL database**
(`mtx_melora`, `mtx_bangeen`) — never a shared one. The browser / Electron app
keeps working from its local copy and syncs to this server, so a dropped
connection doesn't stop the till.

```
server/
  src/
    config.js     env parsing + validation
    db.js         one connection pool per store database
    schema.js     the per-store table layout (generated from tables.js)
    tables.js     THE list of data types — drives schema, sync and import
    migrate.js    apply the schema (idempotent)
    setup.js      `npm run setup` — create databases + schema + admin user
    auth.js       PIN login -> JWT, per-store token
    users.js      user list / create / update (PINs bcrypt-hashed, server only)
    sync.js       pull (change feed) + push (last-write-wins)
    import.js     `npm run import` — load a Backup & Restore JSON into a store
    server.js     the Express app (health, auth, sync, users)
    index.js      `npm start`
  test/smoke.js   no-database sanity checks
  docker-compose.yml   local PostgreSQL for dev/testing
  .env.example
```

---

## 1. Requirements

- **Node.js 18+** (`node -v`)
- **PostgreSQL 13+** — a system package, a container, or a managed service
  (RDS, Neon, Supabase, DigitalOcean). The Postgres user needs `CREATEDB`, or
  the two databases are created by hand (see step 3).

---

## 2. Install

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`. The important ones:

| Variable | What |
|---|---|
| `JWT_SECRET` | **Required.** `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CORS_ORIGIN` | The domain the app is served from, e.g. `https://pos.yourdomain.com` |
| `STORES` | `melora,bangeen` (the store ids — database name is `mtx_` + id) |
| `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` | how to reach PostgreSQL |
| `DEFAULT_ADMIN_PIN` | PIN of the auto-created admin on a brand-new store |
| `SERVE_STATIC` | set to `..` to also serve the app from this server (one origin, no CORS) |

No PostgreSQL handy for a test run? `docker compose up -d` starts one on
`localhost:5432` with user/password `mtx` / `mtx`.

---

## 3. Create the databases

```bash
npm run setup
```

This creates `mtx_melora` and `mtx_bangeen` (if missing), applies the schema to
each, and adds an `Owner Admin` user (PIN from `DEFAULT_ADMIN_PIN`) to any store
that has no users yet. **Safe to re-run** — it never drops or clears anything,
and it's how future schema updates are applied.

If your Postgres user can't `CREATEDB`, create them first, then run setup:

```sql
CREATE DATABASE mtx_melora;
CREATE DATABASE mtx_bangeen;
```

---

## 4. Bring your existing data across

Each current install already produces a JSON export: **Backup & Restore →
Export** inside the app. Do that on each store's machine, copy the files over,
then:

```bash
npm run import -- melora  ./melora-backup.json  --wipe
npm run import -- bangeen ./bangeen-backup.json --wipe
```

`--wipe` clears the target tables first (a clean import). PINs from the old
backup are bcrypt-hashed on the way in.

**Do a dry run first:** point `.env` at a throwaway database (e.g.
`STORES=melora_staging,bangeen_staging`), import, run the app against it, check
the dashboard/reports totals match the old install. Then repeat against the real
databases and cut over.

### Verify the import

Don't eyeball the dashboard — a truncated import or a missing table can still
leave a screen that looks plausible. `verify.js` recomputes the money from both
sides and compares them line by line:

```bash
npm run verify -- bangeen ./bangeen-backup.json
```

It is read-only, so it is safe against a live database. It checks row counts,
net revenue, profit, cost of goods, discounts, expenses, customer and supplier
balances, stock units and inventory value — and three things that are easy to
miss:

- **duplicate invoice numbers** in the backup itself (refunds match their
  original by number, so a duplicate silently misattributes a refund later);
- **`invoiceSeq` present on the server**, without which the online till restarts
  numbering at 1001 and reissues numbers the offline copy already used;
- **`invoiceSeq` higher than the highest invoice** actually in the data.

Exit code is 0 on a clean match, 1 if anything is off.

### Cutting over a shop that is still trading

The import is a **snapshot**. Any sale rung up on the old install after the
export is stranded — it exists only there, and importing again later with
`--wipe` would discard whatever was rung up online in the meantime.

So do the real cut-over in one sitting, at close of business:

1. **Rehearse** any time beforehand — export, import into a staging database,
   `npm run verify`. This is where you find problems, not on the night.
2. At close, on the old install: **Backup & Restore → Download Backup File**.
   No more sales after this point.
3. `npm run import -- <store> ./backup.json --wipe`
4. `npm run verify -- <store> ./backup.json` — must print **PASS**.
5. Point the shop's terminal at the server (Settings → Sync) and sign in.
6. Keep the backup file. It is the only copy of that history until the server's
   own backups have run at least once.

---

## 5. Run

```bash
npm start          # foreground
```

Check it:

```bash
curl http://localhost:5599/api/health
```

### Production process

Use a process manager so it restarts on crash/reboot:

```bash
# pm2
npm i -g pm2
pm2 start src/index.js --name mtx-server
pm2 save && pm2 startup
```

or a systemd unit (`/etc/systemd/system/mtx-server.service`):

```ini
[Unit]
Description=MTX sync server
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/mtx/server
ExecStart=/usr/bin/node src/index.js
Restart=always
EnvironmentFile=/opt/mtx/server/.env
User=mtx

[Install]
WantedBy=multi-user.target
```

### HTTPS

Put a reverse proxy in front for TLS (the app must be served over HTTPS for the
service worker to work). Caddy is the least effort:

```
pos.yourdomain.com {
    reverse_proxy 127.0.0.1:5599
}
```

nginx equivalent: `proxy_pass http://127.0.0.1:5599;` in a `server {}` block with
a certbot certificate.

If `SERVE_STATIC=..` is set, this one server serves both the app and the API.
Otherwise host the static files (`index.html`, `css/`, `js/`, `assets/`,
`service-worker.js`, `manifest.webmanifest`) wherever you like and point
`CORS_ORIGIN` at that domain.

---

## 6. Backups

The whole point of going online is one authoritative copy — so back it up.
Per database, nightly, off the server:

```bash
pg_dump -Fc mtx_melora  > melora_$(date +%F).dump
pg_dump -Fc mtx_bangeen > bangeen_$(date +%F).dump
```

Restore: `pg_restore -d mtx_melora --clean melora_2026-08-29.dump`.

---

## API (for the frontend sync layer — Phase 2)

All JSON. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | per-store db + schema status |
| `GET` | `/api/stores` | `{ stores: ["melora","bangeen"] }` |
| `GET` | `/api/stores/:store/users` | login-screen list (name + role, no PIN) |
| `POST` | `/api/login` | `{ store, userId, pin }` → `{ token, user, store }` |
| `GET` | `/api/me` | who the token belongs to |
| `GET` | `/api/sync/pull?since=<cursor>&limit=<n>` | `{ cursor, hasMore, changes: { <store>: [{id,data,deleted}] } }` |
| `POST` | `/api/sync/push` | `{ changes: [{ store, id, data, deleted, mtime }] }` → `{ applied, conflicts }` |
| `GET` | `/api/users` | Manager+ |
| `POST` | `/api/users` | Admin+ — `{ name, role, pin, email }` |
| `PATCH` | `/api/users/:id` | Admin+ — any of `name, role, email, active, pin, deleted` |

**Sync model.** Every row in every store database carries a `seq` (its place in
that database's change order) and a `client_mtime` (wall-clock ms of the client
write).

- **pull**: "give me every row with `seq` greater than my cursor." The client
  advances its cursor to the highest `seq` it receives and loops while
  `hasMore` is true. `since=0` is a full re-sync.
- **push**: the server applies each change only if its `client_mtime` is newer
  than (or equal to) what it already has — otherwise it's returned in
  `conflicts` and the client should pull to get the winning version. This is
  last-write-wins by client clock; keep the tills' clocks roughly in sync.
- `invoiceSeq` and `seeded` in `settings` are never accepted from a push — each
  terminal keeps its own local invoice counter until Phase 3 gives every
  terminal a number prefix.
- `users` is read through the pull feed (no PIN) but written only via
  `/api/users`.

---

## Tests

```bash
npm test
```

Runs three suites against an in-memory PostgreSQL (`pg-mem`, a dev dependency —
not installed in production with `npm install --omit=dev`):

- `smoke` — every module loads, schema SQL is well-formed, app mounts
- `sync.test` — schema applies, pull/push, cursor advance, last-write-wins
  conflicts, tombstones, protected settings, **store isolation**
- `http.test` — real Express app over `fetch`: login, token auth, 401/403
  guards, sync round-trip, user creation

For a real end-to-end check, run `docker compose up -d`, `npm run setup`,
`npm start`, then `curl localhost:5599/api/health`.

## Connecting the app (done — Phase 2)

### Published website: mtx-group.net

The website now always uses its own `/api` backend. Both `mtx-group.net` and
`www.mtx-group.net` enable server sync automatically, even after all browser
storage is cleared. Browser settings cannot disable or redirect this connection.
Users sign in with their **server account and PIN**; the local-only starter PIN
is not a replacement for a server account.

The first complete download must succeed before a fresh browser opens the store.
The status banner distinguishes saved records, pending uploads, offline operation,
and expired sessions. Only records confirmed as **Saved on server** can be
recovered after clearing browser storage. Pending offline changes still require
the original browser to reconnect and upload them.

On the first connection from an old local-only browser, the previous local data
is archived in that browser and the visible cache is rebuilt from the server.
Already queued changes are retained. The archive can be downloaded from
**Settings → Server & Sync → Download previous local data**. It is not uploaded
automatically, so an old browser cannot silently restore an obsolete catalogue.

To deploy this update, run `git pull --ff-only origin main` in the existing
Hostinger checkout. This release changes frontend assets; it needs no database
migration or reset. If the backend serves a copied build directory, update those
assets using the existing deployment process. The service-worker cache version
is `mtx-shell-v12`; refreshing the website installs the update without clearing
business data. Keep all existing server environment variables and databases.

After deployment, verify `/api/health`, sign in, add a test product and wait for
**Saved on server**. Sign in to the same store in a fresh browser and verify it.
Then clear only the test browser's site data, sign in again, and verify recovery.

### Local desktop/development installs

The frontend sync layer ships in `js/sync.js` + `js/db.js`. To point a terminal
at this server:

1. Open the app, pick the store, sign in as before.
2. **Settings → Server & Sync** → enter the server address → **Test connection**
   → **Connect this terminal**.
3. Sign in again (now against the server). On a terminal that already holds
   data, use **Upload this terminal's data** once so the server gets it.

From then on that terminal signs in against the server, queues every change
locally, and syncs in the background (status chip in the top bar). It keeps
selling with no connection; a cashier who has signed in online once can sign in
offline with the same PIN.

## What's not done yet (Phase 3)

- **Per-terminal invoice numbers** — right now each terminal keeps its own local
  counter, so run **one till per store** until this lands, or two offline tills
  can mint the same invoice number.
- **Stock / customer-debt from ledgers** instead of last-write-wins, so two
  tills selling the same product offline can't lose a movement.
- **Audit log** — record who did each sensitive action (discount, refund, price
  change, permission change) in an append-only server table.
