// Netlify Function: ask-question.js
// GET  → fetches fresh data via Apps Script web app
// POST → multi-turn chat via Claude with full data context

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyrFKRzmw6_N91tFYoxfDzPmSvsyjnVUL1T5aLWXPzcxy7_ko1PlYNPThx6P3l_Su-WCQ/exec';

const STATIC_DATA = `
== PARK BASICS ==
Yellowstone Grizzly RV Park, West Yellowstone, MT
238 total sites. Season: May 1 - Oct 15 (shoulder in Oct). Reservation software: Campspot. New owner fall 2024.

== 2025 FINAL ACTUALS (reservation charges only, by stay date) ==
May: 3,577 nights | $430,616 | $120.38 ADR
Jun: 6,724 nights | $960,993 | $142.92 ADR
Jul: 6,931 nights | $1,076,128 | $155.26 ADR
Aug: 6,333 nights | $893,223 | $141.04 ADR
Sep: 6,212 nights | $903,735 | $145.48 ADR
Oct: 1,225 nights | $155,082
Total May-Sep: 29,777 nights | $4,264,695 | $143.22 ADR

== 2025 ON BOOKS AT MAR 27 ==
May: 2,377 | Jun: 5,700 | Jul: 4,407 | Aug: 2,788 | Sep: 2,478 | Total: 17,750

== 2025 FULL-SEASON CANCELLATION ACTUALS ==
May: 183 cancels | 803 nights | $31,649 fees | $97,789 lost | 22.4% rate
Jun: 412 cancels | 1,547 nights | $65,154 fees | $225,785 lost | 23.0% rate
Jul: 343 cancels | 1,294 nights | $56,994 fees | $200,492 lost | 18.7% rate
Aug: 247 cancels | 950 nights | $39,561 fees | $136,152 lost | 15.0% rate
Sep: 271 cancels | 1,047 nights | $42,418 fees | $157,134 lost | 16.9% rate

== CANCELLATION POLICY ==
>31 days before arrival: 10% fee | 7-31 days: 50% fee | <7 days: 100% fee.

== 2025 PER SITE TYPE ADR ==
Presidential: $184.54 | Prem Pull-Thru: $166.25 | Pull-Thru: $154.78 | Prem Back-In: $135.97
Back-In: $107.30 | Forest Back-In: $118.44 | Prem Forest: $147.25 | Cabin: $269.78

== SITE COUNT CHANGES 2025->2026 ==
Presidential: 5->8 | Prem Pull-Thru: 39->32 | Pull-Thru: 64->70
Prem Back-In: 23->21 | Back-In: 51->51 | Gallatin: 24->24 | Prem Forest: 12->12 | Cabin: 9->9

== 2025 FORWARD DEMAND (gross nights remaining to book from each date) ==
Date       | May  | Jun  | Jul  | Aug  | Sep
2026-03-27 | 1660 | 2052 | 3782 | 4155 | 4586
2026-04-01 | 1610 | 1914 | 3615 | 4111 | 4476
2026-04-05 | 1541 | 1828 | 3522 | 4043 | 4390
2026-04-09 | 1505 | 1737 | 3389 | 3976 | 4337
2026-04-15 | 1434 | 1647 | 3246 | 3899 | 4288
2026-04-20 | 1384 | 1567 | 3181 | 3836 | 4258
2026-04-30 | 1133 | 1415 | 2936 | 3689 | 4100
2026-05-15 | 518  | 1049 | 2580 | 3405 | 3695
2026-05-31 | 2    | 703  | 2154 | 3131 | 3444
2026-06-30 | 0    | 7    | 1097 | 2521 | 2856
2026-07-31 | 0    | 0    | 6    | 1424 | 2247
2026-08-31 | 0    | 0    | 0    | 22   | 1396
2026-09-30 | 0    | 0    | 0    | 0    | 6

NIGHTS ADDED IN 2025 BETWEEN TWO DATES: subtract FWD_DEMAND values.
Example: Jun added Apr 5-9 2025 = 1914 - 1737 = 177 nights.

== 2025 DAILY FILL CURVE - TOTAL ON BOOKS ==
2025-03-27:17750 | 2025-03-31:18079 | 2025-04-01:18159 | 2025-04-05:18420 | 2025-04-09:18679
2025-04-15:18931 | 2025-04-20:19174 | 2025-04-25:19389 | 2025-04-30:19710 | 2025-05-01:19811
2025-05-10:20604 | 2025-05-15:21019 | 2025-05-20:21553 | 2025-05-31:22330 | 2025-06-15:23410
2025-06-30:24468 | 2025-07-15:25825 | 2025-07-31:26940 | 2025-08-15:27835 | 2025-08-31:28687
2025-09-10:28631 | 2025-09-28:27620 | 2025-10-01:27757 | 2025-10-16:28056

== 2025 PER-MONTH FILL CURVE [May, Jun, Jul, Aug, Sep] ==
2025-03-27 | [2377, 5700, 4407, 2788, 2478]
2025-04-01 | [2406, 5809, 4572, 2809, 2563]
2025-04-05 | [2410, 5849, 4657, 2872, 2632]
2025-04-09 | [2432, 5896, 4761, 2930, 2660]
2025-04-15 | [2460, 5944, 4813, 3018, 2696]
2025-04-20 | [2491, 5988, 4862, 3087, 2746]
2025-04-30 | [2542, 6065, 4989, 3223, 2891]
2025-05-01 | [2543, 6098, 5014, 3242, 2914]
2025-05-15 | [2780, 6229, 5249, 3494, 3267]
2025-05-31 | [3185, 6353, 5523, 3778, 3491]
2025-06-15 | [3184, 6627, 5842, 4031, 3726]
2025-06-30 | [3186, 6724, 6156, 4239, 3979]
2025-07-15 | [3186, 6724, 6680, 4805, 4255]
2025-07-31 | [3186, 6724, 6932, 5237, 4464]
2025-08-15 | [3186, 6724, 6931, 5878, 4680]
2025-08-31 | [3186, 6724, 6931, 6315, 5033]
2025-09-10 | [3186, 6724, 6931, 6333, 5457]
2025-10-01 | [631,  6724, 6931, 6333, 6212]

== 2025 SAME-DATE CANCELLATION RATES ==
2026-04-01 | May:11.3% | Jun:7.2% | Jul:3.1% | Aug:3.6% | Sep:2.0%
2026-04-09 | May:12.7% | Jun:8.6% | Jul:4.2% | Aug:4.0% | Sep:2.5%
2026-04-15 | May:13.3% | Jun:9.3% | Jul:4.7% | Aug:4.0% | Sep:2.6%
2026-04-20 | May:13.9% | Jun:10.0% | Jul:5.1% | Aug:4.1% | Sep:2.6%
2026-04-30 | May:16.5% | Jun:11.7% | Jul:6.2% | Aug:4.8% | Sep:2.7%
`;

