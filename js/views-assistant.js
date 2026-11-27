/* =====================================================================
   MTX GROUP — AI Assistant (admins only)

   A tracking assistant that reads the store's own books and answers ready-
   made questions: tap a question, get the answer worked out from the live
   data. Everything is computed on this device from IndexedDB, so it works
   offline, costs nothing per question, and no business data leaves the shop.

   Adding a question = adding one entry to QUESTIONS below: an id, an icon,
   the question text, and a run(ctx) that returns the answer's HTML. ctx is
   built once per period by aiContext() and holds every figure a question
   might need, already filtered and aggregated.

   Who can open it: App.can('assistant') is hard-wired to App.isAdmin(), so it
   never appears in the editable permissions matrix.
   ===================================================================== */

(() => {
/* ---------------- figures ---------------- */
const DAY = 86400000;
/* Short dynamic phrases (the tracking chips) carry their own Arabic, since the
   exact-match dictionary can't translate text with numbers inside it. */
const L = (en, ar) => (App.lang === 'ar' ? ar : en);

/* What a sale line actually brought in, after its share of every discount.
   Refund lines carry negative qty at the paid price, so they net out. Older
   invoices (and demo data) recorded only an invoice-level discount — spread
   that over the lines so product totals still add up to the invoice. */
function aiLineNets(sale) {
  const items = sale.items || [];
  const raw = items.map((i) => (i.net != null ? i.net : (i.price || 0) * (i.qty || 0) - (i.discAmt || 0)));
  const hasLineDisc = items.some((i) => i.net != null || i.discAmt != null);
  const sum = raw.reduce((a, b) => a + b, 0);
  if (!hasLineDisc && sum && sale.total != null && Math.abs(sum - sale.total) > 0.0001) {
    const f = sale.total / sum;
    return raw.map((v) => v * f);
  }
  return raw;
}

/* The equal-length window just before `range`, cut at the same point in time
   so "today so far" is compared with "yesterday up to now", not all of it. */
function aiPrevRange(range) {
  if (range.from == null) return null;
  const end = Math.min(range.to, Date.now());
  const days = Math.max(1, Math.round((range.to - range.from) / DAY));
  return { from: range.from - days * DAY, to: end - days * DAY };
}

async function aiContext(range) {
  const [sales, products, expenses, customers, categories] = await Promise.all([
    DB.all('sales'), DB.all('products'), DB.all('expenses'), DB.all('customers'), DB.all('categories')
  ]);
  const inR = (r) => (ts) => UI.inRange(r, ts);
  const prevRange = aiPrevRange(range);
  const P = sales.filter((s) => inR(range)(s.ts));
  const prevP = prevRange ? sales.filter((s) => inR(prevRange)(s.ts)) : null;
  const E = expenses.filter((e) => inR(range)(e.ts));
  const prevE = prevRange ? expenses.filter((e) => inR(prevRange)(e.ts)) : null;

  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const catName = (id) => (id && catById[id] ? catById[id].name : (id || 'Uncategorized'));

  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const totals = (list, exp) => {
    const revenue = sum(list, (s) => s.total);
    const gross = sum(list, (s) => s.profit);
    const expense = sum(exp || [], (e) => e.amount);
    const orders = list.filter((s) => s.type === 'sale').length;
    const items = sum(list.filter((s) => s.type === 'sale'), (s) => sum(s.items || [], (i) => i.qty));
    return { revenue, gross, expense, net: gross - expense, orders, items, avg: orders ? revenue / orders : 0 };
  };

  // per-product and per-category figures for the period (refunds net out)
  const byProd = {}, byCat = {};
  P.forEach((s) => {
    const nets = aiLineNets(s);
    (s.items || []).forEach((i, k) => {
      const net = nets[k], profit = net - (i.cost || 0) * (i.qty || 0);
      const cid = i.catAmount ? i.category : (i.cat || (prodById[i.id] && prodById[i.id].category));
      const c = byCat[cid || '_'] || (byCat[cid || '_'] = { name: catName(cid), qty: 0, revenue: 0, profit: 0 });
      c.qty += i.qty || 0; c.revenue += net; c.profit += profit;
      if (i.catAmount) return; // Cat POS amounts are categories, not products
      const p = byProd[i.id] || (byProd[i.id] = { id: i.id, name: (prodById[i.id] && prodById[i.id].name) || i.name, qty: 0, revenue: 0, profit: 0, disc: 0 });
      p.qty += i.qty || 0; p.revenue += net; p.profit += profit;
      if (s.type === 'sale' || s.type === 'exchange') p.disc += (i.discAmt || 0);
    });
  });

  // sales speed over the last 30 days, whatever period is picked — this is
  // what "will run out soon" and "not selling" are judged on
  const since30 = Date.now() - 30 * DAY;
  const sold30 = {};
  sales.filter((s) => s.ts >= since30).forEach((s) => (s.items || []).forEach((i) => {
    if (!i.catAmount) sold30[i.id] = (sold30[i.id] || 0) + (i.qty || 0);
  }));
  const lastSold = {};
  sales.forEach((s) => (s.items || []).forEach((i) => { if (!i.catAmount && (i.qty || 0) > 0 && (!lastSold[i.id] || s.ts > lastSold[i.id])) lastSold[i.id] = s.ts; }));

  return {
    range, prevRange, sales, P, prevP, E, prevE, products, customers, categories, prodById, catName,
    now: totals(P, E), prev: prevP ? totals(prevP, prevE) : null,
    prods: Object.values(byProd), cats: Object.values(byCat), sold30, lastSold, sum,
    active: products.filter((p) => p.active !== false)
  };
}

/* ---------------- answer building blocks ---------------- */
const M = (n) => UI.money(UI.roundTo(n));
const pct = (a, b) => (b ? (a / b * 100) : 0);
const fmtPct = (v) => (Math.round(v * 10) / 10).toLocaleString() + '%';
function change(nowV, prevV) {
  if (prevV == null) return '';
  if (!prevV) return nowV ? '<span class="ai-up">▲ new</span>' : '';
  const d = (nowV - prevV) / Math.abs(prevV) * 100;
  if (Math.abs(d) < 0.5) return '<span class="muted">● same as before</span>';
  return d > 0 ? `<span class="ai-up">▲ ${fmtPct(d)}</span>` : `<span class="ai-down">▼ ${fmtPct(-d)}</span>`;
}
const tiles = (list) => `<div class="ai-tiles">${list.map(([label, value, sub]) =>
  `<div class="ai-tile"><div class="tiny muted">${label}</div><div class="ai-tile-v mono">${value}</div>${sub ? `<div class="tiny">${sub}</div>` : ''}</div>`).join('')}</div>`;
const table = (heads, rows, right = []) => rows.length ? `<div class="table-wrap"><table class="tbl ai-tbl"><thead><tr>${heads.map((h, i) =>
  `<th${right.includes(i) ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
  `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' class="mono" style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
const say = (t) => `<p class="ai-say">${t}</p>`;
const tip = (t) => `<div class="ai-tip">💡 <span>${t}</span></div>`;
const warn = (t) => `<div class="ai-tip warn">⚠️ <span>${t}</span></div>`;
const good = (t) => `<div class="ai-tip ok">✅ <span>${t}</span></div>`;
const b = (t) => `<b>${UI.esc(t)}</b>`;
const nothing = (t = 'No sales in this period yet, so there is nothing to measure.') => say(t);
const vsTxt = (ctx) => (ctx.prevRange ? 'compared with the period before' : '');

/* Products ranked by a figure; only ones that actually sold. */
const ranked = (ctx, key, n = 10) => ctx.prods.filter((p) => p.qty > 0).sort((a, z) => z[key] - a[key]).slice(0, n);
/* Days of stock left at the last-30-days pace (Infinity when it isn't selling). */
const daysLeft = (ctx, p) => { const perDay = (ctx.sold30[p.id] || 0) / 30; return perDay > 0 ? (p.stock || 0) / perDay : Infinity; };

/* ---------------- the questions ----------------
   Grouped only for the layout. Order here = order on screen. */
const QUESTIONS = [
  { id: 'profit', group: 'Money', icon: '💰', q: 'How much profit did I make?', run(ctx) {
    const n = ctx.now, p = ctx.prev;
    if (!ctx.P.length && !ctx.E.length) return nothing();
    const margin = pct(n.gross, n.revenue);
    return tiles([
      ['Sales', M(n.revenue), p ? change(n.revenue, p.revenue) : ''],
      ['Gross profit', M(n.gross), fmtPct(margin) + ' margin'],
      ['Expenses', M(n.expense), p ? change(n.expense, p.expense) : ''],
      ['Net profit', M(n.net), p ? change(n.net, p.net) : '']
    ]) + say(`You sold ${b(M(n.revenue))}. After the cost of the goods you kept ${b(M(n.gross))}, and after ${b(M(n.expense))} of expenses your net profit is ${b(M(n.net))}.`)
      + (n.net < 0 ? warn('Expenses are bigger than what the sales earned — this period is running at a loss.')
        : margin < 20 && n.revenue ? tip('Your margin is under 20%. Check the low-margin question to see which products drag it down.')
          : good('You are profitable in this period.'))
      + (ctx.P.some((s) => s.channel === 'catpos') ? say('<span class="tiny muted">Cat POS sales have no cost recorded, so their whole amount counts as profit.</span>') : '');
  } },
  { id: 'revenue', group: 'Money', icon: '📈', q: 'How much did I sell?', run(ctx) {
    const n = ctx.now, p = ctx.prev;
    if (!ctx.P.length) return nothing();
    return tiles([
      ['Total sales', M(n.revenue), p ? change(n.revenue, p.revenue) : ''],
      ['Invoices', UI.num(n.orders), p ? change(n.orders, p.orders) : ''],
      ['Average invoice', M(n.avg), p ? change(n.avg, p.avg) : ''],
      ['Items per invoice', n.orders ? (n.items / n.orders).toFixed(1) : '0', '']
    ]) + say(`${b(UI.num(n.orders))} invoices brought in ${b(M(n.revenue))} (after refunds and discounts). The average customer spends ${b(M(n.avg))}.`)
      + (p && p.revenue ? (n.revenue >= p.revenue ? good(`Sales are up ${vsTxt(ctx)}.`) : warn(`Sales are down ${vsTxt(ctx)} — ${M(p.revenue - n.revenue)} less.`)) : '');
  } },
  { id: 'trend', group: 'Money', icon: '📊', q: 'Are my sales going up or down?', run(ctx) {
    if (!ctx.prev) return say('Pick a period other than "All time" — the assistant compares it with the same length of time just before it.');
    const n = ctx.now, p = ctx.prev;
    const rows = [
      ['Sales', M(n.revenue), M(p.revenue), change(n.revenue, p.revenue)],
      ['Invoices', UI.num(n.orders), UI.num(p.orders), change(n.orders, p.orders)],
      ['Average invoice', M(n.avg), M(p.avg), change(n.avg, p.avg)],
      ['Gross profit', M(n.gross), M(p.gross), change(n.gross, p.gross)],
      ['Expenses', M(n.expense), M(p.expense), change(n.expense, p.expense)],
      ['Net profit', M(n.net), M(p.net), change(n.net, p.net)]
    ];
    const why = n.revenue < p.revenue
      ? (n.orders < p.orders ? 'Fewer customers bought — the drop comes from the number of invoices.' : 'About as many customers, but each spent less — the drop comes from smaller invoices.')
      : (n.orders > p.orders ? 'More customers bought — the growth comes from the number of invoices.' : 'Each customer spent more — the growth comes from bigger invoices.');
    return say(`Previous period: ${UI.fmtDate(ctx.prevRange.from)} → ${UI.fmtDT(ctx.prevRange.to)}.`)
      + table(['', 'This period', 'Before', 'Change'], rows, [1, 2]) + tip(why);
  } },
  { id: 'forecast', group: 'Money', icon: '🔮', q: 'How much will I sell this month?', run(ctx) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsed = Math.max(1, (Date.now() - start) / DAY);
    const mtd = ctx.sales.filter((s) => s.ts >= start);
    const rev = ctx.sum(mtd, (s) => s.total), prof = ctx.sum(mtd, (s) => s.profit);
    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lm = ctx.sum(ctx.sales.filter((s) => s.ts >= lmStart && s.ts < start), (s) => s.total);
    if (!mtd.length) return say('No sales this month yet — the forecast needs at least one day of selling.');
    const fRev = rev / elapsed * dim, fProf = prof / elapsed * dim;
    return tiles([
      ['Sold so far', M(rev), `${Math.floor(elapsed)} of ${dim} days`],
      ['Expected by month end', M(fRev), lm ? change(fRev, lm) + ' vs last month' : ''],
      ['Expected gross profit', M(fProf), ''],
      ...(lm ? [['Needed per day', M(Math.max(0, (lm - rev) / Math.max(1, dim - elapsed))), 'to match last month']] : [])
    ]) + say(`At the pace of this month so far (${b(M(rev / elapsed))} a day) you will finish around ${b(M(fRev))}.`)
      + (lm ? (fRev >= lm ? good(`On track to beat last month (${M(lm)}).`) : warn(`Heading below last month (${M(lm)}). You need about ${M((lm - rev) / Math.max(1, dim - elapsed))} a day for the rest of the month to match it.`)) : '')
      + say('<span class="tiny muted">This month\'s forecast ignores the period picked above.</span>');
  } },

  { id: 'best', group: 'Products', icon: '🏆', q: 'What are my best-selling products?', run(ctx) {
    const top = ranked(ctx, 'qty');
    if (!top.length) return nothing();
    const totalQty = ctx.prods.reduce((a, p) => a + Math.max(0, p.qty), 0);
    return table(['#', 'Product', 'Sold', 'Sales'], top.map((p, i) => [i + 1, UI.esc(p.name), UI.num(p.qty), M(p.revenue)]), [2, 3])
      + say(`${b(top[0].name)} is your best seller with ${b(UI.num(top[0].qty))} units — ${fmtPct(pct(top[0].qty, totalQty))} of everything sold.`)
      + tip('Keep the top sellers well stocked and place them where customers see them first.');
  } },
  { id: 'earners', group: 'Products', icon: '💎', q: 'Which products make me the most profit?', run(ctx) {
    const top = ranked(ctx, 'profit');
    if (!top.length) return nothing();
    const best = ranked(ctx, 'qty', 1)[0];
    return table(['#', 'Product', 'Sold', 'Profit', 'Margin'], top.map((p, i) => [i + 1, UI.esc(p.name), UI.num(p.qty), M(p.profit), fmtPct(pct(p.profit, p.revenue))]), [2, 3, 4])
      + say(`${b(top[0].name)} earns you the most: ${b(M(top[0].profit))} profit.`)
      + (best && best.id !== top[0].id ? tip(`Your best seller (${UI.esc(best.name)}) is not your best earner — selling more of ${UI.esc(top[0].name)} is worth more to you.`) : '');
  } },
  { id: 'lowmargin', group: 'Products', icon: '⚖️', q: 'Which products have a low margin?', run(ctx) {
    const list = ctx.active.filter((p) => (p.price || 0) > 0).map((p) => ({ ...p, m: pct((p.price || 0) - (p.cost || 0), p.price) }))
      .filter((p) => p.m < 20).sort((a, z) => a.m - z.m).slice(0, 15);
    if (!list.length) return good('Every product has at least a 20% margin between its cost and sale price.');
    const loss = list.filter((p) => p.m < 0);
    return table(['Product', 'Cost', 'Price', 'Margin'], list.map((p) => [UI.esc(p.name), M(p.cost), M(p.price), `<span class="${p.m < 0 ? 'ai-down' : ''}">${fmtPct(p.m)}</span>`]), [1, 2, 3])
      + (loss.length ? warn(`${loss.length} product${loss.length > 1 ? 's are' : ' is'} priced <b>below cost</b> — every sale loses money.`) : '')
      + tip('These products earn less than 20% of their price. Consider raising the price or finding a cheaper supplier.');
  } },
  { id: 'dead', group: 'Products', icon: '🐢', q: 'Which products are not selling?', run(ctx) {
    const list = ctx.active.filter((p) => (p.stock || 0) > 0 && !(ctx.sold30[p.id] > 0))
      .map((p) => ({ ...p, tied: (p.cost || 0) * (p.stock || 0) })).sort((a, z) => z.tied - a.tied);
    if (!list.length) return good('Every product in stock sold at least once in the last 30 days.');
    const tied = list.reduce((a, p) => a + p.tied, 0);
    return say(`${b(UI.num(list.length))} products in stock have not sold in the last 30 days. They hold ${b(M(tied))} of your money (at cost).`)
      + table(['Product', 'In stock', 'Money held', 'Last sold'], list.slice(0, 15).map((p) => [UI.esc(p.name), UI.num(p.stock), M(p.tied), ctx.lastSold[p.id] ? UI.fmtDate(ctx.lastSold[p.id]) : 'never']), [1, 2])
      + tip('Put these on a discount or bundle them with best sellers to turn them back into cash. Avoid re-ordering them.');
  } },
  { id: 'restock', group: 'Products', icon: '📦', q: 'What do I need to restock now?', run(ctx) {
    const list = ctx.active.filter((p) => (p.stock || 0) <= (p.minStock || 0)).sort((a, z) => (a.stock || 0) - (z.stock || 0));
    if (!list.length) return good('Nothing is at or below its minimum stock level.');
    const out = list.filter((p) => (p.stock || 0) <= 0).length;
    return say(`${b(UI.num(list.length))} products are at or below their minimum${out ? `, and ${b(UI.num(out))} ${out > 1 ? 'are' : 'is'} completely out of stock` : ''}.`)
      + table(['Product', 'In stock', 'Minimum', 'Sold (30 days)'], list.slice(0, 20).map((p) => [UI.esc(p.name), `<span class="${(p.stock || 0) <= 0 ? 'ai-down' : ''}">${UI.num(p.stock || 0)}</span>`, UI.num(p.minStock || 0), UI.num(ctx.sold30[p.id] || 0)]), [1, 2, 3])
      + tip('Re-order the ones that also sell well (right-hand column) first — those are the sales you lose while they are missing.');
  } },
  { id: 'runout', group: 'Products', icon: '⏳', q: 'Which products will run out soon?', run(ctx) {
    const list = ctx.active.filter((p) => (p.stock || 0) > 0).map((p) => ({ ...p, d: daysLeft(ctx, p) }))
      .filter((p) => p.d <= 14).sort((a, z) => a.d - z.d);
    if (!list.length) return good('At the last 30 days\' pace, nothing in stock runs out in the next 2 weeks.');
    return say(`At the pace of the last 30 days, ${b(UI.num(list.length))} products run out within 2 weeks.`)
      + table(['Product', 'In stock', 'Sells per day', 'Runs out in'], list.slice(0, 20).map((p) => [UI.esc(p.name), UI.num(p.stock), ((ctx.sold30[p.id] || 0) / 30).toFixed(1), `<span class="${p.d <= 3 ? 'ai-down' : ''}">${Math.max(0, Math.floor(p.d))} days</span>`]), [1, 2, 3])
      + tip('Order before the date — allow for how long your supplier takes to deliver.');
  } },
  { id: 'stock', group: 'Products', icon: '🗃️', q: 'How much is my stock worth?', run(ctx) {
    const inStock = ctx.active.filter((p) => (p.stock || 0) > 0);
    const cost = inStock.reduce((a, p) => a + (p.cost || 0) * p.stock, 0);
    const retail = inStock.reduce((a, p) => a + (p.price || 0) * p.stock, 0);
    const units = inStock.reduce((a, p) => a + p.stock, 0);
    if (!inStock.length) return say('Nothing is in stock.');
    const top = [...inStock].sort((a, z) => (z.cost || 0) * z.stock - (a.cost || 0) * a.stock).slice(0, 8);
    return tiles([
      ['At cost', M(cost), 'what you paid'],
      ['At sale price', M(retail), 'if all of it sells'],
      ['Profit waiting', M(retail - cost), fmtPct(pct(retail - cost, retail)) + ' margin'],
      ['Units', UI.num(units), `${UI.num(inStock.length)} products`]
    ]) + say('Where most of the money sits:')
      + table(['Product', 'Units', 'Value at cost'], top.map((p) => [UI.esc(p.name), UI.num(p.stock), M((p.cost || 0) * p.stock)]), [1, 2]);
  } },
  { id: 'cats', group: 'Products', icon: '🏷️', q: 'Which categories sell the most?', run(ctx) {
    const list = ctx.cats.filter((c) => c.revenue > 0).sort((a, z) => z.revenue - a.revenue);
    if (!list.length) return nothing();
    const tot = list.reduce((a, c) => a + c.revenue, 0);
    return table(['Category', 'Sales', 'Share', 'Profit'], list.map((c) => [UI.esc(c.name), M(c.revenue), `<div class="ai-bar"><i style="width:${pct(c.revenue, tot).toFixed(1)}%"></i></div>${fmtPct(pct(c.revenue, tot))}`, M(c.profit)]), [1, 3])
      + say(`${b(list[0].name)} brings in the most — ${fmtPct(pct(list[0].revenue, tot))} of your sales.`);
  } },

  { id: 'weekday', group: 'Timing', icon: '📅', q: 'Which day of the week sells best?', run(ctx) {
    const sales = ctx.P.filter((s) => s.type === 'sale');
    if (!sales.length) return nothing();
    const loc = App.lang === 'ar' ? 'ar' : undefined;
    const days = Array.from({ length: 7 }, (_, d) => ({ d, name: new Date(2024, 0, 7 + d).toLocaleDateString(loc, { weekday: 'long' }), rev: 0, n: 0, dates: new Set() }));
    ctx.P.forEach((s) => { const x = days[new Date(s.ts).getDay()]; x.rev += s.total; if (s.type === 'sale') x.n++; x.dates.add(UI.dayKey(s.ts)); });
    days.forEach((x) => { x.avg = x.dates.size ? x.rev / x.dates.size : 0; });
    const max = Math.max(...days.map((x) => x.avg)) || 1;
    const best = [...days].sort((a, z) => z.avg - a.avg)[0], worst = [...days].filter((x) => x.dates.size).sort((a, z) => a.avg - z.avg)[0];
    return table(['Day', 'Average sales', '', 'Invoices'], days.map((x) => [x.name, M(x.avg), `<div class="ai-bar wide"><i style="width:${(x.avg / max * 100).toFixed(1)}%"></i></div>`, UI.num(x.n)]), [1, 3])
      + say(`${b(best.name)} is your strongest day (about ${b(M(best.avg))}); ${worst ? b(worst.name) + ' is the quietest.' : ''}`)
      + tip('Plan the most staff and fresh stock for the strong days; run offers on the quiet ones.');
  } },
  { id: 'hours', group: 'Timing', icon: '🕒', q: 'What are my busiest hours?', run(ctx) {
    const sales = ctx.P.filter((s) => s.type === 'sale');
    if (!sales.length) return nothing();
    const hrs = Array.from({ length: 24 }, (_, h) => ({ h, n: 0, rev: 0 }));
    sales.forEach((s) => { const x = hrs[new Date(s.ts).getHours()]; x.n++; x.rev += s.total; });
    const used = hrs.filter((x) => x.n);
    const max = Math.max(...used.map((x) => x.n));
    const lbl = (h) => `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`;
    const peak = [...used].sort((a, z) => z.n - a.n)[0];
    return table(['Hour', 'Invoices', '', 'Sales'], used.map((x) => [lbl(x.h), UI.num(x.n), `<div class="ai-bar wide"><i style="width:${(x.n / max * 100).toFixed(1)}%"></i></div>`, M(x.rev)]), [1, 3])
      + say(`The busiest hour is ${b(lbl(peak.h))} with ${b(UI.num(peak.n))} invoices.`)
      + tip('Make sure the till is fully staffed at the peak hour; use the quiet hours for restocking and cleaning.');
  } },
  { id: 'days', group: 'Timing', icon: '🗓️', q: 'What were my best and worst days?', run(ctx) {
    if (!ctx.P.length) return nothing();
    const by = {};
    ctx.P.forEach((s) => { const k = UI.dayKey(s.ts); const x = by[k] || (by[k] = { k, rev: 0, n: 0 }); x.rev += s.total; if (s.type === 'sale') x.n++; });
    const list = Object.values(by).sort((a, z) => z.rev - a.rev);
    const avg = list.reduce((a, x) => a + x.rev, 0) / list.length;
    const row = (x) => [UI.fmtDate(x.k), M(x.rev), UI.num(x.n)];
    return say(`Over ${b(UI.num(list.length))} trading days you averaged ${b(M(avg))} a day.`)
      + '<div class="ai-sub">🏆 Best days</div>' + table(['Date', 'Sales', 'Invoices'], list.slice(0, 5).map(row), [1, 2])
      + (list.length > 5 ? '<div class="ai-sub">🐢 Quietest days</div>' + table(['Date', 'Sales', 'Invoices'], list.slice(-5).reverse().map(row), [1, 2]) : '');
  } },

  { id: 'staff', group: 'People', icon: '🧑‍💼', q: 'Who is my best cashier?', run(ctx) {
    if (!ctx.P.length) return nothing();
    const by = {};
    ctx.P.forEach((s) => {
      const x = by[s.cashier || '—'] || (by[s.cashier || '—'] = { name: s.cashier || '—', rev: 0, n: 0, refunds: 0, disc: 0 });
      x.rev += s.total; if (s.type === 'sale') { x.n++; x.disc += s.discount || 0; }
      if (s.type === 'refund' && !s.exchange) x.refunds += -s.total;
    });
    const list = Object.values(by).sort((a, z) => z.rev - a.rev);
    return table(['Cashier', 'Sales', 'Invoices', 'Average', 'Discounts given', 'Refunded'], list.map((x) => [UI.esc(x.name), M(x.rev), UI.num(x.n), M(x.n ? x.rev / x.n : 0), M(x.disc), M(x.refunds)]), [1, 2, 3, 4, 5])
      + say(`${b(list[0].name)} sold the most: ${b(M(list[0].rev))}.`)
      + tip('Watch the "Discounts given" column — one person giving far more discount than the others is worth a conversation.');
  } },
  { id: 'customers', group: 'People', icon: '⭐', q: 'Who are my best customers?', run(ctx) {
    const by = {};
    ctx.P.forEach((s) => {
      const name = s.customer || ''; if (!name || /walk-?in/i.test(name)) return;
      const x = by[name] || (by[name] = { name, rev: 0, n: 0, last: 0 });
      x.rev += s.total; if (s.type === 'sale') x.n++; x.last = Math.max(x.last, s.ts);
    });
    const list = Object.values(by).filter((x) => x.rev > 0).sort((a, z) => z.rev - a.rev).slice(0, 10);
    const walk = ctx.sum(ctx.P.filter((s) => !s.customer || /walk-?in/i.test(s.customer)), (s) => s.total);
    if (!list.length) return say('All sales in this period were to walk-in customers. Pick a named customer at the till to start tracking who your regulars are.');
    return table(['#', 'Customer', 'Spent', 'Visits', 'Last visit'], list.map((x, i) => [i + 1, UI.esc(x.name), M(x.rev), UI.num(x.n), UI.fmtDate(x.last)]), [2, 3])
      + say(`${b(list[0].name)} is your top customer with ${b(M(list[0].rev))}. Walk-in (unnamed) customers spent ${b(M(walk))}.`)
      + tip('Reward your top customers — a small thank-you keeps them coming back.');
  } },
  { id: 'debts', group: 'People', icon: '📒', q: 'Who owes me money?', run(ctx) {
    const list = ctx.customers.filter((c) => (c.debt || 0) > 0).sort((a, z) => z.debt - a.debt);
    if (!list.length) return good('No customer owes you anything right now.');
    const tot = list.reduce((a, c) => a + c.debt, 0);
    return say(`${b(UI.num(list.length))} customers owe you a total of ${b(M(tot))}.`)
      + table(['Customer', 'Phone', 'Owes'], list.slice(0, 20).map((c) => [UI.esc(c.name), UI.esc(c.phone || ''), M(c.debt)]), [2])
      + tip('Follow up with the biggest amounts first. Debts are shown as they are today, whatever period is picked.');
  } },

  { id: 'discounts', group: 'Leaks', icon: '🎁', q: 'How much did I give away in discounts?', run(ctx) {
    const sales = ctx.P.filter((s) => s.type === 'sale' || s.type === 'exchange');
    if (!sales.length) return nothing();
    const disc = ctx.sum(sales, (s) => s.discount);
    const gross = ctx.sum(sales, (s) => s.subtotal);
    const n = sales.filter((s) => (s.discount || 0) > 0).length;
    const top = ctx.prods.filter((p) => p.disc > 0).sort((a, z) => z.disc - a.disc).slice(0, 8);
    return tiles([
      ['Discounts given', M(disc), fmtPct(pct(disc, gross)) + ' of full price'],
      ['Discounted invoices', UI.num(n), `of ${UI.num(sales.length)}`]
    ]) + (top.length ? say('Products with the most discount on them:') + table(['Product', 'Discount'], top.map((p) => [UI.esc(p.name), M(p.disc)]), [1]) : '')
      + (pct(disc, gross) > 10 ? warn('More than 10% of full price goes out as discount. Check who is giving them in "Who is my best cashier?".') : good('Discounts are under control.'));
  } },
  { id: 'refunds', group: 'Leaks', icon: '↩️', q: 'How much was refunded?', run(ctx) {
    const refs = ctx.P.filter((s) => s.type === 'refund' && !s.exchange);
    const exch = ctx.P.filter((s) => s.type === 'exchange').length;
    if (!refs.length) return good(`No refunds in this period.${exch ? ` (${exch} exchange${exch > 1 ? 's' : ''})` : ''}`);
    const amt = -ctx.sum(refs, (s) => s.total);
    const gross = ctx.sum(ctx.P.filter((s) => s.type === 'sale'), (s) => s.total);
    const by = {};
    refs.forEach((s) => (s.items || []).forEach((i) => { const x = by[i.name] || (by[i.name] = { name: i.name, q: 0, v: 0 }); x.q += -(i.qty || 0); x.v += -(i.price || 0) * (i.qty || 0); }));
    const top = Object.values(by).sort((a, z) => z.q - a.q).slice(0, 8);
    return tiles([
      ['Refunded', M(amt), fmtPct(pct(amt, gross)) + ' of sales'],
      ['Refunds', UI.num(refs.length), exch ? `+ ${UI.num(exch)} exchanges` : '']
    ]) + say('Most returned products:') + table(['Product', 'Returned', 'Value'], top.map((x) => [UI.esc(x.name), UI.num(x.q), M(x.v)]), [1, 2])
      + (pct(amt, gross) > 5 ? warn('Refunds are above 5% of sales. A product that comes back again and again may have a quality problem.') : '');
  } },
  { id: 'expenses', group: 'Leaks', icon: '🧾', q: 'Where does my money go?', run(ctx) {
    if (!ctx.E.length) return say('No expenses recorded in this period.');
    const by = {};
    ctx.E.forEach((e) => { const k = e.category || 'Other'; by[k] = (by[k] || 0) + (e.amount || 0); });
    const list = Object.entries(by).sort((a, z) => z[1] - a[1]);
    const tot = list.reduce((a, x) => a + x[1], 0);
    return tiles([
      ['Total expenses', M(tot), ctx.prev ? change(tot, ctx.prev.expense) : ''],
      ['Of your sales', fmtPct(pct(tot, ctx.now.revenue)), 'goes to expenses']
    ]) + table(['Category', 'Spent', 'Share'], list.map(([k, v]) => [UI.esc(k), M(v), `<div class="ai-bar"><i style="width:${pct(v, tot).toFixed(1)}%"></i></div>${fmtPct(pct(v, tot))}`]), [1])
      + say(`${b(list[0][0])} is the biggest cost: ${b(M(list[0][1]))}.`);
  } },
  { id: 'pay', group: 'Leaks', icon: '💳', q: 'How do customers pay?', run(ctx) {
    const sales = ctx.P.filter((s) => s.type === 'sale');
    if (!sales.length) return nothing();
    const by = {};
    sales.forEach((s) => { const k = s.pay || 'Other'; const x = by[k] || (by[k] = { n: 0, v: 0 }); x.n++; x.v += s.total; });
    const list = Object.entries(by).sort((a, z) => z[1].v - a[1].v);
    const tot = list.reduce((a, x) => a + x[1].v, 0);
    return table(['Method', 'Invoices', 'Amount', 'Share'], list.map(([k, x]) => [UI.esc(k), UI.num(x.n), M(x.v), `<div class="ai-bar"><i style="width:${pct(x.v, tot).toFixed(1)}%"></i></div>${fmtPct(pct(x.v, tot))}`]), [1, 2])
      + (by.Debt ? warn(`${M(by.Debt.v)} was sold on credit (Debt) — that money isn't in the drawer yet.`) : '');
  } }
];

