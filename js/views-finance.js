/* =====================================================================
   MTX GROUP — Views: Financial Dashboard, Reports, Invoices & Receipts
   ===================================================================== */

/* ------------------------------ FINANCE ------------------------------ */
Views.finance = async (root) => {
  const allSales = await Store.sales();
  const allExpenses = await DB.all('expenses');
  const custs = await Store.customers();
  const sups = await Store.suppliers();
  const payments = await DB.all('payments');

  /* Balances and the drawer are "right now" figures, not period ones: a
     customer's debt is what they owe today whenever you ask, and the drawer is
     a per-day concept. Only the trading figures inside render() follow the
     date filter — these are deliberately left outside it. */
  const custDebt = custs.reduce((s, c) => s + (c.debt || 0), 0);
  const supDebt = sups.reduce((s, x) => s + (x.debt || 0), 0);
  const drawer = await DB.setting('drawer') || { opening: 0 };
  const cashSales = allSales.filter((s) => s.pay === 'Cash' && UI.isToday(s.ts)).reduce((a, s) => a + s.total, 0);
  const cashExp = allExpenses.filter((e) => e.pay === 'Cash' && UI.isToday(e.ts)).reduce((a, e) => a + e.amount, 0);
  const cashInDrawer = (drawer.opening || 0) + cashSales - cashExp;

  // All-time by default — what this page showed before it had a filter.
  const state = { preset: 'all', ...UI.rangeOf('all') };

  root.innerHTML = `
    <div class="page-head"><div><h1>Financial Center</h1><div class="sub">Profit & loss, cash flow, debts and balances</div></div>
      <div class="row"><button class="btn ghost" id="mngDrawer">🪙 Cash Drawer</button><a class="btn primary" href="#/reports">📊 Full Reports</a></div></div>

    ${UI.dateFilterHTML(state.preset)}
    <div id="finBody"></div>`;

  const body = root.querySelector('#finBody');

  const render = () => {
    const sales = allSales.filter((s) => UI.inRange(state, s.ts));
    const expenses = allExpenses.filter((e) => UI.inRange(state, e.ts));

    const gross = sales.reduce((s, x) => s + x.total, 0);
    const cogs = sales.reduce((s, x) => s + (x.cost || 0), 0);
    const exp = expenses.reduce((s, x) => s + x.amount, 0);
    const grossProfit = gross - cogs;
    const net = grossProfit - exp;

    // payment method split (net of refunds; clamp so the donut can't draw a negative slice)
    const byPay = {}; sales.forEach((s) => byPay[s.pay] = (byPay[s.pay] || 0) + s.total);
    const payColors = { Cash: '#22C55E', Card: '#2F6BFF', Split: '#3FD8FF', Debt: '#FF8A3D' };
    const donutParts = Object.entries(byPay).map(([k, v]) => ({ l: k, v: Math.max(0, v), c: payColors[k] || '#7D90B3' }));

    /* Cash flow by month. Keyed by year-month rather than the month name, or a
       range spanning more than a year folds last September into this one. */
    const months = {};
    const monLoc = App.lang === 'ar' ? 'ar' : undefined;
    const bump = (ts, field, amt) => {
      const k = UI.monthKey(ts);
      months[k] = months[k] || { in: 0, out: 0 };
      months[k][field] += amt;
    };
    sales.forEach((s) => bump(s.ts, 'in', s.total));
    expenses.forEach((e) => bump(e.ts, 'out', e.amount));
    const monthRows = Object.keys(months).sort().map((k) => ({
      label: UI.parseDayKey(k + '-01').toLocaleString(monLoc, { month: 'short', year: 'numeric' }),
      ...months[k],
    }));

    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML = (sales.length || expenses.length)
      ? `<b>${lbl.name}</b> · ${lbl.span} · ${sales.length} <span>invoices</span> · ${expenses.length} <span>expenses</span>`
      : `<b>${lbl.name}</b> · ${lbl.span} · <span>no records in this range</span>`;

    body.innerHTML = `
    <div class="stats" style="margin-bottom:16px">
      <div class="stat"><div class="ico g">💰</div><div class="label">Gross Revenue</div><div class="value mono">${UI.money(gross)}</div></div>
      <div class="stat"><div class="ico">📦</div><div class="label">Cost of Goods</div><div class="value mono">${UI.money(cogs)}</div></div>
      <div class="stat"><div class="ico c">📈</div><div class="label">Gross Profit</div><div class="value mono">${UI.money(grossProfit)}</div></div>
      <div class="stat"><div class="ico ${net >= 0 ? 'g' : 'r'}">🏆</div><div class="label">Net Profit</div><div class="value mono ${net >= 0 ? 'text-green' : 'text-red'}">${UI.money(net)}</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1.4fr 1fr">
      <div class="card"><div class="card-head"><h3>Profit & Loss Statement</h3><span class="badge blue">${lbl.name}</span></div>
        <div class="kv"><span class="k">Sales income</span><b class="v mono">${UI.money(gross)}</b></div>
        <div class="kv"><span class="k">− Cost of goods sold</span><b class="v mono text-red">${UI.money(cogs)}</b></div>
        <div class="kv"><span class="k" style="font-weight:700">= Gross profit</span><b class="v mono text-green">${UI.money(grossProfit)}</b></div>
        <div class="kv"><span class="k">− Operating expenses</span><b class="v mono text-red">${UI.money(exp)}</b></div>
        <div class="kv"><span class="k" style="font-weight:800;color:var(--text);font-size:15px">= Net profit</span><b class="v mono" style="font-size:19px;color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">${UI.money(net)}</b></div>
        <div class="tiny muted" style="margin-top:8px"><span>Net margin</span>: ${gross ? (net / gross * 100).toFixed(1) : 0}%</div>
      </div>
      <div class="card"><div class="card-head"><h3>Payment Methods</h3></div>
        <div class="row" style="gap:20px;align-items:center;flex-wrap:wrap">${UI.donut(donutParts.length ? donutParts : [{ l: '-', v: 1, c: '#e2e8f0' }])}
          <div class="grow">${donutParts.map((p) => `<div class="row between" style="margin:6px 0"><span class="row" style="gap:8px"><span style="width:10px;height:10px;border-radius:3px;background:${p.c}"></span>${p.l}</span><b class="mono">${UI.money(p.v)}</b></div>`).join('')}</div></div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:18px">
      <div class="card"><div class="section-title">Cash Drawer <span class="tiny muted" style="font-weight:400">· today, not the range</span></div>
        <div class="kv"><span class="k">Opening balance</span><b class="v mono">${UI.money(drawer.opening || 0)}</b></div>
        <div class="kv"><span class="k">＋ Cash sales</span><b class="v mono text-green">${UI.money(cashSales)}</b></div>
        <div class="kv"><span class="k">− Cash expenses</span><b class="v mono text-red">${UI.money(cashExp)}</b></div>
        <div class="kv"><span class="k" style="font-weight:800">Expected in drawer</span><b class="v mono" style="font-size:16px">${UI.money(cashInDrawer)}</b></div>
      </div>
      <div class="card"><div class="section-title">Receivables (Customer debt) <span class="tiny muted" style="font-weight:400">· balance now</span></div>
        <div class="value mono" style="font-size:26px;font-weight:800;color:var(--orange)">${UI.money(custDebt)}</div>
        <div class="tiny muted"><span>Owed to you by</span> ${custs.filter((c) => c.debt > 0).length} <span>customers</span></div>
        <a class="btn ghost sm block" href="#/customers" style="margin-top:12px">Manage debts →</a></div>
      <div class="card"><div class="section-title">Payables (Supplier debt) <span class="tiny muted" style="font-weight:400">· balance now</span></div>
        <div class="value mono" style="font-size:26px;font-weight:800;color:var(--red)">${UI.money(supDebt)}</div>
        <div class="tiny muted"><span>You owe</span> ${sups.filter((s) => s.debt > 0).length} <span>suppliers</span></div>
        <a class="btn ghost sm block" href="#/suppliers" style="margin-top:12px">Manage payables →</a></div>
    </div>

    <div class="card" style="margin-top:18px"><div class="card-head"><h3>Monthly Cash Flow</h3></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="right">Cash In</th><th class="right">Cash Out</th><th class="right">Net</th></tr></thead>
      <tbody>${monthRows.length
        ? monthRows.map((m) => `<tr><td><b>${m.label}</b></td><td class="right mono text-green">${UI.money(m.in)}</td><td class="right mono text-red">${UI.money(m.out)}</td><td class="right mono"><b>${UI.money(m.in - m.out)}</b></td></tr>`).join('')
        : '<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">No cash movement in this range</td></tr>'}</tbody></table></div></div>`;
  };

  root.querySelector('#mngDrawer').onclick = () => {
    UI.modal({
      title: 'Cash Drawer', body: `<div class="form-grid">
        <div class="field"><label>Opening balance</label><input class="input mono" id="dr_open" type="number" value="${drawer.opening || 0}"></div>
        <div class="field"><label>Expected closing</label><input class="input mono" value="${cashInDrawer.toFixed(2)}" readonly></div></div>
        <p class="tiny muted">Set the cash you start the day with. The system tracks cash in/out automatically.</p>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="dr_ok">Save</button>`
    });
    document.getElementById('dr_ok').onclick = async () => { await DB.setting('drawer', { opening: +document.getElementById('dr_open').value || 0, ts: Date.now() }); UI.close(); UI.toast('Drawer updated'); Views.finance(root); };
  };

  UI.bindDateFilter(root, state, render);
  render();
};