// Fetch one file from Apps Script using ?file= parameter
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

function buildLiveContext(snapshot, cancellation, origination) {
  let ctx = '\n== LIVE DATA (fresh as of this request) ==\n';

  if (snapshot) {
    ctx += `\nSNAPSHOT DATE: ${snapshot.snapshot_date}\n`;
    ctx += `Total nights on books (May-Sep): ${snapshot.total_nights?.toLocaleString()}\n`;
    ctx += `Total revenue on books: $${Math.round(snapshot.total_revenue || 0).toLocaleString()}\n`;
    ctx += `Blended rate: $${(snapshot.blended_rate || 0).toFixed(2)}/night\n`;
    ctx += '\nBy month -- nights | revenue | rate:\n';
    const months = ['May','Jun','Jul','Aug','Sep'];
    months.forEach(m => {
      const n = snapshot.totals?.[m] || 0;
      const r = snapshot.revenue?.[m] || 0;
      const adr = n > 0 ? (r/n).toFixed(2) : '--';
      ctx += `  ${m}: ${n.toLocaleString()} nights | $${Math.round(r).toLocaleString()} | $${adr} ADR\n`;
    });
    ctx += `  Oct: ${snapshot.totals?.Oct || 0} nights\n`;

    if (snapshot.by_site_type) {
      ctx += '\nBy site type (May-Sep):\n';
      for (const [type, data] of Object.entries(snapshot.by_site_type)) {
        let nights = 0, rev = 0;
        ['May','Jun','Jul','Aug','Sep'].forEach(m => {
          nights += data[m]?.nights || 0;
          rev    += data[m]?.rev    || 0;
        });
        if (nights > 0) ctx += `  ${type}: ${nights.toLocaleString()} nights | $${Math.round(rev).toLocaleString()} | $${(rev/nights).toFixed(2)} ADR\n`;
      }
    }

    if (snapshot.history && snapshot.history.length) {
      ctx += '\nSNAPSHOT HISTORY (use for momentum — nights added between dates):\n';
      ctx += 'date | total | May | Jun | Jul | Aug | Sep | revenue\n';
      snapshot.history.forEach(h => {
        const rev = h.revenue != null ? `$${Math.round(h.revenue).toLocaleString()}` : 'n/a';
        ctx += `  ${h.date} | ${h.total} | ${h.May||0} | ${h.Jun||0} | ${h.Jul||0} | ${h.Aug||0} | ${h.Sep||0} | ${rev}\n`;
      });
      ctx += 'To find nights added in last N days: today_total - total_(N days ago). Use per-month columns for month-specific.\n';
    }
  } else {
    ctx += '\nNo live snapshot -- seeded baseline data only.\n';
  }

  if (cancellation) {
    ctx += '\nCANCELLATION DATA (season-to-date):\n';
    ctx += `Report date: ${cancellation.report_date} | Rows: ${cancellation.row_count}\n`;
    ctx += `Fees collected: $${Math.round(cancellation.total_cancel_fees||0).toLocaleString()} | Lost revenue: $${Math.round(cancellation.total_lost_revenue||0).toLocaleString()}\n`;
    ['May','Jun','Jul','Aug','Sep'].forEach(m => {
      const mo = cancellation.by_month?.[m];
      if (mo) ctx += `  ${m}: ${mo.count} cancels | ${mo.nights} nights | $${Math.round(mo.fees).toLocaleString()} fees | $${Math.round(mo.lost).toLocaleString()} lost\n`;
    });
  }

  if (origination && origination.raw_rows && origination.raw_rows.length) {
    ctx += `\nORIGINATION (last 2 days, report date: ${origination.report_date}):\n`;
    ctx += `${origination.row_count} line items | ${new Set(origination.raw_rows.map(r=>r.Confirmation)).size} unique reservations\n`;
    const byMonth = {};
    origination.raw_rows.forEach(r => {
      const mo = (r['Arrival Date']||'').substring(0,7);
      if (mo) byMonth[mo] = (byMonth[mo]||0) + 1;
    });
    ctx += `By arrival month: ${Object.entries(byMonth).sort().map(([m,n])=>`${m}:${n}`).join(' | ')}\n`;
    ctx += 'NOTE: Origination = last 2 days only, not cumulative totals.\n';
  }

  return ctx;
}

const NO_CACHE = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Surrogate-Control': 'no-store',
};

exports.handler = async function(event, context) {

  // GET: fetch all data for dashboard
  if (event.httpMethod === 'GET') {
    const [snapshot, cancellation, status, origination] = await Promise.all([
      fetchFromAppsScript(null),           // no ?file= param → returns snapshot (default)
      fetchFromAppsScript('cancellation'), // ?file=cancellation
      fetchFromAppsScript('status'),       // ?file=status
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

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

  const [snapshot, cancellation, origination] = await Promise.all([
    fetchFromAppsScript(null),
    fetchFromAppsScript('cancellation'),
    fetchDriveFile('DRIVE_ORIGINATION_ID'),
  ]);

  const liveContext  = buildLiveContext(snapshot, cancellation, origination);
  const systemPrompt = `You are a precise data analyst for Yellowstone Grizzly RV Park, West Yellowstone, MT.
Answer questions accurately using the data below. Always show your math. State the exact dates and values used.
For momentum/nights-added questions use the snapshot history table. For 2025 comparisons use the fill curves.
Do NOT suggest dashboard changes.

${STATIC_DATA}
${liveContext}`;

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
