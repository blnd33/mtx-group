/* =====================================================================
   MTX GROUP — Views: Dashboard, POS Checkout, Products
   ===================================================================== */
window.Views = window.Views || {};

/* ------------------------------ DASHBOARD ------------------------------ */
Views.dashboard = async (root) => {
  const stat = (ico, cls, label, value, delta) => `
    <div class="stat"><div class="ico ${cls}">${ico}</div>
      <div class="label">${label}</div><div class="value mono">${value}</div>
      ${delta ? `<div class="delta ${delta.startsWith('-') ? 'text-red' : 'text-green'}">${delta}</div>` : ''}</div>`;

  /* A cashier gets their own day and nothing wider: today's takings, today's
     expenses, the drawer they are counting, and the order count. No date
     filter either — metrics() with no range means today. Every panel below —
     profit, valuation, trends, rankings, the recent-sales list — is the shop's
     books, and stops here. See App.seesShopBooks(). */
  if (!App.seesShopBooks()) {
    const m = await Store.metrics();
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Today</h1><div class="sub">${UI.fmtDate(Date.now())} · <span>Your shift so far</span></div></div>
        <div class="row">${App.can('pos') ? '<a class="btn primary" href="#/pos">＋ New Sale</a>' : ''}</div>
      </div>
      <div class="stats">
        ${stat('💵', '', "Today's Sales", UI.money(m.periodSales), '+' + m.orders + ' <span>orders</span>')}
        ${stat('🧾', 'o', 'Expenses (Today)', UI.money(m.periodExpense), null)}
        ${stat('🪙', 'c', 'Cash in Drawer', UI.money(m.cashDrawer), null)}
        ${stat('🛒', '', 'Total Orders', UI.num(m.orders), null)}
      </div>`;
    return;
  }

  // Opens on today, which is what this page showed before it had a filter.
  const state = { preset: 'today', ...UI.rangeOf('today') };

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Business Overview</h1><div class="sub">${UI.fmtDate(Date.now())} · <span>Live snapshot of your store</span></div></div>
      <div class="row">${App.can('reports') ? '<a class="btn ghost" href="#/reports">View Reports</a>' : ''}${App.can('pos') ? '<a class="btn primary" href="#/pos">＋ New Sale</a>' : ''}</div>
    </div>
    ${UI.dateFilterHTML(state.preset)}
    <div id="dashBody"></div>`;

  const body = root.querySelector('#dashBody');

  const render = async () => {
    const m = await Store.metrics(state);
    const lbl = UI.rangeLabel(state);
    const spark = m.trend.map((d) => ({ l: d.label, v: d.total }));

    root.querySelector('#df_summary').innerHTML =
      `<b>${lbl.name}</b> · ${lbl.span} · ${m.orders} <span>orders</span> · <span>the drawer and stock figures stay current</span>`;

    body.innerHTML = `
    <div class="stats" style="margin-bottom:16px">
      ${stat('💵', '', 'Sales', UI.money(m.periodSales), '+' + m.orders + ' <span>orders</span>')}
      ${stat('📈', 'g', 'Net Profit', UI.money(m.periodProfit - m.periodExpense), m.marginTxt)}
      ${stat('🧾', 'o', 'Expenses', UI.money(m.periodExpense), null)}
      ${stat('🪙', 'c', 'Cash in Drawer <span class="tiny muted">· today</span>', UI.money(m.cashDrawer), null)}
    </div>
    <div class="stats" style="margin-bottom:22px">
      ${stat('🛒', '', 'Orders', UI.num(m.orders), null)}
      ${stat('💰', 'g', 'Avg Ticket', UI.money(m.avgTicket), null)}
      ${stat('📦', 'c', 'Inventory Value <span class="tiny muted">· now</span>', UI.money(m.invValue), null)}
      ${stat('⚠️', 'r', 'Low-stock Items <span class="tiny muted">· now</span>', UI.num(m.lowStock.length), m.lowStock.length ? 'Needs attention' : 'All good')}
    </div>

    <div class="grid" style="grid-template-columns:1.7fr 1fr">
      <div class="card">
        <div class="card-head"><h3>Sales Trend</h3><span class="badge blue">${lbl.name}</span></div>
        ${spark.length ? UI.lineChart(spark) : '<div class="muted center" style="height:180px;display:grid">No sales in this range</div>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Profit & Loss</h3><span class="badge green">${lbl.name}</span></div>
        <div class="kv"><span class="k">Gross Sales</span><b class="v mono">${UI.money(m.periodSales)}</b></div>
        <div class="kv"><span class="k">Cost of Goods</span><b class="v mono">${UI.money(m.periodCost)}</b></div>
        <div class="kv"><span class="k">Gross Profit</span><b class="v mono text-green">${UI.money(m.periodSales - m.periodCost)}</b></div>
        <div class="kv"><span class="k">Expenses</span><b class="v mono text-red">${UI.money(m.periodExpense)}</b></div>
        <div class="kv"><span class="k" style="font-weight:700;color:var(--text)">Net Profit</span><b class="v mono" style="font-size:17px;color:var(--green)">${UI.money(m.periodSales - m.periodCost - m.periodExpense)}</b></div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr; margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>Top-selling Products</h3>${App.can('reports') ? '<a class="tiny muted" href="#/reports">Details →</a>' : ''}</div>
        ${m.topProducts.length ? UI.bars(m.topProducts.map((t) => ({ l: t.name, v: t.qty })), (v) => v + ' <span>pcs</span>') : '<div class="muted">No sales in this range</div>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Low-stock Alerts <span class="tiny muted" style="font-weight:400">· now</span></h3><span class="badge red">${m.lowStock.length}</span></div>
        ${m.lowStock.length ? m.lowStock.slice(0, 6).map((p) => `
          <div class="list-item"><div class="thumb-sm">${p.icon || '📦'}</div>
            <div class="grow"><b>${UI.esc(p.name)}</b><div class="tiny muted">Min ${p.minStock} · ${p.sku}</div></div>
            <span class="badge ${p.stock === 0 ? 'red' : 'orange'}">${p.stock} <span>left</span></span></div>`).join('')
        : '<div class="muted">Everything is well stocked 👍</div>'}
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1.4fr 1fr; margin-top:18px">
      <div class="card pad0">
        <div class="card-head" style="padding:18px 20px 0"><h3>Recent Sales</h3>${App.can('reports') ? '<a class="tiny muted" href="#/reports">All →</a>' : ''}</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Time</th><th>Cashier</th><th>Payment</th><th class="right">Total</th></tr></thead><tbody>
          ${m.recent.length ? m.recent.map((s) => `<tr><td><b>#${s.no}</b></td><td class="muted">${UI.fmtDT(s.ts)}</td><td>${UI.esc(s.cashier)}</td><td><span class="badge gray">${s.pay}</span></td><td class="right mono"><b>${UI.money(s.total)}</b></td></tr>`).join('')
            : '<tr><td colspan="5" class="muted" style="padding:24px;text-align:center">No sales in this range</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Best Cashier</h3><span class="badge cyan">${lbl.name}</span></div>
        ${m.cashiers.length ? m.cashiers.map((c, i) => `
          <div class="list-item"><div class="avatar" style="width:36px;height:36px;font-size:13px">${c.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</div>
            <div class="grow"><b>${UI.esc(c.name)}</b><div class="tiny muted">${c.count} <span>orders</span></div></div>
            <b class="mono">${UI.money(c.total)}</b>${i === 0 ? '<span class="badge green">Top</span>' : ''}</div>`).join('')
        : '<div class="muted">No data</div>'}
      </div>
    </div>`;
  };

  UI.bindDateFilter(root, state, () => { render(); });
  await render();
};

/* ------------------------------ POS CHECKOUT ------------------------------ */
let CART = { items: [], discount: 0, discountPct: 0, customer: 'Walk-in Customer', pay: 'Cash', held: [] };
const PAY_METHODS = [['Cash', '💵'], ['Card', '💳'], ['Split', '🔀'], ['Debt', '📝']];

Views.pos = async (root) => {
  const products = (await Store.products()).filter((p) => p.active !== false);
  const cats = await Store.categories();
  let activeCat = 'all', query = '';

  // Store-wide sale set by the Super Admin — applied to every line automatically.
  const camp = (await DB.setting('campaign')) || null;
  CART.campaign = campaignLive(camp) ? { pct: camp.pct, label: camp.label || 'Store discount' } : null;
  const cPct = CART.campaign ? CART.campaign.pct : 0;

  root.innerHTML = `
    <div class="pos">
      <div class="pos-left">
        ${CART.campaign ? `<div class="campaign-bar">🎉 <b>${UI.esc(CART.campaign.label)}</b> — ${cPct}% off every product</div>` : ''}
        <div class="row between" style="margin-bottom:12px">
          <div class="topbar-like search" style="flex:1;display:flex;gap:8px;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:10px 16px">
            <span>🔎</span><input id="posSearch" placeholder="Search product or scan barcode…" style="border:none;background:transparent;outline:none;width:100%"/>
          </div>
          <button class="btn dark" id="openCart">🛒 <span>Cart</span> (<span id="cartCount">0</span>)</button>
        </div>
        <div class="cat-chips" id="catChips">
          <div class="chip active" data-cat="all">All Items</div>
          ${cats.map((c) => `<div class="chip" data-cat="${c.id}">${c.icon || ''} ${UI.esc(c.name)}</div>`).join('')}
        </div>
        <div class="prod-grid" id="posGrid"></div>
      </div>
      <div class="pos-right" id="posRight"></div>
    </div>`;

  const grid = root.querySelector('#posGrid');
  const drawGrid = () => {
    const list = products.filter((p) =>
      (activeCat === 'all' || p.category === activeCat) &&
      (!query || p.name.toLowerCase().includes(query) || (p.barcode || '').includes(query) || (p.sku || '').toLowerCase().includes(query)));
    grid.innerHTML = list.length ? list.map((p) => {
      const sale = cPct ? p.price * (1 - cPct / 100) : 0;
      return `
      <div class="prod-card" data-add="${p.id}">
        <div class="thumb">${p.icon || '📦'}</div>
        <div class="name">${UI.esc(p.name)}</div>
        <div class="row between">${sale
          ? `<span class="price mono"><s class="tiny muted">${UI.money(p.price)}</s> ${UI.money(sale)}</span><span class="disc-tag">−${cPct}%</span>`
          : `<span class="price mono">${UI.money(p.price)}</span>`}</div>
        <div class="stk">${p.stock <= 0 ? '<span class="text-red">Out of stock</span>' : p.stock + ' <span>in stock</span>'}</div>
      </div>`;
    }).join('') : '<div class="muted" style="padding:40px">No products found</div>';
  };
  drawGrid();
  drawCart(root);

  root.querySelector('#catChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    root.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active'); activeCat = c.dataset.cat; drawGrid();
  });
  // The search box only ever FILTERS the grid — click into it and scan (or
  // type) to narrow down to one product. It never adds to the basket itself.
  const search = root.querySelector('#posSearch');
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); drawGrid(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

  grid.addEventListener('click', (e) => {
    const el = e.target.closest('[data-add]'); if (!el) return;
    const p = products.find((x) => x.id === el.dataset.add); if (p) addToCart(p);
  });
  root.querySelector('#openCart').onclick = () => root.querySelector('#posRight').classList.add('open');

  /* Scan-anywhere: a USB/Bluetooth scanner types the code very fast and then
     presses Enter. While the cashier isn't typing in a field, capture that
     burst and put the product straight into the basket — no clicking first.
     Typing in the search box is untouched, so searching still just filters. */
  let scanBuf = '', scanAt = 0;
  const onScanKey = (e) => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (document.querySelector('.overlay')) return;   // a dialog is open
    const now = Date.now();
    if (now - scanAt > 300) scanBuf = '';             // gap = start of a new scan
    scanAt = now;
    if (e.key === 'Enter') {
      const code = scanBuf.trim(); scanBuf = '';
      if (code.length < 3) return;
      e.preventDefault();
      const hit = products.find((p) => (p.barcode || '') === code)
        || products.find((p) => (p.sku || '').toLowerCase() === code.toLowerCase());
      if (hit) { addToCart(hit); UI.toast(hit.name + ' added'); }
      else UI.toast(`No product with barcode ${code}`, 'warn');
      return;
    }
    if (e.key && e.key.length === 1) scanBuf += e.key;
  };
  document.addEventListener('keydown', onScanKey);
  App._viewCleanup = () => document.removeEventListener('keydown', onScanKey);

  function addToCart(p) {
    if (p.stock <= 0) { UI.toast(p.name + ' is out of stock', 'warn'); return; }
    const ex = CART.items.find((i) => i.id === p.id);
    // The stock check has to run on EVERY add, not just the first: checkout
    // floors stock at 0, so anything oversold would disappear silently.
    if (ex) { if (cartAddOk(ex, p.name)) ex.qty++; }
    else {
      const line = { id: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1, min: p.wholesale, stock: p.stock };
      // A running store sale discounts the line automatically; the cashier can
      // still override it by typing their own discount on the row.
      if (cPct) line.disc = { type: 'percent', val: cPct, auto: true };
      CART.items.push(line);
    }
    drawCart(root);
  }
};

/* Guard every quantity increase against the shelf. Returns false (and warns)
   when the line already holds everything in stock. Lines carry the stock level
   they were added with; a line without one (legacy hold) is left unrestricted. */
function cartAddOk(line, name) {
  const max = line.stock;
  if (max == null) return true;
  if (line.qty < max) return true;
  UI.toast(`Only ${max} × ${name} in stock`, 'warn');
  return false;
}

/* What the customer ACTUALLY paid for one unit of a completed sale line, after
   the discounts applied at checkout.

   Refunds, cancellations and exchanges must value a return at this — never at
   `price`, which is the pre-discount shelf price. Returning a 20%-off item at
   `price` hands back more money than the customer ever paid.

   `sold` is the original quantity on the invoice; callers overwrite `qty` with
   the quantity being returned, so the per-unit figure has to be derived from
   the line's stored `net` (or `price × sold − discAmt` for older records). */
function paidUnit(line) {
  const sold = line.sold || 0;
  if (!sold) return line.price || 0;                       // no history — fall back to gross
  const net = (line.net != null) ? line.net
    : (line.price || 0) * sold - (line.discAmt || 0);
  return net / sold;
}

/* Discount attached to a single cart line — either a fixed amount or a percent
   of that line's gross. Returns the money value it removes, capped at the line. */
function lineDisc(i) {
  if (!i.disc || !i.disc.val) return 0;
  const gross = i.price * i.qty;
  const d = i.disc.type === 'percent' ? gross * (i.disc.val / 100) : i.disc.val;
  return Math.min(gross, Math.max(0, d));
}

function cartTotals() {
  // Every figure is rounded to the active currency's precision before it is
  // stored. The dinar has no decimals, so an unrounded percentage discount
  // would put 19,750.333… in the database while the receipt printed 19,750 —
  // and the reports would then never reconcile with the till.
  const r = (v) => UI.roundTo(v);
  const sub = r(CART.items.reduce((s, i) => s + i.price * i.qty, 0));
  const lineDiscs = r(CART.items.reduce((s, i) => s + lineDisc(i), 0));
  const afterLines = sub - lineDiscs;                       // order discount applies to what's left
  const orderPct = afterLines * (CART.discountPct / 100);
  const orderDisc = r(Math.min(afterLines, CART.discount + orderPct));
  const disc = r(lineDiscs + orderDisc);
  const total = r(Math.max(0, sub - disc));
  const cost = r(CART.items.reduce((s, i) => s + i.cost * i.qty, 0));
  return { sub, lineDiscs, orderDisc, disc, total, cost, profit: r(total - cost) };
}

/* Spread a whole-invoice discount across the lines, pro-rata by each line's
   value (so a 5,000 discount on a 10,000 basket takes 50% off every line's
   share — a big item absorbs more than a small one, and no line can go
   negative). Largest-remainder rounding keeps the shares adding up to exactly
   the order discount, to the cent. Returns an array aligned to CART.items. */
function allocateOrderDisc(orderDisc, items) {
  const list = items || CART.items;
  const base = list.map((i) => i.price * i.qty - lineDisc(i)); // value left after item discounts
  const totalBase = base.reduce((a, b) => a + b, 0);
  const zero = list.map(() => 0);
  if (!(orderDisc > 0) || totalBase <= 0) return zero;

  // Work in the currency's smallest whole unit — cents for USD, whole dinars
  // for IQD — so the shares are always valid amounts in that currency.
  const f = Math.pow(10, UI.currency().decimals);
  const units = Math.round(orderDisc * f);
  const raw = base.map((b) => (b / totalBase) * units);
  const share = raw.map((r) => Math.floor(r));
  let left = units - share.reduce((a, b) => a + b, 0);
  // hand the leftover units to the largest fractional parts
  const byFrac = raw.map((r, idx) => ({ idx, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < left && byFrac.length; k++) share[byFrac[k % byFrac.length].idx]++;
  return share.map((c) => c / f);
}

function drawCart(root) {
  const right = root.querySelector('#posRight'); if (!right) return;
  const t = cartTotals();
  const cnt = CART.items.reduce((s, i) => s + i.qty, 0);
  const cc = root.querySelector('#cartCount'); if (cc) cc.textContent = cnt;

  right.innerHTML = `
    <div class="cart-head row between">
      <div><b style="font-size:16px">Current Order</b><div class="tiny muted" id="custLabel">👤 ${UI.esc(CART.customer)}</div></div>
      <button class="icon-btn no-print" id="closeCart" style="display:none">✕</button>
    </div>
    <div class="cart-items">
      ${CART.items.length ? CART.items.map((i) => {
        const gross = i.price * i.qty; const d = lineDisc(i); const net = gross - d;
        const tag = d > 0 ? `<span class="disc-tag">− ${i.disc.type === 'percent' ? i.disc.val + '%' : UI.money(i.disc.val)}</span>` : '';
        return `
        <div class="cart-row${d > 0 ? ' has-disc' : ''}">
          <div class="ci-name">${UI.esc(i.name)}${tag}<div class="tiny muted mono">${UI.money(i.price)}${i.price < i.min ? ' <span class="text-orange">⚠ below wholesale</span>' : ''}</div></div>
          <div class="qty"><button data-dec="${i.id}">−</button><span>${i.qty}</span><button data-inc="${i.id}">＋</button></div>
          <div class="ci-amt mono" style="min-width:60px;text-align:right">${d > 0 ? `<s class="tiny muted">${UI.money(gross)}</s><br>` : ''}<b>${UI.money(net)}</b></div>
          <div class="disc-edit" title="Discount — type a number, tap $ / % to switch">
            <input class="disc-in mono" type="number" min="0" step="any" inputmode="decimal" data-discin="${i.id}" value="${i.disc && i.disc.val ? i.disc.val : ''}" placeholder="0">
            <button class="disc-unit" data-discunit="${i.id}">${i.disc && i.disc.type === 'percent' ? '%' : '$'}</button>
          </div>
          <button class="icon-btn sm" data-rm="${i.id}" style="width:28px;height:28px;border:none">🗑</button>
        </div>`;
      }).join('') : '<div class="empty-cart">🛒<div style="margin-top:8px">Cart is empty<br><span class="tiny">Tap products to add</span></div></div>'}
    </div>
    <div class="cart-foot">
      <div class="row" style="gap:8px;margin-bottom:10px">
        <button class="btn ghost sm grow" id="pickCust">👤 Customer</button>
        <button class="btn ghost sm grow" id="applyDisc">％ Order Disc</button>
        <button class="btn ghost sm grow" id="holdOrder">⏸ Hold${CART.held.length ? ' (' + CART.held.length + ')' : ''}</button>
      </div>
      <div class="tiny muted no-print" style="margin:-2px 0 8px">Type a discount on any item — tap <b>$</b> / <b>%</b> to switch. Or ％ Order Disc for the whole basket.</div>
      <div class="pay-chips" id="payChips">
        ${PAY_METHODS.map(([m, ic]) => `<div class="pay-chip ${(CART.pay || 'Cash') === m ? 'active' : ''}" data-pay="${m}">${ic} ${m === 'Debt' ? 'Account' : m}</div>`).join('')}
      </div>
      <div class="sum-row"><span class="muted">Subtotal</span><span class="mono">${UI.money(t.sub)}</span></div>
      ${t.lineDiscs ? `<div class="sum-row"><span class="muted">Item discounts</span><span class="mono text-red">− ${UI.money(t.lineDiscs)}</span></div>` : ''}
      ${t.orderDisc ? `<div class="sum-row"><span class="muted">Order discount</span><span class="mono text-red">− ${UI.money(t.orderDisc)}</span></div>` : ''}
      ${!t.lineDiscs && !t.orderDisc ? '<div class="sum-row"><span class="muted">Discount</span><span class="mono text-red">− ' + UI.money(0) + '</span></div>' : ''}
      <div class="sum-row total"><span>Total</span><span class="mono">${UI.money(t.total)}</span></div>
      <button class="btn primary block lg" id="checkout" style="margin-top:12px" ${CART.items.length ? '' : 'disabled'}>💳 <span>Charge</span> ${UI.money(t.total)}</button>
      <button class="btn ghost block" id="cancelOrder" style="margin-top:8px" ${CART.items.length || CART.discount || CART.discountPct ? '' : 'disabled'}>✕ <span>Cancel order</span></button>
    </div>`;

  right.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { const i = CART.items.find((x) => x.id === b.dataset.inc); if (!cartAddOk(i, i.name)) return; i.qty++; drawCart(root); });
  right.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const i = CART.items.find((x) => x.id === b.dataset.dec); i.qty--; if (i.qty <= 0) CART.items = CART.items.filter((x) => x !== i); drawCart(root); });
  right.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { CART.items = CART.items.filter((x) => x.id !== b.dataset.rm); drawCart(root); });
  right.querySelector('#payChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-pay]'); if (!c) return;
    CART.pay = c.dataset.pay; drawCart(root);
  });
  // Inline per-row discount: type a value, tap $ / % to switch the unit.
  right.querySelectorAll('[data-discin]').forEach((el) => {
    el.onkeydown = (e) => { if (e.key === 'Enter') el.blur(); };
    el.onchange = () => {
      const it = CART.items.find((x) => x.id === el.dataset.discin); if (!it) return;
      const type = (it.disc && it.disc.type) || 'amount';
      const val = +el.value || 0;
      it.disc = val > 0 ? { type, val } : null;
      drawCart(root);
    };
  });
  right.querySelectorAll('[data-discunit]').forEach((b) => b.onclick = () => {
    const it = CART.items.find((x) => x.id === b.dataset.discunit); if (!it) return;
    const curType = (it.disc && it.disc.type) || 'amount';
    const newType = curType === 'amount' ? 'percent' : 'amount';
    it.disc = { type: newType, val: (it.disc && it.disc.val) || 0 };
    drawCart(root);
    const again = right.querySelector(`[data-discin="${it.id}"]`); if (again) again.focus();
  });
  const cb = right.querySelector('#closeCart'); if (cb) cb.onclick = () => right.classList.remove('open');
  right.querySelector('#applyDisc').onclick = () => discountModal(root);
  right.querySelector('#pickCust').onclick = () => customerModal(root);
  right.querySelector('#holdOrder').onclick = () => {
    if (!CART.items.length) return UI.toast('Cart is empty', 'warn');
    CART.held.push({ items: [...CART.items], ts: Date.now() });
    CART.items = []; CART.discount = 0; CART.discountPct = 0;
    UI.toast('Order held', 'info'); drawCart(root);
  };
  // Cancel: wipe the basket back to a clean slate — items, every discount,
  // the customer and the payment method. Held orders are left alone.
  right.querySelector('#cancelOrder').onclick = (e) => {
    if (e.currentTarget.disabled) return;
    UI.confirm('Cancel this order? The basket and all discounts will be cleared.', () => {
      CART.items = [];
      CART.discount = 0; CART.discountPct = 0;
      CART.customer = 'Walk-in Customer';
      CART.pay = 'Cash';
      UI.toast('Order cancelled', 'info');
      drawCart(root);
    }, { danger: true });
  };
  // One tap: charge, save and print. No payment dialog, no receipt preview.
  right.querySelector('#checkout').onclick = (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true; // guard against a double-tap creating two sales
    completeSale(root, CART.pay || 'Cash').catch((err) => {
      console.error('completeSale failed:', err);
      UI.toast('Charge failed: ' + err.message, 'warn');
      btn.disabled = false; // completeSale never reached drawCart(), so re-enable manually
    });
  };
}

/* Discount dialog. Targets, in order of preference:
   - forcedIds  → the single row whose ％ button was tapped
   - ticked rows → the items selected with the row checkboxes
   - otherwise  → the whole order (legacy basket-level discount)
   Supports both a fixed amount and a percentage, chosen with the toggle. */
function discountModal(root, forcedIds) {
  const selIds = forcedIds || [...root.querySelectorAll('.row-sel:checked')].map((c) => c.dataset.sel);
  const perItem = selIds.length > 0;
  const target = perItem
    ? (selIds.length === 1 ? UI.esc(CART.items.find((i) => i.id === selIds[0])?.name || '1 item') : selIds.length + ' selected items')
    : 'the whole order';

  // Prefill from the first target so re-opening edits the existing discount.
  let cur = { type: 'amount', val: 0 };
  if (perItem) { const f = CART.items.find((i) => i.id === selIds[0]); if (f && f.disc) cur = { ...f.disc }; }
  else if (CART.discountPct) cur = { type: 'percent', val: CART.discountPct };
  else if (CART.discount) cur = { type: 'amount', val: CART.discount };

  UI.modal({
    title: 'Apply Discount',
    body: `<p class="tiny muted" style="margin:-4px 0 12px">Applies to <b>${target}</b></p>
      <div class="seg" id="dType">
        <button class="seg-btn ${cur.type === 'amount' ? 'active' : ''}" data-type="amount">Amount</button>
        <button class="seg-btn ${cur.type === 'percent' ? 'active' : ''}" data-type="percent">Percent %</button>
      </div>
      <div class="field" style="margin-top:12px"><label>Discount value <span id="dUnit" class="muted">${cur.type === 'percent' ? '(%)' : '(amount)'}</span></label>
        <input class="input mono" id="dVal" type="number" min="0" value="${cur.val || ''}" placeholder="0"></div>`,
    footer: `${perItem ? '<button class="btn ghost" id="dClear">Remove</button>' : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="dOk">Apply</button>`
  });

  let type = cur.type;
  document.getElementById('dType').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]'); if (!btn) return;
    type = btn.dataset.type;
    document.querySelectorAll('#dType .seg-btn').forEach((x) => x.classList.toggle('active', x.dataset.type === type));
    document.getElementById('dUnit').textContent = type === 'percent' ? '(%)' : '(amount)';
  });

  const apply = (clear) => {
    const val = clear ? 0 : (+document.getElementById('dVal').value || 0);
    if (perItem) {
      selIds.forEach((id) => { const it = CART.items.find((i) => i.id === id); if (it) it.disc = val > 0 ? { type, val } : null; });
    } else {
      CART.discount = type === 'amount' ? val : 0;
      CART.discountPct = type === 'percent' ? val : 0;
    }
    UI.close(); drawCart(root);
    if (val > 0) UI.toast('Discount applied');
  };
  document.getElementById('dOk').onclick = () => apply(false);
  const clr = document.getElementById('dClear'); if (clr) clr.onclick = () => apply(true);
}

async function customerModal(root) {
  const custs = await Store.customers();
  UI.modal({
    title: 'Select Customer',
    body: `<div class="field"><input class="input" id="cSearch" placeholder="Search customer…"></div>
      <div id="cList">${custs.map((c) => `<div class="list-item" data-cust="${UI.esc(c.name)}" style="cursor:pointer">
        <div class="thumb-sm">👤</div><div class="grow"><b>${UI.esc(c.name)}</b><div class="tiny muted">${c.phone || 'No phone'} ${c.debt ? '· Debt ' + UI.money(c.debt) : ''}</div></div></div>`).join('')}</div>`
  });
  document.querySelectorAll('[data-cust]').forEach((el) => el.onclick = () => { CART.customer = el.dataset.cust; UI.close(); drawCart(root); UI.toast('Customer set'); });
}

/* Invoice numbers come from a stored counter, never from sales.length.
   A count-derived number repeats itself the moment records arrive by any other
   route — loading demo data onto a shop that already had sales produced two
   invoices with the same number — and refunds find their original by number,
   so a duplicate silently re-points a refund at the wrong invoice.
   Reserves `count` consecutive numbers and returns the first. */
async function nextInvoiceNo(count = 1) {
  let seq = await DB.setting('invoiceSeq');
  if (!Number.isFinite(seq)) {
    // First run against an existing database: start above the highest in use.
    const all = await DB.all('sales');
    seq = all.reduce((m, s) => Math.max(m, Number(s.no) || 0), 1000);
  }
  await DB.setting('invoiceSeq', seq + count);
  return seq + 1;
}

async function completeSale(root, pay) {
  const t = cartTotals();
  const store = await DB.setting('store');
  const no = await nextInvoiceNo();
  // The whole-invoice discount is split across the lines pro-rata, so every
  // item records the discount it actually carried (reports read discAmt).
  const shares = allocateOrderDisc(t.orderDisc);
  const sale = {
    id: UI.uid('inv'), no, ts: Date.now(), items: CART.items.map((i, idx) => {
      const itemDisc = lineDisc(i);
      const orderShare = shares[idx] || 0;
      const discAmt = itemDisc + orderShare;
      return { id: i.id, name: i.name, price: i.price, qty: i.qty, cost: i.cost,
        disc: (i.disc && i.disc.val && itemDisc) ? { ...i.disc } : null,
        itemDisc, orderShare, discAmt, net: i.price * i.qty - discAmt };
    }),
    subtotal: t.sub, discount: t.disc, lineDiscount: t.lineDiscs, orderDiscount: t.orderDisc, tax: 0, total: t.total, cost: t.cost, profit: t.profit,
    pay, cashier: App.user.name, customer: CART.customer, status: 'completed', type: 'sale'
  };
  /* Read the stock rows and stage every decrement BEFORE the sale is written,
     so a failure here aborts the sale instead of recording a sale whose stock
     never moved. The staged rows then go out as a single bulk write — one
     IndexedDB transaction for all lines, rather than one per line, which is
     what previously left stock half-decremented if the app died mid-loop.
     (Full sale+stock+debt atomicity needs a real transaction across stores —
     that comes with the server database.) */
  const stockRows = [];
  for (const it of CART.items) {
    const p = await DB.get('products', it.id);
    if (p) { p.stock = Math.max(0, (p.stock || 0) - it.qty); stockRows.push(p); }
  }

  await DB.put('sales', sale);
  if (stockRows.length) await DB.bulk('products', stockRows);
  // Print once the books are straight — the sale is committed, so nothing
  // below (debt bookkeeping) should be able to block the receipt.
  UI.toast('Sale #' + no + ' completed · printing receipt');
  printReceipt(sale, store);
  if (pay === 'Debt') {
    const cu = (await Store.customers()).find((c) => c.name === CART.customer);
    if (cu) { cu.debt = UI.roundTo((cu.debt || 0) + t.total); await DB.put('customers', cu); }
  }
  Store.bust();
  CART = { items: [], discount: 0, discountPct: 0, customer: 'Walk-in Customer', pay: 'Cash', held: CART.held };
  drawCart(root);
}

/* The logo at the top of every printed receipt, taken from the store that is
   actually signed in. This was hardcoded to Melora's file, so Bangeen Crystal
   printed its receipts under the other shop's brand. */
function receiptLogo() {
  const t = window.Tenant && Tenant.get();
  if (!t) return '';
  return `<img class="receipt-logo" src="${t.logo}" alt="${UI.esc(t.name)}">`;
}

/* Receipt markup — shared by the auto-print path (POS), the preview (Invoices)
   and refunds. Refund records store negative amounts; the receipt shows them
   as positive figures under a REFUND heading. */
function receiptHTML(sale, store) {
  const isRefund = sale.type === 'refund';
  const abs = (n) => Math.abs(n);
  const rows = sale.items.map((i) => {
    const line = `<tr><td>${UI.esc(i.name)}</td><td style="text-align:center">${abs(i.qty)}</td><td style="text-align:right">${UI.money(abs(i.price * i.qty))}</td></tr>`;
    // Only the item's OWN discount shows here — the invoice-wide discount is
    // listed once in the totals below, so it isn't counted twice.
    const own = i.itemDisc !== undefined ? i.itemDisc : i.discAmt;
    if (!own) return line;
    const lbl = i.disc && i.disc.type === 'percent' ? `−${i.disc.val}% off` : 'discount';
    return line + `<tr class="r-disc"><td style="padding-left:10px;font-size:10px;font-style:italic">↳ ${lbl}</td><td></td><td style="text-align:right;font-size:10px">− ${UI.money(own)}</td></tr>`;
  }).join('');
  return `<div class="receipt" id="rcpt">
      <div class="r-center">${receiptLogo()}</div>
      <div class="r-center"><b style="font-size:16px">${UI.esc(store?.name || (Tenant.get() ? Tenant.get().legal : 'Store'))}</b><br>${UI.esc(store?.address || '')}<br>${UI.esc(store?.phone || '')}</div>
      ${isRefund ? '<div class="r-center" style="margin-top:6px;font-weight:bold;letter-spacing:2px">◆ REFUND ◆</div>' : ''}
      ${sale.channel === 'catpos' && !isRefund ? '<div class="r-center" style="margin-top:6px;font-weight:bold;letter-spacing:1px">CATEGORY SALE</div>' : ''}
      <hr><div>${isRefund ? 'Refund' : 'Invoice'}: #${sale.no}${isRefund ? `<br>Against invoice: #${sale.refundOf}` : ''}<br>Date: ${new Date(sale.ts).toLocaleString()}<br>Cashier: ${UI.esc(sale.cashier)}<br>Customer: ${UI.esc(sale.customer)}</div><hr>
      <table><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amt</th></tr></thead><tbody>${rows}</tbody></table><hr>
      ${isRefund ? '' : `<div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${UI.money(sale.subtotal)}</span></div>
      ${sale.lineDiscount && sale.orderDiscount
        ? `<div style="display:flex;justify-content:space-between"><span>Item discounts</span><span>− ${UI.money(sale.lineDiscount)}</span></div>
           <div style="display:flex;justify-content:space-between"><span>Invoice discount</span><span>− ${UI.money(sale.orderDiscount)}</span></div>`
        : `<div style="display:flex;justify-content:space-between"><span>Discount</span><span>− ${UI.money(sale.discount)}</span></div>`}`}
      <div style="display:flex;justify-content:space-between" class="r-total"><span>${isRefund ? 'REFUNDED' : 'TOTAL'}</span><span>${UI.money(abs(sale.total))}</span></div>
      <div style="display:flex;justify-content:space-between"><span>${isRefund ? 'Refunded to' : 'Paid'} (${sale.pay})</span><span>${UI.money(abs(sale.total))}</span></div>
      <hr><div class="r-center">${isRefund ? 'Refund processed' : UI.esc(store?.footer || 'Thank you!')}</div>
      <div class="r-center" style="letter-spacing:2px;font-size:18px;margin-top:6px">*${isRefund ? 'R' : ''}${sale.no}*</div>
    </div>`;
}

/* How much of each line item on an invoice has already been refunded. */
async function refundedQtyMap(originalNo) {
  const all = await DB.all('sales');
  const map = {};
  all.filter((s) => s.type === 'refund' && s.refundOf === originalNo).forEach((r) =>
    r.items.forEach((i) => { map[i.id] = (map[i.id] || 0) + Math.abs(i.qty); }));
  return map;
}

/* Refund dialog — pick items/quantities from a past sale to return. */
async function refundModal(root, sale, afterDone) {
  if (sale.type === 'refund') return UI.toast('This is already a refund receipt', 'warn');
  const done = await refundedQtyMap(sale.no);
  const lines = sale.items.map((i) => ({ ...i, sold: i.qty, already: done[i.id] || 0, remain: i.qty - (done[i.id] || 0) }));
  if (lines.every((l) => l.remain <= 0)) return UI.toast('This invoice is already fully refunded', 'warn');

  const rowHTML = (l) => `<div class="cart-row" data-line="${l.id}">
      <div class="ci-name">${UI.esc(l.name)}<div class="tiny muted mono">${UI.money(paidUnit(l))}${paidUnit(l) < (l.price || 0) - 0.001 ? ` <s>${UI.money(l.price)}</s>` : ''} · sold ${l.sold}${l.already ? ` · refunded ${l.already}` : ''}</div></div>
      ${l.remain > 0
        ? `<div class="qty"><button data-rdec>−</button><span data-rqty>0</span><button data-rinc>＋</button></div>`
        : '<span class="badge gray">Refunded</span>'}
    </div>`;

  UI.modal({
    title: `Refund — Invoice #${sale.no}`,
    body: `<p class="tiny muted" style="margin-top:-6px">Select the quantity of each item to return. Stock is added back and the money is refunded.</p>
      <div style="margin-top:12px">${lines.map(rowHTML).join('')}</div>
      <div class="sum-row total" style="margin-top:14px"><span>Refund total</span><span class="mono" id="refTotal">${UI.money(0)}</span></div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="refDo" disabled>↩ Refund &amp; Print</button>`
  });

  const state = {}; lines.forEach((l) => state[l.id] = 0);
  const recalc = () => {
    const total = lines.reduce((a, l) => a + state[l.id] * paidUnit(l), 0);
    document.getElementById('refTotal').textContent = UI.money(total);
    document.getElementById('refDo').disabled = total <= 0;
  };
  document.querySelectorAll('[data-line]').forEach((rowEl) => {
    const id = rowEl.dataset.line; const l = lines.find((x) => x.id === id); if (l.remain <= 0) return;
    const span = rowEl.querySelector('[data-rqty]');
    rowEl.querySelector('[data-rinc]').onclick = () => { if (state[id] < l.remain) { state[id]++; span.textContent = state[id]; recalc(); } };
    rowEl.querySelector('[data-rdec]').onclick = () => { if (state[id] > 0) { state[id]--; span.textContent = state[id]; recalc(); } };
  });
  document.getElementById('refDo').onclick = () => processRefund(root, sale, lines.map((l) => ({ ...l, qty: state[l.id] })).filter((l) => l.qty > 0), afterDone);
}

async function processRefund(root, sale, picked, afterDone, opts = {}) {
  const store = await DB.setting('store');
  // Value the return at what was actually paid, not the shelf price.
  const amount = UI.roundTo(picked.reduce((a, l) => a + l.qty * paidUnit(l), 0));
  const cost = UI.roundTo(picked.reduce((a, l) => a + l.qty * (l.cost || 0), 0));
  const no = await nextInvoiceNo();

  const refund = {
    id: UI.uid('ref'), no, ts: Date.now(), type: 'refund', refundOf: sale.no,
    items: picked.map((l) => ({ id: l.id, name: l.name, price: UI.roundTo(paidUnit(l)), listPrice: l.price, cost: l.cost || 0, qty: -l.qty })),
    subtotal: -amount, discount: 0, tax: 0, total: -amount, cost: -cost, profit: -(amount - cost),
    pay: sale.pay, cashier: App.user.name, customer: sale.customer, status: opts.cancel ? 'cancelled' : 'refunded',
    cancel: !!opts.cancel
  };
  await DB.put('sales', refund);

  // restock the returned units
  for (const l of picked) {
    const p = await DB.get('products', l.id);
    if (p) { p.stock = (p.stock || 0) + l.qty; await DB.put('products', p); }
  }
  // if the original was on account, the customer now owes less
  if (sale.pay === 'Debt') {
    const cu = (await Store.customers()).find((c) => c.name === sale.customer);
    if (cu) { cu.debt = Math.max(0, (cu.debt || 0) - amount); await DB.put('customers', cu); }
  }
  // mark the original invoice cancelled (a full void), for the invoice list
  if (opts.cancel) {
    const orig = await DB.get('sales', sale.id);
    if (orig) { orig.status = 'cancelled'; await DB.put('sales', orig); }
  }

  Store.bust();
  UI.close();
  UI.toast(`${opts.cancel ? 'Cancelled' : 'Refunded'} ${UI.money(amount)} · printing`, 'info');
  printReceipt(refund, store);
  if (afterDone) afterDone();
}

/* Cancel = void the whole invoice: refund every item still un-returned and
   flag the invoice as cancelled. Dashboard revenue drops by that amount. */
async function cancelInvoice(root, sale, onDone) {
  const done = await refundedQtyMap(sale.no);
  // `sold` must survive: qty below becomes the outstanding quantity, but the
  // per-unit price paid can only be derived from the ORIGINAL line quantity.
  const remaining = sale.items.map((i) => ({ ...i, sold: i.qty, qty: i.qty - (done[i.id] || 0) })).filter((l) => l.qty > 0);
  if (!remaining.length) return UI.toast('This invoice is already fully cancelled/refunded', 'warn');
  const amount = UI.roundTo(remaining.reduce((a, l) => a + l.qty * paidUnit(l), 0));
  UI.confirm(`Cancel invoice #${sale.no}? This refunds ${UI.money(amount)}, restocks the items, and removes it from your sales total.`,
    () => processRefund(root, sale, remaining, onDone, { cancel: true }), { danger: true });
}

/* Exchange = return some items from an invoice and give new items in their place;
   the customer pays the difference (or is refunded it). Modeled as a return record
   (negative) + a new-sale record (positive) so the net revenue impact is exactly
   the price difference — e.g. return $500, take $600 → dashboard rises $100. */
async function exchangeModal(root, sale, onDone) {
  if (sale.type === 'refund' || sale.type === 'exchange') return UI.toast('Cannot exchange this receipt', 'warn');
  const products = (await Store.products()).filter((p) => p.active !== false);
  const done = await refundedQtyMap(sale.no);
  const returnable = sale.items.map((i) => ({ ...i, sold: i.qty, remain: i.qty - (done[i.id] || 0) })).filter((l) => l.remain > 0);
  if (!returnable.length) return UI.toast('No items left to exchange on this invoice', 'warn');

  const ret = {}; returnable.forEach((l) => { ret[l.id] = 0; });
  const neu = []; // new items [{id,name,price,cost,qty}]
  let pay = 'Cash';

  UI.modal({
    title: `Exchange — Invoice #${sale.no}`, wide: true,
    body: `<div class="grid" style="grid-template-columns:1fr 1fr;gap:18px">
      <div><div class="section-title">Returning</div>
        <div>${returnable.map((l) => `<div class="cart-row" data-rl="${l.id}">
          <div class="ci-name">${UI.esc(l.name)}<div class="tiny muted mono">${UI.money(paidUnit(l))} · ${l.remain} available</div></div>
          <div class="qty"><button data-rd>−</button><span data-rq>0</span><button data-ri>＋</button></div></div>`).join('')}</div></div>
      <div><div class="section-title">New items</div>
        <div class="scan-box"><span>🔎</span><input id="ex_scan" placeholder="Scan barcode or search name…" autocomplete="off"></div>
        <div id="ex_results" class="scan-results"></div>
        <div id="ex_new" style="margin-top:8px"></div></div>
    </div>
    <div style="background:var(--surface-2);border-radius:14px;padding:14px;margin-top:14px">
      <div class="sum-row"><span class="muted">Returned value</span><span class="mono" id="ex_rt">${UI.money(0)}</span></div>
      <div class="sum-row"><span class="muted">New items value</span><span class="mono" id="ex_nt">${UI.money(0)}</span></div>
      <div class="sum-row total"><span id="ex_dl">Difference</span><span class="mono" id="ex_diff">${UI.money(0)}</span></div>
      <div class="row" style="gap:6px;margin-top:10px" id="ex_pay">
        ${PAY_METHODS.map(([m, ic]) => `<div class="pay-chip ${m === 'Cash' ? 'active' : ''}" data-p="${m}">${ic} ${m === 'Debt' ? 'Account' : m}</div>`).join('')}
      </div>
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ex_do" disabled>🔄 Complete Exchange</button>`
  });

  const recalc = () => {
    // Returns are credited at what was paid; new items sell at today's price.
    const rt = returnable.reduce((a, l) => a + ret[l.id] * paidUnit(l), 0);
    const nt = neu.reduce((a, l) => a + l.qty * l.price, 0);
    const diff = nt - rt;
    document.getElementById('ex_rt').textContent = UI.money(rt);
    document.getElementById('ex_nt').textContent = UI.money(nt);
    document.getElementById('ex_diff').textContent = (diff < 0 ? '− ' : '') + UI.money(Math.abs(diff));
    document.getElementById('ex_dl').textContent = diff > 0 ? 'Customer pays' : diff < 0 ? 'Refund to customer' : 'Even exchange';
    const retQty = returnable.reduce((a, l) => a + ret[l.id], 0);
    const newQty = neu.reduce((a, l) => a + l.qty, 0);
    document.getElementById('ex_do').disabled = !(retQty > 0 && newQty > 0);
  };
  const drawNew = () => {
    document.getElementById('ex_new').innerHTML = neu.length ? neu.map((l, idx) => `<div class="cart-row">
      <div class="ci-name">${UI.esc(l.name)}<div class="tiny muted mono">${UI.money(l.price)}</div></div>
      <div class="qty"><button data-nd="${idx}">−</button><span>${l.qty}</span><button data-ni="${idx}">＋</button></div>
      <button class="icon-btn sm" data-nr="${idx}" style="width:28px;height:28px;border:none">🗑</button></div>`).join('') : '<div class="muted tiny" style="padding:8px">No new items yet</div>';
    document.querySelectorAll('#ex_new [data-ni]').forEach((b) => b.onclick = () => { const l = neu[+b.dataset.ni]; if (!cartAddOk(l, l.name)) return; l.qty++; drawNew(); });
    document.querySelectorAll('#ex_new [data-nd]').forEach((b) => b.onclick = () => { const l = neu[+b.dataset.nd]; l.qty--; if (l.qty <= 0) neu.splice(+b.dataset.nd, 1); drawNew(); });
    document.querySelectorAll('#ex_new [data-nr]').forEach((b) => b.onclick = () => { neu.splice(+b.dataset.nr, 1); drawNew(); });
    recalc();
  };
  drawNew();

  document.querySelectorAll('[data-rl]').forEach((row) => {
    const id = row.dataset.rl; const l = returnable.find((x) => x.id === id); const span = row.querySelector('[data-rq]');
    row.querySelector('[data-ri]').onclick = () => { if (ret[id] < l.remain) { ret[id]++; span.textContent = ret[id]; recalc(); } };
    row.querySelector('[data-rd]').onclick = () => { if (ret[id] > 0) { ret[id]--; span.textContent = ret[id]; recalc(); } };
  });
  /* Pick the replacement item the same way as the POS: scan it and it drops
     straight in, or type part of the name and click the match. */
  const scan = document.getElementById('ex_scan');
  const results = document.getElementById('ex_results');
  const addNew = (p) => {
    if (!p) return;
    const ex = neu.find((l) => l.id === p.id);
    if (ex) { if (!cartAddOk(ex, p.name)) return; ex.qty++; }
    else {
      if ((p.stock || 0) <= 0) return UI.toast(p.name + ' is out of stock', 'warn');
      neu.push({ id: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1, stock: p.stock });
    }
    drawNew();
    scan.value = ''; results.innerHTML = ''; scan.focus();
    UI.toast(p.name + ' added');
  };
  const match = (q) => products.filter((p) =>
    p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q));
  const drawResults = () => {
    const q = scan.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const hits = match(q).slice(0, 8);
    results.innerHTML = hits.length ? hits.map((p) => `<div class="list-item" data-pick="${p.id}" style="cursor:pointer">
        <div class="thumb-sm">${p.icon || '📦'}</div>
        <div class="grow"><b>${UI.esc(p.name)}</b><div class="tiny muted mono">${p.barcode || 'no barcode'}${p.stock <= 0 ? ' · <span class="text-red">out of stock</span>' : ' · ' + p.stock + ' in stock'}</div></div>
        <b class="mono">${UI.money(p.price)}</b></div>`).join('')
      : '<div class="muted tiny" style="padding:10px">No product found</div>';
    results.querySelectorAll('[data-pick]').forEach((el) => el.onclick = () => addNew(products.find((x) => x.id === el.dataset.pick)));
  };
  scan.addEventListener('input', drawResults);
  scan.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();                       // a scanner ends its burst with Enter
    const code = scan.value.trim(); if (!code) return;
    const exact = products.find((p) => (p.barcode || '') === code)
      || products.find((p) => (p.sku || '').toLowerCase() === code.toLowerCase());
    if (exact) return addNew(exact);
    const hits = match(code.toLowerCase());
    if (hits.length === 1) return addNew(hits[0]);
    if (!hits.length) UI.toast(`No product with barcode ${code}`, 'warn');
  });
  setTimeout(() => scan.focus(), 60);          // ready to scan the moment it opens
  document.getElementById('ex_pay').addEventListener('click', (e) => {
    const c = e.target.closest('[data-p]'); if (!c) return;
    document.querySelectorAll('#ex_pay .pay-chip').forEach((x) => x.classList.remove('active')); c.classList.add('active'); pay = c.dataset.p;
  });
  document.getElementById('ex_do').onclick = () => {
    const returnedLines = returnable.map((l) => ({ ...l, qty: ret[l.id] })).filter((l) => l.qty > 0);
    processExchange(root, sale, returnedLines, neu, pay, onDone);
  };
}

