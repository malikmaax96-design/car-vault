/* ============================================================
   CAR VAULT — SUPABASE-POWERED SPA
   Real cloud database. Data syncs across all devices.
   Supabase Project: pqgppnuradtsiipcocpo
   ============================================================ */

'use strict';

// ============================================================
// ===== SUPABASE CONFIGURATION =====
// ============================================================
const SUPABASE_URL = 'https://pqgppnuradtsiipcocpo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWxhYmFzZSIsInJlZmx6InBxZ3BwbnVyYWR0c2lpcGNvY3BvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI2MzAxMjUsImV4cCI6MjA1ODIwNjEyNX0.yCS_u3clZEik5CaEfju5DkY0hqr4qWpqOXZmOakgilE';

let db;
try {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch(e) {
  console.error('Supabase init failed:', e);
}

// ============================================================
// ===== ASYNC DATABASE LAYER =====
// ============================================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function dbGet(entity) {
  try {
    const { data, error } = await db
      .from('cv_records')
      .select('payload')
      .eq('entity', entity)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => r.payload);
  } catch(e) {
    console.error(`dbGet(${entity}) error:`, e);
    return [];
  }
}

async function dbSave(entity, obj) {
  if (!obj.id) obj.id = genId();
  const { error } = await db
    .from('cv_records')
    .upsert(
      { entity, id: obj.id, payload: obj },
      { onConflict: 'entity,id' }
    );
  if (error) throw error;
  return obj;
}

