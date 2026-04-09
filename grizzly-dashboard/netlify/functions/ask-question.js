// Netlify Function: ask-question.js
// GET  → fetches fresh data via Apps Script web app
// POST → multi-turn chat via Claude with full data context

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyrFKRzmw6_N91tFYoxfDzPmSvsyjnVUL1T5aLWXPzcxy7_ko1PlYNPThx6P3l_Su-WCQ/exec';

// ── Static ground truth data (baked in — never changes) ──────────────────
const STATIC_DATA = `
== PARK BASICS ==
Yellowstone Grizzly RV Park, West Yellowstone, MT
238 total sites. Season: May 1 – Oct 15 (shoulder in Oct). Reservation software: Campspot. New owner fall 2024.

== 2025 FINAL ACTUALS (reservation charges only, by stay date) ==
May: 3,577 nights | $430,616 | $120.38 ADR
Jun: 6,724 nights | $960,993 | $142.92 ADR
Jul: 6,931 nights | $1,076,128 | $155.26 ADR
Aug: 6,333 nights | $893,223 | $141.04 ADR
Sep: 6,212 nights | $903,735 | $145.48 ADR
Oct: 1,225 nights | $155,082
Total May-Sep: 29,777 nights | $4,264,695 | $143.22 ADR

== 2025 ON BOOKS AT MAR 27 (booking cycle baseline) ==
May: 2,377 | Jun: 5,700 | Jul: 4,407 | Aug: 2,788 | Sep: 2,478 | Total: 17,750

== 2025 FULL-SEASON CANCELLATION ACTUALS ==
May: 183 cancels | 803 nights | $31,649 fees | $97,789 lost | 22.4% cancel rate
Jun: 412 cancels | 1,547 nights | $65,154 fees | $225,785 lost | 23.0% cancel rate
Jul: 343 cancels | 1,294 nights | $56,994 fees | $200,492 lost | 18.7% cancel rate
Aug: 247 cancels | 950 nights | $39,561 fees | $136,152 lost | 15.0% cancel rate
Sep: 271 cancels | 1,047 nights | $42,418 fees | $157,134 lost | 16.9% cancel rate

== CANCELLATION POLICY ==
>31 days before arrival: 10% fee | 7-31 days: 50% fee | <7 days: 100% fee. Payment upfront at booking.

== 2025 PER SITE TYPE ADR (reservation charges only) ==
Presidential: $184.54 | Prem Pull-Thru: $166.25 | Pull-Thru: $154.78 | Prem Back-In: $135.97
Back-In: $107.30 | Forest Back-In: $118.44 | Prem Forest: $147.25 | Cabin: $269.78

== SITE COUNT CHANGES 2025→2026 ==
Presidential: 5→8 (+3) | Prem Pull-Thru: 39→32 (-7) | Pull-Thru: 64→70 (+6)
Prem Back-In: 23→21 (-2) | Back-In: 51→51 | Gallatin: 24→24 | Prem Forest: 12→12 | Cabin: 9→9

== PROJECTION MODEL ==
Projected = min((on-books × (1 - locked_cancel_rate)) + (fwd_demand_2025 × demand_mult × (1 - lf_cancel_rate)), capacity)
Scenarios: Conservative=85% demand | Base=100% | Optimistic=115%
Capacity: 238 sites × days in month (May=7,378 | Jun=7,140 | Jul=7,378 | Aug=7,378 | Sep=7,140)

== 2025 FORWARD DEMAND (gross nights bookable from each date through month end) ==
This table shows how many nights were booked in 2025 AFTER each date through season end.
Use this to answer "how much late-fill demand is left" and "how many nights were added in 2025 between date X and Y".
Date       | May  | Jun  | Jul  | Aug  | Sep
2026-03-27 | 1660 | 2052 | 3782 | 4155 | 4586
2026-03-31 | 1623 | 1960 | 3661 | 4112 | 4502
2026-04-01 | 1610 | 1914 | 3615 | 4111 | 4476
2026-04-05 | 1541 | 1828 | 3522 | 4043 | 4390
2026-04-09 | 1505 | 1737 | 3389 | 3976 | 4337
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

NIGHTS ADDED IN 2025 BETWEEN TWO DATES: subtract FWD_DEMAND values.
Example: Jun nights added between Apr 1 and Apr 9 in 2025 = 1914 - 1737 = 177 nights.
For a 5-day window ending today (Apr 9): Jun = 1828 - 1737 = 91 nights (Apr 5 to Apr 9).

== 2025 DAILY FILL CURVE — TOTAL ON BOOKS (May-Sep, all months combined) ==
Use this to compute how many total nights were added between any two dates in 2025.
To find nights added between date A and date B: lookup(B) - lookup(A).
2025-03-27:17750 | 2025-03-28:17833 | 2025-03-29:17884 | 2025-03-30:17975 | 2025-03-31:18079
2025-04-01:18159 | 2025-04-02:18242 | 2025-04-03:18279 | 2025-04-04:18355 | 2025-04-05:18420
2025-04-06:18502 | 2025-04-07:18600 | 2025-04-08:18629 | 2025-04-09:18679 | 2025-04-10:18716
2025-04-11:18779 | 2025-04-15:18931 | 2025-04-16:19045 | 2025-04-20:19174 | 2025-04-21:19265
2025-04-25:19389 | 2025-04-30:19710 | 2025-05-01:19811 | 2025-05-05:20253 | 2025-05-10:20604
2025-05-15:21019 | 2025-05-20:21553 | 2025-05-25:21886 | 2025-05-31:22330 | 2025-06-01:22422
2025-06-05:22818 | 2025-06-10:23043 | 2025-06-15:23410 | 2025-06-20:23683 | 2025-06-25:24468
2025-06-30:24468 | 2025-07-03:24931 | 2025-07-10:25358 | 2025-07-15:25825 | 2025-07-20:26184
2025-07-25:26572 | 2025-07-31:26940 | 2025-08-01:26940 | 2025-08-07:27359 | 2025-08-15:27835
2025-08-20:28156 | 2025-08-25:28386 | 2025-08-31:28687 | 2025-09-04:28921 | 2025-09-10:28631
2025-09-16:26980 | 2025-09-21:27225 | 2025-09-28:27620 | 2025-10-01:27757 | 2025-10-16:28056

== 2025 PER-MONTH FILL CURVE (May, Jun, Jul, Aug, Sep on-books at key dates) ==
Use this for month-specific "how many nights were added" questions.
Format: date | [May, Jun, Jul, Aug, Sep]
2025-03-27 | [2377, 5700, 4407, 2788, 2478]
2025-04-01 | [2406, 5809, 4572, 2809, 2563]
2025-04-05 | [2410, 5849, 4657, 2872, 2632]
2025-04-09 | [2432, 5896, 4761, 2930, 2660]
2025-04-15 | [2460, 5944, 4813, 3018, 2696]
2025-04-20 | [2491, 5988, 4862, 3087, 2746]
2025-04-25 | [2493, 6024, 4925, 3132, 2815]
2025-04-30 | [2542, 6065, 4989, 3223, 2891]
2025-05-01 | [2543, 6098, 5014, 3242, 2914]
2025-05-10 | [2670, 6182, 5169, 3423, 3160]
2025-05-15 | [2780, 6229, 5249, 3494, 3267]
2025-05-20 | [2963, 6268, 5369, 3616, 3337]
2025-05-31 | [3185, 6353, 5523, 3778, 3491]
2025-06-01 | [3184, 6364, 5564, 3796, 3514]
2025-06-15 | [3184, 6627, 5842, 4031, 3726]
2025-06-30 | [3186, 6724, 6156, 4239, 3979]
2025-07-15 | [3186, 6724, 6680, 4805, 4255]
2025-07-31 | [3186, 6724, 6932, 5237, 4464]
2025-08-15 | [3186, 6724, 6931, 5878, 4680]
2025-08-31 | [3186, 6724, 6931, 6315, 5033]
2025-09-10 | [3186, 6724, 6931, 6333, 5457]
2025-10-01 | [631,  6724, 6931, 6333, 6212]

EXAMPLE CALCULATIONS:
- "Jun nights added Apr 5-9 2025": Jun[Apr-09] - Jun[Apr-05] = 5896 - 5849 = 47 nights
- "Jun nights added last 5 days (ending Apr 9) 2025": Jun[Apr-09] - Jun[Apr-04 nearest=Apr-05] = 5896 - 5849 = 47 nights
- "Total nights added Apr 1-9 2025": 18679 - 18159 = 520 nights
- Always use nearest available date if exact date not listed. Interpolate linearly if needed.

== 2025 SAME-DATE CANCELLATION RATES (cumulative through each date) ==
Key dates — format: date | May_rate% | Jun_rate% | Jul_rate% | Aug_rate% | Sep_rate%
2026-04-01 | May:11.3% | Jun:7.2% | Jul:3.1% | Aug:3.6% | Sep:2.0%
2026-04-05 | May:12.1% | Jun:8.0% | Jul:3.4% | Aug:3.9% | Sep:2.1%
2026-04-09 | May:12.7% | Jun:8.6% | Jul:4.2% | Aug:4.0% | Sep:2.5%
2026-04-15 | May:13.3% | Jun:9.3% | Jul:4.7% | Aug:4.0% | Sep:2.6%
2026-04-20 | May:13.9% | Jun:10.0% | Jul:5.1% | Aug:4.1% | Sep:2.6%
2026-04-30 | May:16.5% | Jun:11.7% | Jul:6.2% | Aug:4.8% | Sep:2.7%
`;

