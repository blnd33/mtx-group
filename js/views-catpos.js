/* =====================================================================
   MTX GROUP — Views: Cat POS (category-amount selling)

   A second till mode that sells CATEGORIES, not products. The cashier
   picks a category, types a number on the on-screen calculator, and
   presses X — the number is multiplied by a step (1,000 by default, so
   "5 then X" = 5,000) and added to the cart as a category-amount line.

   Discounts come in two kinds, each by amount or by percent:
     • per category  — a discount on one cart line
     • whole invoice — a discount on the basket

   A completed sale is written to the same `sales` store as a normal
   invoice (type 'sale', channel 'catpos'), so it prints on the shared
   receipt path and shows up in Invoices. Reports carry a dedicated
   "Cat POS" tab that breaks the takings down by category.

   Shares helpers with views-core.js (loaded first): nextInvoiceNo,
   printReceipt, allocateOrderDisc, lineDisc, thermalDoc, tRow.
   ===================================================================== */
window.Views = window.Views || {};

/* Cart + calculator state — module-level so switching tabs mid-order
   doesn't lose the basket (mirrors CART in views-core.js). Reset on a
   completed sale and whenever the active store changes. */
let CATCART = { lines: [], discount: 0, discountPct: 0, discUnit: 'amount', pay: 'Cash', customer: 'Walk-in Customer', _store: null };
let CATPAD = { typed: '', cat: null };
let CATPOS_STEP = 1000;
const CATPOS_PAYS = [['Cash', '💵'], ['Card', '💳'], ['Debt', '📝']];

/* Totals for the category basket. Identical shape/rounding to
   cartTotals() in views-core.js, minus cost/profit (no COGS tracked
   for a category-amount sale). */
function catTotals() {
  const r = (v) => UI.roundTo(v);
  const sub = r(CATCART.lines.reduce((s, l) => s + l.price * l.qty, 0));
  const lineDiscs = r(CATCART.lines.reduce((s, l) => s + lineDisc(l), 0));
  const afterLines = sub - lineDiscs;
  const orderPct = afterLines * (CATCART.discountPct / 100);
  const orderDisc = r(Math.min(afterLines, CATCART.discount + orderPct));
  const disc = r(lineDiscs + orderDisc);
  const total = r(Math.max(0, sub - disc));
  return { sub, lineDiscs, orderDisc, disc, total };
}