async function processExchange(root, sale, returnedLines, newLines, pay, onDone) {
  const store = await DB.setting('store');
  // Credit the return at what was paid; charge the new items at today's price.
  const rTotal = UI.roundTo(returnedLines.reduce((a, l) => a + l.qty * paidUnit(l), 0));
  const rCost = UI.roundTo(returnedLines.reduce((a, l) => a + l.qty * (l.cost || 0), 0));
  const nTotal = UI.roundTo(newLines.reduce((a, l) => a + l.qty * l.price, 0));
  const nCost = UI.roundTo(newLines.reduce((a, l) => a + l.qty * (l.cost || 0), 0));
  const diff = UI.roundTo(nTotal - rTotal);
  let no = await nextInvoiceNo(2);   // one for the return leg, one for the sale leg

  const returnRec = {
    id: UI.uid('exr'), no: no++, ts: Date.now(), type: 'refund', refundOf: sale.no, exchange: true,
    items: returnedLines.map((l) => ({ id: l.id, name: l.name, price: UI.roundTo(paidUnit(l)), listPrice: l.price, cost: l.cost || 0, qty: -l.qty })),
    subtotal: -rTotal, discount: 0, tax: 0, total: -rTotal, cost: -rCost, profit: -(rTotal - rCost),
    pay, cashier: App.user.name, customer: sale.customer, status: 'exchanged'
  };
  const saleRec = {
    id: UI.uid('exs'), no, ts: Date.now() + 1, type: 'exchange', refundOf: sale.no, exchange: true, diff,
    items: newLines.map((l) => ({ id: l.id, name: l.name, price: l.price, cost: l.cost || 0, qty: l.qty })),
    subtotal: nTotal, discount: 0, tax: 0, total: nTotal, cost: nCost, profit: nTotal - nCost,
    pay, cashier: App.user.name, customer: sale.customer, status: 'exchanged'
  };
  await DB.put('sales', returnRec);
  await DB.put('sales', saleRec);

  for (const l of returnedLines) { const p = await DB.get('products', l.id); if (p) { p.stock = (p.stock || 0) + l.qty; await DB.put('products', p); } }
  for (const l of newLines) { const p = await DB.get('products', l.id); if (p) { p.stock = Math.max(0, (p.stock || 0) - l.qty); await DB.put('products', p); } }
  if (pay === 'Debt') {
    const cu = (await Store.customers()).find((c) => c.name === sale.customer);
    if (cu) { cu.debt = Math.max(0, (cu.debt || 0) + diff); await DB.put('customers', cu); }
  }

  Store.bust();
  UI.close();
  UI.toast(`Exchange done · ${diff >= 0 ? 'collected ' + UI.money(diff) : 'refunded ' + UI.money(-diff)}`, 'info');
  printReceipt(null, store, exchangeReceiptHTML(sale, returnedLines, newLines, diff, saleRec.no, store));
  if (onDone) onDone();
}

