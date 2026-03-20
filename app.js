'use strict';

/* ============================================================
   DATA LAYER — powered by data/transactions.js & data/products.js
   Edit those files to update what is shown throughout the portal.
   Changes to either file reflect immediately on next page load.
   ============================================================ */
/* Aliases — refreshed by __nexusRender once CSVs are loaded */
let TRANSACTIONS = [];
let BRANDS       = {};
let MODELS       = {};
let ACCESSORIES  = [];
let SOFTWARE     = [];

/* Partner user profile — edit directly here */
const USER = {
  name:        'Marcus Chen',
  initials:    'MC',
  email:       'marcus.chen@techreseller.com',
  company:     'TechReseller Inc.',
  tier:        'Gold Partner',
  tierTarget:  'Platinum',
  tierProgress: 74,
};

/* ── Computed helpers — driven entirely by TRANSACTIONS data ── */
function getYTDRevenue() {
  const year = String(new Date().getFullYear());
  return TRANSACTIONS
    .filter(t => t.start && t.start.startsWith(year) && t.status !== 'cancelled')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}

function getUpcomingRenewals(daysAhead = 60) {
  return TRANSACTIONS
    .filter(t => {
      if (!t.end || t.status !== 'active') return false;
      const d = daysUntil(t.end);
      return d !== null && d >= 0 && d <= daysAhead;
    })
    .map(t => ({ product: t.product, subId: t.subId, daysLeft: daysUntil(t.end), amount: t.amount }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);
}

/* ============================================================
   APPLICATION STATE
   ============================================================ */
const S = {
  page: 'login',
  chatOpen: false,
  chatMessages: [],
  chatTyping: false,
  config: {
    step: 1,
    brand: null,
    model: null,
    cpu: null,
    ram: null,
    storage: null,
    accessories: new Set(),
    software: new Set(),
    qty: 1,
  },
  txFilter: { search:'', type:'all', status:'all' },
  quoteSubmitted: false,
};

/* ============================================================
   UTILITIES
   ============================================================ */
function $id(id) { return document.getElementById(id); }
function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

function fmt$(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function daysUntil(str) {
  if (!str) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(str + 'T00:00:00');
  return Math.round((end - now) / 86400000);
}

function today() {
  return new Date().toISOString().slice(0,10);
}

function showToast(msg, type='success') {
  const t = $id('toast');
  const icons = { success:'bi-check-circle-fill', error:'bi-exclamation-circle-fill', info:'bi-info-circle-fill' };
  t.className = `toast visible ${type}`;
  t.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i>${msg}`;
  setTimeout(() => { t.className = 'toast'; }, 3200);
}

function getTypeLabel(type) {
  const m = { new_purchase:'New Purchase', renewal:'Renewal', add_on:'Add-On' };
  return m[type] || type;
}

function getTypeBadgeClass(type) {
  const m = { new_purchase:'badge-new', renewal:'badge-renewal', add_on:'badge-addon' };
  return m[type] || 'badge-info';
}

function getStatusBadgeClass(s) {
  const m = { active:'badge-active', expired:'badge-expired', pending:'badge-pending', cancelled:'badge-cancelled' };
  return m[s] || 'badge-info';
}

/* ============================================================
   MAIN RENDER
   ============================================================ */
function render() {
  const app = $id('app');
  if (S.page === 'login') {
    app.innerHTML = renderLogin();
    app.style.overflow = 'auto';
    attachLoginEvents();
    return;
  }
  app.style.overflow = 'hidden';
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-area">
        ${renderHeader()}
        <div class="page-body" id="page-body">
          ${renderPage()}
        </div>
      </div>
      ${renderChatWidget()}
    </div>`;
  attachGlobalEvents();
}

function renderPage() {
  switch(S.page) {
    case 'dashboard':     return renderDashboard();
    case 'transactions':  return renderTransactions();
    case 'configurator':  return renderConfigurator();
    case 'reports':       return renderReports();
    default:              return renderDashboard();
  }
}

function navigate(page) {
  S.page = page;
  // Reset configurator when leaving
  if (page !== 'configurator') {
    S.quoteSubmitted = false;
  }
  render();
}

/* ============================================================
   LOGIN
   ============================================================ */
function renderLogin() {
  return `
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <div class="login-logo-icon"><i class="bi bi-grid-1x2-fill"></i></div>
        <h1>Nexus AI Partner Portal</h1>
        <p>Partner Network — Authorized Reseller Access</p>
      </div>
      <div class="demo-hint">
        <strong>Demo Credentials</strong>
        marcus.chen@techreseller.com &nbsp;·&nbsp; Password: demo1234
      </div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input id="login-email" class="form-control" type="email" value="marcus.chen@techreseller.com" autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input id="login-pass" class="form-control" type="password" value="demo1234" autocomplete="current-password" />
      </div>
      <button class="btn btn-primary btn-full btn-lg" id="login-btn">
        <i class="bi bi-box-arrow-in-right"></i> Sign In to Partner Portal
      </button>
      <p class="login-footer">Nexus AI Partner Network · Confidential &amp; Authorised Use Only</p>
    </div>
  </div>`;
}

function attachLoginEvents() {
  const btn = $id('login-btn');
  if (btn) {
    btn.addEventListener('click', doLogin);
    $id('login-pass').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  }
}

function doLogin() {
  const email = $id('login-email').value.trim();
  const pass  = $id('login-pass').value;
  if (!email || !pass) { showToast('Please enter your credentials.','error'); return; }
  navigate('dashboard');
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function renderSidebar() {
  const navItems = [
    { page:'dashboard',    icon:'bi-house-door-fill',   label:'Dashboard' },
    { page:'transactions', icon:'bi-receipt',           label:'Transactions', badge: TRANSACTIONS.filter(t=>t.status==='pending').length },
    { page:'configurator', icon:'bi-cpu-fill',          label:'Configurator',  badgeWarn:'New' },
    { page:'reports',      icon:'bi-bar-chart-line-fill',label:'Reports & Analytics' },
  ];
  return `
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-mark"><i class="bi bi-grid-1x2-fill"></i></div>
      <span class="brand-text">Nexus<span>AI</span></span>
    </div>
    <div class="partner-chip">
      <div class="pc-label">Partner Account</div>
      <div class="pc-company">${USER.company}</div>
      <div class="pc-tier"><i class="bi bi-star-fill"></i>${USER.tier}</div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Navigation</div>
      ${navItems.map(n => `
        <button class="nav-item ${S.page===n.page?'active':''}" data-nav="${n.page}">
          <i class="bi ${n.icon}"></i>
          ${n.label}
          ${n.badge ? `<span class="nav-badge">${n.badge}</span>` : ''}
          ${n.badgeWarn && !n.badge ? `<span class="nav-badge-warn">${n.badgeWarn}</span>` : ''}
        </button>`).join('')}
      <div class="nav-section-label" style="margin-top:8px">Support</div>
      <button class="nav-item" id="nav-chat-btn">
        <i class="bi bi-chat-dots-fill"></i>
        Live Support
        <span class="nav-badge-warn" style="background:#10b981">Online</span>
      </button>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar">${USER.initials}</div>
        <div class="user-meta">
          <div class="u-name">${USER.name}</div>
          <div class="u-email">${USER.email}</div>
        </div>
        <button class="logout-btn" id="logout-btn" title="Sign out"><i class="bi bi-box-arrow-right"></i></button>
      </div>
    </div>
  </aside>`;
}

/* ============================================================
   HEADER
   ============================================================ */
const PAGE_TITLES = {
  dashboard:    ['Dashboard', `Welcome back, ${USER.name}`],
  transactions: ['Transactions', 'Order & Subscription History'],
  configurator: ['Product Configurator', 'Build & Price Computer Bundles'],
  reports:      ['Reports & Analytics', 'Partner Performance Overview'],
};

function renderHeader() {
  const [title, sub] = PAGE_TITLES[S.page] || ['Portal', ''];
  return `
  <header class="top-header">
    <div class="header-breadcrumb">
      <div class="page-title">${title}</div>
      <div class="page-sub">${sub}</div>
    </div>
    <div class="header-actions">
      <button class="hdr-btn" title="Notifications" id="hdr-notif-btn">
        <i class="bi bi-bell-fill" style="font-size:17px;color:#64748b"></i>
        <span class="hdr-dot"></span>
      </button>
      <button class="hdr-btn" title="Help"><i class="bi bi-question-circle" style="font-size:17px;color:#64748b"></i></button>
      <div class="hdr-divider"></div>
      <div class="hdr-user">
        <div class="hdr-avatar">${USER.initials}</div>
        <div class="hdr-user-info">
          <div class="hu-name">${USER.name}</div>
          <div class="hu-company">${USER.company}</div>
        </div>
        <i class="bi bi-chevron-down" style="font-size:11px;color:#94a3b8;margin-left:4px"></i>
      </div>
    </div>
  </header>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const active    = TRANSACTIONS.filter(t => t.status==='active').length;
  const pending   = TRANSACTIONS.filter(t => t.status==='pending').length;
  const revenue   = getYTDRevenue();
  const renewals  = getUpcomingRenewals();
  const urgent    = getUpcomingRenewals(7).length;

  const monthlyData = [38200,41500,39800,52100,48300,55600,61200,57800,63400,71000,68200,76900].slice(-6);
  const maxM = Math.max(...monthlyData);
  const months = ['Sep','Oct','Nov','Dec','Jan','Feb'];

  const recentActivity = [
    { color:'ad-blue',   text:`New order <strong>ORD-2026-0002</strong> placed by Various Clients`, time:'2 hours ago' },
    { color:'ad-green',  text:`Renewal confirmed: <strong>SUB-8821-E</strong> (Acme Corp)`,         time:'Yesterday' },
    { color:'ad-amber',  text:`Upcoming renewal alert: AutoCAD LT × 3 expires in <strong>5 days</strong>`,time:'1 day ago' },
    { color:'ad-purple', text:`Quote submitted: HP ZBook Studio G10 × 5 for Momentum Creative`,     time:'3 days ago' },
    { color:'ad-red',    text:`Order <strong>ORD-2024-0020</strong> cancelled by Redstone Partners`,time:'Dec 2, 2024' },
  ];

  return `
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon si-blue"><i class="bi bi-cart-check-fill"></i></div>
      <div>
        <div class="stat-label">Active Orders</div>
        <div class="stat-value">${active}</div>
        <div class="stat-change chg-up"><i class="bi bi-arrow-up-short"></i>+3 this month</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-green"><i class="bi bi-currency-dollar"></i></div>
      <div>
        <div class="stat-label">YTD Revenue</div>
        <div class="stat-value">${fmt$(revenue).replace('$','$')}</div>
        <div class="stat-change chg-up"><i class="bi bi-arrow-up-short"></i>+12.4% vs last year</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-amber"><i class="bi bi-arrow-repeat"></i></div>
      <div>
        <div class="stat-label">Renewals Due (60d)</div>
        <div class="stat-value">${renewals.length}</div>
        <div class="stat-change ${urgent > 0 ? 'chg-dn' : 'chg-na'}"><i class="bi bi-exclamation-circle"></i>${urgent > 0 ? `${urgent} urgent (&lt;7d)` : 'None urgent'}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-purple"><i class="bi bi-hourglass-split"></i></div>
      <div>
        <div class="stat-label">Pending Approval</div>
        <div class="stat-value">${pending}</div>
        <div class="stat-change chg-na"><i class="bi bi-dash"></i>Awaiting processing</div>
      </div>
    </div>
  </div>

  <div class="dash-grid">
    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-blue"><i class="bi bi-bar-chart-fill"></i></div>
          <div>
            <div class="card-title">Revenue Trend</div>
            <div class="card-sub">Last 6 months</div>
          </div>
        </div>
        <span class="badge badge-active"><i class="bi bi-circle-fill" style="font-size:6px"></i>Live</span>
      </div>
      <div class="card-body">
        <div class="mini-chart-wrap">
          <div class="mini-bars">
            ${monthlyData.map(v => `
              <div class="mini-bar" style="height:100%">
                <div class="mini-bar-fill" style="height:${Math.round(v/maxM*100)}%"></div>
              </div>`).join('')}
          </div>
          <div class="chart-month-labels">
            ${months.map(m=>`<span>${m}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--text-muted)">
          <span>Peak: <strong style="color:var(--text)">${fmt$(Math.max(...monthlyData))}</strong></span>
          <span>Avg: <strong style="color:var(--text)">${fmt$(Math.round(monthlyData.reduce((a,b)=>a+b,0)/monthlyData.length))}</strong></span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-amber"><i class="bi bi-arrow-clockwise"></i></div>
          <div>
            <div class="card-title">Upcoming Renewals</div>
            <div class="card-sub">Next 60 days</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="navigate('transactions')">View All</button>
      </div>
      <div class="card-body">
        ${renewals.length === 0 ? '<div class="empty-state" style="padding:20px"><i class="bi bi-check-circle" style="color:var(--success)"></i><p>No renewals due in the next 60 days.</p></div>' : renewals.map(r => {
          const cls = r.daysLeft <= 7 ? 'urgent' : r.daysLeft <= 30 ? 'soon' : 'ok';
          return `
          <div class="renewal-row">
            <div class="rr-left">
              <div class="rr-product">${r.product}</div>
              <div class="rr-sub">${r.subId}</div>
            </div>
            <div class="rr-right">
              <div class="rr-days ${cls}">${r.daysLeft <= 0 ? 'Overdue' : `${r.daysLeft}d left`}</div>
              <div class="rr-amount">${fmt$(r.amount)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <div class="dash-grid">

    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-purple"><i class="bi bi-activity"></i></div>
          <div><div class="card-title">Recent Activity</div></div>
        </div>
      </div>
      <div class="card-body">
        ${recentActivity.map(a => `
          <div class="activity-row">
            <div class="act-dot ${a.color}"></div>
            <div>
              <div class="act-text">${a.text}</div>
              <div class="act-time">${a.time}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-green"><i class="bi bi-trophy-fill"></i></div>
          <div><div class="card-title">Partner Tier Status</div></div>
        </div>
      </div>
      <div class="card-body">
        <div class="tier-card">
          <div class="tier-badge"><i class="bi bi-star-fill"></i>${USER.tier}</div>
          <div class="tier-desc">You're ${USER.tierProgress}% of the way to <strong>${USER.tierTarget}</strong> status. Keep selling!</div>
          <div class="tier-progress-label"><span>Progress to Platinum</span><span>${USER.tierProgress}%</span></div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill gold" style="width:${USER.tierProgress}%"></div>
          </div>
          <div style="margin-top:14px;font-size:12px;color:var(--text-muted)">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
              <span>YTD Revenue</span><strong>${fmt$(USER.ytdRevenue)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span>Platinum Target</span><strong>${fmt$(250000)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-header-left">
        <div class="card-icon ci-blue"><i class="bi bi-clock-history"></i></div>
        <div><div class="card-title">Recent Transactions</div><div class="card-sub">Last 5 orders</div></div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="navigate('transactions')">View All Transactions</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order ID</th><th>Customer</th><th>Product</th><th>Type</th><th>Status</th><th>Amount</th><th>Start Date</th>
          </tr>
        </thead>
        <tbody>
          ${TRANSACTIONS.slice(-5).reverse().map(t => `
            <tr>
              <td class="td-mono">${t.id}</td>
              <td>${t.customer}</td>
              <td style="max-width:180px">${t.product}</td>
              <td><span class="badge ${getTypeBadgeClass(t.type)}">${getTypeLabel(t.type)}</span></td>
              <td><span class="badge ${getStatusBadgeClass(t.status)}">${t.status.charAt(0).toUpperCase()+t.status.slice(1)}</span></td>
              <td class="fw-600">${fmt$(t.amount)}</td>
              <td class="td-muted">${fmtDate(t.start)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ============================================================
   TRANSACTIONS
   ============================================================ */
function renderTransactions() {
  const filtered = TRANSACTIONS.filter(t => {
    const s = S.txFilter.search.toLowerCase();
    const matchSearch = !s ||
      t.id.toLowerCase().includes(s) ||
      t.subId.toLowerCase().includes(s) ||
      t.customer.toLowerCase().includes(s) ||
      t.product.toLowerCase().includes(s);
    const matchType   = S.txFilter.type==='all'   || t.type===S.txFilter.type;
    const matchStatus = S.txFilter.status==='all' || t.status===S.txFilter.status;
    return matchSearch && matchType && matchStatus;
  });

  const totalAmt = filtered.reduce((sum,t) => sum + t.amount, 0);

  return `
  <div class="filter-bar">
    <div class="search-wrap">
      <i class="bi bi-search"></i>
      <input class="form-control" id="tx-search" placeholder="Search by order ID, customer, product…" value="${S.txFilter.search}" />
    </div>
    <select class="filter-select" id="tx-type">
      <option value="all"         ${S.txFilter.type==='all'         ?'selected':''}>All Types</option>
      <option value="new_purchase"${S.txFilter.type==='new_purchase'?'selected':''}>New Purchase</option>
      <option value="renewal"     ${S.txFilter.type==='renewal'     ?'selected':''}>Renewal</option>
      <option value="add_on"      ${S.txFilter.type==='add_on'      ?'selected':''}>Add-On</option>
    </select>
    <select class="filter-select" id="tx-status">
      <option value="all"       ${S.txFilter.status==='all'       ?'selected':''}>All Statuses</option>
      <option value="active"    ${S.txFilter.status==='active'    ?'selected':''}>Active</option>
      <option value="pending"   ${S.txFilter.status==='pending'   ?'selected':''}>Pending</option>
      <option value="expired"   ${S.txFilter.status==='expired'   ?'selected':''}>Expired</option>
      <option value="cancelled" ${S.txFilter.status==='cancelled' ?'selected':''}>Cancelled</option>
    </select>
    <button class="btn btn-outline btn-sm" id="tx-export-btn"><i class="bi bi-download"></i>Export CSV</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <span class="text-sm text-muted">Showing <strong>${filtered.length}</strong> of <strong>${TRANSACTIONS.length}</strong> transactions</span>
    <span class="text-sm fw-600">Total: ${fmt$(totalAmt)}</span>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Subscription ID</th>
            <th>Customer</th>
            <th>Product / SKU</th>
            <th>Type</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Status</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? `
            <tr><td colspan="9">
              <div class="empty-state">
                <i class="bi bi-inbox"></i>
                <p>No transactions match your filters.</p>
                <small>Try adjusting the search or filter options.</small>
              </div>
            </td></tr>` :
          filtered.map(t => `
            <tr>
              <td class="td-mono" style="font-weight:600">${t.id}</td>
              <td class="td-mono" style="color:var(--text-muted)">${t.subId}</td>
              <td>${t.customer}</td>
              <td style="max-width:200px;font-size:12px">${t.product}</td>
              <td><span class="badge ${getTypeBadgeClass(t.type)}">${getTypeLabel(t.type)}</span></td>
              <td class="td-muted">${fmtDate(t.start)}</td>
              <td class="td-muted">${t.end ? fmtDate(t.end) : '<span style="color:#94a3b8">—</span>'}</td>
              <td><span class="badge ${getStatusBadgeClass(t.status)}">${t.status.charAt(0).toUpperCase()+t.status.slice(1)}</span></td>
              <td style="text-align:right;font-weight:700">${fmt$(t.amount)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ============================================================
   CONFIGURATOR
   ============================================================ */
function renderConfigurator() {
  if (S.quoteSubmitted) return renderQuoteSuccess();
  return `
  <div class="configurator-layout">
    <div>
      ${renderStepBar()}
      <div class="card"><div class="card-body">${renderConfigStep()}</div></div>
    </div>
    <div class="quote-panel">
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <div class="card-icon ci-blue"><i class="bi bi-receipt-cutoff"></i></div>
            <div><div class="card-title">Live Quote</div><div class="card-sub">Updates as you configure</div></div>
          </div>
        </div>
        <div class="card-body" style="padding:16px 18px">
          ${renderQuotePanel()}
        </div>
      </div>
    </div>
  </div>`;
}

function renderStepBar() {
  const steps = ['Brand','Model','Specs','Accessories','Software','Review'];
  const cur = S.config.step;
  return `
  <div class="step-bar mb-20">
    ${steps.map((label,i) => {
      const n = i+1;
      const cls = n < cur ? 'done' : n === cur ? 'active' : '';
      const circle = n < cur ? '<i class="bi bi-check-lg"></i>' : n;
      return `
        ${i > 0 ? `<div class="step-connector ${n <= cur ? 'done':''}"></div>` : ''}
        <div class="step-node ${cls}">
          <div class="step-circle">${circle}</div>
          <span style="display:none;font-size:11px">${label}</span>
        </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:0;margin-bottom:18px">
    ${['Brand','Model','Specs','Accessories','Software','Review'].map((label,i)=>{
      const n=i+1;
      const cls = n < S.config.step ? 'done' : n===S.config.step ? 'active' : '';
      return `<div style="flex:1;text-align:center;font-size:11px;font-weight:${cls==='active'?'700':'500'};color:${cls==='active'?'var(--primary)':cls==='done'?'var(--success)':'var(--text-muted)'}">${label}</div>`;
    }).join('')}
  </div>`;
}

function renderConfigStep() {
  switch(S.config.step) {
    case 1: return renderStep1();
    case 2: return renderStep2();
    case 3: return renderStep3();
    case 4: return renderStep4();
    case 5: return renderStep5();
    case 6: return renderStep6();
    default: return '';
  }
}

function renderStep1() {
  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 1 — Choose a Brand</div>
    <div class="brand-cards">
      ${Object.entries(BRANDS).map(([key,b]) => `
        <div class="brand-card ${S.config.brand===key?'selected':''}" data-brand="${key}">
          <span class="bc-logo">${b.logo}</span>
          <div class="bc-name">${b.name}</div>
          <div class="bc-tagline">${b.tagline}</div>
        </div>`).join('')}
    </div>
  </div>
  <div class="cfg-nav">
    <div></div>
    <button class="btn btn-primary" id="cfg-next" ${!S.config.brand?'disabled':''}>
      Next: Choose Model <i class="bi bi-arrow-right"></i>
    </button>
  </div>`;
}

function renderStep2() {
  const models = MODELS[S.config.brand] || [];
  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 2 — Choose a Model</div>
    <div class="model-cards">
      ${models.map(m => `
        <div class="model-card ${S.config.model?.key===m.key?'selected':''}" data-model="${m.key}">
          ${m.image ? `<div class="mc-img-wrap"><img class="mc-img" src="${m.image}" alt="${m.name}" loading="lazy"></div>` : ''}
          <div class="mc-tag ${m.category}">${m.category.charAt(0).toUpperCase()+m.category.slice(1)}</div>
          <div class="mc-name">${m.name}</div>
          <div class="mc-desc">${m.desc}</div>
          <div class="mc-price">${fmt$(m.basePrice)} <span class="mc-base">starting price</span></div>
          <div class="mc-specs">${m.specNote}</div>
        </div>`).join('')}
    </div>
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-primary" id="cfg-next" ${!S.config.model?'disabled':''}>
      Next: Configure Specs <i class="bi bi-arrow-right"></i>
    </button>
  </div>`;
}

function renderStep3() {
  const m = S.config.model;
  const selCpu  = S.config.cpu  || m.cpuOpts[0];
  const selRam  = S.config.ram  || m.ramOpts[0];
  const selStor = S.config.storage || m.storageOpts[0];
  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 3 — Configure Specifications</div>
    <div style="background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:18px;font-size:12px;color:var(--text-muted)">
      <i class="bi bi-info-circle" style="color:var(--primary)"></i>&nbsp; Base model: <strong style="color:var(--text)">${m.name}</strong> · SKU prefix: <code style="background:#e2e8f0;padding:1px 6px;border-radius:3px;font-size:11px">${m.sku}</code>
    </div>
    <div class="spec-row">
      <div class="spec-col">
        <label>Processor (CPU)</label>
        <select class="form-control" id="cfg-cpu">
          ${m.cpuOpts.map(c=>`<option value="${c.sku}" data-delta="${c.delta}" ${selCpu.sku===c.sku?'selected':''}>${c.label}${c.delta?` (+${fmt$(c.delta)})`:' (Included)'}</option>`).join('')}
        </select>
      </div>
      <div class="spec-col">
        <label>Memory (RAM)</label>
        <select class="form-control" id="cfg-ram">
          ${m.ramOpts.map(r=>`<option value="${r.sku}" data-delta="${r.delta}" data-gb="${r.gb ?? parseInt(r.label)}" ${selRam.sku===r.sku?'selected':''}>${r.label}${r.delta?` (+${fmt$(r.delta)})`:' (Included)'}</option>`).join('')}
        </select>
      </div>
      <div class="spec-col">
        <label>Storage (SSD)</label>
        <select class="form-control" id="cfg-storage">
          ${m.storageOpts.map(s=>`<option value="${s.sku}" data-delta="${s.delta}" ${selStor.sku===s.sku?'selected':''}>${s.label}${s.delta?` (+${fmt$(s.delta)})`:' (Included)'}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-primary" id="cfg-next">Next: Accessories <i class="bi bi-arrow-right"></i></button>
  </div>`;
}

function getSelectedRamGb() {
  if (!S.config.ram) return S.config.model ? parseInt(S.config.model.ramOpts[0].label) : 8;
  return S.config.ram.gb || parseInt(S.config.ram.label || '8');
}

function renderStep4() {
  const m = S.config.model;
  const ramGb = getSelectedRamGb();
  const warnings = [];

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 4 — Accessories</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
      Items greyed out are incompatible with your selected brand or configuration.
    </div>
    <div class="acc-grid">
      ${ACCESSORIES.map(a => {
        const brandOk = a.brands.includes(m.brand);
        const selected = S.config.accessories.has(a.key);
        const disabled = !brandOk;
        const reason = !brandOk ? `Compatible with ${a.brands.map(b=>BRANDS[b].name).join('/')} only` : '';
        return `
          <div class="acc-item ${selected?'selected':''} ${disabled?'disabled':''}" data-acc="${a.key}" ${disabled?'':'style="cursor:pointer"'}>
            <input type="checkbox" ${selected?'checked':''} ${disabled?'disabled':''} tabindex="-1" />
            <div class="acc-details">
              <div class="acc-name">${a.name}</div>
              <div class="acc-sku">${a.sku}</div>
              ${disabled ? `<div class="acc-tag"><i class="bi bi-x-circle"></i> ${reason}</div>` : `<div class="acc-price">+${fmt$(a.price)}</div>`}
            </div>
          </div>`;
      }).join('')}
    </div>
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-primary" id="cfg-next">Next: Software <i class="bi bi-arrow-right"></i></button>
  </div>`;
}

function renderStep5() {
  const m = S.config.model;
  const ramGb = getSelectedRamGb();
  const warnings = [];

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 5 — Software</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
      Software requirements are validated against your configuration. Incompatible items are disabled.
    </div>
    <div class="acc-grid">
      ${SOFTWARE.map(sw => {
        const ramOk = ramGb >= sw.minRam;
        const wkOk  = !sw.workstationOnly || m.isWorkstation;
        const ok = ramOk && wkOk;
        const selected = S.config.software.has(sw.key);
        let reason = '';
        if (!ramOk) reason = `Requires ≥${sw.minRam} GB RAM (you have ${ramGb} GB)`;
        else if (!wkOk) reason = 'Workstation model required';
        return `
          <div class="acc-item ${selected?'selected':''} ${!ok?'disabled':''}" data-sw="${sw.key}" ${ok?'style="cursor:pointer"':''}>
            <input type="checkbox" ${selected?'checked':''} ${!ok?'disabled':''} tabindex="-1" />
            <div class="acc-details">
              <div class="acc-name">${sw.name}</div>
              <div class="acc-sku">${sw.sku}</div>
              ${!ok ? `<div class="acc-tag"><i class="bi bi-x-circle"></i> ${reason}</div>` : `<div class="acc-price">+${fmt$(sw.price)}/seat</div>`}
            </div>
          </div>`;
      }).join('')}
    </div>
    ${warnings.length ? `<div class="compat-warning"><i class="bi bi-exclamation-triangle-fill"></i><span>${warnings.join('<br>')}</span></div>` : ''}
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-primary" id="cfg-next">Review Quote <i class="bi bi-arrow-right"></i></button>
  </div>`;
}

function renderStep6() {
  const { model:m, cpu, ram, storage, accessories, software, qty } = S.config;
  const price = calcPrice();
  const skus = generateSKUs();

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 6 — Review & Quantity</div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius);padding:12px 14px;margin-bottom:18px;font-size:13px;color:#15803d">
      <i class="bi bi-check-circle-fill"></i>&nbsp; Your bundle is configured and ready to quote. Set quantity and submit.
    </div>

    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Base Configuration</div>
      <table style="width:100%;font-size:12px">
        <tr><td style="padding:4px 0;color:var(--text-muted);width:120px">Model</td><td style="font-weight:600">${m.name}</td></tr>
        <tr><td style="padding:4px 0;color:var(--text-muted)">Processor</td><td>${cpu?.label || m.cpuOpts[0].label}</td></tr>
        <tr><td style="padding:4px 0;color:var(--text-muted)">Memory</td><td>${ram?.label || m.ramOpts[0].label}</td></tr>
        <tr><td style="padding:4px 0;color:var(--text-muted)">Storage</td><td>${storage?.label || m.storageOpts[0].label}</td></tr>
      </table>
    </div>

    ${accessories.size > 0 ? `
    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Selected Accessories (${accessories.size})</div>
      ${[...accessories].map(k => {
        const a = ACCESSORIES.find(x=>x.key===k);
        return a ? `<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between"><span>${a.name}</span><span style="color:var(--primary);font-weight:600">+${fmt$(a.price)}</span></div>` : '';
      }).join('')}
    </div>` : ''}

    ${software.size > 0 ? `
    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Selected Software (${software.size})</div>
      ${[...software].map(k => {
        const sw = SOFTWARE.find(x=>x.key===k);
        return sw ? `<div style="font-size:12px;padding:3px 0;display:flex;justify-content:space-between"><span>${sw.name}</span><span style="color:var(--primary);font-weight:600">+${fmt$(sw.price)}/seat</span></div>` : '';
      }).join('')}
    </div>` : ''}

    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">Quantity</div>
      <div class="qty-control">
        <button class="qty-btn" id="qty-dec">−</button>
        <div class="qty-val" id="qty-display">${qty}</div>
        <button class="qty-btn" id="qty-inc">+</button>
        <span style="font-size:12px;color:var(--text-muted);margin-left:8px">units</span>
      </div>
    </div>

    <div style="background:var(--primary-light);border:1px solid #bfdbfe;border-radius:var(--radius);padding:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--text-muted)">Unit Price</span><strong>${fmt$(price.unit)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-weight:700;font-size:15px;color:var(--primary)">Total (× ${qty})</span>
        <strong style="font-size:15px;color:var(--primary)">${fmt$(price.total)}</strong>
      </div>
    </div>
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-success btn-lg" id="cfg-submit">
      <i class="bi bi-send-fill"></i> Submit Quote Request
    </button>
  </div>`;
}

function renderQuotePanel() {
  const { model:m, cpu, ram, storage, accessories, software, qty, step } = S.config;
  if (!m) {
    return `<div class="quote-empty">
      <i class="bi bi-cpu" style="color:var(--border)"></i>
      <p>Start configuring your bundle to see a live price estimate.</p>
    </div>`;
  }
  const price = calcPrice();
  const skus  = generateSKUs();
  const cpuLabel     = cpu?.label     || m.cpuOpts[0].label;
  const ramLabel     = ram?.label     || m.ramOpts[0].label;
  const storageLabel = storage?.label || m.storageOpts[0].label;

  return `
  <div class="quote-line ql-header"><span>Item</span><span>Price</span></div>
  <div class="quote-line">
    <span class="ql-name" style="font-weight:600">${m.name}</span>
    <span class="ql-price">${fmt$(m.basePrice)}</span>
  </div>
  <div class="quote-line ql-sub"><span class="ql-name">${cpuLabel}</span><span>${cpu?.delta?`+${fmt$(cpu.delta)}`:'Incl.'}</span></div>
  <div class="quote-line ql-sub"><span class="ql-name">${ramLabel}</span><span>${ram?.delta?`+${fmt$(ram.delta)}`:'Incl.'}</span></div>
  <div class="quote-line ql-sub"><span class="ql-name">${storageLabel}</span><span>${storage?.delta?`+${fmt$(storage.delta)}`:'Incl.'}</span></div>

  ${accessories.size > 0 ? `
  <div class="divider" style="margin:10px 0 6px"></div>
  <div class="quote-line ql-header"><span>Accessories</span></div>
  ${[...accessories].map(k => {
    const a = ACCESSORIES.find(x=>x.key===k);
    return a ? `<div class="quote-line ql-sub"><span class="ql-name">${a.name}</span><span>+${fmt$(a.price)}</span></div>` : '';
  }).join('')}` : ''}

  ${software.size > 0 ? `
  <div class="divider" style="margin:10px 0 6px"></div>
  <div class="quote-line ql-header"><span>Software (per seat)</span></div>
  ${[...software].map(k => {
    const sw = SOFTWARE.find(x=>x.key===k);
    return sw ? `<div class="quote-line ql-sub"><span class="ql-name">${sw.name}</span><span>+${fmt$(sw.price)}</span></div>` : '';
  }).join('')}` : ''}

  <div class="quote-line ql-sub" style="margin-top:6px"><span>Quantity</span><span>× ${qty}</span></div>
  <div class="quote-line ql-total"><span>Total</span><span>${fmt$(price.total)}</span></div>

  <div class="sku-section">
    <div class="sku-title">Bundle SKUs</div>
    ${skus.map(s => `<span class="sku-chip">${s}</span>`).join('')}
  </div>`;
}

function calcPrice() {
  const { model:m, cpu, ram, storage, accessories, software, qty } = S.config;
  if (!m) return { unit:0, total:0 };
  let unit = m.basePrice;
  unit += (cpu?.delta     || m.cpuOpts[0].delta);
  unit += (ram?.delta     || m.ramOpts[0].delta);
  unit += (storage?.delta || m.storageOpts[0].delta);
  [...accessories].forEach(k => { const a = ACCESSORIES.find(x=>x.key===k); if(a) unit += a.price; });
  [...software].forEach(k => { const sw = SOFTWARE.find(x=>x.key===k); if(sw) unit += sw.price; });
  return { unit, total: unit * qty };
}

function generateSKUs() {
  const { model:m, cpu, ram, storage, accessories, software } = S.config;
  if (!m) return [];
  const skus = [m.sku];
  skus.push(cpu?.sku     || m.cpuOpts[0].sku);
  skus.push(ram?.sku     || m.ramOpts[0].sku);
  skus.push(storage?.sku || m.storageOpts[0].sku);
  [...accessories].forEach(k => { const a = ACCESSORIES.find(x=>x.key===k); if(a) skus.push(a.sku); });
  [...software].forEach(k => { const sw = SOFTWARE.find(x=>x.key===k); if(sw) skus.push(sw.sku); });
  return skus;
}

function renderQuoteSuccess() {
  const { model:m, qty } = S.config;
  const price = calcPrice();
  const skus = generateSKUs();
  const ref = 'QTE-' + Math.floor(Math.random()*90000+10000);
  return `
  <div style="max-width:560px;margin:40px auto;text-align:center">
    <div style="width:72px;height:72px;background:var(--success-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:36px;color:var(--success)">
      <i class="bi bi-check-lg"></i>
    </div>
    <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Quote Submitted!</h2>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px">
      Your quote request has been sent to the Nexus AI sales team. A representative will contact you within 1 business day.
    </p>
    <div class="card" style="text-align:left;margin-bottom:20px">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <span style="color:var(--text-muted);font-size:13px">Quote Reference</span>
          <strong style="font-family:monospace">${ref}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <span style="color:var(--text-muted);font-size:13px">Product</span>
          <strong>${m.name} × ${qty}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <span style="color:var(--text-muted);font-size:13px">Estimated Total</span>
          <strong style="color:var(--primary);font-size:16px">${fmt$(price.total)}</strong>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:6px">BUNDLE SKUs</div>
          ${skus.map(s=>`<span class="sku-chip">${s}</span>`).join('')}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button class="btn btn-outline" onclick="navigate('transactions')"><i class="bi bi-receipt"></i>View Transactions</button>
      <button class="btn btn-primary" onclick="resetConfigurator()"><i class="bi bi-plus-lg"></i>New Configuration</button>
    </div>
  </div>`;
}

function resetConfigurator() {
  S.config = { step:1, brand:null, model:null, cpu:null, ram:null, storage:null, accessories:new Set(), software:new Set(), qty:1 };
  S.quoteSubmitted = false;
  navigate('configurator');
}

/* ============================================================
   REPORTS
   ============================================================ */
function renderReports() {
  const months = ['Sep','Oct','Nov','Dec','Jan','Feb'];
  const revenue = [58200,61500,59800,72100,68300,75600];
  const maxR = Math.max(...revenue);

  return `
  <div class="reports-grid" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-blue"><i class="bi bi-bar-chart-fill"></i></div>
          <div><div class="card-title">Monthly Revenue</div><div class="card-sub">Last 6 months</div></div>
        </div>
      </div>
      <div class="card-body">
        <div class="big-bars">
          ${revenue.map((v,i) => `
            <div class="big-bar" title="${months[i]}: ${fmt$(v)}">
              <div class="big-bar-fill" style="height:${Math.round(v/maxR*100)}%"></div>
              <div class="big-bar-val">${fmt$(v/1000)}k</div>
            </div>`).join('')}
        </div>
        <div class="big-bar-lbls">
          ${months.map(m=>`<div class="big-bar-lbl" style="flex:1">${m}</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-purple"><i class="bi bi-pie-chart-fill"></i></div>
          <div><div class="card-title">Order Type Mix</div><div class="card-sub">All-time breakdown</div></div>
        </div>
      </div>
      <div class="card-body">
        <div class="donut-wrap">
          <div class="donut">
            <div class="donut-hole">30 orders</div>
          </div>
          <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background:#2563eb"></div><span>New Purchase — 44%</span></div>
            <div class="legend-item"><div class="legend-dot" style="background:#7c3aed"></div><span>Renewal — 24%</span></div>
            <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div><span>Add-On — 14%</span></div>
            <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div><span>Other — 18%</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="reports-grid">
    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-green"><i class="bi bi-trophy-fill"></i></div>
          <div><div class="card-title">Top Customers by Revenue</div></div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="top-products-table">
          <thead><tr><th>#</th><th>Customer</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>
            ${[
              ['Acme Corporation',       6, 41275],
              ['GlobalEdge Technologies',2, 38960],
              ['Meridian Finance Ltd',   3, 23817],
              ['Pacific Rim Logistics',  1, 22788],
              ['BlueCrest Engineering',  4, 17889],
            ].map(([c,o,r],i) => `
              <tr>
                <td style="color:var(--text-muted)">${i+1}</td>
                <td style="font-weight:500">${c}</td>
                <td><span class="badge badge-info">${o}</span></td>
                <td style="font-weight:700;color:var(--primary)">${fmt$(r)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-left">
          <div class="card-icon ci-amber"><i class="bi bi-box-seam"></i></div>
          <div><div class="card-title">Top Products Sold</div></div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="top-products-table">
          <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
          <tbody>
            ${[
              ['Dell Latitude 5540',     55, 68970],
              ['HP EliteBook 840 G10',   54, 66474],
              ['HP ZBook Studio G10',    11, 36289],
              ['Dell Precision 3580',     9, 27793],
              ['Microsoft 365 Business', 40,  5960],
            ].map(([p,u,r]) => `
              <tr>
                <td style="font-weight:500;font-size:12px">${p}</td>
                <td style="font-weight:600">${u}</td>
                <td style="font-weight:700;color:var(--primary)">${fmt$(r)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   CHAT WIDGET
   ============================================================ */
const BOT_RESPONSES = [
  { keywords:['order','tracking'],           reply:'I can help you track an order! Please provide the Order ID (e.g., ORD-2024-0001) and I\'ll pull up the details right away.' },
  { keywords:['renewal','expire','expiring'], reply:'For subscription renewals, I recommend checking the Renewals section on your Dashboard. I can also escalate urgent renewals to your account manager — would that help?' },
  { keywords:['quote','price','pricing'],     reply:'Our Configurator tool (in the left navigation) lets you build and price bundles instantly. Once generated, your assigned sales rep can also provide volume discounts.' },
  { keywords:['invoice','billing','payment'], reply:'For billing enquiries, please email billing@nexusai.com or I can connect you with our finance team. Average response time is 4 business hours.' },
  { keywords:['warranty','repair','broken'],  reply:'For warranty claims on Dell or HP hardware, I can open a support ticket directly. Could you provide the Serial Number and Order ID?' },
  { keywords:['dell','hp','product'],        reply:'Nexus AI currently carries the full Dell commercial and HP Z/Elite range. Use the Configurator to explore available models and accessories.' },
  { keywords:['discount','deal','offer'],    reply:'Volume discounts are available for orders of 10+ units. As a Gold Partner you also qualify for quarterly promotion pricing — your account manager can share current offers.' },
  { keywords:['hello','hi','hey','good'],    reply:'Hello! 👋 I\'m Nexus AI Support. How can I help you today? You can ask about orders, renewals, pricing, or products.' },
  { keywords:['thank','thanks'],             reply:'You\'re very welcome! Is there anything else I can assist you with today?' },
];

const DEFAULT_REPLY = 'Thanks for reaching out! A Nexus AI support specialist will join this chat shortly. Typical wait time is under 3 minutes. Is there anything specific you\'d like me to note for them?';

function getBotReply(msg) {
  const lower = msg.toLowerCase();
  for (const r of BOT_RESPONSES) {
    if (r.keywords.some(k => lower.includes(k))) return r.reply;
  }
  return DEFAULT_REPLY;
}

function renderChatWidget() {
  const msgs = S.chatMessages.map(m => `
    <div class="msg-wrap ${m.role}">
      <div class="msg-bubble">${m.text}</div>
      <div class="msg-time">${m.time}</div>
    </div>`).join('');

  const initialGreeting = S.chatMessages.length === 0 ? `
    <div class="msg-wrap bot">
      <div class="msg-bubble">Hi ${USER.name.split(' ')[0]}! 👋 Welcome to Nexus AI Partner Support. How can I help you today?</div>
      <div class="msg-time">Now</div>
    </div>` : '';

  return `
  <div class="chat-window ${S.chatOpen?'':'closed'}" id="chat-window">
    <div class="chat-hdr">
      <div class="chat-agent-av">🎧</div>
      <div>
        <div class="chat-agent-name">Nexus AI Support</div>
        <div class="chat-agent-status"><div class="online-dot"></div>Online · Avg. wait &lt;3 min</div>
      </div>
      <button class="chat-close-btn" id="chat-close-btn"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="chat-msgs" id="chat-msgs">
      ${initialGreeting}${msgs}
      ${S.chatTyping ? `<div class="msg-wrap bot"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>` : ''}
    </div>
    <div class="quick-replies">
      <button class="qr-chip" data-qr="Track my order">Track order</button>
      <button class="qr-chip" data-qr="I need renewal help">Renewal help</button>
      <button class="qr-chip" data-qr="I have a warranty issue">Warranty issue</button>
      <button class="qr-chip" data-qr="Pricing & discounts">Pricing</button>
    </div>
    <div class="chat-input-row">
      <textarea class="chat-input" id="chat-input" placeholder="Type your message…" rows="1"></textarea>
      <button class="chat-send-btn" id="chat-send-btn"><i class="bi bi-send-fill"></i></button>
    </div>
  </div>
  <button class="chat-fab" id="chat-fab" title="Live Support">
    <i class="bi bi-${S.chatOpen?'x-lg':'chat-dots-fill'}"></i>
    ${!S.chatOpen ? '<span class="chat-unread">1</span>' : ''}
  </button>`;
}

function addChatMessage(role, text) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  S.chatMessages.push({ role, text, time });
}

function sendChatMessage(msg) {
  if (!msg.trim()) return;
  addChatMessage('user', msg);
  S.chatTyping = true;
  refreshChat();
  setTimeout(() => {
    S.chatTyping = false;
    addChatMessage('bot', getBotReply(msg));
    refreshChat();
  }, 1200 + Math.random()*800);
}

function refreshChat() {
  const cw = $id('chat-window');
  if (!cw) return;
  const fab = $id('chat-fab');
  // Just re-render the chat widget portion
  const chatPlaceholder = cw.parentElement;
  const fabPlaceholder  = fab.parentElement;

  // Re-inject chat widget HTML
  const tmp = document.createElement('div');
  tmp.innerHTML = renderChatWidget();

  // Replace existing chat-window and chat-fab
  cw.replaceWith(tmp.querySelector('.chat-window'));
  fab.replaceWith(tmp.querySelector('.chat-fab'));

  attachChatEvents();
  scrollChatBottom();
}

function scrollChatBottom() {
  const msgs = $id('chat-msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function attachGlobalEvents() {
  // Sidebar navigation
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // Nav chat btn
  const navChat = $id('nav-chat-btn');
  if (navChat) navChat.addEventListener('click', () => {
    S.chatOpen = true;
    refreshChat();
  });

  // Logout
  const logoutBtn = $id('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    S.page = 'login';
    S.chatMessages = [];
    S.chatOpen = false;
    render();
  });

  // Transactions filters
  const txSearch = $id('tx-search');
  if (txSearch) {
    txSearch.addEventListener('input', e => {
      S.txFilter.search = e.target.value;
      updatePageBody();
    });
    $id('tx-type').addEventListener('change', e => { S.txFilter.type = e.target.value; updatePageBody(); });
    $id('tx-status').addEventListener('change', e => { S.txFilter.status = e.target.value; updatePageBody(); });
    $id('tx-export-btn').addEventListener('click', () => showToast('CSV export downloaded (demo)', 'success'));
  }

  // Configurator events
  attachConfigEvents();

  // Chat
  attachChatEvents();
}

function updatePageBody() {
  const pb = $id('page-body');
  if (pb) pb.innerHTML = renderPage();
  attachGlobalEvents();
}

function attachConfigEvents() {
  // Step nav
  const nextBtn = $id('cfg-next');
  const prevBtn = $id('cfg-prev');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (S.config.step === 3) captureSpecSelections();
    if (S.config.step < 6) { S.config.step++; reloadConfigurator(); }
  });
  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (S.config.step > 1) { S.config.step--; reloadConfigurator(); }
  });

  // Brand selection
  document.querySelectorAll('[data-brand]').forEach(el => {
    el.addEventListener('click', () => {
      S.config.brand = el.dataset.brand;
      S.config.model = null;
      S.config.cpu = null; S.config.ram = null; S.config.storage = null;
      S.config.accessories = new Set(); S.config.software = new Set();
      reloadConfigurator();
    });
  });

  // Model selection
  document.querySelectorAll('[data-model]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.model;
      S.config.model = MODELS[S.config.brand].find(m => m.key === key);
      S.config.cpu = null; S.config.ram = null; S.config.storage = null;
      S.config.accessories = new Set(); S.config.software = new Set();
      reloadConfigurator();
    });
  });

  // Spec selects — live quote update
  ['cfg-cpu','cfg-ram','cfg-storage'].forEach(id => {
    const el = $id(id);
    if (!el) return;
    el.addEventListener('change', () => {
      captureSpecSelections();
      reloadQuotePanel();
    });
  });

  // Accessories
  document.querySelectorAll('[data-acc]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      const k = el.dataset.acc;
      if (S.config.accessories.has(k)) S.config.accessories.delete(k);
      else S.config.accessories.add(k);
      reloadConfigurator();
    });
  });

  // Software
  document.querySelectorAll('[data-sw]').forEach(el => {
    if (el.classList.contains('disabled')) return;
    el.addEventListener('click', () => {
      const k = el.dataset.sw;
      if (S.config.software.has(k)) S.config.software.delete(k);
      else S.config.software.add(k);
      reloadConfigurator();
    });
  });

  // Quantity
  const qtyDec = $id('qty-dec');
  const qtyInc = $id('qty-inc');
  if (qtyDec) {
    qtyDec.addEventListener('click', () => { if (S.config.qty > 1) { S.config.qty--; reloadConfigurator(); } });
    qtyInc.addEventListener('click', () => { S.config.qty++; reloadConfigurator(); });
  }

  // Submit quote
  const submitBtn = $id('cfg-submit');
  if (submitBtn) submitBtn.addEventListener('click', () => {
    S.quoteSubmitted = true;
    reloadConfigurator();
    showToast('Quote submitted! Your sales rep will be in touch.', 'success');
  });
}

function captureSpecSelections() {
  const m = S.config.model;
  if (!m) return;
  const cpuEl     = $id('cfg-cpu');
  const ramEl     = $id('cfg-ram');
  const storageEl = $id('cfg-storage');
  if (cpuEl) {
    const opt = cpuEl.selectedOptions[0];
    S.config.cpu = m.cpuOpts.find(c => c.sku === opt.value) || m.cpuOpts[0];
  }
  if (ramEl) {
    const opt = ramEl.selectedOptions[0];
    S.config.ram = m.ramOpts.find(r => r.sku === opt.value) || m.ramOpts[0];
    S.config.ram = { ...S.config.ram, gb: parseInt(opt.dataset.gb) };
  }
  if (storageEl) {
    const opt = storageEl.selectedOptions[0];
    S.config.storage = m.storageOpts.find(s => s.sku === opt.value) || m.storageOpts[0];
  }
}

function reloadConfigurator() {
  const pb = $id('page-body');
  if (pb) pb.innerHTML = renderConfigurator();
  attachGlobalEvents();
}

function reloadQuotePanel() {
  const panel = document.querySelector('.quote-panel .card-body');
  if (panel) panel.innerHTML = renderQuotePanel();
}

function attachChatEvents() {
  const fab      = $id('chat-fab');
  const closeBtn = $id('chat-close-btn');
  const sendBtn  = $id('chat-send-btn');
  const input    = $id('chat-input');

  if (fab) fab.addEventListener('click', () => {
    S.chatOpen = !S.chatOpen;
    refreshChat();
  });
  if (closeBtn) closeBtn.addEventListener('click', () => {
    S.chatOpen = false;
    refreshChat();
  });
  if (sendBtn) sendBtn.addEventListener('click', () => {
    const msg = input.value.trim();
    if (msg) { input.value = ''; sendChatMessage(msg); }
  });
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg) { input.value = ''; sendChatMessage(msg); }
      }
    });
  }
  // Quick replies
  document.querySelectorAll('[data-qr]').forEach(el => {
    el.addEventListener('click', () => sendChatMessage(el.dataset.qr));
  });

  scrollChatBottom();
}

/* ============================================================
   INIT — called by data/loader.js after CSVs are fetched
   ============================================================ */
window.__nexusRender = function () {
  TRANSACTIONS = window.TRANSACTIONS_DATA || [];
  BRANDS       = window.BRANDS_DATA       || {};
  MODELS       = window.MODELS_DATA       || {};
  ACCESSORIES  = window.ACCESSORIES_DATA  || [];
  SOFTWARE     = window.SOFTWARE_DATA     || [];
  render();
};