Views.catpos = async (root) => {
  // This view can re-render itself (step change, completed sale), which the
  // router's cleanup hook doesn't cover — detach the last keyboard listener
  // here so they can't stack up.
  if (App._viewCleanup) { try { App._viewCleanup(); } catch (e) { /* ignore */ } App._viewCleanup = null; }

  // Fresh basket if the store changed under us.
  if (CATCART._store !== Tenant.id) {
    CATCART = { lines: [], discount: 0, discountPct: 0, discUnit: 'amount', pay: 'Cash', customer: 'Walk-in Customer', _store: Tenant.id };
    CATPAD = { typed: '', cat: null };
  }
  CATPAD.typed = '';

  const cats = await Store.categories();
  const allSales = await Store.sales();
  const store = await DB.setting('store');
  CATPOS_STEP = Math.max(1, Math.round(+(await DB.setting('catposStep')) || 1000));

  // All-time takings per category through Cat POS — shown on each tile.
  const soldByCat = {};
  allSales.filter((s) => s.channel === 'catpos').forEach((s) => (s.items || []).forEach((i) => {
    const net = i.net != null ? i.net : i.price * i.qty - (i.discAmt || 0);
    soldByCat[i.category] = (soldByCat[i.category] || 0) + net;
  }));

  // Drop a stale selection / lines whose category was deleted.
  if (CATPAD.cat && !cats.find((c) => c.id === CATPAD.cat)) CATPAD.cat = null;
  CATCART.lines = CATCART.lines.filter((l) => cats.find((c) => c.id === l.catId));

  const cur = UI.currency();

  /* Calculator extras come from the store registry, so a shop that sells in
     whole thousands gets the plain pad and nothing here renders. */
  const ext = (Tenant.get() && Tenant.get().catpos) || {};
  const dec = !!ext.decimal;
  const quick = Array.isArray(ext.quickAdd) ? ext.quickAdd : [];

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Cat POS</h1><div class="sub">Sell by category with the calculator — number × <b>${UI.num(CATPOS_STEP)}</b></div></div>
    </div>

    ${!cats.length ? `
      <div class="card" style="text-align:center;padding:48px 20px;max-width:520px">
        <div style="font-size:34px">🏷</div>
        <h3 style="margin-top:10px">No categories yet</h3>
        <p class="muted tiny" style="margin-top:6px">Add categories first from <a href="#/products">Products → Categories</a>, then come back here.</p>
      </div>` : `
      <div class="catpos">

        <div class="cp-col">
          <div class="card">
            <div class="card-head"><h3>Calculator</h3>
              <label class="tiny muted" style="display:flex;gap:6px;align-items:center" title="Multiplier — every number you type is multiplied by this">×
                <input class="input mono cp-step" id="cpStep" type="number" min="1" step="1" value="${CATPOS_STEP}"></label>
            </div>
            <div class="cp-pad-display mono muted" id="cpDisplay">${UI.money(0)}</div>
            <div class="cp-keys" id="cpKeys">
              ${[7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => `<button class="cp-key" data-k="${n}">${n}</button>`).join('')}
              ${dec ? '<button class="cp-key" data-k="." title="Decimal point">.</button>' : ''}
              <button class="cp-key ${dec ? '' : 'zero'}" data-k="0">0</button>
              <button class="cp-key back" data-k="back" title="Backspace">⌫</button>
            </div>
            ${quick.length ? `<div class="cp-quick" id="cpQuick">
              ${quick.map((q) => `<button class="cp-key quick" data-q="${q}" title="Add ${UI.money(q)} to this category">+${UI.num(q)}</button>`).join('')}
            </div>` : ''}
            <button class="btn primary block cp-x" id="cpX">PRESS X</button>
            <div class="cp-hint">Number × ${UI.num(CATPOS_STEP)} ${cur.code}. Example: press 5 then X = ${UI.money(5 * CATPOS_STEP)}.${
              dec ? `<br>Decimals work too: 1.8 then X = ${UI.money(1.8 * CATPOS_STEP)}.` : ''}${
              quick.length ? `<br>${quick.map((q) => '+' + UI.num(q)).join(' / ')} tops up the category already in the cart.` : ''}</div>
          </div>
        </div>

        <div class="cp-col">
          <div class="card pad0">
            <div class="card-head" style="padding:18px 20px 0">
              <h3>Cart</h3>
              <button class="tiny muted no-print" id="cpClear" style="border:none;background:none;cursor:pointer">Clear all</button>
            </div>
            <div class="cp-cart-items" id="cpCart"></div>
          </div>
          <div class="card" id="cpTotals"></div>
        </div>

        <div class="cp-col">
          <div class="card">
            <div class="card-head"><h3>Choose category</h3></div>
            <div class="cp-cats" id="cpCats">
              ${cats.map((c) => `
                <button class="cp-cat ${c.id === CATPAD.cat ? 'active' : ''}" data-cat="${c.id}">
                  <span class="cp-cat-ico">${c.icon || '🏷'}</span>
                  <span class="cp-cat-name">${UI.esc(c.name)}</span>
                  <span class="cp-cat-sold mono" title="Sold via Cat POS (all time)">${UI.money(soldByCat[c.id] || 0)}</span>
                </button>`).join('')}
            </div>
          </div>
        </div>

      </div>`}`;

  if (!cats.length) return;

  const dispEl = root.querySelector('#cpDisplay');
  const cartEl = root.querySelector('#cpCart');
  const totalsEl = root.querySelector('#cpTotals');
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || '';

  const drawPad = () => {
    const v = (Number(CATPAD.typed) || 0) * CATPOS_STEP;
    dispEl.textContent = UI.money(v);
    dispEl.classList.toggle('muted', !CATPAD.typed);
  };

  const drawCats = () => root.querySelectorAll('#cpCats .cp-cat')
    .forEach((b) => b.classList.toggle('active', b.dataset.cat === CATPAD.cat));

  const drawCart = () => {
    const t = catTotals();

    cartEl.innerHTML = CATCART.lines.length ? CATCART.lines.map((l) => {
      const gross = l.price * l.qty;
      const d = lineDisc(l);
      const net = gross - d;
      const unit = l.disc && l.disc.type === 'percent' ? '%' : cur.symbol;
      return `
        <div class="cp-line${d > 0 ? ' has-disc' : ''}">
          <div class="cp-line-main">
            <div class="cp-line-name">${UI.esc(l.name)}</div>
            <div class="cp-line-sub">Category amount sale${d > 0 ? ` · <span class="text-red">− ${l.disc.type === 'percent' ? l.disc.val + '%' : UI.money(l.disc.val)}</span>` : ''}</div>
            <div class="disc-edit" style="margin-top:8px" title="Category discount — type a value, tap the unit to switch">
              <input class="disc-in mono" type="number" min="0" step="any" inputmode="decimal" data-ld="${l.catId}" value="${l.disc && l.disc.val ? l.disc.val : ''}" placeholder="0">
              <button class="disc-unit" data-lu="${l.catId}">${unit}</button>
            </div>
          </div>
          <div class="cp-line-amt mono">${d > 0 ? `<s>${UI.money(gross)}</s><br>` : ''}<b>${UI.money(net)}</b></div>
          <button class="cp-rm" data-rm="${l.catId}" title="Remove">✕</button>
        </div>`;
    }).join('') : '<div class="muted tiny cp-empty">Cart is empty — pick a category, type an amount, press X</div>';

    const discVal = CATCART.discUnit === 'percent' ? (CATCART.discountPct || '') : (CATCART.discount || '');
    totalsEl.innerHTML = `
      <div class="row between" style="align-items:center;gap:10px;margin-bottom:10px">
        <span class="muted">Invoice discount</span>
        <div class="cp-disc-field">
          <input id="cpInvDisc" type="number" min="0" step="any" inputmode="decimal" value="${discVal}" placeholder="0">
          <button class="cp-unit" id="cpInvUnit" title="Switch amount / percent">${CATCART.discUnit === 'percent' ? '%' : cur.symbol}</button>
        </div>
      </div>
      <div class="sum-row"><span class="muted">Subtotal</span><span class="mono">${UI.money(t.sub)}</span></div>
      ${t.lineDiscs ? `<div class="sum-row"><span class="muted">Category discounts</span><span class="mono text-red">− ${UI.money(t.lineDiscs)}</span></div>` : ''}
      ${t.orderDisc ? `<div class="sum-row"><span class="muted">Invoice discount</span><span class="mono text-red">− ${UI.money(t.orderDisc)}</span></div>` : ''}
      <div class="sum-row total"><span>Total</span><span class="mono">${UI.money(t.total)}</span></div>

      <div class="pay-chips" style="grid-template-columns:repeat(3,1fr);margin:14px 0 12px">
        ${CATPOS_PAYS.map(([m, ic]) => `<div class="pay-chip ${CATCART.pay === m ? 'active' : ''}" data-pay="${m}">${ic} ${m}</div>`).join('')}
      </div>
      ${CATCART.pay === 'Debt' ? `<button class="btn ghost sm block" id="cpCust" style="margin-bottom:10px">👤 ${UI.esc(CATCART.customer)}</button>` : ''}
      <div class="field"><label>Paid (${cur.code})</label><input class="input mono" id="cpPaid" type="number" min="0" step="${cur.step}" value="${t.total}"></div>
      <div class="sum-row" id="cpChangeRow" style="display:none;margin-top:8px"><span class="muted">Change</span><span class="mono" id="cpChange"></span></div>

      <button class="btn primary block lg" id="cpComplete" style="margin-top:14px" ${CATCART.lines.length ? '' : 'disabled'}>✓ <span>Complete sale</span> ${UI.money(t.total)}</button>`;

    App.translate(cartEl);
    App.translate(totalsEl);

    // ---- per-line discount ----
    cartEl.querySelectorAll('[data-ld]').forEach((el) => {
      el.onkeydown = (e) => { if (e.key === 'Enter') el.blur(); };
      el.onchange = () => {
        const l = CATCART.lines.find((x) => x.catId === el.dataset.ld); if (!l) return;
        const type = (l.disc && l.disc.type) || 'amount';
        const val = +el.value || 0;
        l.disc = val > 0 ? { type, val } : null;
        drawCart();
      };
    });
    cartEl.querySelectorAll('[data-lu]').forEach((b) => b.onclick = () => {
      const l = CATCART.lines.find((x) => x.catId === b.dataset.lu); if (!l) return;
      const curType = (l.disc && l.disc.type) || 'amount';
      l.disc = { type: curType === 'amount' ? 'percent' : 'amount', val: (l.disc && l.disc.val) || 0 };
      drawCart();
      const again = cartEl.querySelector(`[data-ld="${l.catId}"]`); if (again) again.focus();
    });
    cartEl.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
      CATCART.lines = CATCART.lines.filter((x) => x.catId !== b.dataset.rm);
      drawCart();
    });

    // ---- whole-invoice discount ----
    const invDisc = totalsEl.querySelector('#cpInvDisc');
    const applyInv = () => {
      const val = +invDisc.value || 0;
      if (CATCART.discUnit === 'percent') { CATCART.discountPct = val; CATCART.discount = 0; }
      else { CATCART.discount = val; CATCART.discountPct = 0; }
    };
    invDisc.onkeydown = (e) => { if (e.key === 'Enter') invDisc.blur(); };
    invDisc.onchange = () => { applyInv(); drawCart(); };
    totalsEl.querySelector('#cpInvUnit').onclick = () => {
      // Flip the unit, keep the typed number and reinterpret it (same as the
      // per-line toggle and the main POS discount dialog).
      CATCART.discUnit = CATCART.discUnit === 'percent' ? 'amount' : 'percent';
      applyInv();
      drawCart();
    };

    // ---- payment + customer + paid ----
    totalsEl.querySelector('.pay-chips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-pay]'); if (!c) return;
      CATCART.pay = c.dataset.pay; drawCart();
    });
    const custBtn = totalsEl.querySelector('#cpCust');
    if (custBtn) custBtn.onclick = () => catCustomerModal(drawCart);

    const paidIn = totalsEl.querySelector('#cpPaid');
    const updChange = () => {
      const diff = (+paidIn.value || 0) - t.total;
      const row = totalsEl.querySelector('#cpChangeRow');
      if (diff > 0) { row.style.display = 'flex'; totalsEl.querySelector('#cpChange').textContent = UI.money(diff); }
      else row.style.display = 'none';
    };
    paidIn.oninput = updChange;
    updChange();

    const done = totalsEl.querySelector('#cpComplete');
    done.onclick = (e) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.disabled = true;
      completeCatSale(root).catch((err) => {
        console.error('completeCatSale failed:', err);
        UI.toast('Sale failed: ' + err.message, 'warn');
        e.currentTarget.disabled = false;
      });
    };
  };

  // ---- calculator ----
  const pressX = () => {
    if (!CATPAD.cat) return UI.toast('Choose a category first', 'warn');
    const n = Number(CATPAD.typed) || 0;
    if (n <= 0) return UI.toast('Type an amount first', 'warn');
    const amount = UI.roundTo(n * CATPOS_STEP);
    const ex = CATCART.lines.find((l) => l.catId === CATPAD.cat);
    if (ex) ex.price = UI.roundTo(ex.price + amount);
    else CATCART.lines.push({ catId: CATPAD.cat, name: catName(CATPAD.cat), price: amount, qty: 1, disc: null });
    CATPAD.typed = '';
    drawPad(); drawCart();
    UI.toast(catName(CATPAD.cat) + '  +' + UI.money(amount));
  };

  /* One place that decides what a keypress does to the typed value, so the
     on-screen keys and the physical keyboard can never drift apart. */
  const typeKey = (k) => {
    if (k === 'back') { CATPAD.typed = CATPAD.typed.slice(0, -1); return; }
    if (k === '.') {
      if (!dec || CATPAD.typed.includes('.')) return;   // one point only
      CATPAD.typed = (CATPAD.typed || '0') + '.';       // ".5" would read oddly
      return;
    }
    if (CATPAD.typed.length >= 8) return;
    let t = CATPAD.typed + k;
    // Drop a leading zero on a whole number ("07" -> "7") but never on "0.5".
    if (!t.includes('.')) t = t.replace(/^0+(?=\d)/, '');
    CATPAD.typed = t;
  };

  /* A number the calculator can hold, from a money amount. Rounded to three
     places so 250/1000 gives "0.25" rather than a floating-point tail. */
  const toTyped = (money) => String(Math.round((money / CATPOS_STEP) * 1000) / 1000);

  /* +250 / +500. Mid-entry it folds into what is being typed; otherwise it
     tops up the category already in the cart — which is the everyday use:
     press 1, X (1,000), then +250 to make it 1,250. With nothing to top up
     it seeds the display so X can commit it. */
  const pressQuick = (amt) => {
    if (CATPAD.typed) {
      CATPAD.typed = toTyped(UI.roundTo((Number(CATPAD.typed) || 0) * CATPOS_STEP + amt));
      drawPad();
      return;
    }
    const line = CATPAD.cat && CATCART.lines.find((l) => l.catId === CATPAD.cat);
    if (line) {
      line.price = UI.roundTo(line.price + amt);
      drawCart();
      UI.toast(line.name + '  +' + UI.money(amt) + ' = ' + UI.money(line.price));
      return;
    }
    CATPAD.typed = toTyped(amt);
    drawPad();
  };

  root.querySelector('#cpKeys').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    typeKey(b.dataset.k);
    drawPad();
  });
  const quickEl = root.querySelector('#cpQuick');
  if (quickEl) quickEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    pressQuick(Number(b.dataset.q) || 0);
  });
  root.querySelector('#cpX').onclick = pressX;

  root.querySelector('#cpStep').onchange = async (e) => {
    const v = Math.max(1, Math.round(+e.target.value || 1000));
    await DB.setting('catposStep', v);
    Views.catpos(root);
  };

  root.querySelector('#cpCats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    CATPAD.cat = b.dataset.cat;
    drawCats();
  });

  root.querySelector('#cpClear').onclick = () => {
    if (!CATCART.lines.length && !CATCART.discount && !CATCART.discountPct) return;
    UI.confirm('Clear the whole cart and all discounts?', () => {
      CATCART.lines = []; CATCART.discount = 0; CATCART.discountPct = 0;
      drawCart(); UI.toast('Cleared', 'info');
    });
  };

  // Physical keyboard: digits type, Backspace deletes, Enter / * (multiply) press X.
  const onKey = (e) => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (document.querySelector('.overlay')) return;
    if (e.key.length === 1 && e.key >= '0' && e.key <= '9') { typeKey(e.key); drawPad(); }
    // Comma too: the numeric keypad prints one instead of a point in several locales.
    else if (dec && (e.key === '.' || e.key === ',')) { typeKey('.'); drawPad(); }
    else if (e.key === 'Backspace') { typeKey('back'); drawPad(); }
    else if (e.key === 'Enter' || e.key === '*') { e.preventDefault(); pressX(); }
  };
  document.addEventListener('keydown', onKey);
  App._viewCleanup = () => document.removeEventListener('keydown', onKey);

  drawPad();
  drawCart();
};

/* Customer picker — only needed for a Debt sale. */
async function catCustomerModal(after) {
  const custs = await Store.customers();
  UI.modal({
    title: 'Select Customer',
    body: `<div class="field"><input class="input" id="cpcSearch" placeholder="Search customer…"></div>
      <div id="cpcList">${custs.map((c) => `<div class="list-item" data-c="${UI.esc(c.name)}" style="cursor:pointer">
        <div class="thumb-sm">👤</div><div class="grow"><b>${UI.esc(c.name)}</b>
        <div class="tiny muted">${c.phone || 'No phone'}${c.debt ? ' · Debt ' + UI.money(c.debt) : ''}</div></div></div>`).join('')}</div>`
  });
  const list = document.getElementById('cpcList');
  const bind = () => list.querySelectorAll('[data-c]').forEach((el) => el.onclick = () => {
    CATCART.customer = el.dataset.c; UI.close(); after && after();
  });
  bind();
  document.getElementById('cpcSearch').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    list.innerHTML = custs.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q))
      .map((c) => `<div class="list-item" data-c="${UI.esc(c.name)}" style="cursor:pointer">
        <div class="thumb-sm">👤</div><div class="grow"><b>${UI.esc(c.name)}</b>
        <div class="tiny muted">${c.phone || 'No phone'}${c.debt ? ' · Debt ' + UI.money(c.debt) : ''}</div></div></div>`).join('');
    bind();
  };
}

/* Commit a category sale. Written to `sales` exactly like a normal
   invoice so it prints and lists identically — the only differences are
   channel:'catpos', no stock movement, and no cost of goods (the whole
   total is treated as margin, the same as a zero-cost product). */
async function completeCatSale(root) {
  const t = catTotals();
  if (!CATCART.lines.length) return;
  const pay = CATCART.pay || 'Cash';
  if (pay === 'Debt' && (!CATCART.customer || CATCART.customer === 'Walk-in Customer')) {
    UI.toast('Pick a customer for a debt sale', 'warn');
    const btn = root.querySelector('#cpComplete'); if (btn) btn.disabled = false;
    return;
  }

  const store = await DB.setting('store');
  const no = await nextInvoiceNo();
  const shares = allocateOrderDisc(t.orderDisc, CATCART.lines);

  const sale = {
    id: UI.uid('inv'), no, ts: Date.now(), type: 'sale', channel: 'catpos', status: 'completed',
    items: CATCART.lines.map((l, idx) => {
      const itemDisc = lineDisc(l);
      const orderShare = shares[idx] || 0;
      const discAmt = itemDisc + orderShare;
      return {
        id: l.catId, name: l.name, category: l.catId, catAmount: true,
        price: l.price, qty: 1, cost: 0,
        disc: (l.disc && l.disc.val && itemDisc) ? { ...l.disc } : null,
        itemDisc, orderShare, discAmt, net: l.price - discAmt
      };
    }),
    subtotal: t.sub, discount: t.disc, lineDiscount: t.lineDiscs, orderDiscount: t.orderDisc,
    tax: 0, total: t.total, cost: 0, profit: t.total,
    pay, cashier: App.user.name, customer: CATCART.customer || 'Walk-in Customer'
  };

  await DB.put('sales', sale);
  UI.toast('Sale #' + no + ' completed · printing receipt');
  printReceipt(sale, store);

  if (pay === 'Debt') {
    const cu = (await Store.customers()).find((c) => c.name === sale.customer);
    if (cu) { cu.debt = UI.roundTo((cu.debt || 0) + t.total); await DB.put('customers', cu); }
  }

  Store.bust();
  CATCART = { lines: [], discount: 0, discountPct: 0, discUnit: 'amount', pay: 'Cash', customer: 'Walk-in Customer', _store: Tenant.id };
  CATPAD = { typed: '', cat: CATPAD.cat };
  Views.catpos(root);
}

/* ---- Reports: category-sales breakdown ---- */

/* Aggregate a list of catpos sale records into per-category rows.
   Shared by the Reports "Cat POS" tab and the printed report. */
function catposBreakdown(list) {
  const byCat = {};
  list.forEach((s) => (s.items || []).forEach((i) => {
    const k = i.name || '—';
    const gross = i.price * i.qty;
    const net = i.net != null ? i.net : gross - (i.discAmt || 0);
    byCat[k] = byCat[k] || { l: k, gross: 0, disc: 0, net: 0, count: 0 };
    byCat[k].gross += gross;
    byCat[k].disc += i.discAmt || 0;
    byCat[k].net += net;
    byCat[k].count += 1;
  }));
  return Object.values(byCat).sort((a, b) => b.net - a.net);
}
window.catposBreakdown = catposBreakdown;

/* Thermal "Category Sales Report" for the selected range. */
function catposReportHTML(list, lbl, store) {
  const rows = catposBreakdown(list);
  const totNet = rows.reduce((a, r) => a + r.net, 0);
  const totDisc = rows.reduce((a, r) => a + r.disc, 0);
  const invoices = list.filter((s) => s.type === 'sale').length;
  const byPay = {}; list.forEach((s) => byPay[s.pay] = (byPay[s.pay] || 0) + s.total);
  return thermalDoc(store, 'CATEGORY SALES REPORT', `
    <table><thead><tr><th style="text-align:left">Category</th><th style="text-align:right">Sales</th><th style="text-align:right">Sold</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${UI.esc(r.l)}</td><td style="text-align:right">${r.count}</td><td style="text-align:right">${UI.money(r.net)}</td></tr>`).join('')}</tbody></table>
    <hr>
    ${tRow('Invoices', String(invoices))}
    ${totDisc ? tRow('Discounts given', '− ' + UI.money(totDisc)) : ''}
    ${tRow('TOTAL SOLD', UI.money(totNet), true)}
    <hr><div style="font-weight:bold">By payment method</div>
    ${Object.entries(byPay).map(([k, v]) => tRow(k, UI.money(v))).join('')}`,
  `${lbl.name} · ${lbl.span}`);
}
window.catposReportHTML = catposReportHTML;

