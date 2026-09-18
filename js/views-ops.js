/* =====================================================================
   MTX GROUP — Views: Inventory, Barcode, Expenses, Customers, Suppliers
   ===================================================================== */

/* ------------------------------ INVENTORY ------------------------------ */
Views.inventory = async (root) => {
  const products = await Store.products();
  const allMoves = (await DB.all('stockMoves')).sort((a, b) => b.ts - a.ts);
  const invValue = products.reduce((s, p) => s + p.cost * p.stock, 0);
  const retailValue = products.reduce((s, p) => s + p.price * p.stock, 0);
  const low = products.filter((p) => p.stock <= (p.minStock || 0));

  /* Stock levels and valuation are what is on the shelf right now, so they sit
     outside the filter — only the movement history is a record over time. */
  const state = { preset: 'all', ...UI.rangeOf('all') };

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Inventory</h1><div class="sub">Stock control, movements & valuation</div></div>
      <div class="row"><button class="btn ghost" id="adjust">⚖ Adjust Stock</button><button class="btn primary" id="stockIn">📥 Stock In</button></div>
    </div>
    <div class="stats" style="margin-bottom:20px">
      <div class="stat"><div class="ico c">📦</div><div class="label">Inventory Value (cost)</div><div class="value mono">${UI.money(invValue)}</div></div>
      <div class="stat"><div class="ico g">🏷</div><div class="label">Retail Value</div><div class="value mono">${UI.money(retailValue)}</div></div>
      <div class="stat"><div class="ico">🔢</div><div class="label">Total Units</div><div class="value mono">${UI.num(products.reduce((s, p) => s + p.stock, 0))}</div></div>
      <div class="stat"><div class="ico r">⚠️</div><div class="label">Low / Out of Stock</div><div class="value mono">${low.length}</div></div>
    </div>
    ${UI.dateFilterHTML(state.preset)}
    <div class="grid" style="grid-template-columns:1.5fr 1fr">
      <div class="card pad0">
        <div class="card-head" style="padding:18px 20px 4px"><h3>Stock Levels <span class="tiny muted" style="font-weight:400">· on the shelf now</span></h3><span class="badge blue">${products.length}</span></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="right">Stock</th><th class="right">Min</th><th>Status</th><th></th></tr></thead>
        <tbody>${products.map((p) => `<tr><td><b>${UI.esc(p.name)}</b></td><td class="right mono">${p.stock}</td><td class="right mono muted">${p.minStock || 0}</td>
          <td><span class="badge ${p.stock <= 0 ? 'red' : p.stock <= (p.minStock || 0) ? 'orange' : 'green'}">${p.stock <= 0 ? 'Out' : p.stock <= (p.minStock || 0) ? 'Low' : 'OK'}</span></td>
          <td class="row" style="gap:4px"><button class="btn sm ghost" data-in="${p.id}">＋</button><button class="btn sm ghost" data-out="${p.id}">−</button></td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="card pad0" id="invMoves"></div>
    </div>`;

  const movesEl = root.querySelector('#invMoves');

  const render = () => {
    const moves = allMoves.filter((m) => UI.inRange(state, m.ts));
    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML =
      `<b>${lbl.name}</b> · ${lbl.span} · ${moves.length} <span>stock movements</span> · <span>stock levels above are current</span>`;

    movesEl.innerHTML = `
        <div class="card-head" style="padding:18px 20px 4px"><h3>Movement History</h3><span class="badge blue">${moves.length}</span></div>
        <div class="table-wrap" style="max-height:520px;overflow-y:auto"><table class="tbl"><thead><tr><th>Item</th><th>Type</th><th class="right">Qty</th><th>Date</th></tr></thead>
        <tbody>${moves.length ? moves.slice(0, 40).map((m) => `<tr><td>${UI.esc(m.product)}</td><td><span class="badge ${m.type === 'in' ? 'green' : m.type === 'out' ? 'orange' : 'blue'}">${m.reason}</span></td>
          <td class="right mono ${m.qty > 0 ? 'text-green' : 'text-red'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="tiny muted">${UI.fmtDT(m.ts)}</td></tr>`).join('')
          : '<tr><td colspan="4" class="muted" style="padding:24px;text-align:center">No movements in this range</td></tr>'}</tbody></table></div>`;
  };

  const move = (id, dir) => stockMoveModal(root, products.find((p) => p.id === id), dir);
  root.querySelectorAll('[data-in]').forEach((b) => b.onclick = () => move(b.dataset.in, 'in'));
  root.querySelectorAll('[data-out]').forEach((b) => b.onclick = () => move(b.dataset.out, 'out'));
  // Opened from the toolbar with nothing chosen — scan or search to pick.
  root.querySelector('#stockIn').onclick = () => stockMoveModal(root, null, 'in');
  root.querySelector('#adjust').onclick = () => stockMoveModal(root, null, 'adjust');

  UI.bindDateFilter(root, state, render);
  render();
};

async function stockMoveModal(root, product, dir) {
  const products = await Store.products();
  const titles = { in: 'Stock In', out: 'Stock Out', adjust: 'Stock Adjustment' };
  const reasons = { in: ['Purchase', 'Return from customer', 'Transfer in'], out: ['Damaged', 'Expired', 'Transfer out', 'Internal use'], adjust: ['Manual correction', 'Recount', 'Theft/Loss'] };
  let selected = product || null;
  UI.modal({
    title: titles[dir],
    body: `<div class="field"><label>Product</label>
        <div class="scan-box"><span>🔎</span><input id="m_scan" placeholder="Scan barcode or search name…" autocomplete="off"></div>
        <div id="m_results" class="scan-results"></div>
        <div id="m_sel" style="margin-top:6px"></div></div>
      <div class="form-grid"><div class="field"><label>${dir === 'adjust' ? 'Set stock to' : 'Quantity'}</label><input class="input mono" id="m_qty" type="number" value="1"></div>
      <div class="field"><label>Reason</label><select class="select" id="m_reason">${reasons[dir].map((r) => `<option>${r}</option>`).join('')}</select></div></div>
      <div class="field"><label>Note</label><input class="input" id="m_note" placeholder="Optional reason / reference"></div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m_ok">Confirm</button>`
  });

  /* Pick the product by scanning it, exactly like the POS and the exchange
     dialog — or type part of the name and click the match. */
  const scanEl = document.getElementById('m_scan');
  const resEl = document.getElementById('m_results');
  const selEl = document.getElementById('m_sel');
  const drawSel = () => {
    selEl.innerHTML = selected
      ? `<div class="list-item picked"><div class="thumb-sm">${selected.icon || '📦'}</div>
          <div class="grow"><b>${UI.esc(selected.name)}</b><div class="tiny muted mono">${selected.barcode || 'no barcode'} · in stock: ${selected.stock}</div></div>
          <button class="icon-btn sm" id="m_clear" title="Choose another" style="border:none">✕</button></div>`
      : '<div class="muted tiny" style="padding:8px">No product chosen — scan one or search by name.</div>';
    const c = document.getElementById('m_clear');
    if (c) c.onclick = () => { selected = null; drawSel(); scanEl.focus(); };
  };
  const pick = (p) => { if (!p) return; selected = p; scanEl.value = ''; resEl.innerHTML = ''; drawSel(); document.getElementById('m_qty').focus(); };
  const match = (q) => products.filter((p) =>
    p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q));
  const drawResults = () => {
    const q = scanEl.value.trim().toLowerCase();
    if (!q) { resEl.innerHTML = ''; return; }
    const hits = match(q).slice(0, 8);
    resEl.innerHTML = hits.length ? hits.map((p) => `<div class="list-item" data-pick="${p.id}" style="cursor:pointer">
        <div class="thumb-sm">${p.icon || '📦'}</div>
        <div class="grow"><b>${UI.esc(p.name)}</b><div class="tiny muted mono">${p.barcode || 'no barcode'} · in stock: ${p.stock}</div></div>
        <b class="mono">${UI.money(p.price)}</b></div>`).join('')
      : '<div class="muted tiny" style="padding:10px">No product found</div>';
    resEl.querySelectorAll('[data-pick]').forEach((el) => el.onclick = () => pick(products.find((x) => x.id === el.dataset.pick)));
  };
  scanEl.addEventListener('input', drawResults);
  scanEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();                        // the scanner ends its burst with Enter
    const code = scanEl.value.trim(); if (!code) return;
    const exact = products.find((p) => (p.barcode || '') === code)
      || products.find((p) => (p.sku || '').toLowerCase() === code.toLowerCase());
    if (exact) return pick(exact);
    const hits = match(code.toLowerCase());
    if (hits.length === 1) return pick(hits[0]);
    if (!hits.length) UI.toast(`No product with barcode ${code}`, 'warn');
  });
  drawSel();
  setTimeout(() => (selected ? document.getElementById('m_qty') : scanEl).focus(), 60);

  document.getElementById('m_ok').onclick = async () => {
    if (!selected) return UI.toast('Scan or search a product first', 'warn');
    const p = await DB.get('products', selected.id);
    let qty = +document.getElementById('m_qty').value || 0;
    const reason = document.getElementById('m_reason').value;
    if (dir === 'out') qty = -Math.abs(qty);
    if (dir === 'adjust') { p.stock = Math.abs(+document.getElementById('m_qty').value); }
    else p.stock = Math.max(0, (p.stock || 0) + qty);
    await DB.put('products', p);
    await DB.put('stockMoves', { id: UI.uid('mv'), ts: Date.now(), product: p.name, qty: dir === 'adjust' ? 0 : qty, reason, type: dir, note: document.getElementById('m_note').value, by: App.user.name });
    Store.bust(); UI.close(); UI.toast('Stock updated'); Views.inventory(root);
  };
}

