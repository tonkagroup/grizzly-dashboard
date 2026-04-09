// Netlify Function: ask-question.js
// GET  → fetches fresh data via Apps Script web app (bypasses Drive CDN cache)
// POST → answers chat questions using Claude

// !! IMPORTANT: Replace this with your Apps Script /exec URL after deploying Code.gs !!
const APPS_SCRIPT_URL = https://script.google.com/macros/s/AKfycbyrFKRznw6_N91tFYoxfDzPmSvsyjnVUL1T5aLWXPzcxy7_ko1PlYNPThx6P3l_Su-WCQ/exec

const PARK_CONTEXT_STATIC = `
You are a data analyst assistant for Yellowstone Grizzly RV Park in West Yellowstone, MT.
You have access to the park's complete pacing model data for the 2025 and 2026 seasons,
plus live daily data from the automated pipeline (snapshot, origination, cancellation reports).
Answer questions concisely and accurately. Be precise with numbers.
If asked about something not in the data, say so clearly.
Do NOT modify or suggest changes to the dashboard display — your role is answering questions only.

== PARK BASICS ==
- 238 total sites
- Season: May 1 – October 15 (shoulder in Oct)
- Reservation software: Campspot
- New owner took over fall 2024

== 2025 FINAL ACTUALS (rent roll, nights by stay date) ==
May: 3,577 nights | $433,771 revenue | $121.27 ADR
Jun: 6,724 nights | $978,078 revenue | $145.46 ADR
Jul: 6,931 nights | $1,093,913 revenue | $157.83 ADR
Aug: 6,333 nights | $916,590 revenue | $144.73 ADR
Sep: 6,212 nights | $922,014 revenue | $148.42 ADR
Oct: 1,225 nights | $155,082 revenue
Total 2025: 31,002 nights | $4,499,449 revenue | $145.13 blended ADR

== 2025 ON BOOKS AT MAR 27 (baseline comparison point) ==
May: 2,377 (66.5% of final) | Jun: 5,700 (84.8% of final)
Jul: 4,407 (63.6% of final) | Aug: 2,788 (44.0% of final) | Sep: 2,478 (39.9% of final)
Total: 17,750 nights

== 2026 ON BOOKS (latest snapshot) ==
See live snapshot data below — loaded fresh on each request.

== CANCELLATION POLICY ==
>31 days before arrival: 10% fee
7–31 days: 50% fee | <7 days: 100% fee
Payment taken upfront at booking.
`;

// Fetch fresh data directly from Apps Script web app — no Drive CDN caching
async function fetchFromAppsScript(file) {
  try {
    const url = `${APPS_SCRIPT_URL}?file=${file}&t=${Date.now()}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch(e) {
    return null;
  }
}

// Origination still fetched from Drive (less critical, changes less)
async function fetchDriveFile(envKey) {
  const id = process.env[envKey];
  if (!id) return null;
  try {
    const resp = await fetch(`https://drive.google.com/uc?export=download&id=${id}&t=${Date.now()}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch(e) {
    return null;
  }
}

function summarizeOrigination(data) {
  if (!data || !data.raw_rows || !data.raw_rows.length) return null;
  const rows = data.raw_rows;
  const reportDate = data.report_date || 'unknown';
  const DATE_KEY = 'Origination/Claimed (Park TZ) Date';
  const byDate = {};
  const byArrivalMonth = {};
  const bySource = {};
  let online = 0, offline = 0;
  const uniqueConfs = new Set();

  rows.forEach(r => {
    const d = r[DATE_KEY] || '';
    if (d) byDate[d] = (byDate[d] || 0) + 1;
    uniqueConfs.add(r['Confirmation'] || '');
    const arrival = r['Arrival Date'] || '';
    if (arrival) {
      const month = arrival.substring(0, 7);
      byArrivalMonth[month] = (byArrivalMonth[month] || 0) + 1;
    }
    const src = r['Reservation Source'] || 'Unknown';
    bySource[src] = (bySource[src] || 0) + 1;
    const origin = (r['Request Origin'] || '').toUpperCase();
    if (origin === 'ONLINE') online++; else offline++;
  });

  const dateLines    = Object.entries(byDate).sort().map(([d,n]) => `${d}: ${n}`).join(' | ');
  const arrivalLines = Object.entries(byArrivalMonth).sort().map(([m,n]) => `${m}: ${n}`).join(' | ');
  const sourceLines  = Object.entries(bySource).sort((a,b) => b[1]-a[1]).map(([s,n]) => `${s}: ${n}`).join(' | ');

  return `== LIVE ORIGINATION DATA (report date: ${reportDate}) ==
Total line items: ${rows.length} | Unique reservations: ${uniqueConfs.size}
By booking date: ${dateLines || 'none'}
Online: ${online} | Offline: ${offline} | Source: ${sourceLines}
Arrival month: ${arrivalLines}
NOTE: Covers last 2 days only — not cumulative.`;
}

function summarizeCancellation(data) {
  if (!data) return null;
  const reportDate = data.report_date || 'unknown';
  const bm = data.by_month || {};
  const months = ['May','Jun','Jul','Aug','Sep'];
  const lines = months.map(m => {
    const mo = bm[m];
    if (!mo) return null;
    return `${m}: ${mo.nights} nights cancelled | ${mo.count} reservations | $${Math.round(mo.fees).toLocaleString()} fees | $${Math.round(mo.lost).toLocaleString()} lost`;
  }).filter(Boolean).join('\n');
  return `== LIVE CANCELLATION DATA (report date: ${reportDate}) ==
Total rows: ${data.row_count || 0} | Total fees: $${Math.round(data.total_cancel_fees||0).toLocaleString()} | Total lost: $${Math.round(data.total_lost_revenue||0).toLocaleString()}
${lines}`;
}

exports.handler = async function(event, context) {

  const NO_CACHE = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Surrogate-Control': 'no-store',
  };

  // ── GET: fetch fresh data for dashboard ──────────────────────
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

  // ── POST: answer a question via Claude ───────────────────────
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

  const [snapshot, cancellation, origination] = await Promise.all([
    fetchFromAppsScript('snapshot'),
    fetchFromAppsScript('cancellation'),
    fetchDriveFile('DRIVE_ORIGINATION_ID'),
  ]);

  let liveContext = '';
  if (snapshot) {
    liveContext += `\n== LIVE SNAPSHOT (${snapshot.snapshot_date}) ==\n`;
    liveContext += `Total nights on books (May-Sep): ${snapshot.total_nights?.toLocaleString()}\n`;
    liveContext += `Total revenue on books: $${snapshot.total_revenue?.toLocaleString()}\n`;
    liveContext += `Blended rate: $${snapshot.blended_rate?.toFixed(2)}/night\n`;
    ['May','Jun','Jul','Aug','Sep'].forEach(m => {
      if (snapshot.totals?.[m]) liveContext += `${m}: ${snapshot.totals[m].toLocaleString()} nights | $${Math.round(snapshot.revenue?.[m]||0).toLocaleString()} revenue\n`;
    });
  }

  const origSummary   = summarizeOrigination(origination);
  const cancelSummary = summarizeCancellation(cancellation);
  if (origSummary)   liveContext += '\n' + origSummary;
  if (cancelSummary) liveContext += '\n' + cancelSummary;

  const fullContext = PARK_CONTEXT_STATIC + (liveContext ? '\n' + liveContext : '');

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
        system: fullContext,
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