async function fetchFromAppsScript(file) {
  try {
    const resp = await fetch(`${APPS_SCRIPT_URL}?file=${file}&t=${Date.now()}`);
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
    ctx += '\nBy month — nights | revenue | rate:\n';
    const months = ['May','Jun','Jul','Aug','Sep'];
    months.forEach(m => {
      const n = snapshot.totals?.[m] || 0;
      const r = snapshot.revenue?.[m] || 0;
      const adr = n > 0 ? (r/n).toFixed(2) : '—';
      ctx += `  ${m}: ${n.toLocaleString()} nights | $${Math.round(r).toLocaleString()} | $${adr} ADR\n`;
    });
    ctx += `  Oct: ${snapshot.totals?.Oct || 0} nights\n`;

    // By site type
    if (snapshot.by_site_type) {
      ctx += '\nBy site type (May-Sep nights | revenue):\n';
      for (const [type, data] of Object.entries(snapshot.by_site_type)) {
        let nights = 0, rev = 0;
        months.forEach(m => {
          nights += data[m]?.nights || 0;
          rev    += data[m]?.rev    || 0;
        });
        if (nights > 0) {
          ctx += `  ${type}: ${nights.toLocaleString()} nights | $${Math.round(rev).toLocaleString()} | $${(rev/nights).toFixed(2)} ADR\n`;
        }
      }
    }

    // Full history array
    if (snapshot.history && snapshot.history.length) {
      ctx += '\nSNAPSHOT HISTORY (rolling 35-day, use for momentum calculations):\n';
      ctx += 'Format: date | total(May-Sep) | May | Jun | Jul | Aug | Sep | revenue\n';
      snapshot.history.forEach(h => {
        const rev = h.revenue != null ? `$${Math.round(h.revenue).toLocaleString()}` : 'no rev data';
        ctx += `  ${h.date} | ${h.total} | ${h.May||0} | ${h.Jun||0} | ${h.Jul||0} | ${h.Aug||0} | ${h.Sep||0} | ${rev}\n`;
      });
      ctx += '\nMOMENTUM CALCULATION GUIDE:\n';
      ctx += 'To find nights added in last N days: today_total - total_from_(today - N days) in history.\n';
      ctx += 'To find month-specific nights added: today_May - history_May_(N days ago), etc.\n';
      ctx += 'Compare to 2025 using the FC25 PER-MONTH FILL CURVE above with equivalent dates.\n';
    }
  }

  if (cancellation) {
    ctx += '\nCANCELLATION DATA (season-to-date cumulative):\n';
    ctx += `Report date: ${cancellation.report_date} | Total rows: ${cancellation.row_count}\n`;
    ctx += `Total fees collected: $${Math.round(cancellation.total_cancel_fees||0).toLocaleString()}\n`;
    ctx += `Total lost revenue: $${Math.round(cancellation.total_lost_revenue||0).toLocaleString()}\n`;
    ctx += 'By month:\n';
    const months = ['May','Jun','Jul','Aug','Sep'];
    months.forEach(m => {
      const mo = cancellation.by_month?.[m];
      if (mo) {
        ctx += `  ${m}: ${mo.count} cancels | ${mo.nights} nights | $${Math.round(mo.fees).toLocaleString()} fees | $${Math.round(mo.lost).toLocaleString()} lost\n`;
      }
    });
  }

  if (origination && origination.raw_rows && origination.raw_rows.length) {
    ctx += `\nORIGINATION REPORT (report date: ${origination.report_date}):\n`;
    ctx += `Total line items: ${origination.row_count} | Unique reservations: ${new Set(origination.raw_rows.map(r=>r.Confirmation)).size}\n`;
    const byMonth = {};
    const bySource = {};
    let online = 0, offline = 0;
    origination.raw_rows.forEach(r => {
      const arr = r['Arrival Date'] || '';
      const mo = arr.substring(0,7);
      if (mo) byMonth[mo] = (byMonth[mo]||0) + 1;
      const src = r['Reservation Source'] || 'Unknown';
      bySource[src] = (bySource[src]||0) + 1;
      const origin = (r['Request Origin']||'').toUpperCase();
      if (origin === 'ONLINE') online++; else offline++;
    });
    ctx += `Online: ${online} | Offline: ${offline}\n`;
    ctx += `By source: ${Object.entries(bySource).map(([s,n])=>`${s}:${n}`).join(' | ')}\n`;
    ctx += `By arrival month: ${Object.entries(byMonth).sort().map(([m,n])=>`${m}:${n}`).join(' | ')}\n`;
    ctx += 'NOTE: Origination covers last 2 days only — not cumulative 2026 totals.\n';
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

  // ── GET: fetch fresh data for dashboard ──────────────────────────────
  if (event.httpMethod === 'GET') {
    const [snapshot, cancellation, status, origination] = await Promise.all([
      fetchFromAppsScript('snapshot'),
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

  // ── POST: multi-turn chat via Claude ─────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

  // Fetch fresh live data for every request
  const [snapshot, cancellation, origination] = await Promise.all([
    fetchFromAppsScript('snapshot'),
    fetchFromAppsScript('cancellation'),
    fetchDriveFile('DRIVE_ORIGINATION_ID'),
  ]);

  const liveContext = buildLiveContext(snapshot, cancellation, origination);
  const systemPrompt = `You are a precise data analyst assistant for Yellowstone Grizzly RV Park in West Yellowstone, MT.
You have access to complete 2025 and 2026 pacing data, fill curves, cancellation history, and live daily pipeline data.
Answer questions concisely and accurately. Always show your math when doing calculations.
When answering momentum or "nights added" questions, show which data points you used.
If you're interpolating between dates, say so.
Do NOT suggest dashboard changes — your role is answering data questions only.

${STATIC_DATA}
${liveContext}

IMPORTANT CALCULATION REMINDERS:
- For "last N days" questions: use snapshot history to find today's total minus total from N days ago
- For month-specific "last N days": use the per-month columns in snapshot history
- For 2025 comparisons: use FC25 PER-MONTH FILL CURVE with the equivalent dates (subtract 1 year)
- Always state the exact dates and values you used in your calculation`;

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

    return {
      statusCode: 200,
      headers: NO_CACHE,
      body: JSON.stringify({ reply: text }),
    };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Function error: ' + err.message }) };
  }
};