/* ------------------------------ BARCODE ------------------------------ */
Views.barcode = async (root) => {
  const products = await Store.products();
  const missing = products.filter((p) => !p.barcode);
  const canEdit = App.canEdit('products');
  const size = (await DB.setting('labelSize')) || { w: 40, h: 30 };

  root.innerHTML = `
    <div class="page-head"><div><h1>Barcode Management</h1><div class="sub">Generate, print & scan barcode labels</div></div>
      ${canEdit && missing.length ? `<button class="btn primary" id="genAll">⚙ Generate for ${missing.length} without a barcode</button>` : ''}</div>
    <div class="grid" style="grid-template-columns:1fr 1.4fr">
      <div class="card">
        <h3>Barcode Scanner Test</h3><p class="muted tiny">Connect a USB/Bluetooth scanner (acts as keyboard) and scan into the box, or type a code.</p>
        <div class="field" style="margin-top:12px"><input class="input mono" id="scanIn" placeholder="Scan or type barcode…"></div>
        <div id="scanResult"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3>Generate Barcode</h3><p class="muted tiny">Create one code, or use the button above to fill every product that's missing one. ${missing.length ? `<b>${missing.length}</b> products have no barcode.` : 'All products have a barcode ✓'}</p>
        <div class="row" style="margin-top:10px"><input class="input mono" id="genOut" readonly><button class="btn primary" id="genBtn">Generate</button></div>
      </div>
      <div class="card pad0">
        <div class="card-head" style="padding:16px 18px 2px"><h3>Printable Labels</h3>
          <div class="row" style="gap:8px">
            <button class="btn sm ghost" id="lblSize" title="Set your label sticker size">📐 ${size.w}×${size.h}mm</button>
            <button class="btn sm primary" id="printAll">🖨 Print all shown</button>
          </div>
        </div>
        <div style="padding:6px 18px 10px"><div style="display:flex;gap:8px;align-items:center;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:9px 14px"><span>🔎</span><input id="lblSearch" placeholder="Search a product or barcode to print…" style="border:none;background:transparent;outline:none;width:100%"></div></div>
        <div style="padding:0 12px 16px;max-height:58vh;overflow:auto"><div class="grid" id="labels" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px"></div></div>
      </div>
    </div>`;

  const withBarcode = products.filter((p) => p.barcode);
  const labels = root.querySelector('#labels');
  let filter = '';
  const shown = () => {
    const q = filter.toLowerCase();
    return withBarcode.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q));
  };
  const qtyOf = (id) => +(labels.querySelector(`.lbl-qty[data-id="${id}"]`)?.value) || 1;
  const drawLabels = () => {
    const list = shown();
    labels.innerHTML = list.length ? list.map((p) => `
      <div class="lbl-card">
        <div class="tiny" style="font-weight:700;height:28px;overflow:hidden">${UI.esc(p.name)}</div>
        ${barcodeSVG(p.barcode)}
        <div class="mono" style="font-weight:800;color:var(--primary)">${UI.money(p.price)}</div>
        <div class="row" style="gap:6px;margin-top:8px;justify-content:center">
          <input type="number" min="1" value="1" class="input mono lbl-qty" data-id="${p.id}" style="width:50px;padding:6px;text-align:center" title="Copies to print">
          <button class="btn sm ghost" data-print="${p.id}" title="Print this label">🖨</button>
        </div>
      </div>`).join('') : '<div class="muted" style="padding:30px">No matching products.</div>';
    labels.querySelectorAll('[data-print]').forEach((b) => b.onclick = () => {
      const p = withBarcode.find((x) => x.id === b.dataset.print);
      printLabels([{ name: p.name, barcode: p.barcode, price: p.price, qty: qtyOf(p.id) }], size);
    });
  };
  drawLabels();

  root.querySelector('#lblSearch').oninput = (e) => { filter = e.target.value.trim(); drawLabels(); };
  root.querySelector('#printAll').onclick = () => {
    const list = shown();
    if (!list.length) return UI.toast('Nothing to print', 'warn');
    printLabels(list.map((p) => ({ name: p.name, barcode: p.barcode, price: p.price, qty: qtyOf(p.id) })), size);
  };
  root.querySelector('#lblSize').onclick = () => labelSizeModal(root);

  const scan = root.querySelector('#scanIn');
  const showRes = (code) => {
    const hit = products.find((p) => (p.barcode || '') === code);
    root.querySelector('#scanResult').innerHTML = hit
      ? `<div class="card" style="margin-top:12px;background:var(--primary-soft)"><div class="row"><div class="thumb-sm">${hit.icon}</div><div class="grow"><b>${UI.esc(hit.name)}</b><div class="tiny muted">${hit.sku} · ${hit.stock} in stock</div></div><b class="mono">${UI.money(hit.price)}</b></div></div>`
      : `<div class="badge red" style="margin-top:12px">No product found for "${UI.esc(code)}"</div>`;
  };
  scan.addEventListener('keydown', (e) => { if (e.key === 'Enter') showRes(scan.value.trim()); });
  root.querySelector('#genBtn').onclick = () => { root.querySelector('#genOut').value = genBarcode(products.map((p) => p.barcode)); };

  // Bulk: assign a valid unique EAN-13 to every product that has none.
  const genAll = root.querySelector('#genAll');
  if (genAll) genAll.onclick = () => UI.confirm(`Generate a barcode for ${missing.length} product(s) that don't have one?`, async () => {
    const used = products.map((p) => p.barcode).filter(Boolean);
    for (const p of missing) {
      const code = genBarcode(used);
      used.push(code);
      const rec = await DB.get('products', p.id);
      rec.barcode = code; await DB.put('products', rec);
    }
    Store.bust(); UI.toast(`Generated ${missing.length} barcodes`); Views.barcode(root);
  });
};