function exchangeReceiptHTML(sale, returnedLines, newLines, diff, no, store) {
  // Returned lines are credited at the price paid; new lines at today's price.
  const line = (l, sign, unit) => `<tr><td>${sign}${UI.esc(l.name)}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">${UI.money(l.qty * unit(l))}</td></tr>`;
  const retUnit = (l) => paidUnit(l);
  const newUnit = (l) => l.price;
  return `<div class="receipt" id="rcpt">
      <div class="r-center">${receiptLogo()}</div>
      <div class="r-center"><b style="font-size:16px">${UI.esc(store?.name || (Tenant.get() ? Tenant.get().legal : 'Store'))}</b><br>${UI.esc(store?.address || '')}</div>
      <div class="r-center" style="margin-top:6px;font-weight:bold;letter-spacing:2px">🔄 EXCHANGE</div>
      <hr><div>Exchange: #${no}<br>Against invoice: #${sale.no}<br>Date: ${new Date().toLocaleString()}<br>Cashier: ${UI.esc(App.user.name)}</div><hr>
      <div style="font-weight:bold">Returned</div>
      <table><tbody>${returnedLines.map((l) => line(l, '− ', retUnit)).join('')}</tbody></table>
      <div style="font-weight:bold;margin-top:6px">New items</div>
      <table><tbody>${newLines.map((l) => line(l, '＋ ', newUnit)).join('')}</tbody></table><hr>
      <div style="display:flex;justify-content:space-between"><span>Returned value</span><span>${UI.money(returnedLines.reduce((a, l) => a + l.qty * paidUnit(l), 0))}</span></div>
      <div style="display:flex;justify-content:space-between"><span>New items value</span><span>${UI.money(newLines.reduce((a, l) => a + l.qty * l.price, 0))}</span></div>
      <div style="display:flex;justify-content:space-between" class="r-total"><span>${diff >= 0 ? 'CUSTOMER PAID' : 'REFUNDED'}</span><span>${UI.money(Math.abs(diff))}</span></div>
      <hr><div class="r-center">${UI.esc(store?.footer || 'Thank you!')}</div>
      <div class="r-center" style="letter-spacing:2px;font-size:18px;margin-top:6px">*X${no}*</div>
    </div>`;
}

