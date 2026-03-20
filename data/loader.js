/* ============================================================
   NEXUS AI PARTNER PORTAL — CSV Data Loader
   ============================================================
   Fetches all 7 CSV files, parses them, and assembles the
   window.* globals that app.js expects.

   REQUIRES a local web server (e.g. VS Code Live Server).
   Right-click index.html → "Open with Live Server".
   ============================================================ */
'use strict';

(async function () {

  /* ── Loading indicator ──────────────────────────────────── */
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100vh;font-family:'Inter',sans-serif;gap:14px;background:#f8fafc">
        <div style="width:22px;height:22px;border:3px solid #FF3621;
                    border-top-color:transparent;border-radius:50%;
                    animation:__spin .7s linear infinite"></div>
        <span style="color:#1B3139;font-size:15px;font-weight:500">Loading portal data…</span>
      </div>
      <style>@keyframes __spin{to{transform:rotate(360deg)}}</style>`;
  }

  /* ── CSV parser (handles quoted fields + "" escapes) ────── */
  function splitLine(line) {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (c === ',' && !inQ) {
        out.push(cur); cur = '';
      } else { cur += c; }
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').trim().split('\n');
    const headers = splitLine(lines[0]).map(h => h.trim());
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = splitLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    });
  }

  /* ── Fetch all CSVs ─────────────────────────────────────── */
  const FILES = [
    'data/transactions.csv',
    'data/models.csv',
    'data/cpu_options.csv',
    'data/ram_options.csv',
    'data/storage_options.csv',
    'data/accessories.csv',
    'data/software.csv',
  ];

  let rows;
  try {
    const texts = await Promise.all(
      FILES.map(f => fetch(f).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${f}`);
        return r.text();
      }))
    );
    rows = texts.map(parseCSV);
  } catch (err) {
    if (appEl) {
      appEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    height:100vh;font-family:'Inter',sans-serif;color:#1B3139;
                    gap:14px;text-align:center;padding:24px;background:#f8fafc">
          <span style="font-size:44px">⚠️</span>
          <h2 style="margin:0">Data could not be loaded</h2>
          <p style="margin:0;color:#64748b;max-width:420px;line-height:1.6">
            The portal must be served from a local web server — browsers block
            <code>fetch()</code> on <code>file://</code> URLs.<br><br>
            In VS Code: right-click <strong>index.html</strong> →
            <em>Open with Live Server</em>.
          </p>
          <code style="background:#fee2e2;color:#b91c1c;padding:6px 14px;
                       border-radius:6px;font-size:13px">${err.message}</code>
        </div>`;
    }
    return;
  }

  const [txRows, modelRows, cpuRows, ramRows, storRows, accRows, swRows] = rows;

  /* ── Assemble window globals ────────────────────────────── */

  window.TRANSACTIONS_DATA = txRows.map(r => ({
    id:       r.id,
    subId:    r.subId,
    customer: r.customer,
    product:  r.product,
    type:     r.type,
    start:    r.start,
    end:      r.end,
    status:   r.status,
    amount:   parseFloat(r.amount) || 0,
  }));

  window.BRANDS_DATA = {
    dell: { name: 'Dell', logo: '🖥️', tagline: 'Reliable Business & Workstation Solutions',
            image: 'https://placehold.co/120x48/1B3139/ffffff?text=Dell', accentColor: '#007db8' },
    hp:   { name: 'HP',  logo: '💻', tagline: 'Innovation. Performance. Sustainability.',
            image: 'https://placehold.co/120x48/1B3139/ffffff?text=HP',   accentColor: '#0096d6' },
  };

  window.MODELS_DATA = {};
  for (const m of modelRows) {
    const brand = m.brand;
    if (!window.MODELS_DATA[brand]) window.MODELS_DATA[brand] = [];
    window.MODELS_DATA[brand].push({
      key:          m.key,
      brand:        m.brand,
      category:     m.category,
      name:         m.name,
      desc:         m.desc,
      basePrice:    parseFloat(m.basePrice) || 0,
      sku:          m.sku,
      image:        m.image,
      specNote:     m.specNote,
      isWorkstation: m.isWorkstation === 'true',
      compatDocks:  m.compatDocks ? m.compatDocks.split('|') : [],
      cpuOpts:      cpuRows.filter(r => r.modelKey === m.key)
                           .map(r => ({ label: r.label, delta: parseFloat(r.delta) || 0, sku: r.sku })),
      ramOpts:      ramRows.filter(r => r.modelKey === m.key)
                           .map(r => ({ label: r.label, delta: parseFloat(r.delta) || 0, sku: r.sku, gb: parseInt(r.gb) || 0 })),
      storageOpts:  storRows.filter(r => r.modelKey === m.key)
                            .map(r => ({ label: r.label, delta: parseFloat(r.delta) || 0, sku: r.sku })),
    });
  }

  window.ACCESSORIES_DATA = accRows.map(r => ({
    key:      r.key,
    name:     r.name,
    desc:     r.desc,
    price:    parseFloat(r.price) || 0,
    sku:      r.sku,
    brands:   r.brands ? r.brands.split('|') : [],
    category: r.category,
    icon:     r.icon,
    image:    r.image,
  }));

  window.SOFTWARE_DATA = swRows.map(r => ({
    key:                r.key,
    name:               r.name,
    desc:               r.desc,
    price:              parseFloat(r.price) || 0,
    sku:                r.sku,
    minRam:             parseInt(r.minRam) || 0,
    workstationOnly:    r.workstationOnly === 'true',
    subscriptionPeriod: r.subscriptionPeriod,
    icon:               r.icon,
    image:              r.image,
  }));

  /* ── Launch the app ─────────────────────────────────────── */
  if (typeof window.__nexusRender === 'function') {
    window.__nexusRender();
  }

})();
