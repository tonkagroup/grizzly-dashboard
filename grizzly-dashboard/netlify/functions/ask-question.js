// Netlify Function: ask-question.js
// GET  → fetches fresh data via Apps Script web app
// POST → multi-turn chat via Claude with full data context

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyd30AWruVwz2njET7D27BxmQKh_6fAS8-VZLMAU2CIqPXYtCHsGUzmP_yJuevEJPkw5w/exec';

// ── STATIC GROUND TRUTH ───────────────────────────────────────────────────
// This never changes — baked in at deploy time
const STATIC_GROUND_TRUTH = `
== PARK BASICS ==
Yellowstone Grizzly RV Park, West Yellowstone, MT
238 total sites. Season: May 1 – Oct 15 (shoulder in Oct). Reservation software: Campspot. New owner fall 2024.
Main season tracked: May–Sep. October tracked separately.

== 2025 FINAL ACTUALS (reservation charges only, by stay date) ==
May:     3,577 nights | $430,616  | $120.38 ADR
Jun:     6,724 nights | $960,993  | $142.92 ADR
Jul:     6,931 nights | $1,076,128| $155.26 ADR
Aug:     6,333 nights | $893,223  | $141.04 ADR
Sep:     6,212 nights | $903,735  | $145.48 ADR
Oct:     1,225 nights | $155,082  | $126.60 ADR
May-Sep: 29,777 nights | $4,264,695 | $143.22 ADR blended

== 2025 ON BOOKS AT MAR 27 (booking cycle start) ==
May: 2,377 | Jun: 5,700 | Jul: 4,407 | Aug: 2,788 | Sep: 2,478 | Total: 17,750

== 2025 LATE FILL (nights added after Mar 27) ==
May: 1,200 | Jun: 1,024 | Jul: 2,524 | Aug: 3,545 | Sep: 3,734
Note: May includes ~391 walk-up nights not captured in snapshots.

== 2025 FULL-SEASON CANCELLATION ACTUALS ==
May: 183 cancels | 803 nights  | $31,649 fees | $97,789 lost  | 22.4% rate
Jun: 412 cancels | 1,547 nights| $65,154 fees | $225,785 lost | 23.0% rate
Jul: 343 cancels | 1,294 nights| $56,994 fees | $200,492 lost | 18.7% rate
Aug: 247 cancels | 950 nights  | $39,561 fees | $136,152 lost | 15.0% rate
Sep: 271 cancels | 1,047 nights| $42,418 fees | $157,134 lost | 16.9% rate
Cancel rate = cancelled nights / final actual nights.

== CANCELLATION POLICY ==
>31 days before arrival: 10% fee | 7–31 days: 50% fee | <7 days: 100% fee
Payment collected upfront at booking.

== 2025 PER SITE TYPE ADR ==
Presidential: $184.54 | Prem Pull-Thru: $166.25 | Pull-Thru: $154.78 | Prem Back-In: $135.97
Back-In: $107.30 | Forest Back-In (Gallatin): $118.44 | Prem Forest: $147.25 | Cabin: $269.78

== SITE COUNT CHANGES 2025→2026 ==
Presidential: 5→8 (+3) | Prem Pull-Thru: 39→32 (-7) | Pull-Thru: 64→70 (+6)
Prem Back-In: 23→21 (-2) | Back-In: 51→51 | Gallatin: 24→24 | Prem Forest: 12→12 | Cabin: 9→9
New in 2026: Apartments (4 sites, in pacing totals)
Total capacity: 238 sites (same as 2025 for RV sites)

== PROJECTION MODEL ==
Formula: projected = min(locked + lfNet, capacity)
  locked = onBooks26 × (1 - lockedCancelRate)
  lfGross = FWD_DEMAND_2025[snapDate][month] × demandMult
  lfNet = lfGross × (1 - lfCancelRate)
Scenarios: Conservative=85% demand | Base=100% | Optimistic=115%
Revenue = projected nights × per-month 2026 blended rate
Capacity: 238 sites × days in month (May=7378, Jun=7140, Jul=7378, Aug=7378, Sep=7140)

== LOCKED CANCEL CURVE (days to arrival → cancel rate) ==
180d:17.9% | 150d:16.8% | 120d:15.0% | 90d:13.0% | 60d:9.8% | 45d:7.7% | 30d:5.0% | 14d:2.9% | 7d:1.9% | 0d:1.0%

== LATE FILL CANCEL CURVE (days to arrival → cancel rate) ==
180d:9.9% | 150d:9.8% | 120d:9.3% | 90d:8.7% | 60d:7.1% | 45d:6.3% | 30d:4.6% | 14d:3.3% | 7d:2.3%

== 2025 FORWARD DEMAND (gross nights remaining to book from each date) ==
date       | May  | Jun  | Jul  | Aug  | Sep
2026-03-27 | 1660 | 2052 | 3782 | 4155 | 4586
2026-04-01 | 1610 | 1914 | 3615 | 4111 | 4476
2026-04-05 | 1541 | 1828 | 3522 | 4043 | 4390
2026-04-09 | 1505 | 1737 | 3389 | 3976 | 4337
2026-04-14 | 1452 | 1669 | 3277 | 3906 | 4298
2026-04-15 | 1434 | 1647 | 3246 | 3899 | 4288
2026-04-20 | 1384 | 1567 | 3181 | 3836 | 4258
2026-04-30 | 1133 | 1415 | 2936 | 3689 | 4100
2026-05-15 | 518  | 1049 | 2580 | 3405 | 3695
2026-05-31 | 2    | 703  | 2154 | 3131 | 3444
2026-06-15 | 0    | 210  | 1622 | 2816 | 3164
2026-06-30 | 0    | 7    | 1097 | 2521 | 2856
2026-07-15 | 0    | 0    | 404  | 2008 | 2557
2026-07-31 | 0    | 0    | 6    | 1424 | 2247
2026-08-15 | 0    | 0    | 0    | 548  | 1878
2026-08-31 | 0    | 0    | 0    | 22   | 1396
2026-09-15 | 0    | 0    | 0    | 0    | 624
2026-09-30 | 0    | 0    | 0    | 0    | 6
To find 2025 nights added between two dates: subtract FWD_DEMAND values.
Example: Jun added Apr 5–9 2025 = 2052-1828 = 224 nights (using Mar 27 as base, Apr 5 leaves 1828 remaining → 224 booked in that window)

== 2025 DAILY FILL CURVE — TOTAL ON BOOKS (key dates) ==
2025-03-27:17,750 | 2025-04-01:18,159 | 2025-04-05:18,420 | 2025-04-09:18,679
2025-04-14:18,893 | 2025-04-15:18,931 | 2025-04-20:19,174 | 2025-04-30:19,710
2025-05-01:19,811 | 2025-05-10:20,604 | 2025-05-15:21,019 | 2025-05-31:22,330
2025-06-15:23,410 | 2025-06-28:24,643 | 2025-07-15:25,825 | 2025-07-31:26,940
2025-08-15:27,835 | 2025-08-31:28,687 | 2025-09-10:28,631 | 2025-10-01:27,757
Linear interpolation between dates is appropriate for estimates.

== 2025 PER-MONTH ON BOOKS [May, Jun, Jul, Aug, Sep] (key dates) ==
2025-03-27 | [2377, 5700, 4407, 2788, 2478]
2025-04-01 | [2406, 5809, 4572, 2809, 2563]
2025-04-05 | [2410, 5849, 4657, 2872, 2632]
2025-04-09 | [2432, 5896, 4761, 2930, 2660]
2025-04-14 | [2457, 5938, 4804, 3003, 2694]
2025-04-15 | [2460, 5944, 4813, 3018, 2696]
2025-04-20 | [2491, 5988, 4862, 3087, 2746]
2025-04-30 | [2542, 6065, 4989, 3223, 2891]
2025-05-01 | [2543, 6098, 5014, 3242, 2914]
2025-05-15 | [2780, 6229, 5249, 3494, 3267]
2025-05-31 | [3185, 6353, 5523, 3778, 3491]
2025-06-15 | [3184, 6627, 5842, 4031, 3726]
2025-06-28 | [3186, 6724, 6156, 4239, 3979]
2025-07-15 | [3186, 6724, 6680, 4805, 4255]
2025-07-31 | [3186, 6724, 6932, 5237, 4464]
2025-08-15 | [3186, 6724, 6931, 5878, 4680]
2025-08-31 | [3186, 6724, 6931, 6315, 5033]
2025-09-10 | [3186, 6724, 6931, 6333, 5457]
2025-10-01 | [631,  6724, 6931, 6333, 6212]

== 2025 SAME-DATE CANCELLATION BENCHMARKS ==
(cumulative cancel nights and rates through equivalent point in 2025 booking cycle)
date       | May        | Jun        | Jul       | Aug       | Sep
2026-03-27 | 378n/10.6% | 457n/6.8%  | 198n/2.9% | 206n/3.3% | 108n/1.7%
2026-04-01 | 404n/11.3% | 484n/7.2%  | 218n/3.1% | 231n/3.6% | 127n/2.0%
2026-04-09 | 455n/12.7% | 578n/8.6%  | 289n/4.2% | 254n/4.0% | 158n/2.5%
2026-04-15 | 477n/13.3% | 622n/9.3%  | 325n/4.7% | 254n/4.0% | 160n/2.6%
2026-04-20 | 497n/13.9% | 673n/10.0% | 351n/5.1% | 258n/4.1% | 160n/2.6%
2026-04-30 | 534n/14.9% | 739n/11.0% | 419n/6.0% | 290n/4.6% | 169n/2.7%
2026-05-15 | 656n/18.3% | 961n/14.3% | 515n/7.4% | 343n/5.4% | 192n/3.1%
2026-06-01 | 803n/22.4% |1278n/19.0% | 683n/9.9% | 371n/5.9% | 242n/3.9%

== REVENUE NOTE ==
All revenue figures = reservation charges only. Excludes locked site fees, pet fees, other add-ons.
Rate premium 2026 vs 2025: +17.8% ($168.xx vs $143.22). At this premium, can lose ~12% of nights and still beat 2025 revenue.

== KNOWN ISSUES TO BE AWARE OF ==
1. FC25_TOTALS includes Oct nights from Jun 24 2025 onward (~356 nights). Action needed before Jun 24 2026.
2. Dashboard shows May-Sep only. Oct tracked separately.
3. Momentum cards use snapshot history — need report from exactly N days ago to show.
`;