/* Open an invoice with its receipt and — for a normal, still-active sale —
   the Refund / Exchange / Cancel actions. This is the "open it and do that". */
async function invoiceDetail(root, sale, store, onDone) {
  const isRefundRec = sale.type === 'refund' || sale.type === 'exchange';
  let cancelled = sale.status === 'cancelled';
  if (!isRefundRec && !cancelled) {
    const done = await refundedQtyMap(sale.no);
    const remaining = sale.items.reduce((a, i) => a + Math.max(0, i.qty - (done[i.id] || 0)) * i.price, 0);
    if (remaining <= 0) cancelled = true;
  }
  const canAct = (App.canEdit('pos') || App.canEdit('catpos')) && !isRefundRec && !cancelled;
  UI.modal({
    title: (isRefundRec ? 'Receipt' : 'Invoice') + ' #' + sale.no,
    body: receiptHTML(sale, store) + (cancelled && !isRefundRec ? '<div class="badge red" style="display:block;margin-top:10px;text-align:center;padding:8px">This invoice has been fully cancelled / refunded</div>' : ''),
    footer: `<button class="btn ghost" data-close>Close</button><button class="btn ghost" id="d_print">🖨 Print</button>
      ${canAct ? '<button class="btn ghost" id="d_refund">↩ Refund</button><button class="btn ghost" id="d_exchange">🔄 Exchange</button><button class="btn danger" id="d_cancel">✕ Cancel</button>' : ''}`
  });
  document.getElementById('d_print').onclick = () => printReceipt(sale, store);
  if (canAct) {
    document.getElementById('d_refund').onclick = () => refundModal(root, sale, onDone);
    document.getElementById('d_exchange').onclick = () => exchangeModal(root, sale, onDone);
    document.getElementById('d_cancel').onclick = () => cancelInvoice(root, sale, onDone);
  }
}