/* ------------------------------ REPORTS ------------------------------ */
Views.reports = async (root) => {
  const allSales = await Store.sales();
  const allExpenses = await DB.all('expenses');

  const store = await DB.setting('store');
  /* A cashier reports on their own day: the range is fixed to today, and the
     tabs that summarise the shop's books — staff rankings and profit — are not
     offered. See App.seesShopBooks(). */
  const books = App.seesShopBooks();
  const state = books ? { preset: '30d', ...UI.rangeOf('30d') } : { preset: 'today', ...UI.rangeOf('today') };
  let tab = 'sales';

  const TABS = books
    ? [['sales', 'Sales'], ['products', 'Products'], ['catpos', 'Cat POS'], ['staff', 'Cashiers'], ['profit', 'Profit & Expenses']]
    : [['sales', 'Sales'], ['products', 'Products'], ['catpos', 'Cat POS']];

  root.innerHTML = `
    <div class="page-head"><div><h1>Reports</h1><div class="sub">${books ? 'Sales, products, staff and profit analytics' : "Today's sales and products"}</div></div>
      <div class="row"><button class="btn ghost" id="printRep">🖨 Print</button><button class="btn ghost" id="expPDF">📄 Export PDF</button>${books ? '<button class="btn ghost" id="expCSV">📊 Export CSV</button>' : ''}</div></div>

    ${books ? UI.dateFilterHTML(state.preset)
      /* No range picker for a cashier, but this card must still carry
         #df_summary — render() writes the invoice/refund counts into it. */
      : `<div class="card" style="padding:14px 16px;margin-bottom:16px">
           <div class="row wrap between" style="gap:12px">
             <div class="row" style="gap:10px"><span class="badge blue">Today</span>
               <b>${UI.fmtDate(Date.now())}</b></div>
             <button class="btn primary sm" id="printShift">🖨 Print shift summary</button>
           </div>
           <div class="tiny muted" id="df_summary" style="margin-top:10px"></div>
         </div>`}

    <div class="tabs" id="repTabs">
      ${TABS.map(([k, l]) => `<div class="tab ${k === tab ? 'active' : ''}" data-t="${k}">${l}</div>`).join('')}
    </div>
    <div id="repBody"></div>`;

  const b = root.querySelector('#repBody');

  const render = () => {
    // ---- filter everything to the active range (inclusive of both end days) ----
    const from = state.from, to = state.to;
    const inRange = (ts) => UI.inRange(state, ts);
    const sales = allSales.filter((s) => inRange(s.ts));
    const expenses = allExpenses.filter((e) => inRange(e.ts));

    const isSale = (s) => s.type === 'sale';
    const totalRev = sales.reduce((a, x) => a + x.total, 0);     // net of refunds/exchanges
    const totalProfit = sales.reduce((a, x) => a + x.profit, 0); // net of refunds/exchanges
    const refundTotal = sales.filter((s) => s.type === 'refund' && !s.exchange).reduce((a, s) => a - s.total, 0); // true refunds only
    const refundCount = sales.filter((s) => s.type === 'refund' && !s.exchange).length;
    const exchangeCount = sales.filter((s) => s.type === 'exchange').length;
    const orderCount = sales.filter(isSale).length;

    // Long ranges are grouped by month so a year doesn't render 365 rows/points.
    const spanDays = from != null && to != null ? (to - from) / 86400000 : Infinity;
    const byMonth = spanDays > 62;
    const keyOf = (ts) => (byMonth ? UI.monthKey(ts) : UI.dayKey(ts));
    const labelOf = (k) => (byMonth
      ? UI.parseDayKey(k + '-01').toLocaleDateString(App.lang === 'ar' ? 'ar' : undefined, { month: 'short', year: 'numeric' })
      : UI.fmtDate(k));

    const buckets = {};
    sales.forEach((s) => {
      const k = keyOf(s.ts);
      buckets[k] = buckets[k] || { total: 0, profit: 0, count: 0 };
      buckets[k].total += s.total; buckets[k].profit += s.profit; if (isSale(s)) buckets[k].count++;
    });
    const asc = Object.entries(buckets).sort((a, x) => a[0].localeCompare(x[0]));
    const chartData = asc.slice(-14).map(([k, v]) => ({ l: byMonth ? k.slice(5) : k.slice(5), v: v.total }));
    const rows = [...asc].reverse();

    const prodQty = {}; const prodRev = {}; const prodDisc = {};
    // Cat POS lines are category amounts, not products — they get their own tab.
    sales.filter((s) => s.channel !== 'catpos').forEach((s) => s.items.forEach((i) => {
      prodQty[i.name] = (prodQty[i.name] || 0) + i.qty;
      prodRev[i.name] = (prodRev[i.name] || 0) + i.price * i.qty;
      prodDisc[i.name] = (prodDisc[i.name] || 0) + (i.discAmt || 0);
    }));
    const top = Object.entries(prodQty).map(([name, qty]) => ({ name, qty, rev: prodRev[name], disc: prodDisc[name] || 0 })).sort((a, x) => x.qty - a.qty);

    // total discount given across the range (per-item + order-level), sales only
    const totalDiscount = sales.filter(isSale).reduce((a, s) => a + (s.discount || 0), 0);
    const discountedCount = sales.filter((s) => isSale(s) && ((s.items || []).some((i) => i.discAmt) || s.discount)).length;
    const slow = [...top].reverse().slice(0, 5);

    const byCashier = {};
    sales.forEach((s) => { byCashier[s.cashier] = byCashier[s.cashier] || { count: 0, total: 0 }; if (isSale(s)) byCashier[s.cashier].count++; byCashier[s.cashier].total += s.total; });

    // ---- range summary line ----
    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML = sales.length || expenses.length
      ? `<b>${lbl.name}</b> · ${lbl.span}
         · ${orderCount} <span>invoices</span>${refundCount ? ` · ${refundCount} <span>refunds</span>` : ''} · ${expenses.length} <span>expenses</span>
         · <span>${byMonth ? 'by month' : 'by day'}</span>`
      : `<b>${lbl.name}</b> · ${lbl.span} · <span>no records in this range</span>`;

    const empty = (what) => `<div class="card" style="text-align:center;padding:48px 20px">
      <div style="font-size:34px">📭</div>
      <h3 style="margin-top:10px">No ${what} in this range</h3>
      <p class="muted tiny" style="margin-top:6px">Try a wider date range, or pick “All time”.</p></div>`;

    const panels = {
      /* The trend chart is history and the Profit column is the shop's margin —
         both are withheld from a cashier, who sees only their own day's takings. */
      sales: () => !sales.length ? empty('sales') : `
        ${books ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Revenue Trend</h3><span class="badge blue">by ${byMonth ? 'month' : 'day'}</span></div>${UI.lineChart(chartData)}</div>` : ''}
        <div class="card pad0"><div class="card-head" style="padding:18px 20px 4px"><h3>${books ? (byMonth ? 'Monthly' : 'Daily') + ' Sales Report' : "Today's Sales"}</h3><span class="badge green">${UI.money(totalRev)} <span>total</span></span></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>${byMonth ? 'Month' : 'Date'}</th><th class="right">Orders</th><th class="right">Revenue</th>${books ? '<th class="right">Profit</th>' : ''}<th class="right">Avg Ticket</th></tr></thead>
        <tbody>${rows.map(([d, v]) => `<tr><td><b>${labelOf(d)}</b></td><td class="right mono">${v.count}</td><td class="right mono">${UI.money(v.total)}</td>${books ? `<td class="right mono text-green">${UI.money(v.profit)}</td>` : ''}<td class="right mono muted">${UI.money(v.count ? v.total / v.count : 0)}</td></tr>`).join('')}</tbody></table></div></div>`,

      products: () => !sales.length ? empty('product sales') : `
        <div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><div class="card-head"><h3>🔥 Best Sellers</h3></div>${UI.bars(top.slice(0, 8).map((t) => ({ l: t.name, v: t.qty })), (v) => v + ' pcs')}</div>
        <div class="card"><div class="card-head"><h3>🐌 Slow Movers</h3></div>${UI.bars(slow.map((t) => ({ l: t.name, v: t.qty })), (v) => v + ' pcs')}</div></div>
        <div class="card pad0" style="margin-top:16px"><div class="card-head" style="padding:18px 20px 4px"><h3>Product Sales Report</h3><span class="badge blue">${top.length} products</span></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="right">Units Sold</th><th class="right">Revenue</th><th class="right">Discount</th></tr></thead>
        <tbody>${top.map((t) => `<tr><td><b>${UI.esc(t.name)}</b></td><td class="right mono">${t.qty}</td><td class="right mono">${UI.money(t.rev)}</td><td class="right mono ${t.disc ? 'text-red' : 'muted'}">${t.disc ? '− ' + UI.money(t.disc) : '—'}</td></tr>`).join('')}</tbody></table></div></div>`,

      catpos: () => window.catposReportPanel(sales),

      staff: () => !sales.length ? empty('cashier activity') : `
        <div class="card pad0"><div class="card-head" style="padding:18px 20px 4px"><h3>Cashier Performance</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Cashier</th><th class="right">Orders</th><th class="right">Total Sales</th><th class="right">Avg Ticket</th></tr></thead>
        <tbody>${Object.entries(byCashier).sort((a, x) => x[1].total - a[1].total).map(([n, v], i) => `<tr><td><div class="row"><div class="avatar" style="width:32px;height:32px;font-size:12px">${n.split(' ').map((x) => x[0]).join('').slice(0, 2)}</div><b>${UI.esc(n)}</b>${i === 0 ? '<span class="badge green">Top</span>' : ''}</div></td><td class="right mono">${v.count}</td><td class="right mono">${UI.money(v.total)}</td><td class="right mono muted">${UI.money(v.count ? v.total / v.count : 0)}</td></tr>`).join('')}</tbody></table></div></div>`,

      profit: () => {
        const totalExp = expenses.reduce((a, e) => a + e.amount, 0);
        const byCat = {}; expenses.forEach((e) => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
        const catRows = Object.entries(byCat).sort((a, x) => x[1] - a[1]).map(([l, v]) => ({ l, v }));
        return `<div class="stats" style="margin-bottom:16px">
          <div class="stat"><div class="ico g">💰</div><div class="label">Net Revenue</div><div class="value mono">${UI.money(totalRev)}</div>${refundTotal ? `<div class="delta text-red">after ${UI.money(refundTotal)} refunds</div>` : ''}</div>
          <div class="stat"><div class="ico c">📈</div><div class="label">Gross Profit</div><div class="value mono">${UI.money(totalProfit)}</div></div>
          <div class="stat"><div class="ico o">🧾</div><div class="label">Expenses</div><div class="value mono">${UI.money(totalExp)}</div></div>
          <div class="stat"><div class="ico r">🏷️</div><div class="label">Discounts Given</div><div class="value mono ${totalDiscount ? 'text-red' : ''}">${UI.money(totalDiscount)}</div>${discountedCount ? `<div class="delta text-red">on ${discountedCount} sale${discountedCount === 1 ? '' : 's'}</div>` : ''}</div>
          <div class="stat"><div class="ico ${totalProfit - totalExp >= 0 ? 'g' : 'r'}">🏆</div><div class="label">Net Profit</div><div class="value mono ${totalProfit - totalExp >= 0 ? 'text-green' : 'text-red'}">${UI.money(totalProfit - totalExp)}</div></div></div>
          <div class="grid" style="grid-template-columns:1fr 1fr">
            <div class="card"><div class="card-head"><h3>Expenses by Category</h3></div>
            ${catRows.length ? UI.bars(catRows) : '<div class="muted tiny">No expenses in this range</div>'}</div>
            <div class="card"><div class="card-head"><h3>Refunds</h3>${refundCount ? `<span class="badge orange">${refundCount}</span>` : ''}</div>
            ${refundCount ? `<div class="value mono" style="font-size:24px;font-weight:800;color:var(--red)">− ${UI.money(refundTotal)}</div>
              <div class="tiny muted">${refundCount} refund${refundCount === 1 ? '' : 's'} across ${orderCount} sale${orderCount === 1 ? '' : 's'} in this range</div>`
            : '<div class="muted tiny">No refunds in this range 👍</div>'}</div>
          </div>`;
      }
    };
    b.innerHTML = panels[tab]();
    const pcb = b.querySelector('#printCatpos');
    if (pcb) pcb.onclick = () => {
      const cs = allSales.filter((s) => s.channel === 'catpos' && UI.inRange(state, s.ts));
      if (!cs.length) return UI.toast('No category sales in this range to print', 'warn');
      printThermal(window.catposReportHTML(cs, UI.rangeLabel(state), store));
    };
  };

  root.querySelector('#repTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    root.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); tab = t.dataset.t; render();
  });

  const csvBtn = root.querySelector('#expCSV');   // not rendered for cashiers
  if (csvBtn) csvBtn.onclick = () => exportCSV(allSales.filter((s) => UI.inRange(state, s.ts)), state.from, state.to);
  root.querySelector('#expPDF').onclick = () => { UI.toast('Opening print dialog for PDF…', 'info'); setTimeout(() => window.print(), 400); };
  const doPrint = () => {
    const sales = allSales.filter((s) => UI.inRange(state, s.ts));
    const expenses = allExpenses.filter((e) => UI.inRange(state, e.ts));
    if (tab === 'catpos') {
      const cs = sales.filter((s) => s.channel === 'catpos');
      if (!cs.length) return UI.toast('No category sales in this range to print', 'warn');
      return printThermal(window.catposReportHTML(cs, UI.rangeLabel(state), store));
    }
    if (!sales.length && !expenses.length) return UI.toast('Nothing in this range to print', 'warn');
    printThermal(reportSummaryHTML(sales, expenses, UI.rangeLabel(state), store));
  };
  root.querySelector('#printRep').onclick = doPrint;
  // The cashier's end-of-shift button — same slip, put where they'll find it.
  const shiftBtn = root.querySelector('#printShift');
  if (shiftBtn) shiftBtn.onclick = doPrint;

  if (books) UI.bindDateFilter(root, state, render);  // cashiers are fixed to today
  render();
};

/* Thermal financial summary (Z-report style) for the selected range. */
function reportSummaryHTML(sales, expenses, lbl, store) {
  const isSale = (s) => s.type === 'sale';
  const orders = sales.filter(isSale).length;
  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const cogs = sales.reduce((a, s) => a + (s.cost || 0), 0);
  const grossProfit = revenue - cogs;
  const refunded = sales.filter((s) => s.type === 'refund' && !s.exchange).reduce((a, s) => a - s.total, 0);
  const exchanges = sales.filter((s) => s.type === 'exchange').length;
  const discounts = sales.filter((s) => s.type === 'sale').reduce((a, s) => a + (s.discount || 0), 0);
  const totalExp = expenses.reduce((a, e) => a + e.amount, 0);
  const net = grossProfit - totalExp;

  const byPay = {}; sales.forEach((s) => byPay[s.pay] = (byPay[s.pay] || 0) + s.total);
  const qty = {}; sales.filter((s) => s.channel !== 'catpos').forEach((s) => s.items.forEach((i) => { qty[i.name] = (qty[i.name] || 0) + i.qty; }));
  const top = Object.entries(qty).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const byCat = {}; expenses.forEach((e) => byCat[e.category] = (byCat[e.category] || 0) + e.amount);

  /* A cashier can print an end-of-shift slip, but it must not carry the shop's
     margin — no cost of goods, no gross or net profit. Everything they need to
     hand over the till (takings, refunds, expenses, payment split) stays. */
  const books = App.seesShopBooks();

  return thermalDoc(store, books ? 'FINANCIAL SUMMARY' : 'SHIFT SUMMARY', `
    ${tRow('Invoices', String(orders))}
    ${tRow('Net revenue', UI.money(revenue))}
    ${books ? tRow('Cost of goods', UI.money(cogs)) : ''}
    ${books ? tRow('Gross profit', UI.money(grossProfit)) : ''}
    ${discounts ? tRow('Discounts given', '− ' + UI.money(discounts)) : ''}
    ${refunded ? tRow('Refunds', '− ' + UI.money(refunded)) : ''}
    ${exchanges ? tRow('Exchanges', String(exchanges)) : ''}
    ${tRow('Expenses', '− ' + UI.money(totalExp))}
    ${books ? `<hr>${tRow('NET PROFIT', UI.money(net), true)}` : ''}
    <hr><div style="font-weight:bold">Payment methods</div>
    ${Object.entries(byPay).map(([k, v]) => tRow(k, UI.money(v))).join('')}
    ${top.length ? `<hr><div style="font-weight:bold">Top products</div>
      ${top.map(([n, q]) => tRow(n, q + ' pcs')).join('')}` : ''}
    ${Object.keys(byCat).length ? `<hr><div style="font-weight:bold">Expenses by category</div>
      ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => tRow(c, UI.money(v))).join('')}` : ''}`,
  `${lbl.name} · ${lbl.span}`);
}

function exportCSV(sales, from, to) {
  if (!sales.length) return UI.toast('Nothing to export in this range', 'warn');
  const rows = [['Invoice', 'Date', 'Cashier', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Total', 'Profit']];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`; // names may contain commas
  sales.sort((a, b) => a.ts - b.ts).forEach((s) => rows.push(
    [s.no, new Date(s.ts).toLocaleString(), s.cashier, s.customer, s.pay, s.subtotal, s.discount, s.total, s.profit].map(q)
  ));
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads UTF-8
  const tag = from == null ? 'all-time' : `${UI.dayKey(from)}_to_${UI.dayKey(to)}`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${Tenant.id}-sales-${tag}.csv`; a.click();
  UI.toast(`Exported ${sales.length} invoices`);
}

/* ------------------------------ INVOICES ------------------------------ */
Views.invoices = async (root) => {
  const sales = (await Store.sales()).sort((a, b) => b.ts - a.ts);
  const store = await DB.setting('store');
  const state = { preset: '30d', ...UI.rangeOf('30d') };
  let query = '';

  root.innerHTML = `
    <div class="page-head"><div><h1>Invoices & Receipts</h1><div class="sub">thermal & A4 printing</div></div>
      <button class="btn ghost" id="printInv">🖨 Print</button></div>
    ${UI.dateFilterHTML(state.preset)}
    <div class="card pad0"><div class="row between" style="padding:16px 18px">
      <div class="search" style="flex:1;max-width:320px;display:flex;gap:8px;align-items:center;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:9px 14px"><span>🔎</span><input id="invSearch" placeholder="Search invoice #, cashier…" style="border:none;background:transparent;outline:none;width:100%"></div>
    </div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Invoice #</th><th>Date & Time</th><th>Cashier</th><th>Customer</th><th>Items</th><th>Payment</th><th class="right">Total</th><th></th></tr></thead>
    <tbody id="invBody"></tbody></table></div></div>`;

  const body = root.querySelector('#invBody');
  const reload = () => Views.invoices(root);
  // records inside the active date range + search text
  const filtered = () => sales.filter((s) => UI.inRange(state, s.ts) &&
    (!query || ('#' + s.no).includes(query) || s.cashier.toLowerCase().includes(query) || s.customer.toLowerCase().includes(query)));

  const render = () => {
    const list = filtered();
    const lbl = UI.rangeLabel(state);
    const sold = list.filter((s) => s.type === 'sale').length;
    const net = list.reduce((a, s) => a + s.total, 0);
    root.querySelector('#df_summary').innerHTML = `<b>${lbl.name}</b> · ${lbl.span} · ${sold} <span>invoices</span> · ${UI.money(net)} <span>total</span>`;
    draw(list.slice(0, 100));
    App.translate(body);
  };
  const draw = (list) => {
    body.innerHTML = list.map((s) => {
      const neg = s.type === 'refund'; // refund or exchange-return (negative)
      const kind = s.exchange ? '<span class="badge cyan">Exchange</span>'
        : s.type === 'refund' ? '<span class="badge orange">Refund</span>'
        : s.status === 'cancelled' ? '<span class="badge red">Cancelled</span>'
        : `<span class="badge gray">${s.pay}</span>`;
      const prefix = s.type === 'exchange' ? 'X' : s.type === 'refund' ? 'R' : '#';
      const itemDisc = (s.items || []).some((i) => i.discAmt);
      const discBadge = (itemDisc || s.discount) ? '<span class="badge blue" title="Discount applied">🏷 Disc</span>' : '';
      return `<tr><td><b>${prefix}${s.no}</b>${s.refundOf ? `<div class="tiny muted">vs #${s.refundOf}</div>` : ''}</td>
        <td class="muted">${UI.fmtDT(s.ts)}</td><td>${UI.esc(s.cashier)}</td><td>${UI.esc(s.customer)}</td>
        <td class="mono">${Math.abs(s.items.reduce((a, i) => a + i.qty, 0))}</td>
        <td>${kind}${discBadge}</td>
        <td class="right mono"><b class="${neg ? 'text-red' : ''}">${UI.money(s.total)}</b></td>
        <td><button class="btn sm ghost" data-open="${s.id}">Open</button></td></tr>`;
    }).join('');
    body.querySelectorAll('[data-open]').forEach((btn) => btn.onclick = () => invoiceDetail(root, sales.find((x) => x.id === btn.dataset.open), store, reload));
  };

  UI.bindDateFilter(root, state, render);
  render();
  root.querySelector('#invSearch').oninput = (e) => { query = e.target.value.toLowerCase(); render(); };
  root.querySelector('#printInv').onclick = () => {
    const list = filtered();
    if (!list.length) return UI.toast('No invoices in this range to print', 'warn');
    printThermal(invoicesReportHTML(list, UI.rangeLabel(state), store));
  };
};

/* Thermal sales/invoices report for the selected range. */
function invoicesReportHTML(list, lbl, store) {
  const sales = list.filter((s) => s.type === 'sale');
  const refunds = list.filter((s) => s.type === 'refund' && !s.exchange);
  const exchanges = list.filter((s) => s.type === 'exchange');
  const gross = sales.reduce((a, s) => a + s.total, 0);
  const refunded = refunds.reduce((a, s) => a - s.total, 0);
  const net = list.reduce((a, s) => a + s.total, 0);
  const byPay = {}; list.forEach((s) => byPay[s.pay] = (byPay[s.pay] || 0) + s.total);
  return thermalDoc(store, 'SALES / INVOICES REPORT', `
    <table><thead><tr><th style="text-align:left">#</th><th style="text-align:left">Date</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${list.slice(0, 120).map((s) => `<tr><td>${s.type === 'exchange' ? 'X' : s.type === 'refund' ? 'R' : ''}${s.no}</td><td>${UI.fmtDate(s.ts)}</td><td style="text-align:right">${UI.money(s.total)}</td></tr>`).join('')}</tbody></table>
    <hr><div style="font-weight:bold">By payment method</div>
    ${Object.entries(byPay).map(([k, v]) => tRow(k, UI.money(v))).join('')}
    <hr>
    ${tRow('Invoices', String(sales.length))}
    ${tRow('Gross sales', UI.money(gross))}
    ${refunded ? tRow('Refunds', '− ' + UI.money(refunded)) : ''}
    ${exchanges.length ? tRow('Exchanges', String(exchanges.length)) : ''}
    ${tRow('NET TOTAL', UI.money(net), true)}`, `${lbl.name} · ${lbl.span}`);
}