/* The "tracking" strip: what the assistant is watching right now. Each item
   opens the question that explains it. */
function aiAlerts(ctx) {
  const out = [];
  const low = ctx.active.filter((p) => (p.stock || 0) <= (p.minStock || 0)).length;
  const soon = ctx.active.filter((p) => (p.stock || 0) > 0 && daysLeft(ctx, p) <= 7).length;
  const dead = ctx.active.filter((p) => (p.stock || 0) > 0 && !(ctx.sold30[p.id] > 0));
  const debt = ctx.customers.reduce((a, c) => a + Math.max(0, c.debt || 0), 0);
  const belowCost = ctx.active.filter((p) => (p.price || 0) > 0 && (p.price || 0) < (p.cost || 0)).length;
  const n = ctx.now, p = ctx.prev;
  if (p && p.revenue) {
    const d = (n.revenue - p.revenue) / p.revenue * 100;
    out.push({ q: 'trend', level: d >= 0 ? 'ok' : 'bad', text: L(`Sales ${d >= 0 ? 'up' : 'down'} ${fmtPct(Math.abs(d))}`, `المبيعات ${d >= 0 ? 'ارتفعت' : 'انخفضت'} ${fmtPct(Math.abs(d))}`) });
  }
  if (n.revenue || n.expense) out.push({ q: 'profit', level: n.net >= 0 ? 'ok' : 'bad', text: L(`Net profit ${M(n.net)}`, `صافي الربح ${M(n.net)}`) });
  if (low) out.push({ q: 'restock', level: 'bad', text: L(`${low} to restock`, `${low} بحاجة لإعادة التخزين`) });
  if (soon) out.push({ q: 'runout', level: 'warn', text: L(`${soon} run out within a week`, `${soon} ستنفد خلال أسبوع`) });
  if (belowCost) out.push({ q: 'lowmargin', level: 'bad', text: L(`${belowCost} priced below cost`, `${belowCost} سعرها أقل من التكلفة`) });
  if (dead.length) out.push({ q: 'dead', level: 'warn', text: L(`${dead.length} not selling (30 days)`, `${dead.length} لا تُباع (30 يوماً)`) });
  if (debt > 0) out.push({ q: 'debts', level: 'warn', text: L(`${M(debt)} owed to you`, `${M(debt)} ديون لك`) });
  const refunds = -ctx.sum(ctx.P.filter((s) => s.type === 'refund' && !s.exchange), (s) => s.total);
  if (refunds > 0) out.push({ q: 'refunds', level: refunds > n.revenue * 0.05 ? 'bad' : 'warn', text: L(`${M(refunds)} refunded`, `${M(refunds)} مسترجع`) });
  if (!out.length) out.push({ q: 'revenue', level: 'ok', text: L('All quiet — nothing needs attention', 'كل شيء هادئ — لا شيء يحتاج انتباهك') });
  return out;
}