/* Send a receipt straight to the printer — no preview, no extra click.
   Only #printArea is printed (see the print rules in styles.css). Inside the
   Melora POS desktop app (Electron) this skips the OS print dialog entirely
   via window.electronPrint (see electron/preload.js + main.js). Running the
   web build in a plain browser still shows the OS dialog — enable Chrome's
   --kiosk-printing flag there if you need dialog-free printing too.
   If the silent print fails (no default printer set up in Windows, wrong
   printer selected, driver error, etc.) it used to fail invisibly — now it
   falls back to the OS print dialog and tells the cashier why. */
function firePrint(cleanup) {
  if (window.electronPrint) {
    window.electronPrint.silent().then((res) => {
      if (!res || !res.success) {
        UI.toast('Silent print failed (' + ((res && res.reason) || 'no printer') + ') · opening print dialog', 'warn');
        window.addEventListener('afterprint', cleanup);
        window.print();
        setTimeout(cleanup, 4000);
      } else {
        cleanup();
      }
    }).catch((err) => {
      UI.toast('Print failed: ' + err.message, 'warn');
      cleanup();
    });
  } else {
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 4000); // fallback if afterprint never fires
  }
}
/* Send any thermal-formatted HTML straight to the printer. */
function printThermal(html) {
  const area = document.getElementById('printArea');
  if (!area) return;
  area.innerHTML = html;
  document.body.classList.add('print-receipt');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    document.body.classList.remove('print-receipt');
    area.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  firePrint(cleanup);
}
window.printThermal = printThermal;

