/* =====================================================================
   MTX GROUP — Application core: Store (analytics), Router, Chrome, Auth

   Flow: splash → STORE PICKER → per-store sign-in → app shell.
   The picker decides which IndexedDB database everything below talks to,
   so Melora and Bangeen Crystal never see each other's data.
   ===================================================================== */

/* ---------------- Store: cached data + analytics ---------------- */
const Store = (() => {
  let cache = {};
  const get = async (s) => { if (!cache[s]) cache[s] = await DB.all(s); return cache[s]; };
  return {
    bust() { cache = {}; },
    products: () => get('products'),
    categories: () => get('categories'),
    sales: () => get('sales'),
    customers: () => get('customers'),
    suppliers: () => get('suppliers'),
    async metrics() {
      const sales = await get('sales');
      const products = await get('products');
      const expenses = await DB.all('expenses');
      const now = new Date();
      const isSale = (s) => s.type === 'sale'; // only true sales are "orders"; refunds & exchanges net money but don't count
      const todays = sales.filter((s) => UI.isToday(s.ts));
      const todaySales = todays.reduce((a, s) => a + s.total, 0);   // net of refunds
      const todayProfit = todays.reduce((a, s) => a + s.profit, 0); // net of refunds
      const todayExpense = expenses.filter((e) => UI.isToday(e.ts)).reduce((a, e) => a + e.amount, 0);

      // Cash drawer is a per-day concept: opening float + today's cash in − today's cash out
      const drawer = await DB.setting('drawer') || { opening: 0 };
      const cashSales = todays.filter((s) => s.pay === 'Cash').reduce((a, s) => a + s.total, 0);
      const cashExp = expenses.filter((e) => e.pay === 'Cash' && UI.isToday(e.ts)).reduce((a, e) => a + e.amount, 0);

      // last 7 days
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = UI.dayKey(d.getTime());
        const total = sales.filter((s) => UI.dayKey(s.ts) === key).reduce((a, s) => a + s.total, 0);
        last7.push({ label: d.toLocaleDateString(App.lang === 'ar' ? 'ar' : undefined, { weekday: 'short' }), total });
      }

      // this month
      const inMonth = (t) => new Date(t).getMonth() === now.getMonth() && new Date(t).getFullYear() === now.getFullYear();
      const mSales = sales.filter((s) => inMonth(s.ts)).reduce((a, s) => a + s.total, 0);
      const mCost = sales.filter((s) => inMonth(s.ts)).reduce((a, s) => a + (s.cost || 0), 0);
      const mExpense = expenses.filter((e) => inMonth(e.ts)).reduce((a, e) => a + e.amount, 0);

      // top products — category-amount sales (Cat POS) aren't products, so they're left out
      const q = {}; sales.filter((s) => s.channel !== 'catpos').forEach((s) => s.items.forEach((i) => q[i.name] = (q[i.name] || 0) + i.qty));
      const topProducts = Object.entries(q).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 6);

      // cashiers — total nets refunds, but the order count only counts real sales
      const cby = {}; sales.forEach((s) => { cby[s.cashier] = cby[s.cashier] || { count: 0, total: 0 }; if (isSale(s)) cby[s.cashier].count++; cby[s.cashier].total += s.total; });
      const cashiers = Object.entries(cby).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 4);

      return {
        todaySales, todayProfit, todayExpense, todayCount: todays.filter(isSale).length,
        cashDrawer: (drawer.opening || 0) + cashSales - cashExp,
        totalOrders: sales.filter(isSale).length, totalRevenue: sales.reduce((a, s) => a + s.total, 0),
        invValue: products.reduce((a, p) => a + p.cost * p.stock, 0),
        lowStock: products.filter((p) => p.stock <= (p.minStock || 0)),
        marginTxt: todaySales ? (todayProfit / todaySales * 100).toFixed(0) + '% <span>margin</span>' : '—',
        last7, mSales, mCost, mExpense,
        topProducts, cashiers,
        recent: [...sales].sort((a, b) => b.ts - a.ts).slice(0, 6)
      };
    }
  };
})();
window.Store = Store;

