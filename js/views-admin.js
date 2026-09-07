/* =====================================================================
   MTX GROUP — Views: Users & Permissions, Settings, Backup/Restore, Offline
   ===================================================================== */

const ROLES = () => Object.keys(DEFAULT_ACCESS);

/* ------------------------------ USERS ------------------------------ */
Views.users = async (root) => {
  const users = await DB.all('users');
  const logs = (await DB.all('logs')).sort((a, b) => b.ts - a.ts).slice(0, 12);
  const isSuperAdmin = App.user.role === 'Super Admin';

  const permCard = (role) => {
    if (role === 'Super Admin') {
      return `<div style="margin-bottom:14px"><b class="tiny" style="text-transform:uppercase;letter-spacing:.04em;color:var(--primary)">${role}</b>
        <div class="row wrap" style="gap:6px;margin-top:6px"><span class="badge blue">All modules — full access</span></div></div>`;
    }
    const list = App.access[role] || [];
    const mods = ALL_ROUTES.map((id) => {
      const on = list.includes(id);
      if (isSuperAdmin) return `<span class="badge ${on ? 'green' : 'gray'} perm-toggle" data-role="${UI.esc(role)}" data-mod="${id}" style="cursor:pointer;user-select:none" title="${on ? 'Visible — click to hide' : 'Hidden — click to show'}">${on ? '✓ ' : ''}${TITLES[id] || id}</span>`;
      return on ? `<span class="badge gray">${TITLES[id] || id}</span>` : '';
    }).join('');
    return `<div style="margin-bottom:14px"><b class="tiny" style="text-transform:uppercase;letter-spacing:.04em;color:var(--primary)">${role}</b>
      <div class="row wrap" style="gap:6px;margin-top:6px">${mods || '<span class="tiny muted">No modules visible</span>'}</div></div>`;
  };

  root.innerHTML = `
    <div class="page-head"><div><h1>Users & Permissions</h1><div class="sub">${users.length} users · role-based access control</div></div>
      <button class="btn primary" id="addU">＋ Add User</button></div>
    <div class="grid" style="grid-template-columns:1.5fr 1fr">
      <div class="card pad0"><div class="card-head" style="padding:18px 20px 4px"><h3>Team Members</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>PIN</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => `<tr><td><div class="row"><div class="avatar" style="width:34px;height:34px;font-size:12px">${u.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</div><div><b>${UI.esc(u.name)}</b><div class="tiny muted">${UI.esc(u.email || '')}</div></div></div></td>
          <td><span class="badge blue">${UI.esc(u.role)}</span></td><td class="mono">••••</td>
          <td>${u.active ? '<span class="badge green">Active</span>' : '<span class="badge gray">Disabled</span>'}</td>
          <td><button class="btn sm ghost" data-edit="${u.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Roles & Permissions</h3></div>
        ${isSuperAdmin ? '<p class="tiny muted" style="padding:0 20px 8px">Click a module to show or hide it for that role.</p>' : ''}
        <div style="padding:0 20px 16px">${ROLES().map(permCard).join('')}</div></div>
    </div>
    <div class="card" style="margin-top:18px"><div class="card-head"><h3>Activity & Login Log</h3></div>
      ${logs.length ? logs.map((l) => `<div class="list-item"><span>${l.type === 'login' ? '🔑' : '📝'}</span><div class="grow"><b>${UI.esc(l.user)}</b> <span class="muted">${UI.esc(l.action)}</span></div><span class="tiny muted">${UI.fmtDT(l.ts)}</span></div>`).join('')
        : '<div class="muted">Activity will appear here as your team uses the system.</div>'}</div>`;

  root.querySelector('#addU').onclick = () => userForm(root, null);
  root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => userForm(root, users.find((u) => u.id === b.dataset.edit)));
  root.querySelectorAll('.perm-toggle').forEach((b) => b.onclick = async () => {
    const role = b.dataset.role, mod = b.dataset.mod;
    const on = (App.access[role] || []).includes(mod);
    await App.setAccess(role, mod, !on);
    UI.toast((on ? 'Hid ' : 'Showed ') + (TITLES[mod] || mod) + ' for ' + role);
    Views.users(root);
  });
};

function userForm(root, u) {
  const isNew = !u; u = u || { active: true, role: 'Cashier' };
  UI.modal({
    title: isNew ? 'Add User' : 'Edit User',
    body: `<div class="form-grid">
      <div class="field full"><label>Full name *</label><input class="input" id="u_name" value="${UI.esc(u.name || '')}"></div>
      <div class="field"><label>Email</label><input class="input" id="u_email" value="${UI.esc(u.email || '')}"></div>
      <div class="field"><label>Login PIN${!isNew && Sync.configured() ? ' <span class="muted">(blank = keep)</span>' : ''}</label><input class="input mono" id="u_pin" maxlength="6" value="${Sync.configured() ? '' : UI.esc(u.pin || '')}"></div>
      <div class="field"><label>Role</label><select class="select" id="u_role">${ROLES().map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select class="select" id="u_active"><option value="1" ${u.active ? 'selected' : ''}>Active</option><option value="0" ${!u.active ? 'selected' : ''}>Disabled</option></select></div>
    </div>`,
    footer: `${isNew ? '' : '<button class="btn danger" id="u_del" style="margin-right:auto">Delete</button>'}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="u_ok">Save</button>`
  });
  document.getElementById('u_ok').onclick = async () => {
    const name = document.getElementById('u_name').value.trim(); if (!name) return UI.toast('Name required', 'err');
    const email = document.getElementById('u_email').value.trim();
    const role = document.getElementById('u_role').value;
    const active = document.getElementById('u_active').value === '1';
    const pin = document.getElementById('u_pin').value.trim();

    if (Sync.configured()) {
      if (!navigator.onLine) return UI.toast('Reconnect to the server to add or edit users', 'warn');
      if (isNew && !pin) return UI.toast('Set a login PIN for the new user', 'err');
      try {
        const body = { name, email, role, active };
        if (u.id) body.id = u.id;
        if (pin) body.pin = pin;
        await Sync.saveUser(Tenant.id, body);
        await Sync.cycle().catch(() => {});
      } catch (e) { return UI.toast('Save failed: ' + e.message, 'err'); }
      UI.close(); UI.toast('User saved'); return Views.users(root);
    }

    await DB.put('users', { id: u.id || UI.uid('u'), name, email, pin: pin || '0000', role, active });
    UI.close(); UI.toast('User saved'); Views.users(root);
  };
  const del = document.getElementById('u_del');
  if (del) del.onclick = () => UI.confirm('Delete user "' + u.name + '"?', async () => {
    if (Sync.configured()) {
      if (!navigator.onLine) return UI.toast('Reconnect to the server to delete users', 'warn');
      try { await Sync.deleteUser(Tenant.id, u.id); await Sync.cycle().catch(() => {}); }
      catch (e) { return UI.toast('Delete failed: ' + e.message, 'err'); }
    } else {
      await DB.del('users', u.id);
    }
    UI.close(); UI.toast('Deleted', 'info'); Views.users(root);
  }, { danger: true });
}

/* ------------------------------ SETTINGS ------------------------------ */
Views.settings = async (root, initialTab = 'store') => {
  const store = await DB.setting('store') || {};
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  root.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><div class="sub">Configure this store</div></div></div>
    <div class="tabs" id="setTabs">
      <div class="tab active" data-t="store">Store</div><div class="tab" data-t="currency">Currency</div>
      <div class="tab" data-t="receipt">Receipt & Invoice</div>
      <div class="tab" data-t="app">Appearance & Language</div><div class="tab" data-t="data">Data & Offline</div>
      <div class="tab" data-t="sync">Server & Sync</div></div>
    <div id="setBody"></div>`;

  const b = root.querySelector('#setBody');
  const panels = {
    store: () => `<div class="card" style="max-width:640px"><div class="form-grid">
        <div class="field full"><label>Store name</label><input class="input" id="st_name" value="${UI.esc(store.name || '')}"></div>
        <div class="field"><label>Phone</label><input class="input mono" id="st_phone" value="${UI.esc(store.phone || '')}"></div>
        <div class="field full"><label>Address</label><input class="input" id="st_addr" value="${UI.esc(store.address || '')}"></div>
      </div><button class="btn primary" id="st_save">Save Store Info</button></div>`,

    currency: () => {
      const cur = UI.currency();
      const list = Object.values(UI.currencies());
      return `<div class="card" style="max-width:640px">
        <div class="section-title">Selling currency</div>
        <p class="muted tiny" style="margin-top:-6px;margin-bottom:12px">All prices, receipts and reports use this currency.</p>
        <div class="role-pick" id="curPick">
          ${list.map((c) => `<div class="role-btn ${c.code === cur.code ? 'active' : ''}" data-cur="${c.code}">
            <div style="font-size:20px;font-family:var(--font-display)">${c.symbol}</div>
            <div style="margin-top:4px">${c.code} — ${c.name}</div></div>`).join('')}
        </div>

        <div class="section-title" style="margin-top:22px">Exchange rate</div>
        <div class="row" style="gap:10px;align-items:center">
          <span class="mono" style="font-weight:700">1 USD =</span>
          <input class="input mono" id="fxRate" type="number" min="1" step="1" value="${UI.rate()}" style="max-width:160px">
          <span class="mono" style="font-weight:700">د.ع</span>
          <button class="btn primary" id="fxApply" style="margin-inline-start:auto">Apply rate to prices</button>
        </div>
        <p class="tiny muted" style="margin-top:8px">Sets how prices convert to dinar. In dinar, applying a new rate re-prices every product — a $3 item becomes 3 × rate. Default is the Central Bank of Iraq official rate.</p>

        <div class="card" style="background:var(--surface-2);margin-top:20px;box-shadow:none">
          <div class="section-title" style="margin:0 0 8px">Preview</div>
          <div class="kv"><span class="k">Example price</span><b class="v mono" id="curPreview">${UI.money(cur.code === 'IQD' ? 1500 : 1.25)}</b></div>
          <div class="kv"><span class="k">Decimals</span><b class="v mono">${cur.decimals}</b></div>
        </div>
        <p class="tiny muted" style="margin-top:14px">The Iraqi dinar is sold in whole numbers — the POS hides decimals and offers 250 / 500 / 1,000 / 5,000 / 10,000 / 25,000 / 50,000 quick-cash keys at checkout.</p>
      </div>`;
    },
    receipt: () => `<div class="card" style="max-width:640px"><div class="field"><label>Receipt footer message</label><textarea class="input" id="rc_footer">${UI.esc(store.footer || 'Thank you!')}</textarea></div>
        <div class="form-grid"><div class="field"><label class="row" style="gap:8px"><input type="checkbox" checked> Show logo</label></div>
        <div class="field"><label class="row" style="gap:8px"><input type="checkbox" checked> Show barcode/QR</label></div>
        <div class="field"><label>Default printer</label><select class="select"><option>Thermal 80mm</option><option>Thermal 58mm</option><option>A4 (Laser/Inkjet)</option></select></div>
        <div class="field"><label>Copies</label><input class="input mono" type="number" value="1"></div></div>
        <button class="btn primary" id="rc_save">Save Receipt Settings</button></div>`,
    app: () => `<div class="card" style="max-width:640px"><div class="section-title">Theme</div>
        <div class="role-pick"><div class="role-btn ${theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</div><div class="role-btn ${theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</div></div>
        <div class="section-title" style="margin-top:18px">Language & Direction</div>
        <div class="role-pick"><div class="role-btn ${App.lang === 'en' ? 'active' : ''}" data-lang="en">English</div><div class="role-btn ${App.lang === 'ar' ? 'active' : ''}" data-lang="ar">العربية</div></div>
        <p class="tiny muted" style="margin-top:10px">Arabic switches the interface to full right-to-left layout with Arabic text (Cairo font).</p></div>`,
    data: () => `<div class="grid" style="grid-template-columns:1fr 1fr;max-width:840px">
        <div class="card"><h3>💾 Backup & Restore</h3><p class="muted tiny">Export all local data to a file, or restore from one.</p>
          <a class="btn primary block" href="#/backup" style="margin-top:12px">Open Backup Center</a></div>
        <div class="card"><h3>📡 Offline Database</h3><p class="muted tiny">This store keeps everything in your browser (IndexedDB). Manage local storage here.</p>
          <a class="btn ghost block" href="#/offline" style="margin-top:12px">Offline & Storage Status</a></div></div>`,

    sync: () => {
      const on = Sync.configured();
      const st = Sync.getState();
      return `<div class="card" style="max-width:680px">
        <div class="section-title">Server & Sync</div>
        <p class="muted tiny" style="margin-top:-6px;margin-bottom:14px">${Sync.required()
          ? 'This website automatically connects to its server on every browser. Wait for “Saved on server” before clearing browser data. Offline changes upload when you reconnect and sign in.'
          : 'Connect this terminal to your server so tills share one set of data. Offline changes upload when the connection returns. Without a server connection, records exist only in this browser.'}</p>

        <div class="field"><label>Server address</label>
          <input class="input mono" id="sy_url" placeholder="https://pos.yourdomain.com" value="${UI.esc(Sync.serverUrl())}" ${on ? 'disabled' : ''}></div>
        <div class="row wrap" style="gap:10px;margin-top:8px">
          ${on
            ? (Sync.required() ? '<span class="badge green">Automatic server connection</span>' : '<button class="btn ghost" id="sy_disc">Disconnect this terminal</button>')
            : '<button class="btn ghost" id="sy_test">Test connection</button><button class="btn primary" id="sy_enable">Connect this terminal</button>'}
        </div>
        <div class="tiny" id="sy_testout" style="margin-top:10px"></div>

        ${on ? `
        <div class="card" style="background:var(--surface-2);box-shadow:none;margin-top:18px">
          <div class="kv"><span class="k">Status</span><b class="v">${UI.esc(st.status)}</b></div>
          <div class="kv"><span class="k">This terminal</span><b class="v mono">${UI.esc(Sync.deviceId())}</b></div>
          <div class="kv"><span class="k">Waiting to upload</span><b class="v" id="sy_queued">…</b></div>
          <div class="kv"><span class="k">Last sync</span><b class="v">${st.lastSyncAt ? UI.fmtDT(st.lastSyncAt) : 'never'}</b></div>
          ${st.lastError ? `<div class="tiny text-red" style="margin-top:6px">${UI.esc(st.lastError)}</div>` : ''}
        </div>
        <div class="row wrap" style="gap:10px;margin-top:14px">
          <button class="btn ghost" id="sy_now">Sync now</button>
          <button class="btn ghost" id="sy_upload">Upload this terminal's data</button>
          <button class="btn ghost" id="sy_resync">Full re-download</button>
          <button class="btn ghost" id="sy_signin">Sign in again</button>
          <button class="btn ghost" id="sy_archive">Download previous local data</button>
        </div>
        <p class="tiny muted" style="margin-top:10px"><b>Upload</b> pushes every local record to the server — do this once when first connecting a terminal that already holds data. <b>Full re-download</b> replaces local data with the server's copy.</p>`
        : ''}
      </div>`;
    }
  };
  const render = (t) => {
    b.innerHTML = panels[t]();
    const bind = {
      store: () => root.querySelector('#st_save').onclick = async () => {
        Object.assign(store, { name: st_name.value, phone: st_phone.value, address: st_addr.value });
        await DB.setting('store', store);
        UI.toast('Store info saved');
      },
      currency: () => {
        const rateIn = b.querySelector('#fxRate');
        // Only reflect the typed rate in memory (for previews); persisting happens
        // on Apply / switch so we still know the previous rate to re-price against.
        rateIn.oninput = () => { const v = +rateIn.value; if (v > 0) UI.setRate(v); };
        b.querySelector('#fxApply').onclick = () => applyRate(root, +rateIn.value);
        b.querySelectorAll('[data-cur]').forEach((el) => el.onclick = () => switchCurrency(root, el.dataset.cur, +rateIn.value));
      },
      receipt: () => root.querySelector('#rc_save').onclick = async () => { await DB.setting('store', { ...store, footer: rc_footer.value }); UI.toast('Receipt settings saved'); },
      app: () => {
        b.querySelectorAll('[data-theme]').forEach((el) => el.onclick = () => { App.setTheme(el.dataset.theme); render('app'); });
        b.querySelectorAll('[data-lang]').forEach((el) => el.onclick = () => { b.querySelectorAll('[data-lang]').forEach((x) => x.classList.remove('active')); el.classList.add('active'); App.setLang(el.dataset.lang); });
      },
      data: () => {},
      sync: () => {
        const url = () => b.querySelector('#sy_url').value.trim().replace(/\/+$/, '');
        const out = b.querySelector('#sy_testout');
        const reload = () => Views.settings(root, 'sync');
        const signIn = b.querySelector('#sy_signin');
        if (signIn) signIn.onclick = () => { App.user = null; App.showLogin(); };
        const archive = b.querySelector('#sy_archive');
        if (archive) archive.onclick = async () => {
          const backup = await DB.meta('before-server-connection');
          if (!backup) return UI.toast('No previous local data was found on this browser', 'info');
          const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a'); a.href = url; a.download = Tenant.id + '-before-server-backup.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };

        const testBtn = b.querySelector('#sy_test');
        if (testBtn) testBtn.onclick = async () => {
          if (!url()) return UI.toast('Enter the server address', 'warn');
          Sync.setServer(url(), false);
          out.textContent = 'Testing…';
          try {
            const h = await Sync.testConnection();
            out.innerHTML = h && h.ok
              ? `<span class="text-green">Connected. Stores: ${Object.keys(h.stores || {}).join(', ') || '—'}</span>`
              : '<span class="text-red">Reached the server but it reports a problem.</span>';
          } catch (e) { out.innerHTML = `<span class="text-red">Could not reach it: ${UI.esc(e.message)}</span>`; }
        };

        const enableBtn = b.querySelector('#sy_enable');
        if (enableBtn) enableBtn.onclick = async () => {
          if (!url()) return UI.toast('Enter the server address', 'warn');
          Sync.setServer(url(), false);
          try {
            const h = await Sync.testConnection();
            if (!h || !h.ok) throw new Error('the server is not healthy');
            if (!(h.stores && h.stores[Tenant.id])) throw new Error(`the server has no "${Tenant.id}" store`);
          } catch (e) { return UI.toast('Cannot connect: ' + e.message, 'err'); }
          UI.confirm(`Connect this terminal to ${url()}? From now on you sign in against the server, and this device's changes sync to it.`, () => {
            Sync.setServer(url(), true);
            App.user = null;
            Sync.start();
            App.showLogin();
          });
        };

        const disc = b.querySelector('#sy_disc');
        if (disc) disc.onclick = () => UI.confirm('Disconnect this terminal from the server? It goes back to working only on its own local data.', async () => {
          await Sync.disconnect(); UI.toast('Disconnected', 'info'); reload();
        }, { danger: true });

        const q = b.querySelector('#sy_queued');
        if (q) DB.outboxCount().then((n) => { q.textContent = n + ' change' + (n === 1 ? '' : 's'); });

        const now = b.querySelector('#sy_now');
        if (now) now.onclick = async () => {
          now.disabled = true;
          try { await Sync.cycle(); UI.toast('Sync complete'); } catch (e) { UI.toast('Sync failed: ' + e.message, 'warn'); }
          reload();
        };
        const up = b.querySelector('#sy_upload');
        if (up) up.onclick = () => UI.confirm("Push every record on this terminal to the server? Safe to run more than once.", async () => {
          up.disabled = true; up.textContent = 'Uploading…';
          try { await Sync.uploadLocal(); UI.toast('Upload complete'); } catch (e) { UI.toast('Upload failed: ' + e.message, 'warn'); }
          reload();
        });
        const rs = b.querySelector('#sy_resync');
        if (rs) rs.onclick = () => UI.confirm('Re-download everything from the server? Any local change not yet synced could be replaced by the server copy.', async () => {
          rs.disabled = true; rs.textContent = 'Downloading…';
          try { await Sync.fullResync(); UI.toast('Re-download complete'); } catch (e) { UI.toast('Failed: ' + e.message, 'warn'); }
          reload();
        }, { danger: true });
      }
    };
    bind[t] && bind[t]();
  };
  render(initialTab);
  root.querySelectorAll('#setTabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.t === initialTab));
  root.querySelector('#setTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    root.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active'); render(t.dataset.t);
  });
};