/* Shared thermal document shell: store header, title, body, footer + cut mark. */
function thermalDoc(store, title, bodyHTML, sub) {
  return `<div class="receipt" id="rcpt">
      <div class="r-center">${receiptLogo()}</div>
      <div class="r-center"><b style="font-size:16px">${UI.esc(store?.name || (Tenant.get() ? Tenant.get().legal : 'Store'))}</b><br>${UI.esc(store?.address || '')}${store?.phone ? '<br>' + UI.esc(store.phone) : ''}</div>
      <div class="r-center" style="margin-top:6px;font-weight:bold;letter-spacing:1px">${UI.esc(title)}</div>
      ${sub ? `<div class="r-center tiny">${UI.esc(sub)}</div>` : ''}
      <hr><div>Printed: ${new Date().toLocaleString()}<br>By: ${UI.esc((window.App && App.user && App.user.name) || '')}</div><hr>
      ${bodyHTML}
      <hr><div class="r-center">${UI.esc(store?.footer || 'Thank you!')}</div>
    </div>`;
}
/* Two-column money row used across the thermal reports. */
function tRow(label, value, bold) {
  return `<div style="display:flex;justify-content:space-between${bold ? ';font-weight:bold' : ''}"><span>${UI.esc(label)}</span><span>${value}</span></div>`;
}

function printReceipt(sale, store, html) {
  const area = document.getElementById('printArea');
  if (!area) return;
  area.innerHTML = html || receiptHTML(sale, store);
  document.body.classList.add('print-receipt');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    document.body.classList.remove('print-receipt');
    area.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  firePrint(cleanup);
}

/* Preview an existing receipt (Invoices screen), with a manual print button. */
function showReceipt(sale, store) {
  UI.modal({
    title: 'Receipt #' + sale.no,
    body: receiptHTML(sale, store),
    footer: `<button class="btn ghost" data-close>Close</button><button class="btn primary" id="rcPrint">🖨 Print</button>`
  });
  document.getElementById('rcPrint').onclick = () => printReceipt(sale, store);
}