// ── HELPERS ───────────────────────────────────────────────────────────────

async function fetchFromAppsScript(fileParam) {
  try {
    const url = fileParam
      ? `${APPS_SCRIPT_URL}?file=${fileParam}&t=${Date.now()}`
      : `${APPS_SCRIPT_URL}?t=${Date.now()}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch(e) { return null; }
}

async function fetchDriveFile(envKey) {
  const id = process.env[envKey];
  if (!id) return null;
  try {
    const resp = await fetch(`https://drive.google.com/uc?export=download&id=${id}&t=${Date.now()}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch(e) { return null; }
}

// Build context from live Drive/Apps Script data (server side)
function buildLiveContext(snapshot, cancellation, origination) {
  let ctx = '\n== LIVE DATA FROM DRIVE (fetched fresh this request) ==\n';

  if (snapshot) {
    ctx += `\nSNAPSHOT DATE: ${snapshot.snapshot_date}\n`;
    ctx += `Total nights on books (May-Sep): ${(snapshot.total_nights||0).toLocaleString()}\n`;
    ctx += `Total revenue on books: $${Math.round(snapshot.total_revenue||0).toLocaleString()}\n`;
    ctx += `Blended rate: $${(snapshot.blended_rate||0).toFixed(2)}/night\n`;
    ctx += '\nBy month — nights | revenue | ADR:\n';
    ['May','Jun','Jul','Aug','Sep'].forEach(m => {
      const n = snapshot.totals?.[m] || 0;
      const r = snapshot.revenue?.[m] || 0;
      const adr = n > 0 ? (r/n).toFixed(2) : '--';
      ctx += `  ${m}: ${n.toLocaleString()} nights | $${Math.round(r).toLocaleString()} | $${adr}\n`;
    });
    ctx += `  Oct: ${snapshot.totals?.Oct || 0} nights\n`;

    if (snapshot.by_site_type) {
      ctx += '\nBy site type (May-Sep totals):\n';
      for (const [type, data] of Object.entries(snapshot.by_site_type)) {
        let nights = 0, rev = 0;
        ['May','Jun','Jul','Aug','Sep'].forEach(m => {
          nights += data[m]?.nights || 0;
          rev    += data[m]?.rev    || 0;
        });
        if (nights > 0) ctx += `  ${type}: ${nights.toLocaleString()} nights | $${Math.round(rev).toLocaleString()} | $${nights>0?(rev/nights).toFixed(2):'--'} ADR\n`;
      }
    }

    if (snapshot.history && snapshot.history.length) {
      ctx += '\nSNAPSHOT HISTORY (for momentum — nights added between dates):\n';
      ctx += 'date       | total  | May  | Jun  | Jul  | Aug  | Sep  | revenue\n';
      snapshot.history.slice(-35).forEach(h => {
        const rev = h.revenue != null ? `$${Math.round(h.revenue).toLocaleString()}` : 'n/a';
        ctx += `  ${h.date} | ${String(h.total).padStart(6)} | ${String(h.May||0).padStart(4)} | ${String(h.Jun||0).padStart(4)} | ${String(h.Jul||0).padStart(4)} | ${String(h.Aug||0).padStart(4)} | ${String(h.Sep||0).padStart(4)} | ${rev}\n`;
      });
      ctx += 'To find nights added in last N days: subtract total_(N days ago) from today total. Use per-month columns for month breakdown.\n';
    }
  } else {
    ctx += '\nNo live snapshot available — using baseline data only.\n';
  }

  if (cancellation) {
    ctx += '\nCANCELLATION DATA (season-to-date 2026):\n';
    ctx += `Report date: ${cancellation.report_date} | Total rows: ${cancellation.row_count}\n`;
    ctx += `Fees collected: $${Math.round(cancellation.total_cancel_fees||0).toLocaleString()} | Lost revenue: $${Math.round(cancellation.total_lost_revenue||0).toLocaleString()}\n`;
    ctx += 'By month:\n';
    ['May','Jun','Jul','Aug','Sep'].forEach(m => {
      const mo = cancellation.by_month?.[m];
      if (mo) ctx += `  ${m}: ${mo.count} cancels | ${mo.nights} nights | $${Math.round(mo.fees||0).toLocaleString()} fees | $${Math.round(mo.lost||0).toLocaleString()} lost\n`;
    });
  }

  if (origination && origination.raw_rows && origination.raw_rows.length) {
    ctx += `\nORIGINATION (last 2 days of new bookings, report date: ${origination.report_date}):\n`;
    ctx += `${origination.row_count} line items | ${new Set(origination.raw_rows.map(r=>r.Confirmation)).size} unique reservations\n`;
    const byMonth = {};
    origination.raw_rows.forEach(r => {
      const mo = (r['Arrival Date']||'').substring(0,7);
      if (mo) byMonth[mo] = (byMonth[mo]||0) + 1;
    });
    ctx += `By arrival month: ${Object.entries(byMonth).sort().map(([m,n])=>`${m}:${n}`).join(' | ')}\n`;
    ctx += 'NOTE: Origination = last 2 days only, NOT cumulative.\n';
  }

  return ctx;
}

// Build context from dashboard STATE passed in POST body (browser side)
function buildDashboardContext(dc) {
  if (!dc) return '';
  let ctx = '\n== DASHBOARD STATE (from browser, reflects latest loaded data) ==\n';

  ctx += `Snapshot date: ${dc.snapshotDate || 'unknown'}\n`;
  ctx += `Blended rate 2026: $${(dc.rate26||0).toFixed(2)}/night\n`;
  ctx += `Total revenue on books: $${Math.round(dc.totalRevenue26||0).toLocaleString()}\n`;
  ctx += `October nights on books: ${dc.oct26||0}\n`;

  if (dc.onBooks26 && dc.rate26ByMonth) {
    ctx += '\n2026 nights on books and per-month rates:\n';
    const months = ['May','Jun','Jul','Aug','Sep'];
    months.forEach((m,i) => {
      const n = dc.onBooks26[i]||0;
      const r = dc.rate26ByMonth[i]||0;
      ctx += `  ${m}: ${n.toLocaleString()} nights | $${r.toFixed(2)} ADR\n`;
    });
  }

  if (dc.siteTypes) {
    ctx += '\nSite type detail (2026 vs 2025, supply-adjusted demand ratios):\n';
    const st = dc.siteTypes;
    (st.labels||[]).forEach((lbl,i) => {
      const n25 = st.nights25?.[i]||0, n26 = st.nights26?.[i]||0;
      const s25 = st.sites25?.[i]||1, s26 = st.sites26?.[i]||1;
      const raw = n25 > 0 ? (n26/n25) : 0;
      const dem = raw * s25/s26;
      const r26 = st.rate26?.[i];
      ctx += `  ${lbl}: ${n25.toLocaleString()} nights 2025 → ${n26.toLocaleString()} nights 2026 | demand ratio: ${(dem*100).toFixed(0)}%`;
      if (r26) ctx += ` | 2026 ADR: $${r26.toFixed(2)}`;
      ctx += '\n';
    });
  }

  if (dc.snapshotHistory && dc.snapshotHistory.length) {
    ctx += '\nFULL SNAPSHOT HISTORY (2026 booking accumulation — use for trend analysis):\n';
    ctx += 'date       | total  | May  | Jun  | Jul  | Aug  | Sep  | revenue\n';
    dc.snapshotHistory.forEach(h => {
      const rev = h.revenue != null ? `$${Math.round(h.revenue).toLocaleString()}` : 'n/a';
      ctx += `  ${h.date} | ${String(h.total||0).padStart(6)} | ${String(h.May||0).padStart(4)} | ${String(h.Jun||0).padStart(4)} | ${String(h.Jul||0).padStart(4)} | ${String(h.Aug||0).padStart(4)} | ${String(h.Sep||0).padStart(4)} | ${rev}\n`;
    });
  }

  if (dc.cancels && dc.cancels.by_month) {
    ctx += '\n2026 CANCELLATION DETAIL (from dashboard state):\n';
    ctx += `Report date: ${dc.cancels.report_date||'unknown'} | Row count: ${dc.cancels.row_count||0}\n`;
    ['May','Jun','Jul','Aug','Sep'].forEach(m => {
      const mo = dc.cancels.by_month[m];
      if (mo) {
        const ob = dc.onBooks26 ? dc.onBooks26[['May','Jun','Jul','Aug','Sep'].indexOf(m)] : 0;
        const rate = ob > 0 ? (mo.nights/ob*100).toFixed(1) : '--';
        ctx += `  ${m}: ${mo.count} cancels | ${mo.nights} nights | ${rate}% of on-books | $${Math.round(mo.fees||0).toLocaleString()} fees | $${Math.round(mo.lost||0).toLocaleString()} lost\n`;
      }
    });
  }

  if (dc.projections) {
    ctx += '\nPROJECTION MODEL OUTPUT (all three scenarios):\n';
    const months = ['May','Jun','Jul','Aug','Sep'];
    ['conservative','base','optimistic'].forEach(scenKey => {
      const proj = dc.projections[scenKey];
      if (!proj) return;
      const totalNights = proj.reduce((a,r)=>a+(r.proj||0),0);
      const totalRev    = proj.reduce((a,r)=>a+(r.rev||0),0);
      const vs2025rev   = ((totalRev/4264695-1)*100).toFixed(1);
      ctx += `\n  ${scenKey.toUpperCase()}:\n`;
      ctx += `  Total: ${totalNights.toLocaleString()} nights | $${Math.round(totalRev/1000)}K revenue | ${vs2025rev}% vs 2025\n`;
      proj.forEach(r => {
        ctx += `    ${r.month}: ${(r.onBooks||0).toLocaleString()} on books → ${(r.locked||0).toLocaleString()} locked + ${(r.lfNet||0).toLocaleString()} late fill = ${(r.proj||0).toLocaleString()} projected (${(r.occ||0).toFixed(1)}% occ) | $${Math.round((r.rev||0)/1000)}K\n`;
      });
    });
  }

  return ctx;
}

// ── HEADERS ───────────────────────────────────────────────────────────────

const NO_CACHE = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Surrogate-Control': 'no-store',
};