/* Switch the store's selling currency.
   Switching ALWAYS re-prices the whole database at the given rate, so a $3 item
   becomes 4,500 د.ع at 1 USD = 1,500. The user only confirms the conversion —
   there is no "symbol only" path, which used to leave a 0.75 USD item reading
   "1 د.ع" and confused cashiers. */
async function switchCurrency(root, toCode, rateVal) {
  const from = UI.currency();
  if (from.code === toCode) return;
  const to = UI.currencies()[toCode];
  if (rateVal > 0) { UI.setRate(rateVal); await DB.setting('fxRate', rateVal); }

  const factor = UI.fxFactor(from.code, toCode);
  const sample = (await Store.products())[0];
  const preview = sample
    ? `<div class="kv"><span class="k">${UI.esc(sample.name)}</span><b class="v mono">${UI.money(sample.price)}
        <span class="muted">→</span> ${fmtIn(UI.roundTo(sample.price * factor, toCode), to)}</b></div>` : '';

  UI.modal({
    title: `Switch to ${to.name}`,
    body: `<p style="font-size:14.5px;color:var(--text-2)">Convert every price, invoice, expense and balance to
        <b>${to.name}</b> at <b class="mono">1 USD = ${UI.rate().toLocaleString()} د.ع</b>?</p>
      <div class="card" style="background:var(--surface-2);box-shadow:none;margin-top:14px">${preview}
        <div class="kv"><span class="k">Records affected</span><b class="v mono">${(await Store.products()).length} products · ${(await Store.sales()).length} invoices</b></div>
      </div>
      <p class="tiny muted" style="margin-top:14px">Every price follows the rate — a $3 item becomes ${fmtIn(UI.roundTo(3 * factor, toCode), to)}. History and reports stay consistent.</p>`,
    footer: `<button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="cur_conv">Convert &amp; switch</button>`
  });

  const apply = async () => {
    await App.convertAllAmounts(factor, toCode);
    UI.setCurrency(toCode);
    await DB.setting('currency', toCode);
    const store = await DB.setting('store');
    await DB.setting('store', { ...store, currency: toCode });
    UI.close();
    UI.toast(`Now selling in ${to.name}`);
    Views.settings(root, 'currency');
  };
  document.getElementById('cur_conv').onclick = apply;
}