/* ------------------------------ PRODUCTS ------------------------------ */
Views.products = async (root) => {
  const products = await Store.products();
  const cats = await Store.categories();
  const sups = await Store.suppliers();
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || '—';
  const canEdit = App.canEdit('products'); // Cashiers get a read-only catalog

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Products</h1><div class="sub">${products.length} <span>products</span> · ${cats.length} <span>categories</span>${canEdit ? '' : ' · <span class="badge gray">View only</span>'}</div></div>
      ${canEdit ? '<div class="row"><button class="btn ghost" id="expP">⇩ Download Excel</button><button class="btn ghost" id="impP">⇪ Import from Excel</button><button class="btn ghost" id="mgCats">🏷 Categories</button><button class="btn primary" id="addP">＋ Add Product</button></div>' : ''}
    </div>
    <div class="card pad0">
      <div class="row between" style="padding:16px 18px">
        <div class="search" style="flex:1;max-width:340px;display:flex;gap:8px;align-items:center;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:9px 14px">
          <span>🔎</span><input id="pSearch" placeholder="Search name, SKU, barcode…" style="border:none;background:transparent;outline:none;width:100%"></div>
        <span class="badge blue" id="pCount">${products.length} items</span>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>Product</th><th>Category</th><th>SKU / Barcode</th><th class="right">Cost</th><th class="right">Price</th><th class="right">Stock</th><th>Status</th><th></th>
      </tr></thead><tbody id="pBody"></tbody></table></div>
    </div>`;

  const body = root.querySelector('#pBody');
  const draw = (list) => {
    body.innerHTML = list.map((p) => `<tr>
      <td><div class="row"><div class="thumb-sm">${p.icon || '📦'}</div><div><b>${UI.esc(p.name)}</b><div class="tiny muted">${p.unit || 'pcs'}</div></div></div></td>
      <td><span class="badge gray">${UI.esc(catName(p.category))}</span></td>
      <td class="tiny mono">${p.sku || '—'}<br><span class="muted">${p.barcode || '—'}</span></td>
      <td class="right mono">${UI.money(p.cost)}</td>
      <td class="right mono"><b>${UI.money(p.price)}</b></td>
      <td class="right"><span class="badge ${p.stock <= 0 ? 'red' : p.stock <= (p.minStock || 0) ? 'orange' : 'green'}">${p.stock}</span></td>
      <td>${p.active !== false ? '<span class="badge green">Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
      <td>${canEdit ? `<button class="btn sm ghost" data-edit="${p.id}">Edit</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted" style="padding:30px;text-align:center">No products</td></tr>';
    if (canEdit) body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => productForm(root, products.find((x) => x.id === b.dataset.edit)));
  };
  draw(products);
  root.querySelector('#pSearch').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    draw(products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q)));
  };
  if (canEdit) {
    root.querySelector('#addP').onclick = () => productForm(root, null);
    root.querySelector('#mgCats').onclick = () => categoryModal(root);
    root.querySelector('#impP').onclick = () => importModal(root);
    root.querySelector('#expP').onclick = () => exportProducts(products, cats, sups);
  }
};

/* Download every product as .xlsx, in the same column layout the importer
   reads — so editing stock/prices in Excel and re-importing that same file
   updates the matching products (matched by barcode/SKU/name) instead of
   duplicating them. */
function exportProducts(products, cats, sups) {
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || '';
  const supName = (id) => (sups.find((s) => s.id === id) || {}).name || '';
  const headers = IMPORT_COLS.map(([, label]) => label);
  const rows = products.map((p) => [
    p.name, catName(p.category), p.cost || 0, p.price || 0, p.wholesale || 0,
    p.stock || 0, p.minStock || 0, p.barcode || '', p.sku || '', p.unit || 'pcs', supName(p.supplier)
  ]);
  const data = XLSXLite.buildXlsx([headers, ...rows], { sheetName: 'Products', textCols: [7, 8] });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = Tenant.id + '-products-' + UI.dayKey(Date.now()) + '.xlsx';
  a.click();
  UI.toast('Downloaded ' + products.length + ' products');
}

/* =====================================================================
   Excel / CSV import for products + categories
   Excel saves as CSV, which we parse locally — no library, works offline.
   ===================================================================== */

const IMPORT_COLS = [
  ['name', 'Name', ['name', 'product', 'productname', 'item', 'itemname', 'description']],
  ['category', 'Category', ['category', 'cat', 'group', 'categoryname']],
  ['cost', 'Cost', ['cost', 'costprice', 'buy', 'buyprice', 'purchase', 'purchaseprice']],
  ['price', 'Price', ['price', 'sell', 'sellprice', 'sellingprice', 'saleprice', 'retail', 'retailprice']],
  ['wholesale', 'Wholesale', ['wholesale', 'wholesaleprice']],
  ['stock', 'Stock', ['stock', 'qty', 'quantity', 'stockqty', 'instock', 'onhand']],
  ['minStock', 'Min stock', ['min', 'minstock', 'minimum', 'reorder', 'reorderlevel']],
  ['barcode', 'Barcode', ['barcode', 'ean', 'upc', 'bar']],
  ['sku', 'SKU', ['sku', 'code', 'itemcode', 'ref']],
  ['unit', 'Unit', ['unit', 'unittype', 'uom']],
  ['supplier', 'Supplier', ['supplier', 'vendor']]
];

/* Split CSV text into rows, honouring quotes, escaped quotes and , ; or TAB. */
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const head = (text.split(/\r?\n/)[0] || '');
  const count = (ch) => (head.split(ch).length - 1);
  const delim = count('\t') > count(';') && count('\t') > count(',') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/* Lenient number parse: strips currency symbols/spaces, handles 1,234.56 and 1.234,56 */
function toNum(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC > lastD) s = s.replace(/\./g, '').replace(',', '.'); // European: 1.234,56
  else s = s.replace(/,/g, '');                                  // 1,234.56
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const normHead = (h) => String(h || '').toLowerCase().replace(/[\s_\-().]/g, '');

/* Barcodes must stay text. Repair the damage a CSV round-trip through Excel
   can cause: scientific notation (8.69474E+12) and a trailing ".0". This
   recovers codes up to 15 digits; the .xlsx path avoids the damage entirely. */
function normBarcode(v) {
  let s = String(v ?? '').trim();
  if (!s) return '';
  if (/^[+-]?\d(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (isFinite(n)) s = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
  }
  s = s.replace(/\.0+$/, '');
  return s.replace(/\s/g, '');
}

/* Map the sheet's header row onto our fields. */
function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const n = normHead(h);
    const hit = IMPORT_COLS.find(([, , aliases]) => aliases.includes(n));
    if (hit && map[hit[0]] === undefined) map[hit[0]] = idx;
  });
  return map;
}

async function importModal(root) {
  UI.modal({
    title: 'Import products from Excel', wide: true,
    body: `<p class="tiny muted" style="margin-top:-6px">Download the template, fill it in Excel, then choose it here — <b>keep it as .xlsx</b> so barcodes stay exact.
        Categories and suppliers that don't exist yet are created automatically, and any product without a barcode gets a valid one.</p>
      <div class="row" style="gap:10px;margin-top:14px">
        <button class="btn ghost" id="imp_tpl">⇩ Download Excel template</button>
        <input type="file" id="imp_file" accept=".xlsx,.csv,.txt,.tsv" class="input" style="padding:9px">
      </div>
      <div id="imp_preview" style="margin-top:14px"></div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="imp_go" disabled>Import</button>`
  });

  document.getElementById('imp_tpl').onclick = () => {
    const headers = IMPORT_COLS.map(([, label]) => label);
    const sample = [
      ['Cola Can 330ml', 'Beverages', '0.35', '0.75', '0.65', '120', '10', '8694740201654', 'SKU-001', 'pcs', 'Metro Wholesale'],
      ['Chocolate Bar', 'Snacks', '0.40', '1.00', '0.90', '90', '10', '0123456789012', 'SKU-002', 'pcs', '']
    ];
    // Barcode (col 7) and SKU (col 8) stay TEXT; the rest are real numbers/words.
    const data = XLSXLite.buildXlsx([headers, ...sample], { sheetName: 'Products', textCols: [7, 8] });
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = Tenant.id + '-products-template.xlsx'; a.click();
    UI.toast('Template downloaded — fill it in Excel and import the .xlsx');
  };

  let parsed = null;
  document.getElementById('imp_file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const box = document.getElementById('imp_preview');
    const go = document.getElementById('imp_go');
    go.disabled = true;
    try {
      if (/\.xls$/i.test(f.name)) throw new Error('Old .xls isn’t supported — Save As .xlsx or CSV');
      let rows;
      if (/\.xlsx$/i.test(f.name)) rows = await XLSXLite.readXlsx(await f.arrayBuffer());
      else rows = parseCSV(await f.text());
      parsed = await previewImport(rows);
      go.disabled = !parsed || !parsed.valid.length;
    } catch (err) {
      parsed = null;
      box.innerHTML = `<div class="badge red" style="display:block;padding:10px;text-align:center">Couldn't read this file: ${UI.esc(err.message || 'unknown error')}. Try re-downloading the template.</div>`;
    }
  };
  document.getElementById('imp_go').onclick = () => { if (parsed) applyImport(root, parsed.valid); };
}

/* Validate already-parsed rows (from .xlsx or CSV) and render a preview
   of exactly what will happen. */
async function previewImport(rows) {
  const box = document.getElementById('imp_preview');
  if (rows.length < 2) { box.innerHTML = '<div class="badge red" style="display:block;padding:10px;text-align:center">The file has no data rows.</div>'; return null; }

  const map = mapHeaders(rows[0]);
  if (map.name === undefined) {
    box.innerHTML = `<div class="badge red" style="display:block;padding:10px;text-align:center">Couldn't find a <b>Name</b> column. Expected headers like: ${IMPORT_COLS.map(([, l]) => l).join(', ')}</div>`;
    return null;
  }

  const products = await Store.products();
  const cats = await Store.categories();
  const catNames = new Set(cats.map((c) => c.name.toLowerCase()));
  const byBarcode = {}, bySku = {}, byName = {};
  products.forEach((p) => { if (p.barcode) byBarcode[p.barcode] = p; if (p.sku) bySku[p.sku.toLowerCase()] = p; byName[p.name.toLowerCase()] = p; });

  const valid = [], errors = [], newCats = new Set();
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (map[k] === undefined ? '' : String(r[map[k]] ?? '').trim());
    const name = get('name');
    if (!name) { errors.push(`Row ${i + 2}: missing name`); return; }
    /* A blank cell or a missing column means "leave this alone", NOT zero.
       toNum('') would return 0, which on an update would wipe the product's
       real stock/cost/price — so numeric fields come back as null when the
       sheet says nothing about them, and applyImport keeps the old value. */
    const num = (k) => { const raw = get(k); return raw === '' ? null : toNum(raw); };
    const int = (k) => { const n = num(k); return n === null ? null : Math.round(n); };
    const rec = {
      name, category: get('category'), cost: num('cost'), price: num('price'),
      wholesale: num('wholesale'), stock: int('stock'),
      minStock: int('minStock'), barcode: normBarcode(get('barcode')),
      sku: get('sku'), unit: get('unit') || 'pcs', supplier: get('supplier')
    };
    const existing = (rec.barcode && byBarcode[rec.barcode]) || (rec.sku && bySku[rec.sku.toLowerCase()]) || byName[name.toLowerCase()];
    rec._mode = existing ? 'update' : 'new';
    rec._existingId = existing ? existing.id : null;
    if (rec.category && !catNames.has(rec.category.toLowerCase())) newCats.add(rec.category);
    valid.push(rec);
  });

  const newCount = valid.filter((v) => v._mode === 'new').length;
  const updCount = valid.length - newCount;
  box.innerHTML = `
    <div class="row wrap" style="gap:8px;margin-bottom:10px">
      <span class="badge green">${newCount} new</span>
      <span class="badge blue">${updCount} update</span>
      ${newCats.size ? `<span class="badge cyan">${newCats.size} new categories</span>` : ''}
      ${errors.length ? `<span class="badge red">${errors.length} skipped</span>` : ''}
    </div>
    ${errors.length ? `<div class="tiny text-red" style="margin-bottom:8px">${errors.slice(0, 5).join('<br>')}${errors.length > 5 ? '<br>…' : ''}</div>` : ''}
    <div class="table-wrap" style="max-height:260px;overflow:auto"><table class="tbl">
      <thead><tr><th></th><th>Name</th><th>Category</th><th class="right">Cost</th><th class="right">Price</th><th class="right">Stock</th></tr></thead>
      <tbody>${valid.slice(0, 50).map((v) => `<tr>
        <td><span class="badge ${v._mode === 'new' ? 'green' : 'blue'}">${v._mode}</span></td>
        <td><b>${UI.esc(v.name)}</b></td><td>${UI.esc(v.category || '—')}</td>
        <td class="right mono">${v.cost === null ? '<span class="muted">keep</span>' : UI.money(v.cost)}</td>
        <td class="right mono">${v.price === null ? '<span class="muted">keep</span>' : UI.money(v.price)}</td>
        <td class="right mono">${v.stock === null ? '<span class="muted">keep</span>' : v.stock}</td></tr>`).join('')}</tbody></table></div>
    ${valid.length > 50 ? `<div class="tiny muted" style="margin-top:6px">Showing first 50 of ${valid.length} rows.</div>` : ''}`;
  return { valid, errors };
}