/* Panel markup for the Reports "Cat POS" tab. `sales` is already
   range-filtered by the caller. */
function catposReportPanel(sales) {
  const cs = sales.filter((s) => s.channel === 'catpos');
  if (!cs.length) return `<div class="card" style="text-align:center;padding:48px 20px">
      <div style="font-size:34px">📭</div>
      <h3 style="margin-top:10px">No category sales in this range</h3>
      <p class="muted tiny" style="margin-top:6px">Cat POS sales appear here once you make one. Try a wider date range.</p></div>`;

  const rows = catposBreakdown(cs);
  const totNet = rows.reduce((a, r) => a + r.net, 0);
  const totGross = rows.reduce((a, r) => a + r.gross, 0);
  const totDisc = rows.reduce((a, r) => a + r.disc, 0);
  const totCount = rows.reduce((a, r) => a + r.count, 0);
  const invoices = cs.filter((s) => s.type === 'sale').length;

  return `
    <div class="row between" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div class="tiny muted">Category-amount sales made on the Cat POS till</div>
      <button class="btn ghost sm" id="printCatpos">🖨 Print category report</button>
    </div>
    <div class="stats" style="margin-bottom:16px">
      <div class="stat"><div class="ico g">🧮</div><div class="label">Total Sold</div><div class="value mono">${UI.money(totNet)}</div>${totDisc ? `<div class="delta text-red">after ${UI.money(totDisc)} disc.</div>` : ''}</div>
      <div class="stat"><div class="ico">🧾</div><div class="label">Invoices</div><div class="value mono">${UI.num(invoices)}</div></div>
      <div class="stat"><div class="ico c">🏷️</div><div class="label">Category Lines</div><div class="value mono">${UI.num(totCount)}</div></div>
      <div class="stat"><div class="ico o">📦</div><div class="label">Categories Sold</div><div class="value mono">${UI.num(rows.length)}</div></div>
    </div>
    <div class="card"><div class="card-head"><h3>Sales by Category</h3><span class="badge blue">${UI.money(totNet)} total</span></div>
      ${UI.bars(rows.map((r) => ({ l: r.l, v: r.net })))}</div>
    <div class="card pad0" style="margin-top:16px">
      <div class="card-head" style="padding:18px 20px 4px"><h3>Category Sales Report</h3><span class="badge blue">${rows.length} categories</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Category</th><th class="right">Sales</th><th class="right">Gross</th><th class="right">Discount</th><th class="right">Net Sold</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><td><b>${UI.esc(r.l)}</b></td><td class="right mono">${r.count}</td><td class="right mono">${UI.money(r.gross)}</td><td class="right mono ${r.disc ? 'text-red' : 'muted'}">${r.disc ? '− ' + UI.money(r.disc) : '—'}</td><td class="right mono"><b>${UI.money(r.net)}</b></td></tr>`).join('')}
        <tr style="border-top:2px solid var(--border)"><td><b>Total</b></td><td class="right mono">${totCount}</td><td class="right mono">${UI.money(totGross)}</td><td class="right mono ${totDisc ? 'text-red' : 'muted'}">${totDisc ? '− ' + UI.money(totDisc) : '—'}</td><td class="right mono"><b>${UI.money(totNet)}</b></td></tr>
      </tbody></table></div>
    </div>`;
}
window.catposReportPanel = catposReportPanel;