/* Real, scannable EAN-13 barcode as SVG.
   95 modules: start guard, 6 left digits (L/G per the leading digit's parity),
   center guard, 6 right digits (R), end guard. Falls back to a plain rendering
   for codes that aren't 13 digits. */
const EAN = {
  L: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
  G: ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
  R: ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
  P: ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
};
function barcodeSVG(code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 13) { // not EAN-13 — show a neutral placeholder
    return `<div class="tiny muted" style="height:52px;display:grid;place-items:center">${code ? 'non-standard code' : 'no barcode'}</div>`;
  }
  let mods = '101'; // start guard
  const parity = EAN.P[+code[0]];
  for (let i = 1; i <= 6; i++) mods += EAN[parity[i - 1]][+code[i]];
  mods += '01010'; // center guard
  for (let i = 7; i <= 12; i++) mods += EAN.R[+code[i]];
  mods += '101'; // end guard

  const uw = 2, h = 58, quiet = 11 * uw;
  const w = quiet * 2 + mods.length * uw;
  let x = quiet, bars = '';
  for (let i = 0; i < mods.length; i++) {
    if (mods[i] === '1') {
      const guard = (i < 3) || (i >= 45 && i < 50) || (i >= mods.length - 3);
      bars += `<rect x="${x}" y="0" width="${uw}" height="${guard ? h : h - 8}" fill="#111"/>`;
    }
    x += uw;
  }
  return `<svg viewBox="0 0 ${w} ${h + 14}" width="100%" style="margin:6px 0;background:#fff;border-radius:4px">
    ${bars}
    <text x="${w / 2}" y="${h + 11}" text-anchor="middle" font-family="monospace" font-size="11" fill="#111">${code}</text>
  </svg>`;
}

/* Print sticker labels — ONE sticker per physical label on the roll, sized to
   the shop's label stock. Prints from an isolated iframe that contains ONLY the
   labels + a matching @page size, so the app's page/CSS can't interfere and the
   browser reliably makes each page exactly the sticker size. */
function printLabels(items, size) {
  const w = Math.max(15, +size.w || 40), h = Math.max(10, +size.h || 30);
  let labels = '';
  items.forEach((it) => {
    const q = Math.max(1, +it.qty || 1);
    // Label shows only the barcode bars + its number (the number is baked into the SVG).
    for (let n = 0; n < q; n++) labels += `<div class="l">${barcodeSVG(it.barcode)}</div>`;
  });
  if (!labels) return UI.toast('Nothing to print', 'warn');

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .l { width: ${w}mm; height: ${h}mm; box-sizing: border-box; overflow: hidden;
         display: flex; align-items: center; justify-content: center; padding: 1mm;
         page-break-after: always; break-after: page; }
    .l:last-child { page-break-after: auto; break-after: auto; }
    .l svg { width: 100%; height: auto; max-height: ${h - 2}mm; }
  </style></head><body>${labels}</body></html>`;

  const ifr = document.createElement('iframe');
  ifr.setAttribute('aria-hidden', 'true');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  ifr.srcdoc = doc;
  ifr.onload = () => {
    try { ifr.contentWindow.focus(); ifr.contentWindow.print(); }
    catch (e) { UI.toast('Print failed — try again', 'err'); }
    setTimeout(() => ifr.remove(), 1500);
  };
  document.body.appendChild(ifr);
}
window.printLabels = printLabels;

/* Set the physical sticker size (mm) for the label printer. */
function labelSizeModal(root) {
  DB.setting('labelSize').then((cur) => {
    cur = cur || { w: 40, h: 30 };
    UI.modal({
      title: 'Label size',
      body: `<p class="tiny muted" style="margin-top:-4px;margin-bottom:12px">Enter the size of ONE sticker on your label roll, in millimetres. Common sizes: 40×30, 50×30, 40×25.</p>
        <div class="form-grid"><div class="field"><label>Width (mm)</label><input class="input mono" id="lz_w" type="number" min="15" value="${cur.w}"></div>
        <div class="field"><label>Height (mm)</label><input class="input mono" id="lz_h" type="number" min="10" value="${cur.h}"></div></div>
        <p class="tiny muted" style="margin-top:8px">In the print dialog, pick your Tysso label printer and set margins to <b>None</b> so the sticker isn't scaled. Keep width ≥ ~35mm so the bars stay scannable.</p>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="lz_ok">Save</button>`
    });
    document.getElementById('lz_ok').onclick = async () => {
      const w = +document.getElementById('lz_w').value || 40, h = +document.getElementById('lz_h').value || 30;
      await DB.setting('labelSize', { w, h }); UI.close(); UI.toast('Label size saved'); Views.barcode(root);
    };
  });
}

/* ------------------------------ CATEGORIES ------------------------------
   Sales performance per category for the chosen date range. Click a category
   to drill into it and see every product's units sold and revenue. */