// ── HANDLER ───────────────────────────────────────────────────────────────

exports.handler = async function(event, context) {

  // GET: fetch all data for dashboard initial load
  if (event.httpMethod === 'GET') {
    const [snapshot, cancellation, status, origination] = await Promise.all([
      fetchFromAppsScript(null),
      fetchFromAppsScript('cancellation'),
      fetchFromAppsScript('status'),
      fetchDriveFile('DRIVE_ORIGINATION_ID'),
    ]);
    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ snapshot, status, cancellation, origination }),
    };
  }

  // POST: multi-turn chat
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { messages, dashboardContext } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

  // Fetch live data from Drive in parallel with handling the request
  const [snapshot, cancellation, origination] = await Promise.all([
    fetchFromAppsScript(null),
    fetchFromAppsScript('cancellation'),
    fetchDriveFile('DRIVE_ORIGINATION_ID'),
  ]);

  const liveContext      = buildLiveContext(snapshot, cancellation, origination);
  const dashContext      = buildDashboardContext(dashboardContext);

  const systemPrompt = `You are a precise revenue operations analyst for Yellowstone Grizzly RV Park, West Yellowstone, MT.

Your job is to answer questions accurately and concisely using the data provided. Always:
- Show your math when doing calculations
- State the exact dates and values you're using
- Compare 2026 to 2025 at the equivalent point in the booking cycle when relevant
- Flag if data needed to answer is missing or uncertain
- Keep responses focused — bullet points for multi-part answers, prose for simple ones
- Do NOT suggest dashboard changes or code modifications

You have access to three data layers:
1. STATIC GROUND TRUTH — 2025 actuals, fill curves, model parameters (always available)
2. LIVE DRIVE DATA — freshly fetched from Google Drive this request (most authoritative for current state)
3. DASHBOARD STATE — what the browser currently has loaded (includes projections, full history, site detail)

If data appears in multiple layers, prefer LIVE DRIVE DATA for current snapshot figures, and DASHBOARD STATE for computed outputs like projections.

${STATIC_GROUND_TRUTH}
${liveContext}
${dashContext}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: response.status, body: JSON.stringify({ error: err }) };
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ reply: text }) };

  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Function error: ' + err.message }) };
  }
};