/* Re-price the whole database when the exchange rate changes while staying in
   dinar. Dinar prices track USD at the rate, so a new rate scales every amount
   by newRate / oldRate: at 1 USD = 1,250 a $3 item is 3,750 د.ع; raise the rate
   to 1,500 and the same item becomes 4,500 د.ع. In USD no price depends on the
   rate, so we just store the new number. */
async function applyRate(root, newRate) {
  if (!(newRate > 0)) { UI.toast('Enter a valid exchange rate', 'warn'); return; }
  const cur = UI.currency();
  const oldRate = Number(await DB.setting('fxRate')) || 1320;

  // In USD the rate is only a reference for future conversions — nothing to re-price.
  if (cur.code !== 'IQD') {
    UI.setRate(newRate); await DB.setting('fxRate', newRate);
    UI.toast('Exchange rate saved'); return;
  }
  if (newRate === oldRate) { UI.setRate(newRate); UI.toast('Rate is unchanged'); return; }

  const ratio = newRate / oldRate;
  const sample = (await Store.products())[0];
  const preview = sample
    ? `<div class="kv"><span class="k">${UI.esc(sample.name)}</span><b class="v mono">${UI.money(sample.price)}
        <span class="muted">→</span> ${fmtIn(UI.roundTo(sample.price * ratio, 'IQD'), cur)}</b></div>` : '';

  UI.modal({
    title: 'Apply new exchange rate',
    body: `<p style="font-size:14.5px;color:var(--text-2)">Re-price every product, invoice, expense and balance for
        <b class="mono">1 USD = ${newRate.toLocaleString()} د.ع</b> (was ${oldRate.toLocaleString()})?</p>
      <div class="card" style="background:var(--surface-2);box-shadow:none;margin-top:14px">${preview}
        <div class="kv"><span class="k">Records affected</span><b class="v mono">${(await Store.products()).length} products · ${(await Store.sales()).length} invoices</b></div>
      </div>
      <p class="tiny muted" style="margin-top:14px">Every price follows the rate. History and reports stay consistent.</p>`,
    footer: `<button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="rate_apply">Update prices</button>`
  });

  document.getElementById('rate_apply').onclick = async () => {
    await App.convertAllAmounts(ratio, 'IQD');
    UI.setRate(newRate); await DB.setting('fxRate', newRate);
    UI.close();
    UI.toast(`Prices updated — 1 USD = ${newRate.toLocaleString()} د.ع`);
    Views.settings(root, 'currency');
  };
}
/* Format a value in a currency that isn't the active one (for previews). */
function fmtIn(v, c) {
  const s = Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  return c.position === 'before' ? `${c.symbol}${s}` : `${s} ${c.symbol}`;
}

