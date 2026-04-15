/* ============================================================
   CAR VAULT — INVOICE MODULE
   Service Invoices (Workshop) + Vehicle Sale Invoices
   ============================================================ */

'use strict';

const COMPANY = {
  name:     'Car Vault',
  line1:    '25 South Mundells',
  city:     'Welwyn Garden City',
  postcode: 'AL71EP',
  phone:    '02036410809',
  email:    'sales@carvaultuk.co.uk'
};

function getNextInvNum() {
  const k = 'cv_inv_counter';
  const n = parseInt(localStorage.getItem(k) || '530') + 1;
  localStorage.setItem(k, n);
  return n;
}

// ============================================================
// ===== INVOICES PAGE =====
// ============================================================
async function renderInvoices() {
  const content = document.getElementById('pageContent');
  showLoading('Loading invoice data...');
  const [ws, sales] = await Promise.all([dbGet('workshop'), dbGet('sales')]);
  _workshopCache = ws;
  _salesCache    = sales;
  hideLoading();

  content.innerHTML = `
    <div class="section-header">
      <h2>🧾 Invoice Generator</h2>
      <div class="section-actions">
        <button class="btn btn-primary" onclick="openServiceInvModal()">
          <i class="fas fa-tools"></i> New Service Invoice
        </button>
        <button class="btn btn-secondary" onclick="openSaleInvModal()">
          <i class="fas fa-car"></i> New Sale Invoice
        </button>
      </div>
    </div>

    <div class="invoice-types-grid">
      <!-- SERVICE INVOICES -->
      <div class="invoice-type-card">
        <div class="inv-type-header">
          <div class="inv-type-icon amber-bg">🔧</div>
          <div>
            <h3>Workshop Service Invoices</h3>
            <p class="inv-type-sub">Labour, parts & servicing — customer pays for repairs</p>
          </div>
        </div>
        ${ws.length ? `
        <table class="data-table" style="margin-top:14px">
          <thead><tr><th>Reg</th><th>Job Description</th><th>Cost</th><th></th></tr></thead>
          <tbody>
            ${ws.slice(0,7).map(j=>`<tr>
              <td><span class="reg-plate">${j.vehicleReg||'—'}</span></td>
              <td><small>${j.mechanicalProblem||'Workshop job'}</small></td>
              <td>£${((parseFloat(j.labourCost||0)+parseFloat(j.partsCost||0))).toLocaleString()}</td>
              <td><button class="btn btn-primary btn-sm" onclick="openServiceInvModal('${j.id}')"><i class="fas fa-file-invoice"></i> Invoice</button></td>
            </tr>`).join('')}
          </tbody>
        </table>` : `<div class="table-empty" style="margin-top:14px"><span class="empty-icon">🔧</span><p>No workshop jobs yet</p></div>`}
        <button class="btn btn-primary inv-full-btn" onclick="openServiceInvModal()">
          <i class="fas fa-plus"></i> Create Blank Service Invoice
        </button>
      </div>

      <!-- SALE INVOICES -->
      <div class="invoice-type-card">
        <div class="inv-type-header">
          <div class="inv-type-icon blue-bg">🚗</div>
          <div>
            <h3>Car Sale Invoices</h3>
            <p class="inv-type-sub">Vehicle purchase receipts — proof of sale for buyer</p>
          </div>
        </div>
        ${sales.length ? `
        <table class="data-table" style="margin-top:14px">
          <thead><tr><th>Reg</th><th>Buyer</th><th>Price</th><th></th></tr></thead>
          <tbody>
            ${sales.slice(0,7).map(s=>`<tr>
              <td><span class="reg-plate">${s.vehicleReg||'—'}</span></td>
              <td>${s.buyerName||'—'}</td>
              <td>£${parseFloat(s.salePrice||0).toLocaleString()}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="openSaleInvModal('${s.id}')"><i class="fas fa-file-invoice"></i> Invoice</button></td>
            </tr>`).join('')}
          </tbody>
        </table>` : `<div class="table-empty" style="margin-top:14px"><span class="empty-icon">🚗</span><p>No sales yet</p></div>`}
        <button class="btn btn-secondary inv-full-btn" onclick="openSaleInvModal()">
          <i class="fas fa-plus"></i> Create Blank Sale Invoice
        </button>
      </div>
    </div>`;
}