Views.categories = async (root) => {
  const cats = await Store.categories();
  const products = await Store.products();
  const allSales = await Store.sales();
  const state = { preset: '30d', ...UI.rangeOf('30d') };
  let openCat = null;                                   // null = category list

  const UNCAT = { id: '__none', name: 'Uncategorised', icon: '📦' };
  const catOf = (p) => cats.find((c) => c.id === p.category) || UNCAT;
  const prodById = {}; products.forEach((p) => prodById[p.id] = p);

  root.innerHTML = `
    <div class="page-head"><div><h1>Categories</h1><div class="sub">What each category sold, and every product inside it</div></div></div>
    ${UI.dateFilterHTML(state.preset)}
    <div id="catBody"></div>`;
  const body = root.querySelector('#catBody');

  /* Roll the sales in range up per product, then per category. Revenue is
     net of discounts; refunds come through as negatives so totals stay true. */
  const crunch = () => {
    const sales = allSales.filter((s) => UI.inRange(state, s.ts));
    const perProd = {};
    sales.forEach((s) => (s.items || []).forEach((i) => {
      const net = i.net !== undefined ? i.net : (i.price * i.qty - (i.discAmt || 0));
      const r = perProd[i.id] || (perProd[i.id] = { id: i.id, name: i.name, qty: 0, revenue: 0, disc: 0, cost: 0 });
      r.qty += i.qty; r.revenue += net; r.disc += (i.discAmt || 0); r.cost += (i.cost || 0) * i.qty;
    }));
    const perCat = {};
    const bucket = (c) => perCat[c.id] || (perCat[c.id] = { cat: c, qty: 0, revenue: 0, disc: 0, cost: 0, invValue: 0, prods: [] });
    cats.forEach((c) => bucket(c));            // every category shows, even with no sales
    Object.values(perProd).forEach((r) => {
      const p = prodById[r.id];
      const b = bucket(p ? catOf(p) : UNCAT);
      b.qty += r.qty; b.revenue += r.revenue; b.disc += r.disc; b.cost += r.cost; b.prods.push(r);
    });
    // include products that exist but sold nothing in this range
    products.forEach((p) => {
      const b = bucket(catOf(p));
      if (!b.prods.some((x) => x.id === p.id)) b.prods.push({ id: p.id, name: p.name, qty: 0, revenue: 0, disc: 0, cost: 0 });
    });
    // inventory value: current stock on hand × cost, per category — falls as stock sells
    products.forEach((p) => { bucket(catOf(p)).invValue += (p.cost || 0) * (p.stock || 0); });
    return { sales, perCat };
  };

  const render = () => {
    const { sales, perCat } = crunch();
    const list = Object.values(perCat).sort((a, b) => b.revenue - a.revenue);
    const grand = list.reduce((a, b) => a + b.revenue, 0);
    const units = list.reduce((a, b) => a + b.qty, 0);
    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML =
      `<b>${lbl.name}</b> · ${lbl.span} · ${list.length} <span>categories</span> · ${units} <span>units</span> · ${UI.money(grand)} <span>revenue</span>`;

    if (openCat) {
      const b = perCat[openCat] || { cat: UNCAT, prods: [], qty: 0, revenue: 0, disc: 0, cost: 0, invValue: 0 };
      const rows = b.prods.sort((x, y) => y.revenue - x.revenue);
      const isVirtual = b.cat.id === UNCAT.id;
      const canRename = App.canEdit('categories');
      body.innerHTML = `
        <div class="row" style="gap:10px;margin-bottom:14px;align-items:center">
          <button class="btn ghost sm" id="catBack">← All categories</button>
          <h2 style="margin:0">${b.cat.icon || '🏷'} ${UI.esc(b.cat.name)}</h2>
          ${canRename ? `<button class="btn ghost sm" id="catRename">✏️ ${isVirtual ? 'Name this category' : 'Rename'}</button>` : ''}
        </div>
        <div class="stats" style="margin-bottom:16px">
          <div class="stat"><div class="ico">📦</div><div class="label">Units sold</div><div class="value mono">${UI.num(b.qty)}</div></div>
          <div class="stat"><div class="ico g">💰</div><div class="label">Revenue</div><div class="value mono">${UI.money(b.revenue)}</div></div>
          <div class="stat"><div class="ico c">📈</div><div class="label">Profit</div><div class="value mono text-green">${UI.money(b.revenue - b.cost)}</div></div>
          <div class="stat"><div class="ico">📦</div><div class="label">Inventory value</div><div class="value mono">${UI.money(b.invValue)}</div></div>
          <div class="stat"><div class="ico r">🏷️</div><div class="label">Discounts</div><div class="value mono ${b.disc ? 'text-red' : ''}">${UI.money(b.disc)}</div></div>
        </div>
        <div class="card pad0"><div class="card-head" style="padding:18px 20px 4px"><h3>Products in this category</h3><span class="badge blue">${rows.length}</span></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Product</th><th class="right">Units sold</th><th class="right">Revenue</th><th class="right">Discount</th><th class="right">Profit</th></tr></thead>
          <tbody>${rows.length ? rows.map((r) => `<tr>
            <td><b>${UI.esc(r.name)}</b></td>
            <td class="right mono">${r.qty ? UI.num(r.qty) : '<span class="muted">0</span>'}</td>
            <td class="right mono">${UI.money(r.revenue)}</td>
            <td class="right mono ${r.disc ? 'text-red' : 'muted'}">${r.disc ? '− ' + UI.money(r.disc) : '—'}</td>
            <td class="right mono text-green">${UI.money(r.revenue - r.cost)}</td></tr>`).join('')
            : '<tr><td colspan="5" class="muted">No products in this category</td></tr>'}</tbody>
        </table></div></div>`;
      body.querySelector('#catBack').onclick = () => { openCat = null; render(); };
      const renameBtn = body.querySelector('#catRename');
      if (renameBtn) renameBtn.onclick = () => {
        UI.modal({
          title: isVirtual ? 'Name this category' : 'Rename category',
          body: `<div class="field"><label>Name</label><input class="input" id="renameCatInput" value="${isVirtual ? '' : UI.esc(b.cat.name)}" placeholder="e.g. Beverages"></div>`,
          footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="renameCatSave">Save</button>`
        });
        document.getElementById('renameCatSave').onclick = async () => {
          const n = document.getElementById('renameCatInput').value.trim(); if (!n) return;
          if (isVirtual) {
            // Turn "Uncategorised" into a real category and move every product
            // that was sitting in it (no category set) over to the new one.
            const newCat = { id: UI.uid('c'), name: n, icon: '📦' };
            await DB.put('categories', newCat);
            cats.push(newCat);
            for (const p of products) {
              if (catOf(p).id === UNCAT.id) { p.category = newCat.id; await DB.put('products', p); }
            }
            openCat = newCat.id;
          } else {
            b.cat.name = n; await DB.put('categories', b.cat);
          }
          Store.bust(); UI.close(); render();
        };
      };
      App.translate(body);
      return;
    }

    body.innerHTML = !list.length
      ? `<div class="card" style="text-align:center;padding:48px 20px"><div style="font-size:34px">🏷</div>
          <h3 style="margin-top:10px">No categories yet</h3>
          <p class="muted tiny" style="margin-top:6px">Add categories from the Products screen.</p></div>`
      : `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">
          ${list.map((b) => `
            <div class="card cat-card" data-cat="${b.cat.id}">
              <div class="row between" style="align-items:flex-start">
                <div><div style="font-size:26px">${b.cat.icon || '🏷'}</div>
                  <b style="display:block;margin-top:6px">${UI.esc(b.cat.name)}</b>
                  <div class="tiny muted">${b.prods.length} <span>products</span></div></div>
                <span class="badge ${b.qty ? 'green' : 'gray'}">${UI.num(b.qty)} <span>sold</span></span>
              </div>
              <div class="kv" style="margin-top:12px"><span class="k">Revenue</span><b class="v mono">${UI.money(b.revenue)}</b></div>
              <div class="kv"><span class="k">Profit</span><b class="v mono text-green">${UI.money(b.revenue - b.cost)}</b></div>
              <div class="kv"><span class="k">Inventory value</span><b class="v mono">${UI.money(b.invValue)}</b></div>
              ${b.disc ? `<div class="kv"><span class="k">Discounts</span><b class="v mono text-red">− ${UI.money(b.disc)}</b></div>` : ''}
              <div class="tiny muted" style="margin-top:10px">${grand ? Math.round(b.revenue / grand * 100) : 0}% <span>of revenue</span></div>
            </div>`).join('')}
        </div>`;
    body.querySelectorAll('[data-cat]').forEach((el) => el.onclick = () => { openCat = el.dataset.cat; render(); });
    App.translate(body);
  };

  UI.bindDateFilter(root, state, render);
  render();
};

/* ------------------------------ EXPENSES ------------------------------ */
Views.expenses = async (root) => {
  const all = (await DB.all('expenses')).sort((a, b) => b.ts - a.ts);
  const store = await DB.setting('store');
  const state = { preset: '30d', ...UI.rangeOf('30d') };

  root.innerHTML = `
    <div class="page-head"><div><h1>Expenses</h1><div class="sub">Track every cost of running the business</div></div>
      <div class="row"><button class="btn ghost" id="printExp">🖨 Print</button><button class="btn primary" id="addExp">＋ Add Expense</button></div></div>
    ${UI.dateFilterHTML(state.preset)}
    <div id="expBody"></div>`;

  const body = root.querySelector('#expBody');
  const render = () => {
    const exp = all.filter((e) => UI.inRange(state, e.ts));
    const total = exp.reduce((s, e) => s + e.amount, 0);
    const byCat = {}; exp.forEach((e) => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));
    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML = `<b>${lbl.name}</b> · ${lbl.span} · ${exp.length} <span>expenses</span> · ${UI.money(total)}`;

    body.innerHTML = `
      <div class="stats" style="margin-bottom:20px">
        <div class="stat"><div class="ico o">🧾</div><div class="label">Total in range</div><div class="value mono">${UI.money(total)}</div></div>
        <div class="stat"><div class="ico">📅</div><div class="label">Records</div><div class="value mono">${exp.length}</div></div>
        <div class="stat"><div class="ico c">🔁</div><div class="label">Recurring</div><div class="value mono">${exp.filter((e) => e.recurring).length}</div></div>
        <div class="stat"><div class="ico r">🏷</div><div class="label">Categories</div><div class="value mono">${catRows.length}</div></div>
      </div>
      <div class="grid" style="grid-template-columns:1.5fr 1fr">
        <div class="card pad0"><div class="card-head" style="padding:18px 20px 4px"><h3>Expense Records</h3></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>Category</th><th>Note</th><th>Method</th><th>Date</th><th class="right">Amount</th><th></th></tr></thead>
          <tbody>${exp.length ? exp.map((e) => `<tr><td><span class="badge orange">${UI.esc(e.category)}</span> ${e.recurring ? '<span class="badge gray">🔁</span>' : ''}</td>
            <td class="muted">${UI.esc(e.note || '—')}</td><td>${e.pay}</td><td class="tiny muted">${UI.fmtDate(e.ts)}</td>
            <td class="right mono"><b>${UI.money(e.amount)}</b></td>
            <td class="row" style="gap:4px"><button class="btn sm ghost" data-print="${e.id}">🖨</button><button class="btn sm ghost" data-del="${e.id}">✕</button></td></tr>`).join('')
            : '<tr><td colspan="6" class="muted" style="padding:26px;text-align:center">No expenses in this range</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>By Category</h3></div>${catRows.length ? UI.bars(catRows) : '<div class="muted tiny">No expenses in this range</div>'}</div>
      </div>`;

    body.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => UI.confirm('Delete this expense?', async () => { await DB.del('expenses', b.dataset.del); UI.toast('Deleted', 'info'); Views.expenses(root); }, { danger: true }));
    body.querySelectorAll('[data-print]').forEach((b) => b.onclick = () => printThermal(expenseVoucherHTML(all.find((e) => e.id === b.dataset.print), store)));
    App.translate(body);
  };

  UI.bindDateFilter(root, state, render);
  render();
  root.querySelector('#addExp').onclick = () => expenseForm(root);
  root.querySelector('#printExp').onclick = () => {
    const exp = all.filter((e) => UI.inRange(state, e.ts));
    if (!exp.length) return UI.toast('No expenses in this range to print', 'warn');
    printThermal(expensesReportHTML(exp, UI.rangeLabel(state), store));
  };
};

/* Thermal voucher for a single expense. */
function expenseVoucherHTML(e, store) {
  return thermalDoc(store, 'EXPENSE VOUCHER', `
    ${tRow('Category', UI.esc(e.category))}
    ${tRow('Method', UI.esc(e.pay || '—'))}
    ${tRow('Date', UI.fmtDate(e.ts))}
    ${e.note ? `<div style="margin-top:4px">Note: ${UI.esc(e.note)}</div>` : ''}
    <hr>${tRow('AMOUNT', UI.money(e.amount), true)}`);
}

/* Thermal expenses report for the selected date range. */
function expensesReportHTML(list, lbl, store) {
  const byCat = {}; list.forEach((e) => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
  const total = list.reduce((a, e) => a + e.amount, 0);
  return thermalDoc(store, 'EXPENSES REPORT', `
    <table><thead><tr><th style="text-align:left">Date</th><th style="text-align:left">Category</th><th style="text-align:right">Amt</th></tr></thead>
    <tbody>${list.map((e) => `<tr><td>${UI.fmtDate(e.ts)}</td><td>${UI.esc(e.category)}</td><td style="text-align:right">${UI.money(e.amount)}</td></tr>`).join('')}</tbody></table>
    <hr><div style="font-weight:bold">By category</div>
    ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => tRow(c, UI.money(v))).join('')}
    <hr>${tRow('TOTAL EXPENSES', UI.money(total), true)}
    ${tRow('Records', String(list.length))}`, `${lbl.name} · ${lbl.span}`);
}

function expenseForm(root) {
  const cats = ['Rent', 'Utilities', 'Salaries', 'Maintenance', 'Delivery', 'Supplies', 'Marketing', 'Other'];
  UI.modal({
    title: 'Add Expense',
    body: `<div class="form-grid">
      <div class="field"><label>Category</label><select class="select" id="e_cat">${cats.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Amount (${UI.currency().code})</label><input class="input mono" id="e_amt" type="number" step="${UI.currency().step}" min="0" placeholder="0"></div>
      <div class="field"><label>Payment method</label><select class="select" id="e_pay"><option>Cash</option><option>Card</option><option>Bank Transfer</option></select></div>
      <div class="field"><label>Date</label><input class="input" id="e_date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field full"><label>Note</label><input class="input" id="e_note" placeholder="Description"></div>
      <div class="field full"><label class="row" style="gap:8px"><input type="checkbox" id="e_rec"> Recurring expense</label></div>
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="e_ok">Save</button>`
  });
  document.getElementById('e_ok').onclick = async () => {
    const amt = +document.getElementById('e_amt').value;
    if (!amt) return UI.toast('Enter an amount', 'err');
    await DB.put('expenses', { id: UI.uid('exp'), category: document.getElementById('e_cat').value, amount: amt, pay: document.getElementById('e_pay').value, ts: new Date(document.getElementById('e_date').value).getTime(), note: document.getElementById('e_note').value, recurring: document.getElementById('e_rec').checked });
    UI.close(); UI.toast('Expense saved'); Views.expenses(root);
  };
}

/* ------------------------------ CUSTOMERS ------------------------------ */
Views.customers = async (root) => {
  const custs = await Store.customers();
  const allSales = await Store.sales();
  const totalDebt = custs.reduce((s, c) => s + (c.debt || 0), 0);

  /* The range scopes what each customer SPENT. Debt and points are running
     balances — what they owe and have earned as of now — so they ignore it. */
  const state = { preset: 'all', ...UI.rangeOf('all') };

  root.innerHTML = `
    <div class="page-head"><div><h1>Customers</h1><div class="sub">${custs.length} <span>customers</span> · ${UI.money(totalDebt)} <span>outstanding debt</span></div></div>
      <button class="btn primary" id="addCust">＋ Add Customer</button></div>
    ${UI.dateFilterHTML(state.preset)}
    <div id="custBody"></div>`;

  const body = root.querySelector('#custBody');

  const render = () => {
    const sales = allSales.filter((s) => UI.inRange(state, s.ts));
    const spent = (name) => sales.filter((s) => s.customer === name).reduce((a, s) => a + s.total, 0);
    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML =
      `<b>${lbl.name}</b> · ${lbl.span} · ${sales.length} <span>invoices</span> · <span>spending below is for this range; debt and points are current</span>`;

    body.innerHTML = `
    <div class="card pad0"><div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Customer</th><th>Phone</th><th>Address</th><th class="right">Spent<div class="tiny muted" style="font-weight:400">${lbl.name}</div></th><th class="right">Debt</th><th class="right">Points</th><th></th></tr></thead>
      <tbody>${custs.map((c) => `<tr><td><div class="row"><div class="thumb-sm">👤</div><b>${UI.esc(c.name)}</b></div></td>
        <td class="mono">${UI.esc(c.phone || '—')}</td><td class="muted tiny">${UI.esc(c.address || '—')}</td>
        <td class="right mono">${UI.money(spent(c.name))}</td>
        <td class="right mono">${c.debt ? '<span class="badge red">' + UI.money(c.debt) + '</span>' : '<span class="badge green">Clear</span>'}</td>
        <td class="right mono">${c.points || 0}</td>
        <td class="row" style="gap:4px">${c.debt ? `<button class="btn sm success" data-pay="${c.id}">Pay</button>` : ''}<button class="btn sm ghost" data-edit="${c.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`;

    // Rebound every render — the table above is replaced each time.
    body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => customerForm(root, custs.find((c) => c.id === b.dataset.edit)));
    body.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payDebtModal(root, custs.find((c) => c.id === b.dataset.pay), 'customers'));
  };

  root.querySelector('#addCust').onclick = () => customerForm(root, null);
  UI.bindDateFilter(root, state, render);
  render();
};

function customerForm(root, c) {
  const isNew = !c; c = c || {};
  UI.modal({
    title: isNew ? 'Add Customer' : 'Edit Customer',
    body: `<div class="form-grid">
      <div class="field full"><label>Name *</label><input class="input" id="c_name" value="${UI.esc(c.name || '')}"></div>
      <div class="field"><label>Phone</label><input class="input mono" id="c_phone" value="${UI.esc(c.phone || '')}"></div>
      <div class="field"><label>Loyalty points</label><input class="input mono" id="c_pts" type="number" value="${c.points || 0}"></div>
      <div class="field full"><label>Address</label><input class="input" id="c_addr" value="${UI.esc(c.address || '')}"></div>
      <div class="field full"><label>Notes</label><textarea class="input" id="c_note">${UI.esc(c.notes || '')}</textarea></div>
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="c_ok">Save</button>`
  });
  document.getElementById('c_ok').onclick = async () => {
    const name = document.getElementById('c_name').value.trim(); if (!name) return UI.toast('Name required', 'err');
    await DB.put('customers', { id: c.id || UI.uid('cu'), name, phone: document.getElementById('c_phone').value, address: document.getElementById('c_addr').value, notes: document.getElementById('c_note').value, points: +document.getElementById('c_pts').value || 0, debt: c.debt || 0 });
    Store.bust(); UI.close(); UI.toast('Saved'); Views.customers(root);
  };
}

function payDebtModal(root, entity, store) {
  UI.modal({
    title: 'Record Payment — ' + entity.name,
    body: `<div class="kv"><span class="k">Current balance</span><b class="v mono text-red">${UI.money(entity.debt)}</b></div>
      <div class="field" style="margin-top:12px"><label>Payment amount</label><input class="input mono" id="pd_amt" type="number" value="${entity.debt}"></div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn success" id="pd_ok">Record Payment</button>`
  });
  document.getElementById('pd_ok').onclick = async () => {
    const amt = +document.getElementById('pd_amt').value || 0;
    entity.debt = Math.max(0, (entity.debt || 0) - amt);
    await DB.put(store, entity);
    await DB.put('payments', { id: UI.uid('pmt'), ts: Date.now(), party: entity.name, amount: amt, kind: store === 'customers' ? 'customer_payment' : 'supplier_payment' });
    Store.bust(); UI.close(); UI.toast('Payment recorded'); (store === 'customers' ? Views.customers : Views.suppliers)(root);
  };
}

/* ------------------------------ SUPPLIERS ------------------------------ */
Views.suppliers = async (root) => {
  const sups = await Store.suppliers();
  const products = await Store.products();
  const allPurchases = (await DB.all('purchases')).sort((a, b) => b.ts - a.ts);
  const totalDebt = sups.reduce((s, x) => s + (x.debt || 0), 0);
  const canBuy = App.can('inventory'); // buying stock is an inventory action
  const supName = (id) => (sups.find((s) => s.id === id) || {}).name || '—';
  const linkedCount = (id) => products.filter((p) => p.supplier === id).length; // products auto-linked to this supplier

  /* The range scopes the purchase history. "We Owe" is a running balance —
     what is outstanding today — so the supplier table ignores it. */
  const state = { preset: 'all', ...UI.rangeOf('all') };

  root.innerHTML = `
    <div class="page-head"><div><h1>Suppliers</h1><div class="sub">${sups.length} <span>suppliers</span> · ${UI.money(totalDebt)} <span>payable</span></div></div>
      <div class="row">${canBuy ? '<button class="btn ghost" id="newPO">🧾 New Purchase</button>' : ''}<button class="btn primary" id="addSup">＋ Add Supplier</button></div></div>
    ${UI.dateFilterHTML(state.preset)}
    <div class="card pad0"><div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Supplier</th><th>Company</th><th>Phone</th><th>Products</th><th class="right">We Owe<div class="tiny muted" style="font-weight:400">now</div></th><th></th></tr></thead>
      <tbody>${sups.map((s) => `<tr><td><div class="row"><div class="thumb-sm">🏭</div><b>${UI.esc(s.name)}</b></div></td>
        <td class="muted">${UI.esc(s.company || '—')}</td><td class="mono">${UI.esc(s.phone || '—')}</td>
        <td><span class="badge ${linkedCount(s.id) ? 'blue' : 'gray'}">${linkedCount(s.id)} <span>products</span></span></td>
        <td class="right mono">${s.debt ? '<span class="badge red">' + UI.money(s.debt) + '</span>' : '<span class="badge green">Clear</span>'}</td>
        <td class="row" style="gap:4px"><button class="btn sm ghost" data-account="${s.id}">View</button>${canBuy ? `<button class="btn sm ghost" data-buy="${s.id}">Purchase</button>` : ''}${s.debt ? `<button class="btn sm success" data-pay="${s.id}">Pay</button>` : ''}<button class="btn sm ghost" data-edit="${s.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>

    <div class="card pad0" style="margin-top:18px" id="poHistory"></div>`;

  const poEl = root.querySelector('#poHistory');

  const render = () => {
    const purchases = allPurchases.filter((p) => UI.inRange(state, p.ts));
    const lbl = UI.rangeLabel(state);
    root.querySelector('#df_summary').innerHTML =
      `<b>${lbl.name}</b> · ${lbl.span} · ${purchases.length} <span>purchases</span> · <span>balances above are current</span>`;

    poEl.innerHTML = `
      <div class="card-head" style="padding:18px 20px 4px"><h3>Purchase History</h3><span class="badge blue">${purchases.length}</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Purchase #</th><th>Date</th><th>Supplier</th><th class="right">Items</th><th>Status</th><th class="right">Total</th><th></th></tr></thead>
      <tbody>${purchases.length ? purchases.slice(0, 40).map((p) => `<tr><td><b>P${p.no}</b></td><td class="muted">${UI.fmtDT(p.ts)}</td><td>${UI.esc(supName(p.supplierId))}</td>
        <td class="right mono">${p.items.reduce((a, i) => a + i.qty, 0)}</td>
        <td>${p.paid ? '<span class="badge green">Paid</span>' : '<span class="badge orange">On account</span>'}</td>
        <td class="right mono"><b>${UI.money(p.total)}</b></td>
        <td><button class="btn sm ghost" data-view="${p.id}">View</button></td></tr>`).join('')
        : '<tr><td colspan="7" class="muted" style="padding:24px;text-align:center">No purchases in this range.</td></tr>'}</tbody></table></div>`;

    // Rebound each render — this table is replaced every time.
    poEl.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => purchaseView(allPurchases.find((p) => p.id === b.dataset.view), supName));
  };

  root.querySelector('#addSup').onclick = () => supplierForm(root, null);
  const npo = root.querySelector('#newPO'); if (npo) npo.onclick = () => purchaseModal(root, null);
  root.querySelectorAll('[data-account]').forEach((b) => b.onclick = () => supplierAccount(root, sups.find((s) => s.id === b.dataset.account)));
  root.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => purchaseModal(root, b.dataset.buy));
  root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => supplierForm(root, sups.find((s) => s.id === b.dataset.edit)));
  root.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payDebtModal(root, sups.find((s) => s.id === b.dataset.pay), 'suppliers'));

  UI.bindDateFilter(root, state, render);
  render();
};

/* Supplier account — a full auto-computed ledger for one supplier:
   what we owe, which products we source from them, current stock we hold,
   and sales attribution (units/revenue/profit earned from their products). */
async function supplierAccount(root, s) {
  const allProducts = await Store.products();
  const theirProducts = allProducts.filter((p) => p.supplier === s.id);
  const supplierOf = {}; allProducts.forEach((p) => { supplierOf[p.id] = p.supplier; });
  const sales = await Store.sales();
  const purchases = (await DB.all('purchases')).filter((p) => p.supplierId === s.id).sort((a, b) => b.ts - a.ts);
  const payments = (await DB.all('payments')).filter((p) => p.kind === 'supplier_payment' && p.party === s.name).sort((a, b) => b.ts - a.ts);

  // one pass over every sale line: net units sold per product (refunds carry negative qty),
  // and revenue/cost attributed to THIS supplier's products.
  const soldByProduct = {}; let units = 0, revenue = 0, cogs = 0;
  sales.forEach((sale) => sale.items.forEach((i) => {
    soldByProduct[i.id] = (soldByProduct[i.id] || 0) + i.qty;
    if (supplierOf[i.id] === s.id) { units += i.qty; revenue += i.price * i.qty; cogs += (i.cost || 0) * i.qty; }
  }));
  const profit = revenue - cogs;

  const stockUnits = theirProducts.reduce((a, p) => a + (p.stock || 0), 0);
  const stockCost = theirProducts.reduce((a, p) => a + (p.stock || 0) * (p.cost || 0), 0);
  const purchasedTotal = purchases.reduce((a, p) => a + p.total, 0);
  const paidTotal = payments.reduce((a, p) => a + p.amount, 0);

  UI.modal({
    title: `Supplier Account — ${s.name}`, wide: true,
    body: `
      <div class="tiny muted" style="margin-top:-6px">${UI.esc(s.company || '')}${s.phone ? ' · ' + UI.esc(s.phone) : ''}</div>
      <div class="stats" style="grid-template-columns:repeat(4,1fr);margin:16px 0">
        <div class="stat"><div class="ico r">🧾</div><div class="label">You Owe (Payable)</div><div class="value mono">${UI.money(s.debt || 0)}</div></div>
        <div class="stat"><div class="ico c">📦</div><div class="label">Products from Them</div><div class="value mono">${theirProducts.length}</div><div class="tiny muted">${stockUnits} <span>units in stock</span></div></div>
        <div class="stat"><div class="ico">🏷️</div><div class="label">Stock You Hold (cost)</div><div class="value mono">${UI.money(stockCost)}</div></div>
        <div class="stat"><div class="ico g">💰</div><div class="label">Revenue from Their Products</div><div class="value mono">${UI.money(revenue)}</div><div class="tiny text-green">profit ${UI.money(profit)}</div></div>
      </div>

      <div class="section-title">Products sourced from ${UI.esc(s.name)} (${theirProducts.length})</div>
      <div class="table-wrap" style="max-height:240px;overflow:auto"><table class="tbl">
        <thead><tr><th>Product</th><th class="right">In Stock</th><th class="right">Cost</th><th class="right">Sold</th><th class="right">Stock Value</th></tr></thead>
        <tbody>${theirProducts.length ? theirProducts.map((p) => `<tr><td><b>${UI.esc(p.name)}</b></td>
          <td class="right mono">${p.stock}</td><td class="right mono">${UI.money(p.cost)}</td>
          <td class="right mono">${soldByProduct[p.id] || 0}</td><td class="right mono">${UI.money((p.stock || 0) * (p.cost || 0))}</td></tr>`).join('')
          : '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">No products linked yet — set this supplier on a product to link it here automatically.</td></tr>'}</tbody>
      </table></div>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div class="card" style="box-shadow:none;background:var(--surface-2)">
          <div class="section-title" style="margin-top:0">Buying from them</div>
          <div class="kv"><span class="k">Total purchased</span><b class="v mono">${UI.money(purchasedTotal)}</b></div>
          <div class="kv"><span class="k"># of purchases</span><b class="v mono">${purchases.length}</b></div>
          <div class="kv"><span class="k">Payments made</span><b class="v mono text-green">${UI.money(paidTotal)}</b></div>
          <div class="kv"><span class="k" style="font-weight:700">Currently owed</span><b class="v mono ${s.debt ? 'text-red' : 'text-green'}">${UI.money(s.debt || 0)}</b></div>
        </div>
        <div class="card" style="box-shadow:none;background:var(--surface-2)">
          <div class="section-title" style="margin-top:0">Selling their products</div>
          <div class="kv"><span class="k">Units sold (net)</span><b class="v mono">${units}</b></div>
          <div class="kv"><span class="k">Revenue</span><b class="v mono">${UI.money(revenue)}</b></div>
          <div class="kv"><span class="k">Cost of goods</span><b class="v mono">${UI.money(cogs)}</b></div>
          <div class="kv"><span class="k" style="font-weight:700">Profit earned</span><b class="v mono text-green">${UI.money(profit)}</b></div>
        </div>
      </div>

      ${purchases.length ? `<div class="section-title" style="margin-top:16px">Recent purchases</div>
        <div class="table-wrap" style="max-height:160px;overflow:auto"><table class="tbl"><thead><tr><th>Purchase #</th><th>Date</th><th class="right">Items</th><th>Status</th><th class="right">Total</th></tr></thead>
        <tbody>${purchases.slice(0, 20).map((p) => `<tr><td><b>P${p.no}</b></td><td class="muted">${UI.fmtDT(p.ts)}</td><td class="right mono">${p.items.reduce((a, i) => a + i.qty, 0)}</td><td>${p.paid ? '<span class="badge green">Paid</span>' : '<span class="badge orange">On account</span>'}</td><td class="right mono">${UI.money(p.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}`,
    footer: `${canPayThem(s) ? '<button class="btn success" id="acc_pay" style="margin-right:auto">Record Payment</button>' : ''}
      ${App.can('inventory') ? '<button class="btn ghost" id="acc_buy">🧾 New Purchase</button>' : ''}
      <button class="btn primary" data-close>Close</button>`
  });
  const payBtn = document.getElementById('acc_pay');
  if (payBtn) payBtn.onclick = () => { UI.close(); payDebtModal(root, s, 'suppliers'); };
  const buyBtn = document.getElementById('acc_buy');
  if (buyBtn) buyBtn.onclick = () => { UI.close(); purchaseModal(root, s.id); };
}
function canPayThem(s) { return (s.debt || 0) > 0; }

/* Record a purchase from a supplier: adds stock, logs stock-in movements,
   updates the product's latest cost, and adds to what we owe (unless paid now). */
async function purchaseModal(root, supplierId) {
  const sups = await Store.suppliers();
  const products = (await Store.products()).filter((p) => p.active !== false);
  if (!sups.length) return UI.toast('Add a supplier first', 'warn');
  if (!products.length) return UI.toast('Add products first', 'warn');

  const lines = []; // {id, qty, cost}
  UI.modal({
    title: 'New Purchase', wide: true,
    body: `<div class="form-grid">
        <div class="field"><label>Supplier</label><select class="select" id="po_sup">${sups.map((s) => `<option value="${s.id}" ${s.id === supplierId ? 'selected' : ''}>${UI.esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Payment</label><select class="select" id="po_paid"><option value="0">On account (add to payable)</option><option value="1">Paid now</option></select></div>
      </div>
      <div class="section-title" style="margin-top:6px">Items</div>
      <div class="row" style="gap:8px;align-items:flex-end">
        <div class="field grow" style="margin:0"><label>Product</label><select class="select" id="po_prod">${products.map((p) => `<option value="${p.id}" data-cost="${p.cost}">${UI.esc(p.name)} · stock ${p.stock}</option>`).join('')}</select></div>
        <div class="field" style="margin:0;width:90px"><label>Qty</label><input class="input mono" id="po_qty" type="number" min="1" value="1"></div>
        <div class="field" style="margin:0;width:120px"><label>Unit cost</label><input class="input mono" id="po_cost" type="number" step="${UI.currency().step}" min="0" value="${products[0].cost}"></div>
        <button class="btn primary" id="po_add" style="margin-bottom:14px">Add</button>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Cost</th><th class="right">Subtotal</th><th></th></tr></thead><tbody id="po_body"></tbody></table></div>
      <div class="sum-row total" style="margin-top:12px"><span>Purchase total</span><span class="mono" id="po_total">${UI.money(0)}</span></div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="po_save" disabled>Record Purchase</button>`
  });

  const prodSel = document.getElementById('po_prod');
  const costIn = document.getElementById('po_cost');
  prodSel.onchange = () => { costIn.value = prodSel.selectedOptions[0].dataset.cost; };
  const redraw = () => {
    document.getElementById('po_body').innerHTML = lines.map((l, idx) => {
      const p = products.find((x) => x.id === l.id);
      return `<tr><td>${UI.esc(p.name)}</td><td class="right mono">${l.qty}</td><td class="right mono">${UI.money(l.cost)}</td><td class="right mono">${UI.money(l.qty * l.cost)}</td><td><button class="btn sm ghost" data-rm="${idx}">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">No items added</td></tr>';
    const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);
    document.getElementById('po_total').textContent = UI.money(total);
    document.getElementById('po_save').disabled = lines.length === 0;
    document.querySelectorAll('#po_body [data-rm]').forEach((b) => b.onclick = () => { lines.splice(+b.dataset.rm, 1); redraw(); });
  };
  redraw();
  document.getElementById('po_add').onclick = () => {
    const id = prodSel.value; const qty = Math.max(1, +document.getElementById('po_qty').value || 1); const cost = UI.roundTo(costIn.value);
    const existing = lines.find((l) => l.id === id && l.cost === cost);
    if (existing) existing.qty += qty; else lines.push({ id, qty, cost });
    document.getElementById('po_qty').value = 1; redraw();
  };
  document.getElementById('po_save').onclick = () => processPurchase(root, document.getElementById('po_sup').value, document.getElementById('po_paid').value === '1', lines, products);
}

async function processPurchase(root, supplierId, paid, lines, products) {
  const all = await DB.all('purchases');
  const no = 1000 + all.length + 1;
  const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);
  const items = lines.map((l) => ({ id: l.id, name: (products.find((p) => p.id === l.id) || {}).name, qty: l.qty, cost: l.cost }));

  await DB.put('purchases', {
    id: UI.uid('po'), no, ts: Date.now(), supplierId, items, total, paid,
    by: App.user.name, status: paid ? 'paid' : 'unpaid'
  });

  // add stock, log movement, refresh latest cost
  for (const l of lines) {
    const p = await DB.get('products', l.id);
    if (!p) continue;
    p.stock = (p.stock || 0) + l.qty;
    p.cost = l.cost; // latest purchase cost becomes the product cost
    await DB.put('products', p);
    await DB.put('stockMoves', { id: UI.uid('mv'), ts: Date.now(), product: p.name, qty: l.qty, reason: 'Purchase', type: 'in', note: `PO P${no}`, by: App.user.name });
  }
  // on account -> increase payable
  if (!paid) {
    const sup = await DB.get('suppliers', supplierId);
    if (sup) { sup.debt = (sup.debt || 0) + total; await DB.put('suppliers', sup); }
  }
  Store.bust(); UI.close();
  UI.toast(`Purchase P${no} recorded · ${UI.money(total)}`);
  Views.suppliers(root);
}

function purchaseView(po, supName) {
  UI.modal({
    title: `Purchase P${po.no}`,
    body: `<div class="kv"><span class="k">Supplier</span><b class="v">${UI.esc(supName(po.supplierId))}</b></div>
      <div class="kv"><span class="k">Date</span><b class="v">${new Date(po.ts).toLocaleString()}</b></div>
      <div class="kv"><span class="k">Recorded by</span><b class="v">${UI.esc(po.by || '—')}</b></div>
      <div class="kv"><span class="k">Payment</span><b class="v">${po.paid ? 'Paid' : 'On account'}</b></div>
      <div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Cost</th><th class="right">Subtotal</th></tr></thead>
      <tbody>${po.items.map((i) => `<tr><td>${UI.esc(i.name)}</td><td class="right mono">${i.qty}</td><td class="right mono">${UI.money(i.cost)}</td><td class="right mono">${UI.money(i.qty * i.cost)}</td></tr>`).join('')}</tbody></table></div>
      <div class="sum-row total" style="margin-top:12px"><span>Total</span><span class="mono">${UI.money(po.total)}</span></div>`,
    footer: `<button class="btn primary" data-close>Close</button>`
  });
}

function supplierForm(root, s) {
  const isNew = !s; s = s || {};
  UI.modal({
    title: isNew ? 'Add Supplier' : 'Edit Supplier',
    body: `<div class="form-grid">
      <div class="field"><label>Contact name *</label><input class="input" id="s_name" value="${UI.esc(s.name || '')}"></div>
      <div class="field"><label>Company</label><input class="input" id="s_comp" value="${UI.esc(s.company || '')}"></div>
      <div class="field"><label>Phone</label><input class="input mono" id="s_phone" value="${UI.esc(s.phone || '')}"></div>
      <div class="field"><label>Balance owed</label><input class="input mono" id="s_debt" type="number" value="${s.debt || 0}"></div>
      <div class="field full"><label>Products supplied</label><input class="input" id="s_prod" value="${UI.esc(s.products || '')}"></div>
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="s_ok">Save</button>`
  });
  document.getElementById('s_ok').onclick = async () => {
    const name = document.getElementById('s_name').value.trim(); if (!name) return UI.toast('Name required', 'err');
    await DB.put('suppliers', { id: s.id || UI.uid('s'), name, company: document.getElementById('s_comp').value, phone: document.getElementById('s_phone').value, products: document.getElementById('s_prod').value, debt: +document.getElementById('s_debt').value || 0 });
    Store.bust(); UI.close(); UI.toast('Saved'); Views.suppliers(root);
  };
}