/* ------------------------ STORE-WIDE DISCOUNT ------------------------
   Super Admin only. A campaign takes a % off EVERY product at checkout —
   e.g. "this week 15% off". Cashiers see it applied automatically; they
   don't need to do anything and can't change it. */
Views.discounts = async (root) => {
  const c = (await DB.setting('campaign')) || { active: false, pct: 0, label: '', from: null, to: null };
  const products = await Store.products();
  const live = campaignLive(c);
  const dayKey = (ts) => (ts ? UI.dayKey(ts) : '');

  root.innerHTML = `
    <div class="page-head"><div><h1>Store Discount</h1><div class="sub">Run a store-wide sale — a percentage off every product</div></div></div>

    <div class="card" style="max-width:720px;${live ? 'border-color:var(--green)' : ''}">
      <div class="row between" style="align-items:flex-start">
        <div><h3>${live ? '🎉 Sale is running' : 'Campaign'}</h3>
          <p class="muted tiny" style="margin-top:4px">${live
            ? `<b>${c.pct}%</b> is being taken off every product at checkout right now.`
            : 'Turn this on to discount every product in the shop at once.'}</p></div>
        <label class="row" style="gap:8px;white-space:nowrap"><input type="checkbox" id="cmp_on" ${c.active ? 'checked' : ''}> <b>Enabled</b></label>
      </div>

      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Discount percent (%)</label>
          <input class="input mono" id="cmp_pct" type="number" min="0" max="90" value="${c.pct || ''}" placeholder="15"></div>
        <div class="field"><label>Name (shown on screen)</label>
          <input class="input" id="cmp_label" value="${UI.esc(c.label || '')}" placeholder="Eid Sale"></div>
        <div class="field"><label>Start date <span class="muted tiny">(optional)</span></label>
          <input class="input" id="cmp_from" type="date" value="${dayKey(c.from)}"></div>
        <div class="field"><label>End date <span class="muted tiny">(optional)</span></label>
          <input class="input" id="cmp_to" type="date" value="${dayKey(c.to)}"></div>
      </div>
      <p class="tiny muted" style="margin-top:8px">Leave the dates empty to run it until you switch it off. Outside the dates the discount stops by itself.</p>
      <div class="row" style="gap:10px;margin-top:14px">
        <button class="btn primary" id="cmp_save">Save campaign</button>
        <button class="btn ghost" id="cmp_stop">Stop sale now</button>
      </div>
    </div>

    <div class="card" style="max-width:720px;margin-top:18px">
      <div class="card-head"><h3>Preview</h3><span class="badge ${live ? 'green' : 'gray'}">${live ? c.pct + '% off' : 'not running'}</span></div>
      <p class="muted tiny">How the first few products will ring up while the sale is on.</p>
      <div class="table-wrap" style="margin-top:10px"><table class="tbl">
        <thead><tr><th>Product</th><th class="right">Normal</th><th class="right">Sale price</th><th class="right">Saving</th></tr></thead>
        <tbody id="cmp_prev"></tbody></table></div>
    </div>`;

  const drawPreview = () => {
    const pct = Math.min(90, Math.max(0, +root.querySelector('#cmp_pct').value || 0));
    root.querySelector('#cmp_prev').innerHTML = products.slice(0, 8).map((p) => {
      const off = p.price * (pct / 100);
      return `<tr><td><b>${UI.esc(p.name)}</b></td>
        <td class="right mono">${UI.money(p.price)}</td>
        <td class="right mono text-green"><b>${UI.money(p.price - off)}</b></td>
        <td class="right mono text-red">− ${UI.money(off)}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="muted">No products yet</td></tr>';
  };
  drawPreview();
  root.querySelector('#cmp_pct').oninput = drawPreview;

  const readForm = () => {
    const from = root.querySelector('#cmp_from').value;
    const to = root.querySelector('#cmp_to').value;
    return {
      active: root.querySelector('#cmp_on').checked,
      pct: Math.min(90, Math.max(0, +root.querySelector('#cmp_pct').value || 0)),
      label: root.querySelector('#cmp_label').value.trim(),
      from: from ? UI.parseDayKey(from).getTime() : null,
      // include the whole end day
      to: to ? UI.parseDayKey(to).getTime() + 86399999 : null
    };
  };
  root.querySelector('#cmp_save').onclick = async () => {
    const next = readForm();
    if (next.active && !next.pct) return UI.toast('Enter a discount percent', 'warn');
    await DB.setting('campaign', next);
    UI.toast(next.active && campaignLive(next) ? `Sale on — ${next.pct}% off everything` : 'Campaign saved');
    Views.discounts(root); App.renderChrome && App.renderChrome();
  };
  root.querySelector('#cmp_stop').onclick = async () => {
    await DB.setting('campaign', { ...c, active: false });
    UI.toast('Sale stopped', 'info'); Views.discounts(root);
  };
};

/* Is a campaign actually in force right now (enabled, has a %, within dates)? */
function campaignLive(c) {
  if (!c || !c.active || !(c.pct > 0)) return false;
  const now = Date.now();
  if (c.from && now < c.from) return false;
  if (c.to && now > c.to) return false;
  return true;
}
window.campaignLive = campaignLive;

/* ------------------------------ BACKUP ------------------------------ */
Views.backup = async (root) => {
  const counts = {};
  for (const s of DB.stores) counts[s] = (await DB.all(s)).length;
  const lastBackup = await DB.setting('lastBackup');
  // Whole-system backups cover every store, so the timestamp is device-level
  // rather than living inside one store's database.
  const lastSysBackup = Number(App.prefs.get('lastSysBackup', 0)) || 0;
  root.innerHTML = `
    <div class="page-head"><div><h1>Backup & Restore</h1><div class="sub">Keep your business data safe — export, import, auto-backup</div></div>
      <span class="store-chip">${UI.esc(Tenant.get().name)}</span></div>

    <div class="card" style="margin-bottom:18px;border:1.5px solid var(--primary)">
      <div class="card-head"><h3>💾 Whole-system backup</h3>
        <span class="badge blue">${STORES.map((s) => UI.esc(s.name)).join(' + ')}</span></div>
      <p class="muted tiny">One file for the entire install — every store, not just the one you are signed into.
        It holds products, sales, invoices, customers, suppliers, expenses, stock movements, staff and settings.
        The dashboard and reports are rebuilt from that data, so they come back too.
        <b>Restoring returns the system to exactly the state it was in when you made the file.</b></p>
      <div class="row wrap" style="gap:10px;margin-top:14px">
        <button class="btn primary" id="sysExport">⬇ Back up the whole system</button>
        <input type="file" id="sysFile" accept=".json" class="input" style="width:auto;flex:1;min-width:200px">
        <button class="btn warn" id="sysRestore">⬆ Restore whole system</button>
      </div>
      <div class="kv" style="margin-top:12px"><span class="k">Last whole-system backup</span>
        <b class="v">${lastSysBackup ? UI.fmtDT(lastSysBackup) : 'Never'}</b></div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card"><h3>📤 Export Backup</h3><p class="muted tiny">Download a complete snapshot of <b>${UI.esc(Tenant.get().name)}</b> only. The other store's data is in its own separate backup.</p>
        <div class="kv" style="margin-top:10px"><span class="k">Products</span><b class="v">${counts.products}</b></div>
        <div class="kv"><span class="k">Sales invoices</span><b class="v">${counts.sales}</b></div>
        <div class="kv"><span class="k">Customers</span><b class="v">${counts.customers}</b></div>
        <div class="kv"><span class="k">Last backup</span><b class="v">${lastBackup ? UI.fmtDT(lastBackup) : 'Never'}</b></div>
        <button class="btn primary block" id="doExport" style="margin-top:14px">⬇ Download Backup File</button></div>
      <div class="card"><h3>📥 Restore Backup</h3><p class="muted tiny">Import data from an MTX backup file. This replaces current data.</p>
        <input type="file" id="restoreFile" accept=".json" class="input" style="margin-top:12px">
        <button class="btn warn block" id="doRestore" style="margin-top:12px">⬆ Restore From File</button>
        <hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
        <h3 class="text-red">⚠ Danger Zone</h3><p class="muted tiny">Erase everything and start from an empty system — no products, sales, customers or expenses. Only your administrator login is kept.</p>
        <button class="btn danger block" id="doWipe" style="margin-top:10px">Erase Everything &amp; Start Empty</button></div>
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:18px">
      <div class="card"><h3>⚠ Backups are manual</h3><p class="muted tiny">There is no automatic backup. This store's data lives only in this browser on this device —
        clearing site data, or a lost or reset machine, loses it. Download a backup file at the end of each trading day and keep it somewhere else.</p>
        <div class="kv" style="margin-top:10px"><span class="k">Last downloaded</span><b class="v">${lastBackup ? UI.fmtDT(lastBackup) : 'Never'}</b></div></div>
      <div class="card"><h3>🧪 Sample data</h3><p class="muted tiny">Load an example catalogue with 14 days of trading history — useful for testing or a demo. Only do this on an empty system.</p>
        <button class="btn ghost block" id="loadDemo" style="margin-top:12px">Load demo data</button></div>
    </div>
    <div class="grid" style="grid-template-columns:1fr;margin-top:18px">
      <div class="card"><h3>↺ Catch-up sales from a stock count</h3>
        <p class="muted tiny">A shop traded on a copy this system never saw? Give the product export from before that trading and one from after —
          the difference is recorded as a catch-up invoice so the money reaches the books, and stock is brought down to the closing figures.
          <b>Where the other copy's backup file still exists, restore that instead — it is exact and this is an estimate.</b></p>
        <button class="btn ghost" id="catchUp" style="margin-top:12px">Compare two stock exports…</button></div>
    </div>`;

  root.querySelector('#catchUp').onclick = () => catchUpModal(root);

  /* ---- whole-system backup ---- */
  const sysBtn = root.querySelector('#sysExport');
  sysBtn.onclick = async () => {
    sysBtn.disabled = true;
    const label = sysBtn.textContent;
    try {
      const json = await DB.exportSystem((name) => { sysBtn.textContent = 'Reading ' + name + '…'; });
      const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mtx-system-backup-${UI.dayKey(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      App.prefs.set('lastSysBackup', String(Date.now()));
      const n = Object.values(json.stores).reduce((t, b) => t + (b.data.sales || []).length, 0);
      UI.toast(`Whole system backed up — ${Object.keys(json.stores).length} stores, ${n} invoices`);
    } catch (e) {
      UI.toast('Backup failed: ' + e.message, 'err');
    } finally {
      sysBtn.disabled = false; sysBtn.textContent = label;
      Views.backup(root);
    }
  };

  root.querySelector('#sysRestore').onclick = () => {
    const f = root.querySelector('#sysFile').files[0];
    if (!f) return UI.toast('Choose a whole-system backup file first', 'warn');
    const reader = new FileReader();
    reader.onload = () => {
      let json;
      try { json = JSON.parse(reader.result); } catch (e) { return UI.toast('Invalid backup file', 'err'); }
      if (!json || json.meta?.kind !== 'system') {
        return UI.toast('That is a single-store backup — use Restore Backup on the right', 'warn');
      }
      const names = Object.values(json.stores).map((b) => b.name || '?').join(' and ');
      const when = json.meta.exportedAt ? UI.fmtDT(json.meta.exportedAt) : 'an unknown time';
      UI.confirm(
        `Put the whole system back to how it was on ${when}? This replaces ${names} completely — ` +
        `every sale, product and customer recorded since then is erased. You are signed into ` +
        `${Tenant.get().name}; you will be signed out afterwards.`,
        async () => {
          try {
            const res = await DB.importSystem(json);
            Store.bust();
            let msg = 'Restored: ' + res.done.join(', ');
            if (res.skipped.length) msg += ' · skipped unknown: ' + res.skipped.join(', ');
            UI.toast(msg);
            // Sign out: the restored file carries its own staff and PINs, and
            // the signed-in user may no longer exist.
            setTimeout(() => { App.user = null; Tenant.clear(); App.showPicker(); }, 1200);
          } catch (e) {
            UI.toast('Restore failed: ' + e.message, 'err');
          }
        }, { danger: true });
    };
    reader.readAsText(f);
  };

  root.querySelector('#doExport').onclick = async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${Tenant.id}-backup-${UI.dayKey(Date.now())}.json`; a.click();
    await DB.setting('lastBackup', Date.now()); UI.toast('Backup downloaded'); Views.backup(root);
  };
  root.querySelector('#doRestore').onclick = () => {
    const f = root.querySelector('#restoreFile').files[0];
    if (!f) return UI.toast('Choose a backup file first', 'warn');
    const reader = new FileReader();
    reader.onload = () => {
      let json;
      try { json = JSON.parse(reader.result); } catch (e) { return UI.toast('Invalid backup file', 'err'); }
      if (!json || !json.data) return UI.toast('Invalid backup file', 'err');

      const here = Tenant.get();
      const from = json.meta && json.meta.store;
      const run = async () => {
        try { await DB.importAll(json); Store.bust(); UI.toast('Data restored into ' + here.name); Views.backup(root); }
        catch (e) { UI.toast('Restore failed: ' + e.message, 'err'); }
      };

      // Restoring one shop's books into the other would silently merge two
      // businesses — make that impossible to do by accident.
      if (from && from !== here.id) {
        const other = Tenant.find(from);
        return UI.confirm(
          `This backup was taken from ${other ? other.name : from}, but you are signed into ${here.name}. ` +
          `Restoring it would overwrite ${here.name}'s products, sales and customers with the other store's data. ` +
          `Switch to ${other ? other.name : from} and restore there instead. Continue anyway?`,
          run, { danger: true });
      }
      UI.confirm(`Restore will replace all of ${here.name}'s current data. Continue?`, run);
    };
    reader.readAsText(f);
  };
  /* Erase everything for this store.

     With sync on, clearing the browser alone achieves nothing: the wipe also
     drops the sync cursor, so the next pull re-downloads the whole lot from
     the server and the button looks broken. So when a server is connected the
     server is erased FIRST (it tombstones the rows, which also clears every
     other terminal), then the local copy, then the cursor is parked at the
     server's head so nothing is pulled back. */
  const wipeBtn = root.querySelector('#doWipe');
  wipeBtn.onclick = () => {
    const synced = window.Sync && Sync.configured();
    const here = Tenant.get().name;
    UI.confirm(
      `This permanently erases ALL products, sales, invoices, customers, suppliers, expenses and stock history for ${here}. ` +
      (synced
        // With a server, the staff list lives there and is not erased, so it
        // comes back on the next sync along with the store's settings.
        ? 'It erases them ON THE SERVER as well, so every other terminal clears itself down on its next sync. '
          + 'Your staff logins and store settings are kept. '
        // Standalone, the local database is emptied outright: the app rebuilds
        // itself on restart with a single default administrator.
        : 'Your staff list is erased too — the system restarts with one administrator, '
          + '"Owner Admin", PIN 1234. Change that PIN straight away. ') +
      'This cannot be undone — download a backup first if you have not. Are you absolutely sure?',
      async () => {
        const label = wipeBtn.textContent;
        wipeBtn.disabled = true;
        try {
          if (synced) {
            wipeBtn.textContent = 'Erasing on the server…';
            await Sync.eraseServer();
          }
          wipeBtn.textContent = 'Erasing locally…';
          await DB.wipe();
          await DB.setting('seeded', false);
          if (synced) {
            /* The wipe also dropped the sync cursor, so this pull starts from
               scratch. That is what we want: the server now sends the rows
               back as tombstones (deleted, no data), which apply as deletes
               and leave the till empty, while settings and staff — which were
               never erased — come back intact. */
            wipeBtn.textContent = 'Re-syncing…';
            await Sync.cycle().catch(() => {});
          }
          Store.bust();
          UI.toast(synced ? 'Erased here and on the server' : 'Everything erased — starting empty', 'info');
          setTimeout(() => location.reload(), 900);
        } catch (e) {
          wipeBtn.disabled = false; wipeBtn.textContent = label;
          // Nothing local has been touched yet if the server call failed, so
          // the shop is still intact — say so rather than leaving them guessing.
          UI.toast('Erase failed: ' + e.message + ' — nothing was deleted', 'err');
        }
      }, { danger: true });
  };

  root.querySelector('#loadDemo').onclick = async () => {
    const existing = (await DB.all('products')).length;
    UI.confirm(existing
      ? `You already have ${existing} products. Loading demo data will add sample products, sales and customers on top. Continue?`
      : 'Load sample products, customers and 14 days of trading history?',
      async () => { await Seed.demo(); Store.bust(); UI.toast('Demo data loaded'); location.reload(); });
  };
};

/* ------------------------------ OFFLINE STATUS ------------------------------ */
Views.offline = async (root) => {
  const online = navigator.onLine;
  let usage = null;
  if (navigator.storage && navigator.storage.estimate) usage = await navigator.storage.estimate();
  const usedMB = usage ? (usage.usage / 1048576).toFixed(2) : '—';
  const quotaMB = usage ? (usage.quota / 1048576).toFixed(0) : '—';
  const pct = usage ? (usage.usage / usage.quota * 100).toFixed(1) : 0;
  const swReady = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  const counts = {}; for (const s of ['products', 'sales', 'customers', 'expenses']) counts[s] = (await DB.all(s)).length;

  root.innerHTML = `
    <div class="page-head"><div><h1>Offline & Storage</h1><div class="sub">Offline-first — this store never stops selling without internet</div></div>
      <span class="status-chip ${online ? '' : 'offline'}"><span class="dot"></span>${online ? 'Online' : 'Offline'}</span></div>

    <div class="stats" style="margin-bottom:20px">
      <div class="stat"><div class="ico ${online ? 'g' : 'o'}">${online ? '🌐' : '📴'}</div><div class="label">Connection</div><div class="value" style="font-size:20px">${online ? 'Online' : 'Offline Mode'}</div><div class="tiny muted">${online ? 'All features working' : 'All features still working'}</div></div>
      <div class="stat"><div class="ico ${swReady ? 'g' : 'r'}">⚙️</div><div class="label">Service Worker</div><div class="value" style="font-size:20px">${swReady ? 'Active' : 'Loading'}</div><div class="tiny muted">App shell cached for offline</div></div>
      <div class="stat"><div class="ico c">🗄️</div><div class="label">Local Database</div><div class="value" style="font-size:20px">IndexedDB</div><div class="tiny muted">${counts.products} products · ${counts.sales} sales</div></div>
      <div class="stat"><div class="ico">💽</div><div class="label">Storage Used</div><div class="value mono" style="font-size:20px">${usedMB} MB</div><div class="tiny muted">of ${quotaMB} MB quota</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1.3fr 1fr">
      <div class="card"><div class="card-head"><h3>How the suite works offline</h3></div>
        ${[['⚙️', 'Service Worker', 'Caches the entire app so it loads instantly with zero internet.', 'green', 'Ready'],
           ['🗄️', 'Local IndexedDB', 'Every product, sale, invoice and report is stored on this device.', 'green', 'Ready'],
           ['🖨️', 'Local Printing', 'Receipts print directly from the browser to thermal/A4 printers.', 'green', 'Ready'],
           ['📷', 'Barcode Scanning', 'USB/Bluetooth scanners work as keyboard input — no internet needed.', 'green', 'Ready'],
           ['💾', 'Backups', 'Manual only — download a backup file yourself from Backup & Restore.', 'amber', 'Manual'],
           ['☁️', 'Cloud Sync', Sync.configured()
             ? 'Connected to the store server. Wait for “Saved on server” before clearing local data. Pending offline changes exist only on this device.'
             : 'Not connected. Records exist only on this device. Connect in Settings → Server & Sync.', Sync.configured() ? 'green' : 'amber', Sync.configured() ? UI.esc(Sync.getState().status) : 'Not connected']
          ].map((r) => `<div class="list-item"><div class="thumb-sm">${r[0]}</div><div class="grow"><b>${r[1]}</b><div class="tiny muted">${r[2]}</div></div><span class="badge ${r[3]}">${r[4]}</span></div>`).join('')}
      </div>
      <div class="card"><div class="card-head"><h3>Storage Usage</h3></div>
        <div class="value mono" style="font-size:30px;font-weight:800">${usedMB}<span style="font-size:14px" class="muted"> MB</span></div>
        <div class="progress" style="margin:14px 0"><i style="width:${Math.max(pct, 2)}%"></i></div>
        <div class="tiny muted">${pct}% of available browser storage used</div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <button class="btn primary block" id="installBtn">📲 Install as App</button>
        <a class="btn ghost block" href="#/backup" style="margin-top:8px">Backup Data Now</a>
      </div>
    </div>`;

  root.querySelector('#installBtn').onclick = () => {
    if (window.__deferredPrompt) { window.__deferredPrompt.prompt(); }
    else UI.toast('Use your browser menu → "Install app" / "Add to Home screen"', 'info');
  };
};