// ============================================================
// ===== SERVICE INVOICE MODAL =====
// ============================================================
let _invRowIdx = 0;

function openServiceInvModal(jobId = null) {
  const job = jobId ? (_workshopCache||[]).find(j => j.id === jobId) : null;
  _invRowIdx = 0;

  const pre = [];
  if (job) {
    if (parseFloat(job.labourCost) > 0) pre.push({ d:'Labour', r: parseFloat(job.labourCost), q:1 });
    if (parseFloat(job.partsCost)  > 0) pre.push({ d: job.partsRequired||'Parts & Materials', r: parseFloat(job.partsCost), q:1 });
  }
  if (!pre.length) {
    pre.push({ d:'Labour', r:0, q:1 });
    pre.push({ d:'', r:0, q:1 });
  }

  const num = `CV${getNextInvNum()}`;
  document.getElementById('modalTitle').textContent = '🔧 Create Service Invoice';
  document.getElementById('modalBody').innerHTML = `
    <div class="invoice-form">
      <div class="form-grid">
        <div class="form-group"><label>Invoice Number</label>
          <input class="form-control" id="inv_num" value="${num}"></div>
        <div class="form-group"><label>Date</label>
          <input class="form-control" id="inv_date" type="date" value="${today()}"></div>
        <div class="form-group"><label>Customer Name</label>
          <input class="form-control" id="inv_cust" placeholder="e.g. John Smith"></div>
        <div class="form-group"><label>Customer Phone</label>
          <input class="form-control" id="inv_phone" placeholder="e.g. 07712 345678"></div>
        <div class="form-group"><label>Vehicle Make &amp; Model</label>
          <input class="form-control" id="inv_veh" placeholder="e.g. Land Rover Range Rover Sport"></div>
        <div class="form-group"><label>Registration</label>
          <input class="form-control" id="inv_reg" value="${job?.vehicleReg||''}" style="text-transform:uppercase" placeholder="e.g. DK16 WRO"></div>
      </div>

      <div style="margin-top:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <label style="font-weight:700;font-size:13px;color:var(--text-primary)">Line Items</label>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addInvRow()"><i class="fas fa-plus"></i> Add Row</button>
        </div>
        <div class="inv-line-header">
          <span style="flex:3;min-width:0">Description</span>
          <span style="width:90px;text-align:right">Rate (£)</span>
          <span style="width:60px;text-align:center">Qty</span>
          <span style="width:80px;text-align:right">Amount</span>
          <span style="width:36px"></span>
        </div>
        <div id="invRows">
          ${pre.map(p=>buildInvRow(p.d, p.r, p.q)).join('')}
        </div>
      </div>

      <div class="inv-summary-bar">
        <div class="inv-vat-pick">
          <label>VAT Rate:</label>
          <select class="form-control" id="inv_vat" onchange="recalcInv()" style="width:140px">
            <option value="0">No VAT (0%)</option>
            <option value="20" selected>Standard (20%)</option>
            <option value="5">Reduced (5%)</option>
          </select>
        </div>
        <div class="inv-totals-box">
          <div class="inv-tot-row"><span>Subtotal</span><b id="invSub">£0.00</b></div>
          <div class="inv-tot-row"><span id="invVatLbl">VAT (20%)</span><b id="invVatAmt">£0.00</b></div>
          <div class="inv-tot-row grand"><span>TOTAL</span><b id="invGrand">£0.00</b></div>
        </div>
      </div>
    </div>
    <div class="form-footer">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" onclick="doServiceInv()">
        <i class="fas fa-print"></i> Preview &amp; Print PDF
      </button>
    </div>`;
  openModal();
  recalcInv();
}