/* ---------------- Navigation config ---------------- */
const NAV = [
  { group: 'Main' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'pos', label: 'POS Checkout', icon: '🛒' },
  { id: 'catpos', label: 'Cat POS', icon: '🧮' },
  { group: 'Catalog' },
  { id: 'products', label: 'Products', icon: '📦' },
  { id: 'categories', label: 'Categories', icon: '🏷' },
  { id: 'inventory', label: 'Inventory', icon: '🗃️' },
  { id: 'barcode', label: 'Barcode', icon: '🏷️' },
  { group: 'Finance' },
  { id: 'finance', label: 'Financial Center', icon: '💰' },
  { id: 'expenses', label: 'Expenses', icon: '🧾' },
  { id: 'invoices', label: 'Invoices', icon: '📄' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { group: 'People' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
  { id: 'users', label: 'Users & Roles', icon: '🔐' },
  { group: 'System' },
  { id: 'discounts', label: 'Store Discount', icon: '🎉' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'backup', label: 'Backup & Restore', icon: '💾' },
  { id: 'offline', label: 'Offline Status', icon: '📡' }
];
const TITLES = Object.fromEntries(NAV.filter((n) => n.id).map((n) => [n.id, n.label]));
const ALL_ROUTES = NAV.filter((n) => n.id).map((n) => n.id);

/* ---------------- Access control ----------------
   Default starting point for what each role can open. '*' = every module.
   `offline` is available to everyone (it's just device/connection status).
   READONLY lists modules a role may view but not modify (write buttons hidden).
   Super Admin can override any of this per-role at runtime from the Users &
   Permissions page (see App.access / App.loadAccess / App.setAccess below) —
   DEFAULT_ACCESS only supplies the values used the first time a store runs.
   Because access is stored in the store's own database, Melora and Bangeen
   can hand out completely different permissions. */
const DEFAULT_ACCESS = {
  'Super Admin': '*',
  'Admin': '*',
  'Manager': ['dashboard', 'pos', 'catpos', 'products', 'categories', 'inventory', 'barcode', 'finance', 'expenses', 'invoices', 'reports', 'customers', 'suppliers', 'offline'],
  'Cashier': ['dashboard', 'pos', 'catpos', 'barcode', 'expenses', 'invoices', 'reports', 'offline'],
  'Accountant': ['dashboard', 'categories', 'finance', 'expenses', 'invoices', 'reports', 'customers', 'suppliers', 'offline'],
  'Inventory Staff': ['dashboard', 'products', 'categories', 'inventory', 'barcode', 'suppliers', 'offline']
};
const READONLY = {
  'Cashier': ['products']
};
/* Modules excluded from the '*' default so Admin doesn't start with them —
   Super Admin can still switch them on for any role from Users & Permissions. */
const SUPER_ONLY = ['discounts'];

/* ---------------- App core ---------------- */
const App = {
  user: null,
  lang: 'en',
  access: {},

  /* Device-level preferences (theme, language) live outside any store's
     database so the picker screen can be themed before a store is chosen.
     Once you're inside a store, that store's saved settings take over. */
  prefs: {
    get(k, d) { try { const v = localStorage.getItem('mtx.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mtx.' + k, v); } catch (e) { /* private mode */ } }
  },

  async loadAccess() {
    const saved = await DB.setting('access');
    const merged = {};
    for (const role of Object.keys(DEFAULT_ACCESS)) {
      const def = DEFAULT_ACCESS[role];
      const defList = def === '*' ? ALL_ROUTES.filter((id) => role === 'Super Admin' || !SUPER_ONLY.includes(id)) : def.slice();
      merged[role] = (saved && saved[role]) ? saved[role] : defList;
    }
    this.access = merged;
  },

  async setAccess(role, moduleId, allow) {
    if (role === 'Super Admin') return; // always full access, not editable
    const list = this.access[role] || (this.access[role] = []);
    const i = list.indexOf(moduleId);
    if (allow && i < 0) list.push(moduleId);
    if (!allow && i >= 0) list.splice(i, 1);
    await DB.setting('access', this.access);
  },

  async init() {
    // Device prefs first — the picker is painted before any store is open.
    this.applyLangSetting(this.prefs.get('lang', 'en') === 'ar' ? 'ar' : 'en');
    document.documentElement.setAttribute('data-theme', this.prefs.get('theme', 'light'));
    this.registerSW();
    this.watchConnection();
    this.watchViewport();
    this.installTranslateObserver();

    setTimeout(async () => {
      const sp = document.getElementById('splash');
      if (sp) { sp.style.opacity = '0'; setTimeout(() => sp.remove(), 500); }
      // Coming back from a refresh mid-shift? Go straight to that store's login.
      const remembered = Tenant.remembered();
      // Otherwise, a store-specific subdomain (melora.mtx-group.net,
      // bangeen.mtx-group.net) deep-links straight into its own sign-in
      // screen. Anything else — bare domain, localhost, the desktop app —
      // shows the normal two-store picker.
      const hostStore = Tenant.hostStore();
      if (remembered) await this.enterStore(remembered.id);
      else if (hostStore) await this.enterStore(hostStore);
      else this.showPicker();
    }, 1600);
  },

  /* ---------------- Screen 1: store picker ---------------- */
  showPicker() {
    document.getElementById('app').classList.add('hide');
    document.getElementById('login').classList.add('hide');
    const el = document.getElementById('picker');
    el.classList.remove('hide');
    el.innerHTML = `
      <div class="picker">
        <header class="picker-top">
          <div class="mtx-lockup">
            <span class="mtx-badge sm"><img src="assets/mtx-mark.svg" alt=""></span>
            <span><b>MTX Group</b><i>RETAIL SUITE</i></span>
          </div>
          <div class="row" style="gap:8px">
            <button class="icon-btn" id="pkLang" title="Language">🌐</button>
            <button class="icon-btn" id="pkTheme" title="Toggle theme">🌓</button>
          </div>
        </header>

        <div class="picker-body">
          <div class="picker-head">
            <div class="eyebrow">Select a workspace</div>
            <h1>Which store are you<br>working in today?</h1>
          </div>

          <div class="store-grid">
            ${STORES.map((s) => `
              <button class="store-card" data-store="${s.id}"
                      style="--sc:${s.theme['--primary']};--sc2:${s.theme['--primary-2']};--sc-soft:${s.theme['--primary-soft']}">
                <span class="sc-glow" aria-hidden="true"></span>
                <span class="sc-logo"><img src="${s.logo}" alt="${UI.esc(s.name)}"></span>
                <span class="sc-body">
                  <span class="sc-tag">${UI.esc(s.tagline)}</span>
                  <span class="sc-name">${UI.esc(s.name)}</span>
                  <span class="sc-blurb">${UI.esc(s.blurb)}</span>
                </span>
                <span class="sc-go">Enter store <i>→</i></span>
              </button>`).join('')}
          </div>
        </div>
      </div>`;

    el.querySelectorAll('.store-card').forEach((card) => {
      card.onclick = () => {
        card.classList.add('picked');
        setTimeout(() => this.enterStore(card.dataset.store), 220);
      };
    });
    document.getElementById('pkTheme').onclick = () =>
      this.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    document.getElementById('pkLang').onclick = (e) => { e.stopPropagation(); this.showLangMenu(e.currentTarget); };
    this.translate(el);
  },

  /* Open a store: point the database at it, bootstrap it if it's brand new,
     load its own settings, then show its sign-in screen. */
  async enterStore(id) {
    await Tenant.set(id);
    // With a server configured, the server is the source of truth — don't lay
    // down a local starter catalogue. A fresh terminal fills up from the first
    // sync after sign-in (see syncBootstrap).
    if (!Sync.configured()) await Seed.run();
    if (Sync.configured()) Sync.start();
    await this.loadAccess();
    // Currency and exchange rate are the store's own books — per store.
    const cur = await DB.setting('currency'); UI.setCurrency(cur || 'USD');
    const fx = await DB.setting('fxRate'); UI.setRate(fx || 1320);
    // Language and theme are the operator's preference, not the store's, so
    // they follow the person across both shops rather than flipping on entry.
    this.applyLangSetting(this.prefs.get('lang', 'en') === 'ar' ? 'ar' : 'en');
    document.documentElement.setAttribute('data-theme', this.prefs.get('theme', 'light'));
    Tenant.paint(); // re-tint for the resolved theme
    this.showLogin();
  },

  /* Back to the picker — signs the current user out first. */
  switchStore() {
    UI.confirm('Leave ' + (Tenant.get() ? Tenant.get().name : 'this store') + ' and switch to another store?', () => {
      this.user = null;
      Sync.stop();
      Tenant.clear();
      this.showPicker();
    });
  },

  /* ---------------- Screen 2: per-store sign-in ---------------- */
  showLogin() {
    document.getElementById('app').classList.add('hide');
    document.getElementById('picker').classList.add('hide');
    const t = Tenant.get();
    const el = document.getElementById('login');
    el.classList.remove('hide');
    // Headline and feature list come from the store's own entry in the
    // registry, so each shop's sign-in screen speaks about its own trade.
    const hero = t.hero || { title: [t.name, t.tagline], points: [] };
    el.innerHTML = `
      <div class="login">
        <div class="hero">
          <div class="hero-top">
            <button class="back-link" data-back>← All stores</button>
            <span class="hero-mtx"><img src="assets/mtx-mark-light.svg" alt="">MTX GROUP</span>
          </div>
          <div class="hero-body">
            <div class="hero-lockup">
              <div class="hero-logo"><img src="${t.logo}" alt="${UI.esc(t.name)}"></div>
              <div>
                <div class="wordmark">${UI.esc(t.name)}</div>
                <div class="wordmark-sub">${UI.esc(t.tagline)}</div>
              </div>
            </div>
            <h2 class="tagline">${UI.esc(hero.title[0])}<br><span>${UI.esc(hero.title[1])}</span></h2>
            <div class="feats">
              ${hero.points.map(([icon, label]) =>
                `<div class="feat"><span class="fi">${icon}</span>${UI.esc(label)}</div>`).join('')}
            </div>
          </div>
          <div class="hero-foot">
            <span>${UI.esc(t.legal)}</span>
            <span class="hf-dot"></span>
            <span>Point of sale, inventory &amp; accounts</span>
          </div>
        </div>
        <div class="panel"><div class="box">
          <!-- Phones hide the hero, which is where the store's logo and the way
               back to the picker live — so the panel carries its own copy. -->
          <div class="login-brand-m">
            <button class="back-link" data-back>← All stores</button>
            <div class="lbm-logo"><img src="${t.logo}" alt="${UI.esc(t.name)}"></div>
            <div class="lbm-name">${UI.esc(t.name)}</div>
            <div class="lbm-tag">${UI.esc(t.tagline)}</div>
          </div>
          <h2>Welcome back 👋</h2><p class="lead">Sign in to ${UI.esc(t.name)}.</p>
          <div class="form-label" style="margin-top:32px">SELECT USER</div>
          <div class="user-pick" id="userPick"></div>
          <div class="field"><label>PIN</label><input class="input" id="pinIn" type="password" maxlength="6" placeholder="Enter PIN" value=""></div>
          <button class="btn primary block lg" id="loginBtn" style="margin-top:20px;padding:16px;font-size:16px">Sign In →</button>
        </div></div>
      </div>`;

    el.querySelectorAll('[data-back]').forEach((b) => {
      b.onclick = () => { this.user = null; Tenant.clear(); this.showPicker(); };
    });

    (async () => {
      const pick = document.getElementById('userPick');
      const btn = document.getElementById('loginBtn');
      const synced = Sync.configured();

      // User list: from the server when we can reach it, otherwise the local
      // copy (kept current by sync, or the seeded users in offline-only mode).
      let users = [];
      try {
        users = (synced && navigator.onLine)
          ? await Sync.listUsers(Tenant.id)
          : (await DB.all('users')).filter((u) => u.active !== false);
      } catch (e) {
        users = (await DB.all('users')).filter((u) => u.active !== false);
      }

      if (!users.length) {
        pick.innerHTML = '<div class="tiny muted" style="padding:8px 0">This terminal has no users yet. Open <b>Settings → Server &amp; Sync</b> on a connected device, or connect this one, to set it up.</div>';
        btn.disabled = true;
        return;
      }

      let selected = users.find((u) => u.active !== false) || users[0];
      const paint = () => pick.innerHTML = users.filter((u) => u.active !== false).map((u) => `
        <div class="user-card ${u.id === selected.id ? 'active' : ''}" data-u="${u.id}">
          <div class="u-name">${UI.esc(u.name)}</div><div class="u-role">${UI.esc(u.role)}</div>
        </div>`).join('');
      paint();
      pick.addEventListener('click', (e) => { const b = e.target.closest('[data-u]'); if (!b) return; selected = users.find((u) => u.id === b.dataset.u); paint(); });

      const login = async () => {
        const pin = document.getElementById('pinIn').value.trim();
        if (!pin) return UI.toast('Enter your PIN', 'warn');
        btn.disabled = true;
        try {
          if (synced) {
            let ok = false;
            if (navigator.onLine) {
              try {
                const r = await Sync.login(Tenant.id, selected.id, pin);
                this.user = { ...selected, ...r.user };
                ok = true;
              } catch (err) {
                if (err.code === 'UNAUTH' || /pin|credential/i.test(err.message)) {
                  btn.disabled = false; return UI.toast('Incorrect user or PIN', 'err');
                }
                // server unreachable — fall through to the offline check
              }
            }
            if (!ok) {
              if (await Sync.verifyPinOffline(Tenant.id, selected.id, pin)) {
                this.user = selected;
              } else {
                btn.disabled = false;
                const cached = await Sync.hasOfflinePin(Tenant.id, selected.id);
                return UI.toast(
                  cached ? 'Incorrect PIN'
                    : (navigator.onLine ? 'Cannot reach the server — try again' : 'Offline: sign in online once so this user can work offline'),
                  'err',
                );
              }
            }
          } else {
            if (pin !== selected.pin) { btn.disabled = false; return UI.toast('Incorrect PIN', 'err'); }
            this.user = selected;
          }
          DB.put('logs', { id: UI.uid('log'), ts: Date.now(), user: this.user.name, type: 'login', action: 'signed in' });
          this.enterApp();
        } catch (err) {
          console.error(err); btn.disabled = false;
          UI.toast('Sign-in failed: ' + err.message, 'err');
        }
      };
      btn.onclick = login;
      document.getElementById('pinIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    })();
    this.translate(el);
  },

  /* First sign-in on a synced terminal: pull the store's data down before the
     app renders. A terminal that already has data syncs quietly in the
     background instead. */
  async syncBootstrap() {
    if (!Sync.configured()) return;
    const store = Tenant.id;
    const first = !(await DB.meta('cursor:' + store));
    if (first) {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = '<div class="modal"><div class="modal-body" style="text-align:center;padding:36px">'
        + '<div class="loader" style="margin:0 auto 14px"><i></i></div>'
        + '<b>Setting up this terminal…</b><div class="tiny muted" id="syncBootN" style="margin-top:6px">connecting</div></div></div>';
      document.body.appendChild(ov);
      try {
        await Sync.cycle({ initial: true, silent: true, onProgress: (n) => {
          const el = document.getElementById('syncBootN'); if (el) el.textContent = n + ' records';
        } });
        await this.loadAccess();
      } catch (e) {
        UI.toast('First sync failed: ' + e.message + ' — will keep retrying', 'warn');
      } finally {
        ov.remove();
      }
    } else {
      Sync.cycle({ silent: true }).then(() => this.loadAccess()).catch(() => {});
    }
  },

  /* ---------------- Screen 3: the app ---------------- */
  async enterApp() {
    document.getElementById('login').classList.add('hide');
    document.getElementById('picker').classList.add('hide');
    document.getElementById('app').classList.remove('hide');
    await this.syncBootstrap();
    this.renderChrome();
    const current = location.hash.replace('#/', '').split('?')[0];
    const target = '#/' + this.homeRoute();
    // Land on the user's first permitted module; re-route even if the hash
    // already points there (setting the same hash won't fire hashchange).
    if (!current || !this.can(current)) { if (location.hash === target) this.route(); else location.hash = target; }
    else this.route();
    if (!this._hashBound) { window.addEventListener('hashchange', () => this.route()); this._hashBound = true; }
    UI.toast('Welcome, ' + this.user.name.split(' ')[0] + ' — ' + Tenant.get().name);
  },

  renderChrome() {
    const t = Tenant.get();
    const app = document.getElementById('app');
    if (this._syncUnsub) { this._syncUnsub(); this._syncUnsub = null; }
    app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <button class="brand" id="brandSwitch" title="Switch store">
          <span class="brand-logo"><img src="${t.logo}" alt=""></span>
          <span class="brand-txt"><span class="wordmark">${UI.esc(t.name)}</span><span class="wordmark-sub">${UI.esc(t.tagline)}</span></span>
          <span class="brand-swap" aria-hidden="true">⇄</span>
        </button>
        <nav id="nav"></nav>
        <div class="side-foot">
          <!-- On phones the top bar drops these controls, so the drawer is
               where they live. Shown only under the mobile breakpoint. -->
          <div class="side-tools">
            <button class="side-tool" id="sideStore" title="Switch store"><span>⇄</span>Switch store</button>
            <button class="side-tool" id="sideLang" title="Language"><span>🌐</span>Language</button>
            <button class="side-tool" id="sideTheme" title="Toggle theme"><span>🌓</span>Theme</button>
          </div>
          <div class="side-user">
            <div class="avatar">${this.user.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</div>
            <div class="grow"><div class="su-name">${UI.esc(this.user.name)}</div><div class="tiny su-role">${UI.esc(this.user.role)}</div></div>
            <button class="icon-btn plain" id="logout" title="Sign out">⎋</button>
          </div>
          <div class="side-mtx"><img src="assets/mtx-mark-light.svg" alt="">MTX Group Retail Suite</div>
        </div>
      </aside>
      <div class="backdrop" id="backdrop"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-toggle" id="menuBtn">☰</button>
          <div class="page-title" id="pageTitle">Dashboard</div>
          <span class="store-chip" title="Active store">${UI.esc(t.name)}</span>
          <div class="search"><span>🔎</span><input id="globalSearch" placeholder="Search products, invoices, customers…"></div>
          <span class="status-chip ${navigator.onLine ? '' : 'offline'}" id="netChip"><span class="dot"></span>${navigator.onLine ? 'Online' : 'Offline'}</span>
          ${Sync.configured() ? '<button class="status-chip no-print" id="syncChip" title="Sync status" style="border:none;cursor:pointer"><span class="dot"></span><span id="syncChipTxt">Sync</span></button>' : ''}
          <button class="icon-btn" id="storeBtn" title="Switch store">⇄</button>
          <button class="icon-btn" id="langBtn" title="Language">🌐</button>
          <button class="icon-btn" id="themeBtn" title="Toggle theme">🌓</button>
          <button class="btn ghost hide" id="installBtn" title="Install the suite as an app on this device">⇩ Install App</button>
          <button class="icon-btn" id="logoutBtn" title="Sign out">⎋</button>
          ${this.can('pos') ? '<a class="btn primary" href="#/pos">＋ Sale</a>' : ''}
        </header>
        <div class="content" id="content"></div>
      </div>`;

    // nav — only modules this role can open; group headers with no visible items are dropped
    const nav = document.getElementById('nav');
    let html = '', pendingGroup = null;
    for (const n of NAV) {
      if (n.group) { pendingGroup = n.group; continue; }
      if (!this.can(n.id)) continue;
      if (pendingGroup) { html += `<div class="nav-group">${pendingGroup}</div>`; pendingGroup = null; }
      html += `<a class="nav-item" data-route="${n.id}" href="#/${n.id}"><span class="ni">${n.icon}</span>${n.label}${n.id === 'offline' ? '<span class="dot" style="margin-left:auto;background:var(--green)"></span>' : ''}</a>`;
    }
    nav.innerHTML = html;

    const doLogout = () => UI.confirm('Sign out of ' + Tenant.get().name + '?', () => {
      this.user = null;
      if (Sync.configured()) Sync.signOut();
      this.showLogin();
    });
    document.getElementById('logout').onclick = doLogout;
    document.getElementById('logoutBtn').onclick = doLogout;
    const toggleTheme = () => this.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    document.getElementById('storeBtn').onclick = () => this.switchStore();
    document.getElementById('brandSwitch').onclick = () => this.switchStore();
    document.getElementById('sideStore').onclick = () => this.switchStore();
    document.getElementById('sideTheme').onclick = toggleTheme;
    document.getElementById('sideLang').onclick = (e) => { e.stopPropagation(); this.showLangMenu(e.currentTarget); };
    this.wireInstallButton();
    document.getElementById('themeBtn').onclick = toggleTheme;
    document.getElementById('langBtn').onclick = (e) => { e.stopPropagation(); this.showLangMenu(e.currentTarget); };
    document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('backdrop').classList.toggle('show'); };
    document.getElementById('backdrop').onclick = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('backdrop').classList.remove('show'); };
    const gs = document.getElementById('globalSearch');
    gs.addEventListener('keydown', (e) => { if (e.key === 'Enter' && gs.value.trim()) { location.hash = '#/products'; } });

    // Sync status chip — reflects Sync's state, click opens the quick panel.
    const chip = document.getElementById('syncChip');
    if (chip) {
      const txt = document.getElementById('syncChipTxt');
      const MAP = {
        off: ['', 'Sync off'], idle: ['', 'Sync'], syncing: ['', 'Syncing…'],
        synced: ['', 'Synced'], offline: ['offline', 'Offline'],
        error: ['offline', 'Sync error'], 'needs-login': ['offline', 'Sign in'],
      };
      this._syncUnsub = Sync.on((st) => {
        if (!chip.isConnected) return;
        const [cls, label] = MAP[st.status] || ['', 'Sync'];
        chip.className = 'status-chip no-print ' + cls;
        txt.textContent = (st.status === 'offline' && st.queued) ? st.queued + ' queued' : label;
      });
      chip.onclick = () => this.showSyncPanel();
    }
    this.translate(app);
  },

  /* Quick sync panel from the top-bar chip. Full controls (resync, upload,
     disconnect) live in Settings -> Server & Sync. */
  showSyncPanel() {
    const st = Sync.getState();
    UI.modal({
      title: 'Sync',
      body: `<div class="kv"><span class="k">Status</span><b class="v">${UI.esc(st.status)}</b></div>
        <div class="kv"><span class="k">Server</span><b class="v tiny mono">${UI.esc(Sync.serverUrl())}</b></div>
        <div class="kv"><span class="k">This terminal</span><b class="v mono">${UI.esc(Sync.deviceId())}</b></div>
        <div class="kv"><span class="k">Waiting to upload</span><b class="v">${st.queued} <span>change${st.queued === 1 ? '' : 's'}</span></b></div>
        <div class="kv"><span class="k">Last sync</span><b class="v">${st.lastSyncAt ? UI.fmtDT(st.lastSyncAt) : 'never'}</b></div>
        ${st.lastError ? `<div class="tiny text-red" style="margin-top:8px">${UI.esc(st.lastError)}</div>` : ''}`,
      footer: `<button class="btn ghost" data-close>Close</button>
        ${App.can('settings') ? '<a class="btn ghost" href="#/settings" data-close>Settings</a>' : ''}
        <button class="btn primary" id="syncNowBtn">Sync now</button>`,
    });
    document.getElementById('syncNowBtn').onclick = async (e) => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Syncing…';
      try { await Sync.cycle(); UI.toast('Sync complete'); }
      catch (err) { UI.toast('Sync failed: ' + err.message, 'warn'); }
      UI.close();
    };
  },

  async route() {
    let id = (location.hash.replace('#/', '') || this.homeRoute()).split('?')[0];
    // Access guard: block direct-URL access to modules this role can't open.
    if (!this.can(id)) {
      const content = document.getElementById('content');
      if (content) content.innerHTML = `<div class="card" style="max-width:520px;margin:40px auto;text-align:center;padding:40px">
        <div style="font-size:40px">🔒</div>
        <h2 style="margin-top:12px">No access</h2>
        <p class="muted" style="margin-top:8px">Your role (<b>${UI.esc(this.user.role)}</b>) doesn't have permission to open <b>${UI.esc(TITLES[id] || id)}</b>.</p>
        <a class="btn primary" style="margin-top:18px" href="#/${this.homeRoute()}">Go to ${TITLES[this.homeRoute()] || 'home'}</a></div>`;
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      const t = document.getElementById('pageTitle'); if (t) t.textContent = 'No access';
      return;
    }
    // Let the outgoing view detach anything global it attached (e.g. the POS
    // scanner key listener) before the next one renders.
    if (this._viewCleanup) { try { this._viewCleanup(); } catch (e) { /* ignore */ } this._viewCleanup = null; }
    const view = Views[id] || Views.dashboard;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === id));
    const title = document.getElementById('pageTitle'); if (title) title.textContent = TITLES[id] || 'Dashboard';
    if (title) this.translate(title);
    // POS gets full-bleed content
    const content = document.getElementById('content');
    content.style.padding = id === 'pos' ? '0' : '';
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('backdrop').classList.remove('show');
    try { await view(content); } catch (e) { console.error(e); content.innerHTML = `<div class="card">⚠ Error loading page: ${e.message}</div>`; }
    this.translate(content);
    const main = document.querySelector('.main'); if (main) main.scrollTop = 0;
  },

  nav(id) { location.hash = '#/' + id; },

  /* ---- permission helpers ---- */
  can(id) {
    if (!this.user) return false;
    if (this.user.role === 'Super Admin') return true; // always full access, not editable
    const list = this.access[this.user.role];
    return !!(list && list.includes(id));
  },
  canEdit(id) {
    if (!this.can(id)) return false;
    const ro = READONLY[this.user.role];
    return !(ro && ro.includes(id));
  },

  /* May this user see the shop's BOOKS — as opposed to their own till?
     Books means whole-business money: total revenue, profit, margins, cost of
     goods, inventory valuation, historical trends and staff rankings. A
     cashier is accountable for the drawer in front of them and the day they
     are working, so they get today's takings and nothing wider.

     Module access (App.can) controls which PAGES open; this controls which
     FIGURES appear on the pages they can open. Both the dashboard and reports
     read this one predicate, so the rule cannot drift between them. */
  seesShopBooks() {
    return !!this.user && this.user.role !== 'Cashier';
  },
  homeRoute() { return ALL_ROUTES.find((id) => this.can(id)) || 'offline'; },

  /* Re-price the whole database into another currency.
     Every monetary field is rewritten and rounded to the target currency's
     precision, so history, debts and reports all stay consistent with the
     prices the cashier now sees. Scoped to the active store only. */
  async convertAllAmounts(factor, toCode) {
    const r = (v) => UI.roundTo((Number(v) || 0) * factor, toCode);

    const products = await DB.all('products');
    products.forEach((p) => { p.cost = r(p.cost); p.price = r(p.price); p.wholesale = r(p.wholesale); });
    await DB.bulk('products', products);

    const sales = await DB.all('sales');
    sales.forEach((s) => {
      ['subtotal', 'discount', 'tax', 'total', 'cost', 'profit'].forEach((k) => { if (s[k] != null) s[k] = r(s[k]); });
      (s.items || []).forEach((i) => { i.price = r(i.price); i.cost = r(i.cost); });
    });
    await DB.bulk('sales', sales);

    const expenses = await DB.all('expenses');
    expenses.forEach((e) => { e.amount = r(e.amount); });
    await DB.bulk('expenses', expenses);

    const customers = await DB.all('customers');
    customers.forEach((c) => { c.debt = r(c.debt); });
    await DB.bulk('customers', customers);

    const suppliers = await DB.all('suppliers');
    suppliers.forEach((s) => { s.debt = r(s.debt); });
    await DB.bulk('suppliers', suppliers);

    const payments = await DB.all('payments');
    payments.forEach((p) => { p.amount = r(p.amount); });
    await DB.bulk('payments', payments);

    const drawer = await DB.setting('drawer');
    if (drawer) await DB.setting('drawer', { ...drawer, opening: r(drawer.opening) });

    Store.bust();
  },

  setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    this.prefs.set('theme', t);
    Tenant.paint(); // accent tokens differ between light and dark
    const c = document.querySelector('meta[name=theme-color]');
    if (c) c.content = t === 'dark' ? '#14110F' : '#1C1916';
  },
  // Set document direction/lang without re-rendering (used at startup).
  applyLangSetting(l) {
    this.lang = l;
    const rtl = l === 'ar';
    document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', l);
  },
  // Translate a freshly-rendered subtree into the active language (Arabic only for now).
  translate(node) { if (this.lang === 'ar') window.translateTree(node || document.body, 'ar'); },
  // Catch every in-place re-render (POS cart, settings tabs, modals, toasts) so
  // they get translated too. Idempotent: translated Arabic no longer matches an
  // English key, and we only observe childList (not characterData) so no loop.
  installTranslateObserver() {
    if (this._mo) return;
    this._mo = new MutationObserver((muts) => {
      if (this.lang !== 'ar') return;
      for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) window.translateTree(n, 'ar'); });
    });
    this._mo.observe(document.body, { childList: true, subtree: true });
  },
  // Language dropdown anchored under the top-bar globe button.
  showLangMenu(anchor) {
    document.querySelectorAll('.lang-menu').forEach((m) => m.remove()); // toggle closed if already open
    if (anchor.dataset.open === '1') { anchor.dataset.open = '0'; return; }
    anchor.dataset.open = '1';

    const LANGS = [['en', 'English'], ['ar', 'العربية']];
    const menu = document.createElement('div');
    menu.className = 'lang-menu';
    menu.innerHTML = LANGS.map(([c, label]) =>
      `<div class="lang-opt ${this.lang === c ? 'active' : ''}" data-l="${c}">${label}${this.lang === c ? ' ✓' : ''}</div>`).join('');
    document.body.appendChild(menu);

    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    // keep the 170px-wide menu on screen, right-aligned to the button
    menu.style.left = `${Math.max(8, Math.min(r.right - 170, window.innerWidth - 178))}px`;

    const close = () => { menu.remove(); anchor.dataset.open = '0'; document.removeEventListener('click', onDoc); };
    const onDoc = (e) => { if (!menu.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener('click', onDoc), 0);
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-l]'); if (!opt) return;
      close();
      if (opt.dataset.l !== this.lang) this.setLang(opt.dataset.l);
    });
  },

  setLang(l) {
    this.applyLangSetting(l);
    this.prefs.set('lang', l);
    // Re-render the current screen from the English templates, then translate.
    if (this.user) { this.renderChrome(); this.route(); }
    else if (Tenant.get()) this.showLogin();
    else this.showPicker();
    UI.toast(l === 'ar' ? 'تم تفعيل اللغة العربية' : 'Language set to English', 'info');
  },

  /* Charts choose their geometry (label size, stroke weight, aspect) at render
     time from the viewport width, so crossing the phone/desktop boundary —
     rotating the handset, or resizing a window — has to re-render the current
     view or the owner is left with a chart built for the other screen. */
  watchViewport() {
    const NARROW = 560;
    let wasNarrow = window.innerWidth <= NARROW;
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const isNarrow = window.innerWidth <= NARROW;
        if (isNarrow === wasNarrow) return;
        wasNarrow = isNarrow;
        if (this.user) this.route();
      }, 180);
    });
  },

  watchConnection() {
    const upd = () => {
      const chip = document.getElementById('netChip');
      if (chip) { chip.classList.toggle('offline', !navigator.onLine); chip.innerHTML = `<span class="dot"></span>${navigator.onLine ? 'Online' : 'Offline'}`; }
      UI.toast(navigator.onLine ? 'Back online' : 'Offline mode — you can keep selling', navigator.onLine ? 'ok' : 'warn');
    };
    window.addEventListener('online', upd); window.addEventListener('offline', upd);
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      // When a new version's service worker takes control, reload once so the
      // user immediately gets the latest files (no manual cache clearing).
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return; reloaded = true; location.reload();
      });
      navigator.serviceWorker.register('service-worker.js').then((reg) => {
        // Poll for updates so a running install picks up new deploys.
        setInterval(() => reg.update().catch(() => {}), 60000);
      }).catch((e) => console.warn('SW failed', e));
    }
    // The browser fires this once it decides the page is installable (valid
    // manifest + SW + HTTPS/localhost). Stash it and reveal the header button —
    // Chrome/Edge won't show their own install UI once we've called preventDefault.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.__deferredPrompt = e;
      const btn = document.getElementById('installBtn');
      if (btn) btn.classList.remove('hide');
    });
    window.addEventListener('appinstalled', () => {
      window.__deferredPrompt = null;
      const btn = document.getElementById('installBtn');
      if (btn) btn.classList.add('hide');
      UI.toast('MTX Group Retail Suite installed!');
    });
  },

  /* Show/hide + wire the header's "Install App" button around whatever
     install prompt the browser has (or hasn't) made available yet. */
  wireInstallButton() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    // Already installed and running standalone — nothing to install.
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
    if (window.__deferredPrompt) btn.classList.remove('hide');
    btn.onclick = async () => {
      const prompt = window.__deferredPrompt;
      if (!prompt) return UI.toast('Use your browser\'s menu → "Install app" / "Add to Home Screen"', 'info');
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      window.__deferredPrompt = null;
      btn.classList.add('hide');
      if (outcome !== 'accepted') UI.toast('Install cancelled', 'info');
    };
  }
};
window.App = App;

document.addEventListener('DOMContentLoaded', () => App.init());