/* ---------------- the page ---------------- */
Views.assistant = async (root) => {
  if (!App.isAdmin()) { root.innerHTML = '<div class="card">Only an admin can use the AI Assistant.</div>'; return; }
  const state = { preset: '30d', ...UI.rangeOf('30d') };
  let ctx = null;
  const groups = [...new Set(QUESTIONS.map((q) => q.group))];
  const GROUP_LABEL = { Money: 'Money', Products: 'Products & stock', Timing: 'When I sell', People: 'Staff & customers', Leaks: 'Where money leaks' };

  root.innerHTML = `
    <div class="page-head"><div><h1>AI Assistant</h1>
      <div class="sub">Tap a question — the assistant reads your live sales, stock, expenses and customers and answers it.</div></div>
      <div class="row" style="gap:8px"><button class="btn primary" id="ai_all">🩺 Full check-up</button><button class="btn ghost" id="ai_clear">Clear chat</button></div></div>
    ${UI.dateFilterHTML('30d')}
    <div class="card ai-watch"><div class="card-head"><h3>🛰️ Tracking now</h3><span class="tiny muted" id="ai_upd"></span></div><div class="ai-alerts" id="ai_alerts"></div></div>
    <div class="ai-layout">
      <div class="card ai-qs">${groups.map((g) => `<div class="ai-group"><div class="ai-gl">${GROUP_LABEL[g] || g}</div>
        ${QUESTIONS.filter((q) => q.group === g).map((q) => `<button class="ai-q" data-q="${q.id}"><span class="ai-qi">${q.icon}</span><span>${q.q}</span></button>`).join('')}</div>`).join('')}</div>
      <div class="ai-chat" id="ai_chat"><div class="card ai-empty" id="ai_empty"><div style="font-size:42px">🤖</div>
        <h3>Ask me anything on the left</h3><p class="muted tiny">${QUESTIONS.length} questions ready. Every answer uses the period picked above.</p></div></div>
    </div>`;

  const chat = root.querySelector('#ai_chat');
  const load = async () => {
    ctx = await aiContext(state);
    const lbl = UI.rangeLabel(state);
    const sum = root.querySelector('#df_summary');
    if (sum) sum.innerHTML = `<b>${lbl.name}</b> · ${lbl.span} · ${UI.num(ctx.P.length)} <span>${L('records', 'سجل')}</span>`;
    root.querySelector('#ai_upd').textContent = L('Updated ', 'آخر تحديث ') + new Date().toLocaleTimeString(App.lang === 'ar' ? 'ar' : undefined, { hour: '2-digit', minute: '2-digit' });
    root.querySelector('#ai_alerts').innerHTML = aiAlerts(ctx).map((a) =>
      `<button class="ai-alert ${a.level}" data-q="${a.q}">${a.text}</button>`).join('');
    App.translate(root.querySelector('#ai_alerts'));
  };

  const ask = (id, quiet) => {
    const q = QUESTIONS.find((x) => x.id === id); if (!q || !ctx) return;
    const empty = root.querySelector('#ai_empty'); if (empty) empty.remove();
    let html;
    try { html = q.run(ctx); } catch (e) { console.error(e); html = warn('Could not work this one out: ' + UI.esc(e.message)); }
    const lbl = UI.rangeLabel(state);
    const el = document.createElement('div');
    el.className = 'ai-turn';
    el.innerHTML = `<div class="ai-me"><span>${q.q}</span></div>
      <div class="ai-bot"><div class="ai-av">🤖</div><div class="ai-ans card"><div class="tiny muted ai-period">${lbl.name} · ${lbl.span}</div>${html}</div></div>`;
    chat.appendChild(el);
    App.translate(el);
    if (!quiet) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return el;
  };

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-q]'); if (t) ask(t.dataset.q);
  });
  root.querySelector('#ai_clear').onclick = () => {
    chat.innerHTML = '<div class="card ai-empty" id="ai_empty"><div style="font-size:42px">🤖</div><h3>Ask me anything on the left</h3></div>';
    App.translate(chat);
  };
  root.querySelector('#ai_all').onclick = () => {
    chat.innerHTML = '';
    const first = ask('profit', true);
    ['trend', 'best', 'restock', 'runout', 'dead', 'lowmargin', 'debts', 'refunds', 'discounts'].forEach((id) => ask(id, true));
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  UI.bindDateFilter(root, state, load);
  await load();
};
})();