function buildInvRow(d='', r='', q='1') {
  const idx = _invRowIdx++;
  const amt = (parseFloat(r)||0)*(parseFloat(q)||0);
  return `<div class="inv-item-row" id="invR${idx}">
    <input class="form-control" placeholder="e.g. Labour / Oil Filter" value="${d}" oninput="recalcInv()" style="flex:3;min-width:0">
    <input class="form-control" type="number" step="0.01" placeholder="0.00" value="${r||''}" oninput="recalcInv()" style="width:90px;text-align:right">
    <input class="form-control" type="number" step="0.01" placeholder="1" value="${q||'1'}" oninput="recalcInv()" style="width:60px;text-align:center">
    <span class="inv-row-amt" style="width:80px;text-align:right;font-weight:600;padding:0 6px;line-height:38px;font-size:13px">£${amt.toFixed(2)}</span>
    <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="document.getElementById('invR${idx}').remove();recalcInv()" style="width:36px;flex:none"><i class="fas fa-times"></i></button>
  </div>`;
}

function addInvRow() {
  const el = document.createElement('div');
  el.innerHTML = buildInvRow();
  document.getElementById('invRows').appendChild(el.firstElementChild);
  recalcInv();
}

function recalcInv() {
  let sub = 0;
  document.querySelectorAll('#invRows .inv-item-row').forEach(row => {
    const ins = row.querySelectorAll('input');
    const amt = (parseFloat(ins[1]?.value)||0) * (parseFloat(ins[2]?.value)||0);
    const el  = row.querySelector('.inv-row-amt');
    if (el) el.textContent = `£${amt.toFixed(2)}`;
    sub += amt;
  });
  const vp  = parseFloat(document.getElementById('inv_vat')?.value||0);
  const va  = sub * (vp/100);
  const gr  = sub + va;
  _setIfEl('invSub',    `£${sub.toFixed(2)}`);
  _setIfEl('invVatAmt', `£${va.toFixed(2)}`);
  _setIfEl('invVatLbl', `VAT (${vp}%)`);
  _setIfEl('invGrand',  `£${gr.toFixed(2)}`);
}