async function dbRemove(entity, id) {
  const { error } = await db
    .from('cv_records')
    .delete()
    .eq('entity', entity)
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// ===== LOADING STATE =====
// ============================================================
function showLoading(text = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadText = document.getElementById('loadingText');
  if (overlay) overlay.style.display = 'flex';
  if (loadText) loadText.textContent = text;
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ============================================================
// ===== DATA CACHES (avoids redundant fetches per page) =====
// ============================================================
let _stockCache     = [];
let _workshopCache  = [];
let _inspCache      = [];
let _salesCache     = [];
let _compCache      = [];

// ============================================================
// ===== ROUTER =====
// ============================================================
let currentPage = 'dashboard';
let activeCharts = {};

function navigate(page) {
  currentPage = page;

  // Destroy existing charts to prevent canvas reuse error
  Object.values(activeCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  activeCharts = {};

  // Update nav active state
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update page title
  const titles = {
    dashboard: 'Dashboard', stock: 'Stock Management',
    workshop: 'Workshop', inspections: 'Inspections',
    sales: 'Sales Records', complaints: 'Complaints',
    reports: 'Reports & Analytics'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[page] || page;

  // Render the page
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = '';
  content.className = 'page-content fade-in';

  const renderers = {
    dashboard:   renderDashboard,
    stock:       renderStock,
    workshop:    renderWorkshop,
    inspections: renderInspections,
    sales:       renderSales,
    complaints:  renderComplaints,
    reports:     renderReports
  };

  if (renderers[page]) {
    renderers[page]().catch(err => {
      hideLoading();
      console.error('Page render error:', err);
      content.innerHTML = `
        <div style="text-align:center;padding:60px;color:var(--red)">
          <i class="fas fa-exclamation-triangle" style="font-size:40px;margin-bottom:16px;display:block"></i>
          <p style="font-size:16px;color:var(--text-secondary)">Failed to load data. Check your internet connection.</p>
          <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('${page}')">
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>`;
    });
  }

  // Close mobile sidebar after navigation
  if (window.innerWidth < 768) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('open');
  }
}

// ============================================================
// ===== DASHBOARD =====
// ============================================================
async function renderDashboard() {
  showLoading('Fetching dashboard data...');
  const [stock, sales, workshop, complaints] = await Promise.all([
    dbGet('stock'), dbGet('sales'), dbGet('workshop'), dbGet('complaints')
  ]);
  hideLoading();

  // Cache for use in other modules
  _stockCache = stock; _salesCache = sales;
  _workshopCache = workshop; _compCache = complaints;

  const available  = stock.filter(v => v.status === 'available').length;
  const inWorkshop = stock.filter(v => v.status === 'workshop').length;
  const reserved   = stock.filter(v => v.status === 'reserved').length;

  const now = new Date();
  const mSales = sales.filter(s => {
    const d = new Date(s.saleDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthRev    = mSales.reduce((s,x) => s + (parseFloat(x.salePrice)||0), 0);
  const monthProfit = mSales.reduce((s,x) => s + (parseFloat(x.profit)||0), 0);
  const pendingJobs = workshop.filter(j => j.status !== 'done').length;
  const openComp    = complaints.filter(c => c.status === 'open').length;

  const content = document.getElementById('pageContent');
  if (!content) return;

  content.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-text">
        <h1>Welcome back, <span>Car Vault</span> 👋</h1>
        <p>Here's a snapshot of your dealership today — ${formatDate(now.toISOString())}</p>
      </div>
      <div class="connection-badge">
        <i class="fas fa-circle" style="font-size:8px"></i>
        Live Database Connected
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card amber">
        <div class="kpi-header"><span class="kpi-label">Total Stock</span><div class="kpi-icon amber"><i class="fas fa-car"></i></div></div>
        <div class="kpi-value">${stock.length}</div>
        <div class="kpi-sub">${available} available · ${inWorkshop} workshop · ${reserved} reserved</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-header"><span class="kpi-label">Month Revenue</span><div class="kpi-icon green"><i class="fas fa-pound-sign"></i></div></div>
        <div class="kpi-value">£${monthRev.toLocaleString()}</div>
        <div class="kpi-sub">${mSales.length} car${mSales.length !== 1 ? 's' : ''} sold this month</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-header"><span class="kpi-label">Month Profit</span><div class="kpi-icon blue"><i class="fas fa-chart-line"></i></div></div>
        <div class="kpi-value">£${monthProfit.toLocaleString()}</div>
        <div class="kpi-sub">Avg £${mSales.length ? Math.round(monthProfit/mSales.length).toLocaleString() : 0} per car</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-header"><span class="kpi-label">Needs Attention</span><div class="kpi-icon red"><i class="fas fa-exclamation-triangle"></i></div></div>
        <div class="kpi-value">${pendingJobs + openComp}</div>
        <div class="kpi-sub">${pendingJobs} pending jobs · ${openComp} open complaints</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card">
        <div class="card-title"><i class="fas fa-chart-bar"></i> Revenue &amp; Profit — Last 6 Months</div>
        <div class="chart-container" style="height:270px"><canvas id="dashSalesChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-circle-half-stroke"></i> Stock Status</div>
        <div class="chart-container" style="height:270px"><canvas id="dashDonutChart"></canvas></div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card">
        <div class="card-title"><i class="fas fa-history"></i> Recent Sales</div>
        ${buildRecentSalesHTML(sales.slice(0, 6))}
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-bell"></i> Live Alerts</div>
        ${buildAlertsHTML(workshop, complaints)}
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    buildSalesChart(sales);
    buildDonutChart(stock);
  });

  updateNavBadges(workshop, complaints);
}

function buildRecentSalesHTML(sales) {
  if (!sales.length) return `<div class="table-empty"><span class="empty-icon">📊</span><p>No sales recorded yet</p></div>`;
  return `
    <table class="data-table" style="min-width:auto">
      <thead><tr><th>Reg</th><th>Buyer</th><th>Date</th><th>Profit</th></tr></thead>
      <tbody>
        ${sales.map(s => {
          const profit = parseFloat(s.profit || 0);
          return `<tr>
            <td><span class="reg-plate">${s.vehicleReg||'—'}</span></td>
            <td>${s.buyerName||'—'}</td>
            <td>${formatDate(s.saleDate)}</td>
            <td class="${profit>=0?'profit-positive':'profit-negative'}">£${Math.abs(profit).toLocaleString()}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function buildAlertsHTML(workshop, complaints) {
  const alerts = [];
  workshop.filter(j => j.status !== 'done').slice(0, 4).forEach(j => {
    alerts.push({ type:'warning', icon:'fa-wrench', title:`Workshop: ${j.vehicleReg||'Unknown'}`, desc: j.workRequired||'Repair pending' });
  });
  complaints.filter(c => c.status === 'open').slice(0, 3).forEach(c => {
    alerts.push({ type:'danger', icon:'fa-user-times', title:`Complaint: ${c.customerName||'Unknown'}`, desc: c.issue||'Issue reported' });
  });
  if (!alerts.length) return `<div class="table-empty"><span class="empty-icon">✅</span><p>All clear — no alerts!</p></div>`;
  return `<div class="alert-list">${alerts.map(a => `
    <div class="alert-item ${a.type}">
      <i class="fas ${a.icon} alert-icon ${a.type}"></i>
      <div><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div>
    </div>`).join('')}</div>`;
}

function buildSalesChart(sales) {
  const ctx = document.getElementById('dashSalesChart');
  if (!ctx) return;
  const months = [], revenues = [], profits = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    months.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    const ms = sales.filter(s => {
      const sd = new Date(s.saleDate);
      return sd.getMonth()===d.getMonth() && sd.getFullYear()===d.getFullYear();
    });
    revenues.push(ms.reduce((s,x)=>s+(parseFloat(x.salePrice)||0),0));
    profits.push(ms.reduce((s,x)=>s+(parseFloat(x.profit)||0),0));
  }
  activeCharts.sales = new Chart(ctx, {
    type:'bar',
    data:{ labels:months, datasets:[
      {label:'Revenue',data:revenues,backgroundColor:'rgba(245,158,11,0.75)',borderColor:'#f59e0b',borderWidth:1,borderRadius:6},
      {label:'Profit', data:profits, backgroundColor:'rgba(16,185,129,0.75)',borderColor:'#10b981',borderWidth:1,borderRadius:6}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b'}},
        y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',callback:v=>'£'+v.toLocaleString()}}
      }}
  });
}

function buildDonutChart(stock) {
  const ctx = document.getElementById('dashDonutChart');
  if (!ctx) return;
  const counts = {
    Available: stock.filter(v=>v.status==='available').length,
    Workshop:  stock.filter(v=>v.status==='workshop').length,
    Sold:      stock.filter(v=>v.status==='sold').length,
    Reserved:  stock.filter(v=>v.status==='reserved').length
  };
  activeCharts.donut = new Chart(ctx, {
    type:'doughnut',
    data:{labels:Object.keys(counts),datasets:[{data:Object.values(counts),backgroundColor:['#10b981','#f59e0b','#3b82f6','#8b5cf6'],borderWidth:2,borderColor:'#111b2e'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'66%',
      plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',padding:14,font:{size:12}}}}}
  });
}

// ============================================================
// ===== STOCK MODULE =====
// ============================================================
let _stockFilter = 'all';
let _stockSearch = '';

async function renderStock() {
  _stockFilter = 'all'; _stockSearch = '';
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>🚗 Vehicle Stock</h2>
      <div class="section-actions">
        <div class="search-bar">
          <i class="fas fa-search"></i>
          <input type="text" id="stockSearchInput" placeholder="Search reg, make, model..." oninput="onStockSearch(this.value)">
        </div>
        <button class="btn btn-primary" onclick="openStockModal()"><i class="fas fa-plus"></i> Add Vehicle</button>
      </div>
    </div>
    <div class="filter-bar">
      <span class="filter-label">Status:</span>
      ${['all','available','workshop','sold','reserved'].map(f =>
        `<button class="filter-btn ${f==='all'?'active':''}" onclick="setStockFilter('${f}')">${capitalize(f)}</button>`
      ).join('')}
    </div>
    <div class="quick-stats" id="stockStats"></div>
    <div class="table-wrapper" id="stockTableWrap">
      <div class="table-empty"><p>Loading stock...</p></div>
    </div>`;

  showLoading('Loading stock...');
  _stockCache = await dbGet('stock');
  hideLoading();
  renderStockTable();
}

function setStockFilter(f) {
  _stockFilter = f;
  document.querySelectorAll('#pageContent .filter-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().toLowerCase() === f);
  });
  renderStockTable();
}

function onStockSearch(val) {
  _stockSearch = val.toLowerCase();
  renderStockTable();
}

function renderStockTable() {
  let stock = [..._stockCache];
  const all = stock;
  if (_stockFilter !== 'all') stock = stock.filter(v => v.status === _stockFilter);
  if (_stockSearch) stock = stock.filter(v =>
    (v.registration||'').toLowerCase().includes(_stockSearch) ||
    (v.make||'').toLowerCase().includes(_stockSearch) ||
    (v.model||'').toLowerCase().includes(_stockSearch)
  );

  const statsEl = document.getElementById('stockStats');
  if (statsEl) {
    const unsoldVal = all.filter(v=>v.status!=='sold').reduce((s,v)=>s+(parseFloat(v.purchasePrice)||0),0);
    statsEl.innerHTML = `
      <div class="quick-stat">Total: <strong>${all.length}</strong></div>
      <div class="quick-stat">Available: <strong>${all.filter(v=>v.status==='available').length}</strong></div>
      <div class="quick-stat">Workshop: <strong>${all.filter(v=>v.status==='workshop').length}</strong></div>
      <div class="quick-stat">Sold: <strong>${all.filter(v=>v.status==='sold').length}</strong></div>
      <div class="quick-stat">Reserved: <strong>${all.filter(v=>v.status==='reserved').length}</strong></div>
      <div class="quick-stat">Stock Value: <strong>£${unsoldVal.toLocaleString()}</strong></div>`;
  }

  const wrap = document.getElementById('stockTableWrap');
  if (!wrap) return;

  if (!stock.length) {
    wrap.innerHTML = `<div class="table-empty"><span class="empty-icon">🚗</span><p>${_stockSearch||_stockFilter!=='all'?'No vehicles match your filter.':'No vehicles in stock — add your first!'}</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Registration</th><th>Make &amp; Model</th><th>Year</th><th>Colour</th>
        <th>Mileage</th><th>Buy Price</th><th>Sale Price</th><th>Profit</th>
        <th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${stock.map(v => {
          const profit = (parseFloat(v.salePrice)||0) - (parseFloat(v.purchasePrice)||0);
          return `<tr>
            <td><span class="reg-plate">${v.registration||'—'}</span></td>
            <td><strong>${v.make||''}</strong> ${v.model||''}</td>
            <td>${v.year||'—'}</td>
            <td>${v.colour||'—'}</td>
            <td>${v.mileage ? parseInt(v.mileage).toLocaleString()+' mi' : '—'}</td>
            <td>£${(parseFloat(v.purchasePrice)||0).toLocaleString()}</td>
            <td>£${(parseFloat(v.salePrice)||0).toLocaleString()}</td>
            <td class="${profit>=0?'profit-positive':'profit-negative'}">${profit>=0?'+':'−'}£${Math.abs(profit).toLocaleString()}</td>
            <td><span class="badge badge-${v.status||'available'}">${capitalize(v.status||'available')}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="openStockModal('${v.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="deleteStock('${v.id}')" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function openStockModal(id = null) {
  const v = id ? _stockCache.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = v ? 'Edit Vehicle' : 'Add New Vehicle';
  document.getElementById('modalBody').innerHTML = `
    <form id="stockForm">
      <div class="form-grid">
        <div class="form-group"><label>Registration *</label>
          <input class="form-control" id="sf_reg" value="${v?.registration||''}" placeholder="e.g. AB12 CDE" required style="text-transform:uppercase"></div>
        <div class="form-group"><label>Make *</label>
          <input class="form-control" id="sf_make" value="${v?.make||''}" placeholder="e.g. BMW, Ford" required></div>
        <div class="form-group"><label>Model *</label>
          <input class="form-control" id="sf_model" value="${v?.model||''}" placeholder="e.g. 3 Series" required></div>
        <div class="form-group"><label>Year</label>
          <input class="form-control" id="sf_year" type="number" value="${v?.year||''}" placeholder="e.g. 2020" min="1980" max="2035"></div>
        <div class="form-group"><label>Colour</label>
          <input class="form-control" id="sf_colour" value="${v?.colour||''}" placeholder="e.g. Midnight Black"></div>
        <div class="form-group"><label>Mileage</label>
          <input class="form-control" id="sf_mileage" type="number" value="${v?.mileage||''}" placeholder="e.g. 45000"></div>
        <div class="form-group"><label>Purchase Price (£)</label>
          <input class="form-control" id="sf_buy" type="number" step="0.01" value="${v?.purchasePrice||''}" placeholder="e.g. 12000"></div>
        <div class="form-group"><label>Asking / Sale Price (£)</label>
          <input class="form-control" id="sf_sell" type="number" step="0.01" value="${v?.salePrice||''}" placeholder="e.g. 15500"></div>
        <div class="form-group"><label>Status</label>
          <select class="form-control" id="sf_status">
            ${['available','workshop','sold','reserved'].map(s=>`<option value="${s}" ${(v?.status||'available')===s?'selected':''}>${capitalize(s)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Date Added</label>
          <input class="form-control" id="sf_date" type="date" value="${v?.dateAdded||today()}"></div>
        <div class="form-group full-width"><label>Notes</label>
          <textarea class="form-control" id="sf_notes" placeholder="Any additional notes...">${v?.notes||''}</textarea></div>
      </div>
      <div class="form-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveStock('${id||''}')">
          <i class="fas fa-save"></i> ${v ? 'Update Vehicle' : 'Add Vehicle'}
        </button>
      </div>
    </form>`;
  openModal();
}

async function saveStock(id) {
  const reg = document.getElementById('sf_reg')?.value?.trim().toUpperCase();
  if (!reg) { toast('Registration is required', 'error'); return; }
  const obj = {
    id: id || genId(),
    registration: reg,
    make:          document.getElementById('sf_make')?.value?.trim()   || '',
    model:         document.getElementById('sf_model')?.value?.trim()  || '',
    year:          document.getElementById('sf_year')?.value           || '',
    colour:        document.getElementById('sf_colour')?.value?.trim() || '',
    mileage:       document.getElementById('sf_mileage')?.value        || '',
    purchasePrice: document.getElementById('sf_buy')?.value            || '',
    salePrice:     document.getElementById('sf_sell')?.value           || '',
    status:        document.getElementById('sf_status')?.value         || 'available',
    dateAdded:     document.getElementById('sf_date')?.value           || today(),
    notes:         document.getElementById('sf_notes')?.value          || ''
  };
  try {
    showLoading('Saving vehicle...');
    await dbSave('stock', obj);
    _stockCache = await dbGet('stock');
    hideLoading();
    closeModal();
    renderStockTable();
    toast(id ? 'Vehicle updated! ✓' : 'Vehicle added! ✓', 'success');
  } catch(e) {
    hideLoading();
    toast('Failed to save vehicle. Try again.', 'error');
    console.error(e);
  }
}

async function deleteStock(id) {
  if (!confirm('Delete this vehicle? This cannot be undone.')) return;
  try {
    showLoading('Deleting...');
    await dbRemove('stock', id);
    _stockCache = _stockCache.filter(v => v.id !== id);
    hideLoading();
    renderStockTable();
    toast('Vehicle deleted', 'info');
  } catch(e) {
    hideLoading();
    toast('Failed to delete. Try again.', 'error');
  }
}

// ============================================================
// ===== WORKSHOP MODULE =====
// ============================================================
let _workshopFilter = 'all';
let _workshopSearch = '';

async function renderWorkshop() {
  _workshopFilter = 'all'; _workshopSearch = '';
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>🔧 Workshop Jobs</h2>
      <div class="section-actions">
        <div class="search-bar"><i class="fas fa-search"></i>
          <input type="text" id="wsSearchInput" placeholder="Search reg, problem..." oninput="onWsSearch(this.value)"></div>
        <button class="btn btn-primary" onclick="openWorkshopModal()"><i class="fas fa-plus"></i> Log Job</button>
      </div>
    </div>
    <div class="filter-bar">
      <span class="filter-label">Status:</span>
      ${['all','pending','in-progress','done'].map(f =>
        `<button class="filter-btn ${f==='all'?'active':''}" onclick="setWsFilter('${f}')">${capitalize(f.replace('-',' '))}</button>`
      ).join('')}
    </div>
    <div class="table-wrapper" id="wsTableWrap"><div class="table-empty"><p>Loading jobs...</p></div></div>`;

  showLoading('Loading workshop...');
  [_workshopCache, _stockCache] = await Promise.all([dbGet('workshop'), dbGet('stock')]);
  hideLoading();
  renderWorkshopTable();
}

function setWsFilter(f) {
  _workshopFilter = f;
  document.querySelectorAll('#pageContent .filter-btn').forEach(b =>
    b.classList.toggle('active', b.textContent.trim().toLowerCase() === f.replace('-',' '))
  );
  renderWorkshopTable();
}

function onWsSearch(val) { _workshopSearch = val.toLowerCase(); renderWorkshopTable(); }

function renderWorkshopTable() {
  let jobs = [..._workshopCache];
  if (_workshopFilter !== 'all') jobs = jobs.filter(j => j.status === _workshopFilter);
  if (_workshopSearch) jobs = jobs.filter(j =>
    (j.vehicleReg||'').toLowerCase().includes(_workshopSearch) ||
    (j.mechanicalProblem||'').toLowerCase().includes(_workshopSearch) ||
    (j.mechanic||'').toLowerCase().includes(_workshopSearch)
  );
  const wrap = document.getElementById('wsTableWrap');
  if (!wrap) return;
  if (!jobs.length) { wrap.innerHTML = `<div class="table-empty"><span class="empty-icon">🔧</span><p>No workshop jobs found.</p></div>`; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Reg</th><th>LWN</th><th>Problem</th><th>Work Required</th>
        <th>Parts</th><th>Mechanic</th><th>Cost</th><th>Date</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${jobs.map(j => {
          const cost = (parseFloat(j.labourCost||0)+parseFloat(j.partsCost||0));
          return `<tr>
            <td><span class="reg-plate">${j.vehicleReg||'—'}</span></td>
            <td><small style="color:var(--text-muted)">${j.lwn||'—'}</small></td>
            <td>${j.mechanicalProblem||'—'}</td>
            <td style="max-width:160px"><small>${j.workRequired||'—'}</small></td>
            <td><small>${j.partsRequired||'—'}</small></td>
            <td>${j.mechanic||'—'}</td>
            <td>£${cost.toLocaleString()}</td>
            <td><small>${formatDate(j.dateLogged)}</small></td>
            <td><span class="badge badge-${(j.status||'pending').replace(' ','-')}">${capitalize((j.status||'pending').replace('-',' '))}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="openWorkshopModal('${j.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="deleteWorkshopJob('${j.id}')" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function openWorkshopModal(id = null) {
  const j = id ? _workshopCache.find(x => x.id === id) : null;
  const stockRegs = _stockCache.map(v => v.registration);
  document.getElementById('modalTitle').textContent = j ? 'Edit Workshop Job' : 'Log New Job';
  document.getElementById('modalBody').innerHTML = `
    <form id="wsForm">
      <div class="form-grid">
        <div class="form-group"><label>Vehicle Reg</label>
          <input class="form-control" id="ws_reg" value="${j?.vehicleReg||''}" style="text-transform:uppercase" placeholder="e.g. AB12 CDE" list="wsRegList">
          <datalist id="wsRegList">${stockRegs.map(r=>`<option value="${r}">`).join('')}</datalist></div>
        <div class="form-group"><label>LWN Number</label>
          <input class="form-control" id="ws_lwn" value="${j?.lwn||''}" placeholder="e.g. LWN001"></div>
        <div class="form-group full-width"><label>Mechanical Problem</label>
          <input class="form-control" id="ws_problem" value="${j?.mechanicalProblem||''}" placeholder="Describe the issue..."></div>
        <div class="form-group full-width"><label>Work Required</label>
          <textarea class="form-control" id="ws_work" placeholder="Work to be carried out...">${j?.workRequired||''}</textarea></div>
        <div class="form-group full-width"><label>Parts Required</label>
          <input class="form-control" id="ws_parts" value="${j?.partsRequired||''}" placeholder="List parts needed..."></div>
        <div class="form-group"><label>Labour Cost (£)</label>
          <input class="form-control" id="ws_labour" type="number" step="0.01" value="${j?.labourCost||''}" placeholder="0"></div>
        <div class="form-group"><label>Parts Cost (£)</label>
          <input class="form-control" id="ws_parts_cost" type="number" step="0.01" value="${j?.partsCost||''}" placeholder="0"></div>
        <div class="form-group"><label>Mechanic / Inspector</label>
          <input class="form-control" id="ws_mechanic" value="${j?.mechanic||''}" placeholder="e.g. MUGHEERA"></div>
        <div class="form-group"><label>Status</label>
          <select class="form-control" id="ws_status">
            ${['pending','in-progress','done'].map(s=>`<option value="${s}" ${(j?.status||'pending')===s?'selected':''}>${capitalize(s.replace('-',' '))}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Date Logged</label>
          <input class="form-control" id="ws_date_logged" type="date" value="${j?.dateLogged||today()}"></div>
        <div class="form-group"><label>Date Completed</label>
          <input class="form-control" id="ws_date_done" type="date" value="${j?.dateCompleted||''}"></div>
      </div>
      <div class="form-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveWorkshopJob('${id||''}')">
          <i class="fas fa-save"></i> ${j ? 'Update Job' : 'Log Job'}
        </button>
      </div>
    </form>`;
  openModal();
}

async function saveWorkshopJob(id) {
  const obj = {
    id:                id || genId(),
    vehicleReg:        (document.getElementById('ws_reg')?.value||'').toUpperCase(),
    lwn:               document.getElementById('ws_lwn')?.value        || '',
    mechanicalProblem: document.getElementById('ws_problem')?.value    || '',
    workRequired:      document.getElementById('ws_work')?.value       || '',
    partsRequired:     document.getElementById('ws_parts')?.value      || '',
    labourCost:        document.getElementById('ws_labour')?.value     || '0',
    partsCost:         document.getElementById('ws_parts_cost')?.value || '0',
    mechanic:          document.getElementById('ws_mechanic')?.value   || '',
    status:            document.getElementById('ws_status')?.value     || 'pending',
    dateLogged:        document.getElementById('ws_date_logged')?.value || today(),
    dateCompleted:     document.getElementById('ws_date_done')?.value  || ''
  };
  try {
    showLoading('Saving...');
    await dbSave('workshop', obj);
    _workshopCache = await dbGet('workshop');
    hideLoading();
    closeModal();
    renderWorkshopTable();
    toast(id ? 'Job updated! ✓' : 'Job logged! ✓', 'success');
  } catch(e) { hideLoading(); toast('Failed to save. Try again.', 'error'); }
}

async function deleteWorkshopJob(id) {
  if (!confirm('Delete this workshop job?')) return;
  try {
    showLoading('Deleting...');
    await dbRemove('workshop', id);
    _workshopCache = _workshopCache.filter(j => j.id !== id);
    hideLoading();
    renderWorkshopTable();
    toast('Job deleted', 'info');
  } catch(e) { hideLoading(); toast('Failed to delete.', 'error'); }
}

// ============================================================
// ===== INSPECTIONS MODULE =====
// ============================================================
let _inspSearch = '';

async function renderInspections() {
  _inspSearch = '';
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>✅ Inspection Log</h2>
      <div class="section-actions">
        <div class="search-bar"><i class="fas fa-search"></i>
          <input type="text" id="inspSearchInput" placeholder="Search reg, inspector..." oninput="onInspSearch(this.value)"></div>
        <button class="btn btn-primary" onclick="openInspModal()"><i class="fas fa-plus"></i> Log Inspection</button>
      </div>
    </div>
    <div class="table-wrapper" id="inspTableWrap"><div class="table-empty"><p>Loading inspections...</p></div></div>`;

  showLoading('Loading inspections...');
  [_inspCache, _stockCache] = await Promise.all([dbGet('inspections'), dbGet('stock')]);
  hideLoading();
  renderInspTable();
}

function onInspSearch(val) { _inspSearch = val.toLowerCase(); renderInspTable(); }

function renderInspTable() {
  let insps = [..._inspCache];
  if (_inspSearch) insps = insps.filter(i =>
    (i.vehicleReg||'').toLowerCase().includes(_inspSearch) ||
    (i.inspector||'').toLowerCase().includes(_inspSearch)
  );
  const wrap = document.getElementById('inspTableWrap');
  if (!wrap) return;
  if (!insps.length) { wrap.innerHTML = `<div class="table-empty"><span class="empty-icon">📋</span><p>No inspections recorded yet.</p></div>`; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Reg</th><th>Date</th><th>Inspector</th>
        <th>Alloy</th><th>Mechanical</th><th>Findings</th><th>Result</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${insps.map(i => `<tr>
          <td><span class="reg-plate">${i.vehicleReg||'—'}</span></td>
          <td>${formatDate(i.inspectionDate)}</td>
          <td>${i.inspector||'—'}</td>
          <td><span class="badge badge-${(i.alloyCondition||'good').toLowerCase()}">${i.alloyCondition||'—'}</span></td>
          <td><span class="badge badge-${(i.mechanicalCondition||'good').toLowerCase()}">${i.mechanicalCondition||'—'}</span></td>
          <td style="max-width:200px"><small style="color:var(--text-secondary)">${i.findings||'—'}</small></td>
          <td><span class="badge badge-${i.result||'pass'}">${capitalize(i.result||'pass')}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm btn-icon" onclick="openInspModal('${i.id}')" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteInsp('${i.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openInspModal(id = null) {
  const insp = id ? _inspCache.find(x => x.id === id) : null;
  const stockRegs = _stockCache.map(v => v.registration);
  document.getElementById('modalTitle').textContent = insp ? 'Edit Inspection' : 'Log Inspection';
  document.getElementById('modalBody').innerHTML = `
    <form id="inspForm">
      <div class="form-grid">
        <div class="form-group"><label>Vehicle Reg</label>
          <input class="form-control" id="insp_reg" value="${insp?.vehicleReg||''}" style="text-transform:uppercase" placeholder="e.g. AB12 CDE" list="inspRegList">
          <datalist id="inspRegList">${stockRegs.map(r=>`<option value="${r}">`).join('')}</datalist></div>
        <div class="form-group"><label>Inspection Date</label>
          <input class="form-control" id="insp_date" type="date" value="${insp?.inspectionDate||today()}"></div>
        <div class="form-group"><label>Inspector Name</label>
          <input class="form-control" id="insp_inspector" value="${insp?.inspector||''}" placeholder="e.g. MUGHEERA"></div>
        <div class="form-group"><label>Result</label>
          <select class="form-control" id="insp_result">
            ${['pass','advisory','fail'].map(r=>`<option value="${r}" ${(insp?.result||'pass')===r?'selected':''}>${capitalize(r)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Alloy Condition</label>
          <select class="form-control" id="insp_alloy">
            ${['Good','Fair','Poor'].map(c=>`<option value="${c}" ${(insp?.alloyCondition||'Good')===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group"><label>Mechanical Condition</label>
          <select class="form-control" id="insp_mech">
            ${['Good','Fair','Poor'].map(c=>`<option value="${c}" ${(insp?.mechanicalCondition||'Good')===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="form-group full-width"><label>Findings / Notes</label>
          <textarea class="form-control" id="insp_findings" placeholder="Describe inspection findings...">${insp?.findings||''}</textarea></div>
      </div>
      <div class="form-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveInsp('${id||''}')">
          <i class="fas fa-save"></i> ${insp ? 'Update' : 'Log Inspection'}
        </button>
      </div>
    </form>`;
  openModal();
}

async function saveInsp(id) {
  const obj = {
    id:                  id || genId(),
    vehicleReg:          (document.getElementById('insp_reg')?.value||'').toUpperCase(),
    inspectionDate:      document.getElementById('insp_date')?.value      || today(),
    inspector:           document.getElementById('insp_inspector')?.value || '',
    result:              document.getElementById('insp_result')?.value     || 'pass',
    alloyCondition:      document.getElementById('insp_alloy')?.value      || 'Good',
    mechanicalCondition: document.getElementById('insp_mech')?.value       || 'Good',
    findings:            document.getElementById('insp_findings')?.value   || ''
  };
  try {
    showLoading('Saving...');
    await dbSave('inspections', obj);
    _inspCache = await dbGet('inspections');
    hideLoading();
    closeModal();
    renderInspTable();
    toast(id ? 'Inspection updated! ✓' : 'Inspection logged! ✓', 'success');
  } catch(e) { hideLoading(); toast('Failed to save.', 'error'); }
}

async function deleteInsp(id) {
  if (!confirm('Delete this inspection?')) return;
  try {
    showLoading('Deleting...');
    await dbRemove('inspections', id);
    _inspCache = _inspCache.filter(i => i.id !== id);
    hideLoading();
    renderInspTable();
    toast('Inspection deleted', 'info');
  } catch(e) { hideLoading(); toast('Failed to delete.', 'error'); }
}

// ============================================================
// ===== SALES MODULE =====
// ============================================================
let _salesSearch = '';

async function renderSales() {
  _salesSearch = '';
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>💰 Sales Records</h2>
      <div class="section-actions">
        <div class="search-bar"><i class="fas fa-search"></i>
          <input type="text" id="salesSearchInput" placeholder="Search buyer, vehicle..." oninput="onSalesSearch(this.value)"></div>
        <button class="btn btn-primary" onclick="openSaleModal()"><i class="fas fa-plus"></i> Record Sale</button>
      </div>
    </div>
    <div class="quick-stats" id="salesStats"></div>
    <div class="table-wrapper" id="salesTableWrap"><div class="table-empty"><p>Loading sales...</p></div></div>`;

  showLoading('Loading sales...');
  [_salesCache, _stockCache] = await Promise.all([dbGet('sales'), dbGet('stock')]);
  hideLoading();
  updateSalesStats();
  renderSalesTable();
}

function updateSalesStats() {
  const statsEl = document.getElementById('salesStats');
  if (!statsEl) return;
  const totalRev    = _salesCache.reduce((s,x)=>s+(parseFloat(x.salePrice)||0),0);
  const totalProfit = _salesCache.reduce((s,x)=>s+(parseFloat(x.profit)||0),0);
  statsEl.innerHTML = `
    <div class="quick-stat">Total Sales: <strong>${_salesCache.length}</strong></div>
    <div class="quick-stat">Revenue: <strong>£${totalRev.toLocaleString()}</strong></div>
    <div class="quick-stat">Profit: <strong style="color:var(--green)">£${totalProfit.toLocaleString()}</strong></div>
    <div class="quick-stat">Avg Profit: <strong>£${_salesCache.length?Math.round(totalProfit/_salesCache.length).toLocaleString():0}</strong></div>`;
}

function onSalesSearch(val) { _salesSearch = val.toLowerCase(); renderSalesTable(); }

function renderSalesTable() {
  let sales = [..._salesCache];
  if (_salesSearch) sales = sales.filter(s =>
    (s.buyerName||'').toLowerCase().includes(_salesSearch) ||
    (s.vehicleReg||'').toLowerCase().includes(_salesSearch) ||
    (s.vehicleDesc||'').toLowerCase().includes(_salesSearch)
  );
  const wrap = document.getElementById('salesTableWrap');
  if (!wrap) return;
  if (!sales.length) { wrap.innerHTML = `<div class="table-empty"><span class="empty-icon">💰</span><p>No sales recorded yet.</p></div>`; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Reg</th><th>Vehicle</th><th>Buyer</th><th>Sale Date</th>
        <th>Buy Price</th><th>Sale Price</th><th>Profit</th><th>Payment</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${sales.map(s => {
          const profit = parseFloat(s.profit||0);
          return `<tr>
            <td><span class="reg-plate">${s.vehicleReg||'—'}</span></td>
            <td><small style="color:var(--text-secondary)">${s.vehicleDesc||'—'}</small></td>
            <td><strong>${s.buyerName||'—'}</strong></td>
            <td>${formatDate(s.saleDate)}</td>
            <td>£${parseFloat(s.purchasePrice||0).toLocaleString()}</td>
            <td><strong>£${parseFloat(s.salePrice||0).toLocaleString()}</strong></td>
            <td class="${profit>=0?'profit-positive':'profit-negative'}">${profit>=0?'+':'−'}£${Math.abs(profit).toLocaleString()}</td>
            <td><span class="badge badge-${(s.paymentMethod||'cash').toLowerCase().replace(' ','-')}">${capitalize(s.paymentMethod||'cash')}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="openSaleModal('${s.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="deleteSale('${s.id}')" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function openSaleModal(id = null) {
  const s = id ? _salesCache.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = s ? 'Edit Sale Record' : 'Record New Sale';
  document.getElementById('modalBody').innerHTML = `
    <form id="saleForm">
      <div class="form-grid">
        <div class="form-group"><label>Vehicle Reg</label>
          <input class="form-control" id="sl_reg" value="${s?.vehicleReg||''}" style="text-transform:uppercase"
            placeholder="e.g. AB12 CDE" list="slRegList" oninput="autoFillSale()">
          <datalist id="slRegList">${_stockCache.map(v=>`<option value="${v.registration}">`).join('')}</datalist></div>
        <div class="form-group"><label>Vehicle Description</label>
          <input class="form-control" id="sl_desc" value="${s?.vehicleDesc||''}" placeholder="e.g. BMW 3 Series 2020"></div>
        <div class="form-group"><label>Buyer Name</label>
          <input class="form-control" id="sl_buyer" value="${s?.buyerName||''}" placeholder="Full name"></div>
        <div class="form-group"><label>Sale Date</label>
          <input class="form-control" id="sl_date" type="date" value="${s?.saleDate||today()}"></div>
        <div class="form-group"><label>Purchase Price (£)</label>
          <input class="form-control" id="sl_buy" type="number" step="0.01" value="${s?.purchasePrice||''}" placeholder="0" oninput="calcProfit()"></div>
        <div class="form-group"><label>Sale Price (£)</label>
          <input class="form-control" id="sl_sell" type="number" step="0.01" value="${s?.salePrice||''}" placeholder="0" oninput="calcProfit()"></div>
        <div class="form-group"><label>Profit (£) — Auto Calculated</label>
          <input class="form-control" id="sl_profit" type="number" step="0.01" value="${s?.profit||''}" readonly style="opacity:0.65;cursor:not-allowed"></div>
        <div class="form-group"><label>Payment Method</label>
          <select class="form-control" id="sl_payment">
            ${['cash','finance','part-exchange'].map(pm=>`<option value="${pm}" ${(s?.paymentMethod||'cash')===pm?'selected':''}>${capitalize(pm.replace('-',' '))}</option>`).join('')}
          </select></div>
        <div class="form-group full-width"><label>Notes</label>
          <textarea class="form-control" id="sl_notes" placeholder="Any additional details...">${s?.notes||''}</textarea></div>
      </div>
      <div class="form-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveSale('${id||''}')">
          <i class="fas fa-save"></i> ${s ? 'Update Sale' : 'Record Sale'}
        </button>
      </div>
    </form>`;
  openModal();
}

function autoFillSale() {
  const reg = document.getElementById('sl_reg')?.value?.toUpperCase();
  const v = _stockCache.find(x => x.registration === reg);
  if (v) {
    const desc = document.getElementById('sl_desc');
    const buy  = document.getElementById('sl_buy');
    const sell = document.getElementById('sl_sell');
    if (desc && !desc.value) desc.value = `${v.make} ${v.model} ${v.year||''}`.trim();
    if (buy  && !buy.value)  buy.value  = v.purchasePrice || '';
    if (sell && !sell.value) sell.value = v.salePrice || '';
    calcProfit();
  }
}

function calcProfit() {
  const buy  = parseFloat(document.getElementById('sl_buy')?.value)  || 0;
  const sell = parseFloat(document.getElementById('sl_sell')?.value) || 0;
  const profEl = document.getElementById('sl_profit');
  if (profEl) profEl.value = (sell - buy).toFixed(2);
}

async function saveSale(id) {
  const reg  = (document.getElementById('sl_reg')?.value||'').toUpperCase();
  const buy  = parseFloat(document.getElementById('sl_buy')?.value)  || 0;
  const sell = parseFloat(document.getElementById('sl_sell')?.value) || 0;
  const obj = {
    id:            id || genId(),
    vehicleReg:    reg,
    vehicleDesc:   document.getElementById('sl_desc')?.value    || '',
    buyerName:     document.getElementById('sl_buyer')?.value   || '',
    saleDate:      document.getElementById('sl_date')?.value    || today(),
    purchasePrice: buy.toString(),
    salePrice:     sell.toString(),
    profit:        (sell - buy).toFixed(2),
    paymentMethod: document.getElementById('sl_payment')?.value || 'cash',
    notes:         document.getElementById('sl_notes')?.value   || ''
  };
  try {
    showLoading('Recording sale...');
    await dbSave('sales', obj);
    if (!id && reg) {
      const v = _stockCache.find(x => x.registration === reg);
      if (v && v.status !== 'sold') {
        v.status = 'sold';
        await dbSave('stock', v);
        _stockCache = await dbGet('stock');
      }
    }
    _salesCache = await dbGet('sales');
    hideLoading();
    closeModal();
    updateSalesStats();
    renderSalesTable();
    toast(id ? 'Sale updated! ✓' : 'Sale recorded! ✓', 'success');
  } catch(e) { hideLoading(); toast('Failed to save.', 'error'); console.error(e); }
}

async function deleteSale(id) {
  if (!confirm('Delete this sale record?')) return;
  try {
    showLoading('Deleting...');
    await dbRemove('sales', id);
    _salesCache = _salesCache.filter(s => s.id !== id);
    hideLoading();
    updateSalesStats();
    renderSalesTable();
    toast('Sale deleted', 'info');
  } catch(e) { hideLoading(); toast('Failed to delete.', 'error'); }
}

// ============================================================
// ===== COMPLAINTS MODULE =====
// ============================================================
let _compFilter = 'all';
let _compSearch = '';

async function renderComplaints() {
  _compFilter = 'all'; _compSearch = '';
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>😤 Complaints Tracker</h2>
      <div class="section-actions">
        <div class="search-bar"><i class="fas fa-search"></i>
          <input type="text" id="compSearchInput" placeholder="Search customer, vehicle..." oninput="onCompSearch(this.value)"></div>
        <button class="btn btn-primary" onclick="openCompModal()"><i class="fas fa-plus"></i> Log Complaint</button>
      </div>
    </div>
    <div class="filter-bar">
      <span class="filter-label">Status:</span>
      ${['all','open','in-progress','resolved'].map(f =>
        `<button class="filter-btn ${f==='all'?'active':''}" onclick="setCompFilter('${f}')">${capitalize(f.replace('-',' '))}</button>`
      ).join('')}
    </div>
    <div class="table-wrapper" id="compTableWrap"><div class="table-empty"><p>Loading complaints...</p></div></div>`;

  showLoading('Loading complaints...');
  _compCache = await dbGet('complaints');
  hideLoading();
  renderCompTable();
}

function setCompFilter(f) {
  _compFilter = f;
  document.querySelectorAll('#pageContent .filter-btn').forEach(b =>
    b.classList.toggle('active', b.textContent.trim().toLowerCase() === f.replace('-',' '))
  );
  renderCompTable();
}

function onCompSearch(val) { _compSearch = val.toLowerCase(); renderCompTable(); }

function renderCompTable() {
  let comps = [..._compCache];
  if (_compFilter !== 'all') comps = comps.filter(c => c.status === _compFilter);
  if (_compSearch) comps = comps.filter(c =>
    (c.customerName||'').toLowerCase().includes(_compSearch) ||
    (c.vehicleReg||'').toLowerCase().includes(_compSearch) ||
    (c.issue||'').toLowerCase().includes(_compSearch)
  );
  const wrap = document.getElementById('compTableWrap');
  if (!wrap) return;
  if (!comps.length) { wrap.innerHTML = `<div class="table-empty"><span class="empty-icon">😊</span><p>No complaints found!</p></div>`; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Customer</th><th>Vehicle</th><th>Date Raised</th>
        <th>Issue</th><th>Status</th><th>Resolved</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${comps.map(c => `<tr>
          <td><strong>${c.customerName||'—'}</strong></td>
          <td><span class="reg-plate">${c.vehicleReg||'—'}</span></td>
          <td>${formatDate(c.dateRaised)}</td>
          <td style="max-width:220px"><small style="color:var(--text-secondary)">${c.issue||'—'}</small></td>
          <td><span class="badge badge-${(c.status||'open').replace(/ /g,'-')}">${capitalize((c.status||'open').replace('-',' '))}</span></td>
          <td>${c.dateResolved ? formatDate(c.dateResolved) : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm btn-icon" onclick="openCompModal('${c.id}')" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteComp('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openCompModal(id = null) {
  const c = id ? _compCache.find(x => x.id === id) : null;
  document.getElementById('modalTitle').textContent = c ? 'Edit Complaint' : 'Log Complaint';
  document.getElementById('modalBody').innerHTML = `
    <form id="compForm">
      <div class="form-grid">
        <div class="form-group"><label>Customer Name</label>
          <input class="form-control" id="co_name" value="${c?.customerName||''}" placeholder="Full name"></div>
        <div class="form-group"><label>Vehicle Reg</label>
          <input class="form-control" id="co_reg" value="${c?.vehicleReg||''}" style="text-transform:uppercase" placeholder="e.g. AB12 CDE"></div>
        <div class="form-group"><label>Date Raised</label>
          <input class="form-control" id="co_date" type="date" value="${c?.dateRaised||today()}"></div>
        <div class="form-group"><label>Status</label>
          <select class="form-control" id="co_status">
            ${['open','in-progress','resolved'].map(s=>`<option value="${s}" ${(c?.status||'open')===s?'selected':''}>${capitalize(s.replace('-',' '))}</option>`).join('')}
          </select></div>
        <div class="form-group full-width"><label>Issue Description</label>
          <textarea class="form-control" id="co_issue" placeholder="Describe the complaint...">${c?.issue||''}</textarea></div>
        <div class="form-group"><label>Date Resolved</label>
          <input class="form-control" id="co_resolved" type="date" value="${c?.dateResolved||''}"></div>
        <div class="form-group full-width"><label>Resolution Notes</label>
          <textarea class="form-control" id="co_resolution" placeholder="How was this resolved?">${c?.resolution||''}</textarea></div>
      </div>
      <div class="form-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="saveComp('${id||''}')">
          <i class="fas fa-save"></i> ${c ? 'Update' : 'Log Complaint'}
        </button>
      </div>
    </form>`;
  openModal();
}

async function saveComp(id) {
  const obj = {
    id:           id || genId(),
    customerName: document.getElementById('co_name')?.value       || '',
    vehicleReg:   (document.getElementById('co_reg')?.value||'').toUpperCase(),
    dateRaised:   document.getElementById('co_date')?.value       || today(),
    status:       document.getElementById('co_status')?.value     || 'open',
    issue:        document.getElementById('co_issue')?.value      || '',
    dateResolved: document.getElementById('co_resolved')?.value   || '',
    resolution:   document.getElementById('co_resolution')?.value || ''
  };
  try {
    showLoading('Saving...');
    await dbSave('complaints', obj);
    _compCache = await dbGet('complaints');
    hideLoading();
    closeModal();
    renderCompTable();
    toast(id ? 'Complaint updated! ✓' : 'Complaint logged! ✓', 'success');
  } catch(e) { hideLoading(); toast('Failed to save.', 'error'); }
}

async function deleteComp(id) {
  if (!confirm('Delete this complaint?')) return;
  try {
    showLoading('Deleting...');
    await dbRemove('complaints', id);
    _compCache = _compCache.filter(c => c.id !== id);
    hideLoading();
    renderCompTable();
    toast('Complaint deleted', 'info');
  } catch(e) { hideLoading(); toast('Failed to delete.', 'error'); }
}

// ============================================================
// ===== REPORTS MODULE =====
// ============================================================
async function renderReports() {
  const content = document.getElementById('pageContent');
  content.innerHTML = `<div class="table-empty"><p>Loading reports...</p></div>`;
  showLoading('Loading reports...');
  const [sales, stock, workshop] = await Promise.all([dbGet('sales'), dbGet('stock'), dbGet('workshop')]);
  hideLoading();

  const totalRev    = sales.reduce((s,x)=>s+(parseFloat(x.salePrice)||0),0);
  const totalProfit = sales.reduce((s,x)=>s+(parseFloat(x.profit)||0),0);
  const stockVal    = stock.filter(v=>v.status!=='sold').reduce((s,x)=>s+(parseFloat(x.purchasePrice)||0),0);
  const wsSpend     = workshop.reduce((s,x)=>s+(parseFloat(x.labourCost||0)+parseFloat(x.partsCost||0)),0);

  content.innerHTML = `
    <div class="section-header">
      <h2>📈 Reports &amp; Analytics</h2>
      <div class="section-actions">
        <button class="btn btn-secondary" onclick="exportCSV('sales')"><i class="fas fa-file-csv"></i> Sales CSV</button>
        <button class="btn btn-secondary" onclick="exportCSV('stock')"><i class="fas fa-file-csv"></i> Stock CSV</button>
        <button class="btn btn-primary" onclick="exportAllData()"><i class="fas fa-download"></i> Full Backup</button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card amber">
        <div class="kpi-header"><span class="kpi-label">All-Time Revenue</span><div class="kpi-icon amber"><i class="fas fa-pound-sign"></i></div></div>
        <div class="kpi-value">£${totalRev.toLocaleString()}</div>
        <div class="kpi-sub">From ${sales.length} total sales</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-header"><span class="kpi-label">All-Time Profit</span><div class="kpi-icon green"><i class="fas fa-chart-line"></i></div></div>
        <div class="kpi-value">£${totalProfit.toLocaleString()}</div>
        <div class="kpi-sub">Avg £${sales.length?Math.round(totalProfit/sales.length).toLocaleString():0} per sale</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-header"><span class="kpi-label">Current Stock Value</span><div class="kpi-icon blue"><i class="fas fa-car"></i></div></div>
        <div class="kpi-value">£${stockVal.toLocaleString()}</div>
        <div class="kpi-sub">${stock.filter(v=>v.status!=='sold').length} vehicles unsold</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-header"><span class="kpi-label">Workshop Spend</span><div class="kpi-icon red"><i class="fas fa-tools"></i></div></div>
        <div class="kpi-value">£${wsSpend.toLocaleString()}</div>
        <div class="kpi-sub">${workshop.length} total jobs</div>
      </div>
    </div>
    <div class="reports-grid">
      <div class="card">
        <div class="card-title"><i class="fas fa-chart-line"></i> Monthly Profit — Last 12 Months</div>
        <div class="chart-container" style="height:260px"><canvas id="profitTrendChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-car"></i> Top Makes Sold</div>
        <div class="chart-container" style="height:260px"><canvas id="makesChart"></canvas></div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    buildProfitTrendChart(sales);
    buildMakesChart(stock);
  });
}

function buildProfitTrendChart(sales) {
  const ctx = document.getElementById('profitTrendChart');
  if (!ctx) return;
  const months = [], profits = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    months.push(d.toLocaleDateString('en-GB', { month: 'short' }));
    profits.push(sales.filter(s => {
      const sd = new Date(s.saleDate);
      return sd.getMonth()===d.getMonth() && sd.getFullYear()===d.getFullYear();
    }).reduce((sum,s)=>sum+(parseFloat(s.profit)||0),0));
  }
  activeCharts.profit = new Chart(ctx, {
    type:'line',
    data:{labels:months,datasets:[{label:'Profit (£)',data:profits,borderColor:'#10b981',backgroundColor:'rgba(16,185,129,0.1)',borderWidth:2.5,fill:true,tension:0.4,pointBackgroundColor:'#10b981',pointBorderColor:'#111b2e',pointBorderWidth:2,pointRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8'}}},
      scales:{x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b'}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',callback:v=>'£'+v.toLocaleString()}}}}
  });
}

function buildMakesChart(stock) {
  const ctx = document.getElementById('makesChart');
  if (!ctx) return;
  const counts = {};
  stock.filter(v=>v.status==='sold').forEach(v => { const m=v.make||'Unknown'; counts[m]=(counts[m]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if (!sorted.length) { ctx.closest('.chart-container').innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)">No sold vehicles yet</div>'; return; }
  const colors=['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'];
  activeCharts.makes = new Chart(ctx, {
    type:'bar',
    data:{labels:sorted.map(x=>x[0]),datasets:[{label:'Cars Sold',data:sorted.map(x=>x[1]),backgroundColor:colors,borderRadius:7}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{color:'#64748b'}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748b',stepSize:1}}}}
  });
}

// ============================================================
// ===== EXPORT ============================================================
async function exportCSV(entity) {
  showLoading('Preparing export...');
  const data = await dbGet(entity);
  hideLoading();
  if (!data.length) { toast('No data to export', 'info'); return; }
  const keys = Object.keys(data[0]);
  const rows = [keys.join(','), ...data.map(row => keys.map(k=>`"${(row[k]||'').toString().replace(/"/g,'""')}"`).join(','))];
  downloadFile(rows.join('\n'), `car-vault-${entity}-${today()}.csv`, 'text/csv');
  toast(`${capitalize(entity)} exported! ✓`, 'success');
}

async function exportAllData() {
  showLoading('Preparing backup...');
  const [stock, workshop, inspections, sales, complaints] = await Promise.all([
    dbGet('stock'), dbGet('workshop'), dbGet('inspections'), dbGet('sales'), dbGet('complaints')
  ]);
  hideLoading();
  const data = { exportDate: new Date().toISOString(), version: '2.0-supabase', stock, workshop, inspections, sales, complaints };
  downloadFile(JSON.stringify(data, null, 2), `car-vault-backup-${today()}.json`, 'application/json');
  toast('Full backup downloaded! ✓', 'success');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// ===== MODAL =====
// ============================================================
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ============================================================
// ===== UTILITIES =====
// ============================================================
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function today() { return new Date().toISOString().split('T')[0]; }

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) { return dateStr; }
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: 'check-circle', error: 'times-circle', info: 'info-circle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i> ${message}`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = '0.4s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 400);
  }, 3200);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const isOpen  = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
}

function updateNavBadges(workshop, complaints) {
  const pendingJobs = (workshop||[]).filter(j => j.status !== 'done').length;
  const openComps   = (complaints||[]).filter(c => c.status === 'open').length;
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.querySelector('.nav-badge')?.remove();
    if (el.dataset.page === 'workshop'   && pendingJobs > 0) el.insertAdjacentHTML('beforeend', `<span class="nav-badge">${pendingJobs}</span>`);
    if (el.dataset.page === 'complaints' && openComps   > 0) el.insertAdjacentHTML('beforeend', `<span class="nav-badge">${openComps}</span>`);
  });
}

// ============================================================
// ===== SEED DEMO DATA (first-time setup) =====
// ============================================================
async function seedDemoData() {
  const existing = await dbGet('stock');
  if (existing.length > 0) return; // Already populated — skip

  showLoading('Setting up demo data for first use...');
  toast('First time setup — loading demo data...', 'info');

  const vehicles = [
    {id:genId(),registration:'AB12CDE',make:'BMW',model:'3 Series',year:'2020',colour:'Midnight Black',mileage:'45000',purchasePrice:'12000',salePrice:'16500',status:'available',dateAdded:'2026-03-01',notes:''},
    {id:genId(),registration:'EF34GHI',make:'Mercedes',model:'C-Class',year:'2019',colour:'Polar White',mileage:'62000',purchasePrice:'14500',salePrice:'19000',status:'workshop',dateAdded:'2026-03-05',notes:''},
    {id:genId(),registration:'JK56LMN',make:'Audi',model:'A4',year:'2021',colour:'Tango Red',mileage:'28000',purchasePrice:'18000',salePrice:'24500',status:'sold',dateAdded:'2026-02-10',notes:''},
    {id:genId(),registration:'OP78QRS',make:'Volkswagen',model:'Golf',year:'2022',colour:'Indium Grey',mileage:'15000',purchasePrice:'13500',salePrice:'17500',status:'available',dateAdded:'2026-03-15',notes:''},
    {id:genId(),registration:'TU90VWX',make:'Ford',model:'Focus',year:'2020',colour:'Electric Blue',mileage:'38000',purchasePrice:'8500',salePrice:'12000',status:'reserved',dateAdded:'2026-03-20',notes:''},
    {id:genId(),registration:'YZ12ABC',make:'Toyota',model:'Corolla',year:'2021',colour:'Pearl White',mileage:'22000',purchasePrice:'11000',salePrice:'15000',status:'sold',dateAdded:'2026-02-22',notes:''},
    {id:genId(),registration:'CD34EFG',make:'Honda',model:'Civic',year:'2022',colour:'Crystal Black',mileage:'18000',purchasePrice:'13000',salePrice:'17000',status:'available',dateAdded:'2026-04-01',notes:''},
    {id:genId(),registration:'GH56IJK',make:'Vauxhall',model:'Astra',year:'2020',colour:'Satin Steel Grey',mileage:'42000',purchasePrice:'7800',salePrice:'11500',status:'sold',dateAdded:'2026-03-25',notes:''},
  ];
  const workshopJobs = [
    {id:genId(),vehicleReg:'EF34GHI',lwn:'LWN001',mechanicalProblem:'Steering noise on full lock',workRequired:'Replace steering rack',partsRequired:'Steering rack assembly',labourCost:'250',partsCost:'420',mechanic:'MUGHEERA',status:'in-progress',dateLogged:'2026-03-06',dateCompleted:''},
    {id:genId(),vehicleReg:'AB12CDE',lwn:'LWN002',mechanicalProblem:'Brake wear indicator light on',workRequired:'Replace front brake pads and discs',partsRequired:'Brake pads + discs set',labourCost:'120',partsCost:'95',mechanic:'MOE',status:'done',dateLogged:'2026-03-10',dateCompleted:'2026-03-11'},
    {id:genId(),vehicleReg:'OP78QRS',lwn:'LWN003',mechanicalProblem:'Right front lever clicking',workRequired:'Inspect and repair CV joint',partsRequired:'CV joint kit',labourCost:'180',partsCost:'85',mechanic:'MUGHEERA',status:'pending',dateLogged:'2026-04-02',dateCompleted:''},
  ];
  const inspections = [
    {id:genId(),vehicleReg:'AB12CDE',inspectionDate:'2026-03-01',inspector:'MUGHEERA',alloyCondition:'Good',mechanicalCondition:'Fair',findings:'Minor brake wear. Front discs near minimum spec. Tyres good all round.',result:'advisory'},
    {id:genId(),vehicleReg:'EF34GHI',inspectionDate:'2026-03-05',inspector:'MUGHEERA',alloyCondition:'Fair',mechanicalCondition:'Poor',findings:'Steering rack noisy on full lock. Urgent replacement needed before sale.',result:'fail'},
    {id:genId(),vehicleReg:'JK56LMN',inspectionDate:'2026-02-10',inspector:'MOE',alloyCondition:'Good',mechanicalCondition:'Good',findings:'Excellent condition throughout. Minor stone chips on bonnet only.',result:'pass'},
  ];
  const salesData = [
    {id:genId(),vehicleReg:'JK56LMN',vehicleDesc:'Audi A4 2021',buyerName:'Ahmed Khan',saleDate:'2026-03-15',purchasePrice:'18000',salePrice:'24500',profit:'6500',paymentMethod:'finance',notes:''},
    {id:genId(),vehicleReg:'YZ12ABC',vehicleDesc:'Toyota Corolla 2021',buyerName:'Sarah Johnson',saleDate:'2026-03-22',purchasePrice:'11000',salePrice:'15000',profit:'4000',paymentMethod:'cash',notes:''},
    {id:genId(),vehicleReg:'GH56IJK',vehicleDesc:'Vauxhall Astra 2020',buyerName:'Mohammed Ali',saleDate:'2026-04-01',purchasePrice:'7800',salePrice:'11500',profit:'3700',paymentMethod:'part-exchange',notes:'Part ex: Ford Fiesta 2018 valued £4000'},
    {id:genId(),vehicleReg:'CD99XYZ',vehicleDesc:'Range Rover Sport 2019',buyerName:'Lisa Brown',saleDate:'2026-02-20',purchasePrice:'28000',salePrice:'35000',profit:'7000',paymentMethod:'finance',notes:''},
    {id:genId(),vehicleReg:'PQ88RST',vehicleDesc:'Mercedes A-Class 2022',buyerName:'Tariq Hussain',saleDate:'2026-04-05',purchasePrice:'16000',salePrice:'21000',profit:'5000',paymentMethod:'cash',notes:''},
  ];
  const complaintsData = [
    {id:genId(),customerName:'Ahmed Khan',vehicleReg:'JK56LMN',dateRaised:'2026-03-20',issue:'Engine warning light (EML) on 5 days after purchase',status:'open',dateResolved:'',resolution:''},
    {id:genId(),customerName:'Lisa Brown',vehicleReg:'CD99XYZ',dateRaised:'2026-02-28',issue:'Air conditioning not working. Car was advertised with working A/C',status:'resolved',dateResolved:'2026-03-05',resolution:'Recharged A/C system at no cost to customer'},
  ];

  await Promise.all(vehicles.map(v => dbSave('stock', v)));
  await Promise.all(workshopJobs.map(j => dbSave('workshop', j)));
  await Promise.all(inspections.map(i => dbSave('inspections', i)));
  await Promise.all(salesData.map(s => dbSave('sales', s)));
  await Promise.all(complaintsData.map(c => dbSave('complaints', c)));

  hideLoading();
  toast('Demo data loaded successfully! ✓', 'success');
}

// ============================================================
// ===== INIT =====
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Current date in header
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  // Navigation click listeners
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // Modal close
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Sidebar overlay close
  document.getElementById('sidebarOverlay')?.addEventListener('click', toggleSidebar);

  // ===== Database connection check =====
  try {
    showLoading('Connecting to database...');
    const { error } = await db.from('cv_records').select('id').limit(1);
    if (error) throw error;
    hideLoading();
    toast('Database connected ✓', 'success');
  } catch(e) {
    hideLoading();
    console.error('DB Connection error:', e);
    toast('⚠️ Database connection failed — check console', 'error');
  }

  // Seed demo data if first run
  await seedDemoData();

  // Navigate to dashboard
  navigate('dashboard');
});
