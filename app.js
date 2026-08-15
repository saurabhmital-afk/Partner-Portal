'use strict';

/* ============================================================
   DATA LAYER — powered by data/transactions.js & data/products.js
   Edit those files to update what is shown throughout the portal.
   Changes to either file reflect immediately on next page load.
   ============================================================ */
/* Aliases — refreshed by __nexusRender once CSVs are loaded */
let TRANSACTIONS = [];
let PRODUCTS     = [];

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
    productKey: null,
    qty: 1,
    supportTier: 'Standard',
    term: 'annual',
    addons: new Set(),
    catalogFilter: { search: '', category: 'all' },
  },
  txFilter: { search:'', type:'all', status:'all' },
  askAi: { messages: [], typing: false },
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
    case 'ask-ai':        return renderAskAI();
    default:              return renderDashboard();
  }
}

function navigate(page) {
  S.page = page;
  // Reset the configurator if returning to it after a submitted quote
  if (page === 'configurator' && S.config.step === 5) resetConfigurator();
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
    { page:'configurator', icon:'bi-magic',             label:'Configurator',  badgeWarn:'New' },
    { page:'reports',      icon:'bi-bar-chart-line-fill',label:'Reports & Analytics' },
    { page:'ask-ai',       icon:'bi-stars',             label:'Ask AI',        badgeWarn:'New' },
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
  configurator: ['Product Configurator', 'Build & Price Security Product Bundles'],
  reports:      ['Reports & Analytics', 'Partner Performance Overview'],
  'ask-ai':     ['Ask AI', 'Natural-language answers from your product and transaction data'],
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
    { color:'ad-amber',  text:`Upcoming renewal alert: Vantage Threat Intelligence Feed × 3 expires in <strong>5 days</strong>`,time:'1 day ago' },
    { color:'ad-purple', text:`Quote submitted: IronGate VPN Concentrator 500 × 5 for Momentum Creative`,     time:'3 days ago' },
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
              <span>YTD Revenue</span><strong>${fmt$(getYTDRevenue())}</strong>
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
const SUPPORT_TIERS = [
  { key: 'Standard', mult: 1 },
  { key: 'Premium',  mult: 1.15 },
  { key: 'Platinum', mult: 1.3 },
];
const CONFIG_STEP_LABELS = ['Choose Product', 'Configure', 'Add-ons', 'Review', 'Done'];

function getProductByKey(key) { return PRODUCTS.find(p => p.key === key); }
function getAddonsForProduct(key) { return PRODUCTS.filter(p => p.addonForKey === key); }
function getSupportMultiplier(tier) { const t = SUPPORT_TIERS.find(x => x.key === tier); return t ? t.mult : 1; }
function getSkuFor(product) { return product.key.toUpperCase().replace(/-/g, '_'); }

function getLineUnitPrice(product, supportTier, term) {
  let price = product.listPrice * getSupportMultiplier(supportTier);
  if (product.type === 'subscription' && term === '3yr') price = price * 3 * 0.9;
  return Math.round(price * 100) / 100;
}

function calcQuote() {
  const product = getProductByKey(S.config.productKey);
  if (!product) return { lines: [], total: 0 };
  const lines = [];
  const baseUnit = getLineUnitPrice(product, S.config.supportTier, S.config.term);
  lines.push({ product, qty: S.config.qty, unitPrice: baseUnit, lineTotal: Math.round(baseUnit * S.config.qty * 100) / 100, isAddon: false });
  getAddonsForProduct(product.key).filter(a => S.config.addons.has(a.key)).forEach(a => {
    const perSeat = a.priceUnit.includes('per seat');
    const qty = perSeat ? S.config.qty : 1;
    const unit = getLineUnitPrice(a, S.config.supportTier, S.config.term);
    lines.push({ product: a, qty, unitPrice: unit, lineTotal: Math.round(unit * qty * 100) / 100, isAddon: true });
  });
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  return { lines, total };
}

function renderConfigurator() {
  if (S.config.step === 5) return renderStepBar() + renderQuoteSuccess();
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
  const cur = S.config.step;
  return `
  <div class="step-bar mb-20">
    ${CONFIG_STEP_LABELS.map((label,i) => {
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
    ${CONFIG_STEP_LABELS.map((label,i)=>{
      const n=i+1;
      const cls = n < cur ? 'done' : n===cur ? 'active' : '';
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
    default: return '';
  }
}

function renderStep1() {
  const f = S.config.catalogFilter;
  let products = PRODUCTS.filter(p => !p.addonForKey);
  const categories = [...new Set(PRODUCTS.map(p => p.category))].sort();
  if (f.search) {
    const s = f.search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s) || p.vendorLine.toLowerCase().includes(s));
  }
  if (f.category !== 'all') products = products.filter(p => p.category === f.category);

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 1 — Choose a Product</div>
    <div class="filter-bar" style="margin-bottom:16px">
      <div class="search-wrap">
        <i class="bi bi-search"></i>
        <input class="form-control" id="cfg-search" placeholder="Search products…" value="${f.search}" />
      </div>
      <select class="filter-select" id="cfg-category">
        <option value="all">All Categories</option>
        ${categories.map(c => `<option value="${c}" ${f.category===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="model-cards">
      ${products.map(p => `
        <div class="model-card ${S.config.productKey===p.key?'selected':''}" data-select-product="${p.key}">
          <div class="mc-tag ${p.type==='hardware'?'workstation':'business'}">${p.type.charAt(0).toUpperCase()+p.type.slice(1)}</div>
          <div class="mc-name">${p.name}</div>
          <div class="mc-desc">${p.shortDesc}</div>
          <div class="mc-price">${p.listPrice > 0 ? fmt$(p.listPrice) : 'Included'} <span class="mc-base">${p.priceUnit}</span></div>
          <div class="mc-specs">${p.vendorLine} · ${p.category}</div>
        </div>`).join('') || '<div class="empty-state"><i class="bi bi-inbox"></i><p>No products match your filters.</p></div>'}
    </div>
  </div>`;
}

function renderStep2() {
  const p = getProductByKey(S.config.productKey);
  if (!p) return `<div class="empty-state"><i class="bi bi-inbox"></i><p>Choose a product first.</p></div>
    <div class="cfg-nav"><div></div><button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button></div>`;

  const tierOptions = SUPPORT_TIERS.map(t => `<option value="${t.key}" ${S.config.supportTier===t.key?'selected':''}>${t.key} Support${t.mult>1?` (+${Math.round((t.mult-1)*100)}%)`:' (Included)'}</option>`).join('');
  const termCol = p.type === 'subscription' ? `
      <div class="spec-col">
        <label>Term Length</label>
        <select class="form-control" id="cfg-term">
          <option value="annual" ${S.config.term==='annual'?'selected':''}>1-Year (Billed annually)</option>
          <option value="3yr" ${S.config.term==='3yr'?'selected':''}>3-Year Prepay (Save 10%)</option>
        </select>
      </div>` : '';

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 2 — Configure ${p.name}</div>
    <div style="background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:18px;font-size:12px;color:var(--text-muted)">
      <i class="bi bi-info-circle" style="color:var(--primary)"></i>&nbsp; ${p.vendorLine} · SKU: <code style="background:#e2e8f0;padding:1px 6px;border-radius:3px;font-size:11px">${getSkuFor(p)}</code>
    </div>
    <div class="spec-row">
      <div class="spec-col">
        <label>${p.type==='hardware' ? 'Quantity' : 'Seats'}</label>
        <div class="qty-control">
          <button class="qty-btn" id="qty-dec">−</button>
          <div class="qty-val" id="qty-display">${S.config.qty}</div>
          <button class="qty-btn" id="qty-inc">+</button>
        </div>
      </div>
      <div class="spec-col">
        <label>Support Tier</label>
        <select class="form-control" id="cfg-tier">${tierOptions}</select>
      </div>
      ${termCol}
    </div>
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-primary" id="cfg-next">Next: Add-ons <i class="bi bi-arrow-right"></i></button>
  </div>`;
}

function renderStep3() {
  const p = getProductByKey(S.config.productKey);
  if (!p) return `<div class="empty-state"><i class="bi bi-inbox"></i><p>Choose a product first.</p></div>`;
  const addons = getAddonsForProduct(p.key);

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 3 — Add-ons</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
      Compatible add-ons for ${p.name}.
    </div>
    ${addons.length ? `<div class="acc-grid">
      ${addons.map(a => {
        const selected = S.config.addons.has(a.key);
        return `
          <div class="acc-item ${selected?'selected':''}" data-addon="${a.key}" style="cursor:pointer">
            <input type="checkbox" ${selected?'checked':''} tabindex="-1" />
            <div class="acc-details">
              <div class="acc-name">${a.name}</div>
              <div class="acc-sku">${getSkuFor(a)}</div>
              <div class="acc-price">${a.listPrice > 0 ? `+${fmt$(a.listPrice)}` : 'Free'} ${a.priceUnit}</div>
            </div>
          </div>`;
      }).join('')}
    </div>` : `<div class="empty-state"><i class="bi bi-inbox"></i><p>No add-ons available for this product.</p></div>`}
  </div>
  <div class="cfg-nav">
    <button class="btn btn-secondary" id="cfg-prev"><i class="bi bi-arrow-left"></i> Back</button>
    <button class="btn btn-primary" id="cfg-next">Review Quote <i class="bi bi-arrow-right"></i></button>
  </div>`;
}

function renderStep4() {
  const { lines, total } = calcQuote();
  if (!lines.length) return `<div class="empty-state"><i class="bi bi-inbox"></i><p>Choose a product first.</p></div>`;

  return `
  <div class="cfg-section">
    <div class="cfg-section-title">Step 4 — Review &amp; Submit</div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius);padding:12px 14px;margin-bottom:18px;font-size:13px;color:#15803d">
      <i class="bi bi-check-circle-fill"></i>&nbsp; Your bundle is configured and ready to quote.
    </div>
    <table style="width:100%;font-size:12px;margin-bottom:20px">
      <tr><th style="text-align:left;padding:4px 0;color:var(--text-muted)">Item</th><th style="text-align:right;color:var(--text-muted)">Qty</th><th style="text-align:right;color:var(--text-muted)">Unit Price</th><th style="text-align:right;color:var(--text-muted)">Line Total</th></tr>
      ${lines.map(l => `
        <tr>
          <td style="padding:6px 0">${l.product.name}${l.isAddon?' <span style="font-size:10px;color:var(--text-muted)">(Add-on)</span>':''}</td>
          <td style="text-align:right">${l.qty.toLocaleString()}</td>
          <td style="text-align:right">${fmt$(l.unitPrice)}</td>
          <td style="text-align:right;font-weight:700">${fmt$(l.lineTotal)}</td>
        </tr>`).join('')}
    </table>
    <div style="background:var(--primary-light);border:1px solid #bfdbfe;border-radius:var(--radius);padding:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between">
        <span style="font-weight:700;font-size:15px;color:var(--primary)">Total</span>
        <strong style="font-size:15px;color:var(--primary)">${fmt$(total)}</strong>
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
  const p = getProductByKey(S.config.productKey);
  if (!p) {
    return `<div class="quote-empty">
      <i class="bi bi-shield-lock" style="color:var(--border)"></i>
      <p>Start configuring a product to see a live price estimate.</p>
    </div>`;
  }
  const { lines, total } = calcQuote();
  const skus = lines.map(l => getSkuFor(l.product));

  return `
  <div class="quote-line ql-header"><span>Item</span><span>Price</span></div>
  ${lines.map(l => `<div class="quote-line ${l.isAddon?'ql-sub':''}"><span class="ql-name" style="font-weight:${l.isAddon?400:600}">${l.product.name} × ${l.qty}</span><span class="ql-price">${fmt$(l.lineTotal)}</span></div>`).join('')}

  <div class="quote-line ql-sub" style="margin-top:6px"><span>Support Tier</span><span>${S.config.supportTier}</span></div>
  ${p.type==='subscription' ? `<div class="quote-line ql-sub"><span>Term</span><span>${S.config.term==='3yr'?'3-Year Prepay':'1-Year'}</span></div>` : ''}
  <div class="quote-line ql-total"><span>Total</span><span>${fmt$(total)}</span></div>

  <div class="sku-section">
    <div class="sku-title">Bundle SKUs</div>
    ${skus.map(s => `<span class="sku-chip">${s}</span>`).join('')}
  </div>`;
}

function renderQuoteSuccess() {
  const { lines, total } = calcQuote();
  const skus = lines.map(l => getSkuFor(l.product));
  const base = lines[0];
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
          <strong>${base.product.name} × ${base.qty}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <span style="color:var(--text-muted);font-size:13px">Estimated Total</span>
          <strong style="color:var(--primary);font-size:16px">${fmt$(total)}</strong>
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
  S.config = { step:1, productKey:null, qty:1, supportTier:'Standard', term:'annual', addons:new Set(), catalogFilter:{search:'',category:'all'} };
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
            ${(() => {
              const byProduct = {};
              TRANSACTIONS.forEach(t => {
                const m = t.product.match(/^(.*?)\s*×\s*(\d+)/);
                const name = m ? m[1].trim() : t.product;
                const units = m ? parseInt(m[2], 10) : 1;
                if (!byProduct[name]) byProduct[name] = { units: 0, revenue: 0 };
                byProduct[name].units += units;
                byProduct[name].revenue += t.amount;
              });
              return Object.entries(byProduct)
                .sort((a, b) => b[1].revenue - a[1].revenue)
                .slice(0, 5)
                .map(([p, d]) => `
              <tr>
                <td style="font-weight:500;font-size:12px">${p}</td>
                <td style="font-weight:600">${d.units.toLocaleString()}</td>
                <td style="font-weight:700;color:var(--primary)">${fmt$(d.revenue)}</td>
              </tr>`).join('');
            })()}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   ASK AI — local natural-language query engine over PRODUCTS/TRANSACTIONS
   Not a real hosted LLM (this app has no backend or API key) — a
   deterministic intent/entity matcher, wrapped in a chat-like UI. This
   means answers are always grounded in the actual data, and it can
   reliably say "I don't know" instead of guessing.
   ============================================================ */
function normalizeQuery(str) {
  return (str || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const QUESTION_STOPWORDS = new Set(['how','much','has','have','what','whats',"what's",'who','tell','me','about','does','do','is','are','the','a','an','to','for','of','in','on','and','or','please','can','could','would','you','we','our','i','many','number']);

// Naive proper-noun detector: longest run of capitalized, non-stopword words
// anywhere in the raw (un-lowercased) query — used to recognize "you asked
// about a specific named thing" even when that thing isn't in our data.
function extractCapitalizedPhrase(rawQuery) {
  const words = (rawQuery || '').split(/\s+/);
  let best = [], current = [];
  words.forEach((w) => {
    const clean = w.replace(/[^\w'-]/g, '');
    const isCandidate = /^[A-Z]/.test(clean) && clean.length > 1 && !QUESTION_STOPWORDS.has(clean.toLowerCase());
    if (isCandidate) current.push(clean);
    else { if (current.length > best.length) best = current; current = []; }
  });
  if (current.length > best.length) best = current;
  return best.length ? best.join(' ') : null;
}

function findProductMatches(q) {
  const byName = [...PRODUCTS].sort((a, b) => b.name.length - a.name.length);
  const nameHits = byName.filter(p => q.includes(normalizeQuery(p.name)));
  if (nameHits.length) {
    const maxLen = Math.max(...nameHits.map(p => p.name.length));
    return nameHits.filter(p => p.name.length === maxLen);
  }
  const vendorLines = [...new Set(PRODUCTS.map(p => p.vendorLine))].sort((a, b) => b.length - a.length);
  const vendorHit = vendorLines.find(v => q.includes(normalizeQuery(v)));
  return vendorHit ? PRODUCTS.filter(p => p.vendorLine === vendorHit) : [];
}

function findCustomerMatch(q) {
  const customers = [...new Set(TRANSACTIONS.map(t => t.customer))].sort((a, b) => b.length - a.length);
  return customers.find(c => q.includes(normalizeQuery(c))) || null;
}

function findCategoryMatch(q) {
  const categories = [...new Set(PRODUCTS.map(p => p.category))];
  return categories.find(c => q.includes(normalizeQuery(c))) || null;
}

function extractProductNameQty(productField) {
  const m = productField.match(/^(.*?)\s*×\s*(\d+)/);
  return m ? { name: m[1].trim(), qty: parseInt(m[2], 10) } : { name: productField.trim(), qty: 1 };
}

function getTransactionsForCustomer(name) { return TRANSACTIONS.filter(t => t.customer === name); }
function getTransactionsForProduct(name) {
  const norm = normalizeQuery(name);
  return TRANSACTIONS.filter(t => normalizeQuery(extractProductNameQty(t.product).name) === norm);
}
function sumAmount(rows) { return rows.reduce((s, t) => s + t.amount, 0); }
function sumQty(rows) { return rows.reduce((s, t) => s + extractProductNameQty(t.product).qty, 0); }

function topProductAnswer() {
  const byProduct = {};
  TRANSACTIONS.forEach(t => {
    if (t.status === 'cancelled') return;
    const { name, qty } = extractProductNameQty(t.product);
    if (!byProduct[name]) byProduct[name] = { units: 0, revenue: 0 };
    byProduct[name].units += qty;
    byProduct[name].revenue += t.amount;
  });
  const sorted = Object.entries(byProduct).sort((a, b) => b[1].revenue - a[1].revenue);
  if (!sorted.length) return 'No transaction data is available yet.';
  const top3 = sorted.slice(0, 3).map(([n, v], i) => `${i + 1}. ${n} (${fmt$(v.revenue)})`).join('; ');
  const [name, d] = sorted[0];
  return `Our top-selling product by revenue is <strong>${name}</strong>, with ${fmt$(d.revenue)} across ${d.units.toLocaleString()} units. Top 3: ${top3}.`;
}

function topCustomerAnswer() {
  const byCustomer = {};
  TRANSACTIONS.forEach(t => {
    if (t.status === 'cancelled') return;
    if (!byCustomer[t.customer]) byCustomer[t.customer] = { revenue: 0, orders: 0 };
    byCustomer[t.customer].revenue += t.amount;
    byCustomer[t.customer].orders += 1;
  });
  const sorted = Object.entries(byCustomer).sort((a, b) => b[1].revenue - a[1].revenue);
  if (!sorted.length) return 'No transaction data is available yet.';
  const [name, d] = sorted[0];
  return `Our top customer by revenue is <strong>${name}</strong>, with ${fmt$(d.revenue)} across ${d.orders} order${d.orders === 1 ? '' : 's'}.`;
}

function answerAskAI(rawQuery) {
  const q = normalizeQuery(rawQuery);
  if (!q) return 'Please type a question — you can ask about product pricing, product details, or transaction and revenue data.';

  if (/^(hi|hello|hey|help|what can you do)/.test(q)) {
    return 'I can answer questions about our product catalog (pricing, descriptions, categories) and our transaction history (revenue, top customers/products, order counts, renewals). Try: "How much does Argus XDR cost?" or "How much revenue has Acme Corporation generated?"';
  }

  const productMatches = findProductMatches(q);
  const categoryMatch = findCategoryMatch(q);
  const customerMatch = findCustomerMatch(q);

  if (/top customer|biggest customer|highest revenue customer/.test(q)) return topCustomerAnswer();
  if (/top|best[- ]selling|most sold/.test(q) && !customerMatch) return topProductAnswer();

  if (/price|cost|how much (is|does|would)/.test(q) && productMatches.length === 1) {
    const p = productMatches[0];
    return `${p.name} is priced at <strong>${fmt$(p.listPrice)}</strong> ${p.priceUnit}.`;
  }

  if (/what is|what's|tell me about|describe/.test(q) && productMatches.length >= 1) {
    if (productMatches.length === 1) {
      const p = productMatches[0];
      return `${p.name} (${p.vendorLine}) is a ${p.category} ${p.type} product. ${p.shortDesc} List price: <strong>${fmt$(p.listPrice)}</strong> ${p.priceUnit}.`;
    }
    return `We carry ${productMatches.length} ${productMatches[0].vendorLine} products: ${productMatches.map(p => p.name).join(', ')}.`;
  }

  if (categoryMatch && /what|which|list|show/.test(q)) {
    const prods = PRODUCTS.filter(p => p.category === categoryMatch);
    return `Our ${categoryMatch} lineup: ${prods.map(p => p.name).join(', ')}.`;
  }

  if (/ytd|this year/.test(q) && /revenue|sales/.test(q)) {
    return `Year-to-date revenue is <strong>${fmt$(getYTDRevenue())}</strong>.`;
  }

  if (customerMatch) {
    const rows = getTransactionsForCustomer(customerMatch);
    if (/how many|count|number of/.test(q) && !/revenue|spent|sales/.test(q)) {
      return `${customerMatch} has <strong>${rows.length}</strong> order${rows.length === 1 ? '' : 's'} on record.`;
    }
    const total = sumAmount(rows);
    return `${customerMatch} has generated <strong>${fmt$(total)}</strong> in total revenue across ${rows.length} order${rows.length === 1 ? '' : 's'}.`;
  }

  if (productMatches.length === 1 && /sold|units|revenue|sales/.test(q)) {
    const p = productMatches[0];
    const rows = getTransactionsForProduct(p.name);
    if (!rows.length) return `We don't have any recorded sales of ${p.name} yet.`;
    return `We've sold <strong>${sumQty(rows).toLocaleString()} units</strong> of ${p.name} across ${rows.length} order${rows.length === 1 ? '' : 's'}, totaling <strong>${fmt$(sumAmount(rows))}</strong> in revenue.`;
  }

  if (/renewal/.test(q) && /(upcoming|due|next|coming)/.test(q)) {
    const list = getUpcomingRenewals(60);
    if (!list.length) return 'No renewals are due in the next 60 days.';
    return `Upcoming renewals (next 60 days): ${list.slice(0, 5).map(r => `${r.product} (${r.subId}) — ${r.daysLeft}d left, ${fmt$(r.amount)}`).join('; ')}.`;
  }

  if (/average|avg/.test(q) && /order|deal|sale/.test(q)) {
    const rows = TRANSACTIONS.filter(t => t.status !== 'cancelled');
    const avg = rows.length ? sumAmount(rows) / rows.length : 0;
    return `The average order value is <strong>${fmt$(avg)}</strong> across ${rows.length} orders.`;
  }

  const statusWord = ['active', 'pending', 'expired', 'cancelled'].find(s => q.includes(s));
  if (statusWord && /how many|count|number of/.test(q)) {
    const n = TRANSACTIONS.filter(t => t.status === statusWord).length;
    return `There are <strong>${n}</strong> ${statusWord} order${n === 1 ? '' : 's'}.`;
  }

  const typeMap = { renewal: 'renewal', 'new purchase': 'new_purchase', 'add-on': 'add_on', addon: 'add_on' };
  const typeKey = Object.keys(typeMap).find(k => q.includes(k));
  if (typeKey && /how many|count|number of/.test(q)) {
    const n = TRANSACTIONS.filter(t => t.type === typeMap[typeKey]).length;
    return `There are <strong>${n}</strong> ${typeKey} transactions on record.`;
  }

  // A capitalized, non-question-word phrase suggests the user named a
  // specific customer/product we couldn't match — flag that explicitly
  // rather than silently falling back to an unrelated total-revenue answer.
  const capCandidate = extractCapitalizedPhrase(rawQuery);
  if (capCandidate && !customerMatch && !productMatches.length && !categoryMatch) {
    return `I couldn't find any records for "${capCandidate}" in our product or transaction data. Double-check the spelling, or ask about overall revenue or top products instead.`;
  }

  if (/revenue|sales|how much (have we|has)/.test(q)) {
    const rows = TRANSACTIONS.filter(t => t.status !== 'cancelled');
    return `Total revenue across all transactions is <strong>${fmt$(sumAmount(rows))}</strong> from ${rows.length} orders.`;
  }

  return "I don't have enough information to answer that from our product or transaction data. Try asking about a specific product's price, a customer's order history, or overall revenue.";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderAskAI() {
  const hasMessages = S.askAi.messages.length > 0;
  const msgsHtml = S.askAi.messages.map(m => `
    <div class="msg-wrap ${m.role}">
      <div class="msg-bubble">${m.text}</div>
      <div class="msg-time">${m.time}</div>
    </div>`).join('');

  const suggestions = [
    'How much does Argus XDR cost?',
    'Tell me about SentryWall 3200',
    "What's our total revenue this year?",
    'How much revenue has Acme Corporation generated?',
    "What's our top-selling product?",
    'Which renewals are coming up?',
  ];

  return `
  <div class="ama-container">
    ${!hasMessages ? `
    <div class="ama-hero">
      <div class="ama-hero-icon"><i class="bi bi-stars"></i></div>
      <h2>Ask AI</h2>
      <p>Ask about product pricing, product details, or transaction and revenue data. Answers are computed directly from your live product and transaction records — if something isn't in the data, I'll say so.</p>
      <div class="ama-suggestions">
        ${suggestions.map(s => `<button class="ama-suggestion-card" data-ama-suggestion="${escapeHtml(s)}">${s}</button>`).join('')}
      </div>
    </div>` : `
    <div class="ama-toolbar"><button class="btn btn-outline btn-sm" id="ama-new-chat"><i class="bi bi-plus-lg"></i> New Chat</button></div>
    <div class="ama-messages" id="ama-messages">
      ${msgsHtml}
      ${S.askAi.typing ? `<div class="msg-wrap bot"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>` : ''}
    </div>`}
    <div class="ama-input-bar">
      <textarea class="chat-input ama-textarea" id="ama-input" placeholder="Ask a question — e.g. &quot;How much revenue has Acme Corporation generated?&quot;" rows="3"></textarea>
      <button class="chat-send-btn" id="ama-send-btn"><i class="bi bi-send-fill"></i></button>
    </div>
  </div>`;
}

function sendAskAIMessage(text) {
  if (!text.trim()) return;
  const time = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  S.askAi.messages.push({ role: 'user', text: escapeHtml(text), time: time() });
  S.askAi.typing = true;
  reloadAskAI();
  setTimeout(() => {
    const answer = answerAskAI(text);
    S.askAi.typing = false;
    S.askAi.messages.push({ role: 'bot', text: answer, time: time() });
    reloadAskAI();
  }, 700 + Math.random() * 700);
}

function reloadAskAI() {
  const pb = $id('page-body');
  if (pb) pb.innerHTML = renderAskAI();
  attachGlobalEvents();
  const msgsEl = $id('ama-messages');
  if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
}

/* ============================================================
   CHAT WIDGET
   ============================================================ */
const BOT_RESPONSES = [
  { keywords:['order','tracking'],           reply:'I can help you track an order! Please provide the Order ID (e.g., ORD-2024-0001) and I\'ll pull up the details right away.' },
  { keywords:['renewal','expire','expiring'], reply:'For subscription renewals, I recommend checking the Renewals section on your Dashboard. I can also escalate urgent renewals to your account manager — would that help?' },
  { keywords:['quote','price','pricing'],     reply:'Our Configurator tool (in the left navigation) lets you build and price bundles instantly. Once generated, your assigned sales rep can also provide volume discounts.' },
  { keywords:['invoice','billing','payment'], reply:'For billing enquiries, please email billing@nexusai.com or I can connect you with our finance team. Average response time is 4 business hours.' },
  { keywords:['warranty','repair','broken'],  reply:'For hardware support on SentryWall or IronGate appliances, I can open a support ticket directly. Could you provide the Serial Number and Order ID?' },
  { keywords:['palo alto','product','firewall','sentrywall'], reply:'Nexus AI currently carries the full Palo Alto Security lineup — SentryWall firewalls, Aegis endpoint protection, Argus XDR, Meridian SASE, and more. Use the Configurator to explore available products and add-ons.' },
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

  // Ask AI
  const amaSendBtn = $id('ama-send-btn');
  const amaInput = $id('ama-input');
  if (amaSendBtn && amaInput) {
    amaSendBtn.addEventListener('click', () => {
      const v = amaInput.value.trim();
      if (v) { amaInput.value = ''; sendAskAIMessage(v); }
    });
    amaInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = amaInput.value.trim();
        if (v) { amaInput.value = ''; sendAskAIMessage(v); }
      }
    });
  }
  document.querySelectorAll('[data-ama-suggestion]').forEach(el => {
    el.addEventListener('click', () => sendAskAIMessage(el.dataset.amaSuggestion));
  });
  const amaNewChat = $id('ama-new-chat');
  if (amaNewChat) amaNewChat.addEventListener('click', () => { S.askAi = { messages: [], typing: false }; updatePageBody(); });

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
    if (S.config.step < 4) { S.config.step++; reloadConfigurator(); }
  });
  if (prevBtn) prevBtn.addEventListener('click', () => {
    if (S.config.step > 1) { S.config.step--; reloadConfigurator(); }
  });

  // Product selection (Step 1)
  document.querySelectorAll('[data-select-product]').forEach(el => {
    el.addEventListener('click', () => {
      S.config.productKey = el.dataset.selectProduct;
      S.config.qty = 1;
      S.config.supportTier = 'Standard';
      S.config.term = 'annual';
      S.config.addons = new Set();
      S.config.step = 2;
      reloadConfigurator();
    });
  });

  // Step 1 catalog filters
  const cfgSearch = $id('cfg-search');
  if (cfgSearch) cfgSearch.addEventListener('input', e => { S.config.catalogFilter.search = e.target.value; reloadConfigurator(); });
  const cfgCategory = $id('cfg-category');
  if (cfgCategory) cfgCategory.addEventListener('change', e => { S.config.catalogFilter.category = e.target.value; reloadConfigurator(); });

  // Support tier / term selects (Step 2) — live quote update
  const tierEl = $id('cfg-tier');
  if (tierEl) tierEl.addEventListener('change', () => { S.config.supportTier = tierEl.value; reloadQuotePanel(); });
  const termEl = $id('cfg-term');
  if (termEl) termEl.addEventListener('change', () => { S.config.term = termEl.value; reloadQuotePanel(); });

  // Quantity (Step 2)
  const qtyDec = $id('qty-dec');
  const qtyInc = $id('qty-inc');
  if (qtyDec) {
    qtyDec.addEventListener('click', () => { if (S.config.qty > 1) { S.config.qty--; reloadConfigurator(); } });
    qtyInc.addEventListener('click', () => { S.config.qty++; reloadConfigurator(); });
  }

  // Add-ons (Step 3)
  document.querySelectorAll('[data-addon]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.addon;
      if (S.config.addons.has(k)) S.config.addons.delete(k);
      else S.config.addons.add(k);
      reloadConfigurator();
    });
  });

  // Submit quote (Step 4)
  const submitBtn = $id('cfg-submit');
  if (submitBtn) submitBtn.addEventListener('click', () => {
    S.config.step = 5;
    reloadConfigurator();
    showToast('Quote submitted! Your sales rep will be in touch.', 'success');
  });
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
  PRODUCTS     = window.PRODUCTS_DATA     || [];
  render();
};