function _setIfEl(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function doServiceInv() {
  const items = [];
  document.querySelectorAll('#invRows .inv-item-row').forEach(row => {
    const ins  = row.querySelectorAll('input');
    const desc = ins[0]?.value?.trim();
    const rate = parseFloat(ins[1]?.value)||0;
    const qty  = parseFloat(ins[2]?.value)||0;
    if (desc||rate) items.push({ desc:desc||'—', rate, qty });
  });
  if (!items.length) { toast('Add at least one line item', 'error'); return; }

  const vp = parseFloat(document.getElementById('inv_vat')?.value||0);
  const sub = items.reduce((s,i)=>s+i.rate*i.qty, 0);
  const va  = sub*(vp/100);
  printInvoice({
    type:'service',
    invNum:   document.getElementById('inv_num')?.value  || 'CV000',
    date:     document.getElementById('inv_date')?.value || today(),
    customer: document.getElementById('inv_cust')?.value?.trim() || '—',
    phone:    document.getElementById('inv_phone')?.value?.trim() || '',
    vehicle:  document.getElementById('inv_veh')?.value?.trim() || '',
    reg:      (document.getElementById('inv_reg')?.value||'').toUpperCase(),
    items, sub, vp, va, grand: sub+va
  });
  closeModal();
}

// ============================================================
// ===== SALE INVOICE MODAL =====
// ============================================================
function openSaleInvModal(saleId = null) {
  const s = saleId ? (_salesCache||[]).find(x=>x.id===saleId) : null;
  const num = `SAL${getNextInvNum()}`;

  document.getElementById('modalTitle').textContent = '🚗 Create Car Sale Invoice';
  document.getElementById('modalBody').innerHTML = `
    <div class="invoice-form">
      <div class="form-grid">
        <div class="form-group"><label>Invoice Number</label>
          <input class="form-control" id="sinv_num" value="${num}"></div>
        <div class="form-group"><label>Date</label>
          <input class="form-control" id="sinv_date" type="date" value="${s?.saleDate||today()}"></div>
        <div class="form-group"><label>Buyer Name</label>
          <input class="form-control" id="sinv_buyer" value="${s?.buyerName||''}" placeholder="Full name"></div>
        <div class="form-group"><label>Buyer Phone</label>
          <input class="form-control" id="sinv_phone" placeholder="e.g. 07712 345678"></div>
        <div class="form-group"><label>Buyer Address</label>
          <input class="form-control" id="sinv_addr" placeholder="e.g. 12 High Street, Luton"></div>
        <div class="form-group"><label>Vehicle Make &amp; Model</label>
          <input class="form-control" id="sinv_veh" value="${s?.vehicleDesc||''}" placeholder="e.g. BMW 3 Series 320d M Sport 2020"></div>
        <div class="form-group"><label>Registration</label>
          <input class="form-control" id="sinv_reg" value="${s?.vehicleReg||''}" style="text-transform:uppercase" placeholder="e.g. AB12 CDE"></div>
        <div class="form-group"><label>Colour</label>
          <input class="form-control" id="sinv_colour" placeholder="e.g. Midnight Black"></div>
        <div class="form-group"><label>Mileage at Sale</label>
          <input class="form-control" id="sinv_miles" placeholder="e.g. 45,000"></div>
        <div class="form-group"><label>Payment Method</label>
          <select class="form-control" id="sinv_pay">
            ${['Cash','Finance','Part-Exchange','Bank Transfer','Debit Card'].map(m=>`<option ${s?.paymentMethod?.toLowerCase()===m.toLowerCase()?'selected':''}>${m}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Sale Price (£)</label>
          <input class="form-control" id="sinv_price" type="number" step="0.01" value="${s?.salePrice||''}" placeholder="0.00" oninput="recalcSaleInv()"></div>
        <div class="form-group"><label>VAT</label>
          <select class="form-control" id="sinv_vat" onchange="recalcSaleInv()">
            <option value="0" selected>0% — Private sale</option>
            <option value="20">20% — Trade</option>
          </select></div>
      </div>
      <div class="inv-summary-bar" style="justify-content:flex-end">
        <div class="inv-totals-box">
          <div class="inv-tot-row grand"><span>TOTAL DUE</span><b id="sinvGrand" style="color:var(--accent)">£0.00</b></div>
        </div>
      </div>
    </div>
    <div class="form-footer">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-secondary" onclick="doSaleInv()">
        <i class="fas fa-print"></i> Preview &amp; Print PDF
      </button>
    </div>`;
  openModal();
  recalcSaleInv();
}

function recalcSaleInv() {
  const p = parseFloat(document.getElementById('sinv_price')?.value||0);
  const v = parseFloat(document.getElementById('sinv_vat')?.value||0)/100;
  const el = document.getElementById('sinvGrand');
  if (el) el.textContent = `£${(p*(1+v)).toFixed(2)}`;
}

function doSaleInv() {
  const price = parseFloat(document.getElementById('sinv_price')?.value||0);
  const vp    = parseFloat(document.getElementById('sinv_vat')?.value||0);
  const va    = price*(vp/100);
  const veh   = document.getElementById('sinv_veh')?.value?.trim()||'';
  const reg   = (document.getElementById('sinv_reg')?.value||'').toUpperCase();
  const desc  = [veh, reg ? `Reg: ${reg}` : ''].filter(Boolean).join(' · ');

  printInvoice({
    type:'sale',
    invNum:   document.getElementById('sinv_num')?.value   || 'SAL000',
    date:     document.getElementById('sinv_date')?.value  || today(),
    customer: document.getElementById('sinv_buyer')?.value?.trim() || '—',
    phone:    document.getElementById('sinv_phone')?.value?.trim() || '',
    address:  document.getElementById('sinv_addr')?.value?.trim()  || '',
    vehicle: veh, reg,
    colour:  document.getElementById('sinv_colour')?.value||'',
    mileage: document.getElementById('sinv_miles')?.value||'',
    payment: document.getElementById('sinv_pay')?.value||'Cash',
    items:[{ desc: desc||'Vehicle', rate:price, qty:1 }],
    sub:price, vp, va, grand:price+va
  });
  closeModal();
}

// ============================================================
// ===== PRINT ENGINE =====
// ============================================================
function printInvoice(d) {
  const isSvc = d.type === 'service';
  const dateStr = formatDate(d.date);

  const rows = d.items.map(i=>`
    <tr>
      <td class="tc-d">${i.desc}</td>
      <td class="tc-n">£${i.rate.toFixed(2)}</td>
      <td class="tc-n" style="text-align:center">${i.qty}</td>
      <td class="tc-n"><strong>£${(i.rate*i.qty).toFixed(2)}</strong></td>
    </tr>`).join('');

  const vatRow = d.vp > 0
    ? `<tr><td colspan="3" class="tl">VAT (${d.vp}%)</td><td class="tv">£${d.va.toFixed(2)}</td></tr>` : '';

  const extraBillTo = isSvc ? `
    ${d.vehicle?`<div class="bd">${d.vehicle}</div>`:''}
    ${d.reg?`<div class="bd">📋 Reg: <strong>${d.reg}</strong></div>`:''}
    ${d.phone?`<div class="bd">📞 ${d.phone}</div>`:''}
  ` : `
    ${d.address?`<div class="bd">${d.address}</div>`:''}
    ${d.vehicle?`<div class="bd">${d.vehicle}</div>`:''}
    ${d.reg?`<div class="bd">📋 Reg: <strong>${d.reg}</strong></div>`:''}
    ${d.phone?`<div class="bd">📞 ${d.phone}</div>`:''}
    ${d.mileage?`<div class="bd">Mileage: ${parseInt(d.mileage.replace(/,/g,'')).toLocaleString()} miles</div>`:''}
    ${d.colour?`<div class="bd">Colour: ${d.colour}</div>`:''}
    ${d.payment?`<div class="bd">Payment: ${d.payment}</div>`:''}
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${d.invNum} — Car Vault</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:13px}
.wrap{max-width:780px;margin:0 auto;padding:40px 48px}
/* PRINT CONTROLS */
.no-print{margin-bottom:24px;display:flex;gap:10px;align-items:center}
.btn-print{background:#111;color:#fff;border:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;letter-spacing:.3px}
.btn-close{background:#f1f1f1;color:#333;border:none;padding:11px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
/* HEADER */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid #111;margin-bottom:24px}
.logo-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.logo-sq{width:50px;height:50px;background:#111;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:24px}
.brand{font-size:21px;font-weight:900;letter-spacing:2px;color:#111}
.brand em{color:#f59e0b;font-style:normal}
.co-info{font-size:11.5px;color:#666;line-height:1.85;margin-top:2px}
.meta{text-align:right}
.mlbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:#aaa;display:block;margin-top:9px}
.mval{font-size:13px;color:#333}
.mval.lg{font-size:16px;font-weight:800;color:#111}
.mval.bal{font-size:19px;font-weight:900;color:#111}
/* DIVIDER */
hr{border:none;border-top:1px solid #e5e5e5;margin:20px 0}
/* BILL TO */
.section-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:#aaa;margin-bottom:10px}
.badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;${isSvc?'background:#fff3cd;color:#92400e':'background:#dbeafe;color:#1e40af'}}
.bn{font-size:17px;font-weight:800;color:#111;margin-bottom:4px}
.bd{font-size:12.5px;color:#555;line-height:1.9}
/* TABLE */
table.items{width:100%;border-collapse:collapse;margin-top:20px}
table.items thead th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;padding:4px 8px 9px;border-bottom:2px solid #ddd;text-align:left}
table.items thead th.tc-n{text-align:right}
.tc-d{padding:11px 8px;border-bottom:1px solid #eee;font-size:13px;color:#222}
.tc-n{padding:11px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap;color:#333}
/* TOTALS */
.tots{display:flex;justify-content:flex-end;margin-top:6px}
.tots-inner{min-width:260px}
table.tsub{width:100%;border-collapse:collapse;margin:0}
.tl{font-size:12.5px;color:#666;text-align:right;padding:5px 10px}
.tv{font-size:13px;font-weight:600;text-align:right;padding:5px 10px;white-space:nowrap}
.tgrand .tl,.tgrand .tv{padding-top:12px;border-top:2px solid #222;font-size:15px;font-weight:900;color:#111}
.balbox{background:#f6f6f6;border-radius:7px;padding:14px 16px;margin-top:14px;text-align:right}
.ballbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#aaa}
.balval{font-size:23px;font-weight:900;color:#111;margin-top:3px}
/* FOOTER */
.footer{margin-top:44px;padding-top:16px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#bbb}
.footer strong{color:#888}
@media print{
  .no-print{display:none!important}
  body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Close</button>
    <span style="font-size:12px;color:#aaa;margin-left:8px">Tip: Choose "Save as PDF" in the print dialog</span>
  </div>

  <div class="hdr">
    <div>
      <div class="logo-row">
        <div class="logo-sq">🏠</div>
        <div class="brand">CAR<em>▲</em>VAULT</div>
      </div>
      <div class="co-info">
        <strong>${COMPANY.name}</strong><br>
        ${COMPANY.line1}<br>${COMPANY.city}<br>${COMPANY.postcode}<br>
        ${COMPANY.phone}<br>${COMPANY.email}
      </div>
    </div>
    <div class="meta">
      <span class="mlbl">Invoice No.</span>
      <div class="mval lg">${d.invNum}</div>
      <span class="mlbl">Date</span>
      <div class="mval">${dateStr}</div>
      <span class="mlbl">Due</span>
      <div class="mval">On Receipt</div>
      <span class="mlbl">Balance Due</span>
      <div class="mval bal">GBP £${d.grand.toFixed(2)}</div>
    </div>
  </div>

  <div>
    <div class="section-lbl">Bill To</div>
    <div class="badge">${isSvc?'🔧 Service Invoice':'🚗 Vehicle Sale Receipt'}</div>
    <div class="bn">${d.customer}</div>
    ${extraBillTo}
  </div>

  <table class="items">
    <thead><tr>
      <th>Description</th>
      <th class="tc-n">Rate</th>
      <th class="tc-n" style="text-align:center">Qty</th>
      <th class="tc-n">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="tots">
    <div class="tots-inner">
      <table class="tsub">
        <tr><td class="tl">Subtotal</td><td class="tv">£${d.sub.toFixed(2)}</td></tr>
        ${vatRow}
        <tr class="tgrand"><td class="tl">Total</td><td class="tv">£${d.grand.toFixed(2)}</td></tr>
      </table>
      <div class="balbox">
        <div class="ballbl">Balance Due</div>
        <div class="balval">GBP £${d.grand.toFixed(2)}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    Thank you for your business! &nbsp;·&nbsp;
    <strong>${COMPANY.name}</strong> &nbsp;·&nbsp;
    ${COMPANY.phone} &nbsp;·&nbsp; ${COMPANY.email}
  </div>
</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=860,height=1100,menubar=yes,toolbar=yes');
  if (!w) { toast('Please allow popups for invoice printing', 'error'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
}