/* Commit the import: create missing categories/suppliers, then add or update each product. */
async function applyImport(root, rows) {
  const cats = await Store.categories();
  const sups = await Store.suppliers();
  const catByName = {}; cats.forEach((c) => catByName[c.name.toLowerCase()] = c);
  const supByName = {}; sups.forEach((s) => supByName[s.name.toLowerCase()] = s);
  const products = await Store.products();
  const usedBarcodes = products.map((p) => p.barcode).filter(Boolean);

  let created = 0, updated = 0, madeCats = 0, madeSups = 0;
  for (const r of rows) {
    // category (auto-create)
    let catId = '';
    if (r.category) {
      const key = r.category.toLowerCase();
      if (!catByName[key]) { const c = { id: UI.uid('c'), name: r.category, icon: '🏷' }; await DB.put('categories', c); catByName[key] = c; madeCats++; }
      catId = catByName[key].id;
    }
    // supplier (auto-create)
    let supId = '';
    if (r.supplier) {
      const key = r.supplier.toLowerCase();
      if (!supByName[key]) { const s = { id: UI.uid('s'), name: r.supplier, company: '', phone: '', products: '', debt: 0 }; await DB.put('suppliers', s); supByName[key] = s; madeSups++; }
      supId = supByName[key].id;
    }

    if (r._existingId) {
      const p = await DB.get('products', r._existingId);
      // The product may have been deleted between preview and apply — treat it
      // as new rather than throwing and aborting the rest of the import.
      if (!p) { r._existingId = null; }
      else {
        // `?? p.x` (not `|| p.x`) so an explicit 0 in the sheet still applies,
        // while a blank cell keeps whatever the product already had.
        Object.assign(p, {
          name: r.name, category: catId || p.category,
          cost: r.cost ?? p.cost, price: r.price ?? p.price,
          wholesale: r.wholesale ?? p.wholesale,
          stock: r.stock ?? p.stock, minStock: r.minStock ?? p.minStock,
          unit: r.unit || p.unit, supplier: supId || p.supplier, sku: r.sku || p.sku,
          barcode: r.barcode || p.barcode || genBarcode(usedBarcodes)
        });
        if (p.barcode) usedBarcodes.push(p.barcode);
        await DB.put('products', p); updated++;
      }
    }
    if (!r._existingId) {
      const barcode = r.barcode || genBarcode(usedBarcodes);
      usedBarcodes.push(barcode);
      await DB.put('products', {
        id: UI.uid('p'), name: r.name, category: catId, cost: r.cost ?? 0, price: r.price ?? 0,
        wholesale: r.wholesale ?? 0, stock: r.stock ?? 0, minStock: r.minStock ?? 10, unit: r.unit || 'pcs',
        supplier: supId, sku: r.sku, barcode, active: true, icon: '📦', expiry: null
      });
      created++;
    }
  }
  Store.bust(); UI.close();
  UI.toast(`Imported: ${created} new, ${updated} updated${madeCats ? `, ${madeCats} categories` : ''}${madeSups ? `, ${madeSups} suppliers` : ''}`);
  Views.products(root);
}

/* EAN-13 check digit for a 12-digit string. */
function ean13Check(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}
/* Generate a valid, unique in-store EAN-13 barcode.
   Prefix "20" is GS1's restricted range reserved for in-store / private use —
   the correct choice for codes a shop generates itself. */
function genBarcode(existing = []) {
  const taken = new Set(existing.filter(Boolean));
  for (let tries = 0; tries < 10000; tries++) {
    let d = '20';
    for (let i = 0; i < 10; i++) d += Math.floor(Math.random() * 10);
    const code = d + ean13Check(d);
    if (!taken.has(code)) return code;
  }
  const d = ('20' + Date.now()).slice(0, 12);
  return d + ean13Check(d);
}
window.genBarcode = genBarcode;

async function productForm(root, p) {
  const cats = await Store.categories();
  const sups = await Store.suppliers();
  const allProducts = await Store.products();
  const isNew = !p;
  p = p || { active: true, unit: 'pcs', minStock: 10, icon: '📦' };
  const otherBarcodes = allProducts.filter((x) => x.id !== p.id).map((x) => x.barcode);
  UI.modal({
    title: isNew ? 'Add Product' : 'Edit Product', wide: true,
    body: `<div class="form-grid">
      <div class="field full"><label>Product name *</label><input class="input" id="f_name" value="${UI.esc(p.name || '')}"></div>
      <div class="field"><label>Category</label><select class="select" id="f_cat">${cats.map((c) => `<option value="${c.id}" ${c.id === p.category ? 'selected' : ''}>${UI.esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Emoji / Icon</label><input class="input" id="f_icon" value="${UI.esc(p.icon || '📦')}"></div>
      <div class="field"><label>Barcode</label>
        <div class="row" style="gap:6px">
          <input class="input mono grow" id="f_barcode" placeholder="Scan / type, or generate" value="${UI.esc(p.barcode || '')}">
          <button class="btn ghost sm" id="f_genBc" type="button" title="Generate barcode">⚙ Generate</button>
        </div>
        <div class="tiny muted" id="f_bcHint" style="margin-top:4px">Leave empty and it's auto-generated on save.</div>
      </div>
      <div class="field"><label>SKU</label><input class="input mono" id="f_sku" value="${UI.esc(p.sku || '')}"></div>
      <div class="field"><label>Cost price (${UI.currency().code})</label><input class="input mono" id="f_cost" type="number" step="${UI.currency().step}" min="0" value="${p.cost || 0}"></div>
      <div class="field"><label>Selling price * (${UI.currency().code})</label><input class="input mono" id="f_price" type="number" step="${UI.currency().step}" min="0" value="${p.price || 0}"></div>
      <div class="field"><label>Wholesale price (${UI.currency().code})</label><input class="input mono" id="f_wholesale" type="number" step="${UI.currency().step}" min="0" value="${p.wholesale || 0}"></div>
      <div class="field"><label>Unit type</label><input class="input" id="f_unit" value="${UI.esc(p.unit || 'pcs')}"></div>
      <div class="field"><label>Stock quantity</label><input class="input mono" id="f_stock" type="number" value="${p.stock || 0}"></div>
      <div class="field"><label>Min-stock alert</label><input class="input mono" id="f_min" type="number" value="${p.minStock || 0}"></div>
      <div class="field"><label>Supplier</label><select class="select" id="f_sup"><option value="">— None —</option>${sups.map((s) => `<option value="${s.id}" ${s.id === p.supplier ? 'selected' : ''}>${UI.esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select class="select" id="f_active"><option value="1" ${p.active !== false ? 'selected' : ''}>Active</option><option value="0" ${p.active === false ? 'selected' : ''}>Inactive</option></select></div>
    </div>`,
    footer: `${isNew ? '' : '<button class="btn danger" id="delP" style="margin-right:auto">Delete</button>'}
      <button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="saveP">Save Product</button>`
  });
  // Generate button — fill a fresh unique barcode
  document.getElementById('f_genBc').onclick = () => {
    const bc = document.getElementById('f_barcode');
    bc.value = genBarcode(otherBarcodes);
    document.getElementById('f_bcHint').innerHTML = '<span class="text-green">Generated ✓ valid EAN-13</span>';
  };

  document.getElementById('saveP').onclick = async () => {
    const name = document.getElementById('f_name').value.trim();
    if (!name) return UI.toast('Name is required', 'err');
    let barcode = document.getElementById('f_barcode').value.trim();
    if (!barcode) barcode = genBarcode(otherBarcodes);          // no barcode → generate one
    else if (otherBarcodes.includes(barcode)) return UI.toast('That barcode is already used by another product', 'err');
    const rec = {
      id: p.id || UI.uid('p'), name, category: document.getElementById('f_cat').value, icon: document.getElementById('f_icon').value || '📦',
      barcode, sku: document.getElementById('f_sku').value.trim(),
      cost: UI.roundTo(document.getElementById('f_cost').value), price: UI.roundTo(document.getElementById('f_price').value),
      wholesale: UI.roundTo(document.getElementById('f_wholesale').value), unit: document.getElementById('f_unit').value,
      stock: +document.getElementById('f_stock').value || 0, minStock: +document.getElementById('f_min').value || 0,
      supplier: document.getElementById('f_sup').value, active: document.getElementById('f_active').value === '1', expiry: p.expiry || null
    };
    await DB.put('products', rec); Store.bust(); UI.close(); UI.toast(isNew ? 'Product added' : 'Product updated'); Views.products(root);
  };
  const del = document.getElementById('delP');
  if (del) del.onclick = () => UI.confirm('Delete "' + p.name + '"? This cannot be undone.', async () => {
    await DB.del('products', p.id); Store.bust(); UI.close(); UI.toast('Product deleted', 'info'); Views.products(root);
  }, { danger: true });
}

async function categoryModal(root) {
  const cats = await Store.categories();
  const products = await Store.products();
  const invValue = (c) => products.filter((p) => p.category === c.id).reduce((s, p) => s + (p.cost || 0) * (p.stock || 0), 0);
  UI.modal({
    title: 'Categories',
    body: `<div class="row" style="margin-bottom:14px"><input class="input" id="newCat" placeholder="New category name"><input class="input" id="newCatIcon" placeholder="🏷" style="max-width:70px"><button class="btn primary" id="addCat">Add</button></div>
      <div id="catList">${cats.map((c) => `<div class="list-item"><div class="thumb-sm">${c.icon || '🏷'}</div><b class="grow">${UI.esc(c.name)}</b><span class="tiny muted mono" style="margin-right:10px">${UI.money(invValue(c))} <span>inventory</span></span><button class="btn sm ghost" data-editcat="${c.id}">Rename</button><button class="btn sm ghost" data-delcat="${c.id}">Remove</button></div>`).join('')}</div>`
  });
  document.getElementById('addCat').onclick = async () => {
    const n = document.getElementById('newCat').value.trim(); if (!n) return;
    await DB.put('categories', { id: UI.uid('c'), name: n, icon: document.getElementById('newCatIcon').value || '🏷' });
    Store.bust(); UI.toast('Category added'); categoryModal(root);
  };
  document.querySelectorAll('[data-delcat]').forEach((b) => b.onclick = async () => { await DB.del('categories', b.dataset.delcat); Store.bust(); categoryModal(root); });
  document.querySelectorAll('[data-editcat]').forEach((b) => b.onclick = async () => {
    const c = cats.find((x) => x.id === b.dataset.editcat); if (!c) return;
    UI.modal({
      title: 'Rename category',
      body: `<div class="field"><label>Name</label><input class="input" id="renameCatInput" value="${UI.esc(c.name)}"></div>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="renameCatSave">Save</button>`
    });
    document.getElementById('renameCatSave').onclick = async () => {
      const n = document.getElementById('renameCatInput').value.trim(); if (!n) return;
      c.name = n; await DB.put('categories', c); Store.bust(); UI.toast('Category renamed'); categoryModal(root);
    };
  });
}
