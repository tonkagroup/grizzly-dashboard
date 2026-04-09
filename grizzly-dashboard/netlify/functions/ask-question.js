// Netlify Function: ask-question.js
// Handles two jobs:
//   GET  → fetches Drive JSON files server-side for the dashboard (avoids CORS)
//   POST → answers chat questions using Claude, with full live data as context

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
May: 2,377 (66.5% of final)
Jun: 5,700 (84.8% of final)
Jul: 4,407 (63.6% of final)
Aug: 2,788 (44.0% of final)
Sep: 2,478 (39.9% of final)
Total: 17,750 nights | ~$2,584,240 revenue on books

== 2025 LATE FILL (nights added after Mar 27) ==
Snapshot basis (measured from 114 daily snapshots):
May: +1,591 (includes +391 walk-up adder invisible to snapshots)
Jun: +1,024 | Jul: +2,524 | Aug: +3,545 | Sep: +3,734

Demand-adjusted basis (gross post-Mar-27 bookings minus matched cancels):
May: +1,551 | Jun: +1,845 | Jul: +3,382 | Aug: +3,835 | Sep: +4,154

== 2025 PLATEAU DATES ==
May: Jun 25 (peak 3,186; rent roll 3,577 — 391 walk-up gap)
Jun: Jul 3 (perfect match 6,724) | Jul: ~Aug 1 (6,931)
Aug: Sep 4 (6,333) | Sep: Oct 5 (6,212)

== 2025 FILL CURVE MILESTONES ==
Date    | May   | Jun   | Jul   | Aug   | Sep
Mar 27  | 2,377 | 5,700 | 4,407 | 2,788 | 2,478
Apr 30  | 2,672 | 5,897 | 4,729 | 3,010 | 2,689
May 31  | 3,180 | 6,490 | 5,432 | 3,509 | 3,112
Jun 22  | 3,184 | 6,691 | 6,007 | 4,142 | 3,831
Jul 3   | 3,186 | 6,724 | 6,177 | 4,287 | 3,929
Jul 29  | 3,186 | 6,724 | 6,913 | 5,153 | 4,455
Aug 23  | 3,186 | 6,724 | 6,931 | 6,186 | 4,820
Sep 7   | 3,186 | 6,724 | 6,931 | 6,333 | 5,353
Oct 1   | 631   | 6,724 | 6,931 | 6,333 | 6,212

== 2026 ON BOOKS (latest snapshot) ==
May: 2,325 (vs 2025: −252, −10.6%)
Jun: 5,174 (vs 2025: −526, −9.2%)
Jul: 3,897 (vs 2025: −510, −11.6%)
Aug: 2,765 (vs 2025: −23, −0.8%)
Sep: 1,997 (vs 2025: −481, −19.4%)
Total: 16,158 | 2026 blended rate: $168.67/night

== 2026 BOOKING VELOCITY ==
Oct–Nov 2025: 25–55 nights/day | Dec 2025: 35–61/day
Jan–Mar 2026: 75–117/day (above 2025 avg of 99.7/day)
Mar 27–30: 99.3/day | 7-day (Mar 23–30): +623 nights ~$105K
30-day (Mar 1–30): +2,713 nights ~$457K

== PROJECTIONS (snapshot late fill basis) ==
Conservative (11% cancel, 85% LF): 24,936 nights | $4.21M | −16.3% vs 2025
Base (9% cancel, 100% LF):         27,121 nights | $4.57M | −8.9% vs 2025
Optimistic (7% cancel, 105% LF):   28,066 nights | $4.73M | −5.7% vs 2025

== SITE TYPE PACING (Mar 30 2026 vs Mar 27 2025) ==
Presidential: 546→850 nts | 5→8 sites | demand ratio 0.97x
Prem Pull-Thru: 3,756→2,524 | 39→32 sites | 0.82x (concern)
Pull-Thru: 3,829→4,283 | 64→70 sites | 1.02x
Prem Back-In: 1,799→1,410 | 23→21 sites | 0.86x
Back-In: 3,333→3,197 | 51→51 sites | 0.96x
Gallatin: 2,265→1,580 | 24→24 sites | 0.70x (concern — unchanged supply)
Prem Forest: 1,284→1,262 | 12→12 sites | 0.98x
Cabin: 581→335 | 9→6 sites | 0.86x

== CANCELLATION POLICY ==
>31 days before arrival: 10% fee
7–31 days: 50% fee | <7 days: 100% fee
Payment taken upfront at booking.
`;

async function fetchDriveFile(envKey) {
  const id = process.env[envKey];
  if (!id) return null;
  try {
   const resp = await fetch(`https://drive.google.com/uc?export=download&id=${id}&cachebust=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
});
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
  const bySiteType = {};
  let online = 0, offline = 0;
  const leadBuckets = { same_day: 0, one_to_7: 0, eight_to_30: 0, thirty1_to_90: 0, over_90: 0 };
  const uniqueConfs = new Set();

  rows.forEach(r => {
    const d = r[DATE_KEY] || '';
    if (d) byDate[d] = (byDate[d] || 0) + 1;
    const conf = r['Confirmation'] || '';
    uniqueConfs.add(conf);
    const arrival = r['Arrival Date'] || '';
    if (arrival) {
      const month = arrival.substring(0, 7);
      byArrivalMonth[month] = (byArrivalMonth[month] || 0) + 1;
    }
    const src = r['Reservation Source'] || 'Unknown';
    bySource[src] = (bySource[src] || 0) + 1;
    const origin = (r['Request Origin'] || '').toUpperCase();
    if (origin === 'ONLINE') online++; else offline++;
    const siteType = r['Site/Add-on Type'] || '';
    const st = siteType.toUpperCase();
    let cls = 'Other';
    if (st.includes('PRESIDENTIAL')) cls = 'Presidential';
    else if (st.includes('PREMIUM PULL')) cls = 'Prem Pull-Thru';
    else if (st.includes('PULL-THRU') || st.includes('PULL THRU')) cls = 'Pull-Thru';
    else if (st.includes('PREMIUM BACK') || st.includes('PREMIUM FOREST')) cls = 'Prem Back-In';
    else if (st.includes('GALLATIN') || st.includes('FOREST BACK')) cls = 'Gallatin';
    else if (st.includes('BACK IN') || st.includes('BACK-IN')) cls = 'Back-In';
    else if (st.includes('DRY')) cls = 'Dry Site';
    else if (st.includes('ELECTRIC')) cls = 'Electric Only';
    else if (st.includes('LUXURY')) cls = 'Lux Cabin';
    else if (st.includes('CABIN')) cls = 'Cabin';
    bySiteType[cls] = (bySiteType[cls] || 0) + 1;
    if (d && arrival) {
      const booked = new Date(d);
      const arr = new Date(arrival);
      const days = Math.round((arr - booked) / 86400000);
      if (days === 0) leadBuckets.same_day++;
      else if (days <= 7) leadBuckets.one_to_7++;
      else if (days <= 30) leadBuckets.eight_to_30++;
      else if (days <= 90) leadBuckets.thirty1_to_90++;
      else leadBuckets.over_90++;
    }
  });

  const dateLines = Object.entries(byDate).sort().map(([d, n]) => `${d}: ${n} line items`).join(' | ');
  const arrivalLines = Object.entries(byArrivalMonth).sort().map(([m, n]) => `${m}: ${n}`).join(' | ');
  const sourceLines = Object.entries(bySource).sort((a,b) => b[1]-a[1]).map(([s, n]) => `${s}: ${n}`).join(' | ');
  const siteLines = Object.entries(bySiteType).sort((a,b) => b[1]-a[1]).map(([s, n]) => `${s}: ${n}`).join(' | ');

  return `== LIVE ORIGINATION DATA (report date: ${reportDate}) ==
Total line items in report: ${rows.length}
Unique reservation confirmations: ${uniqueConfs.size}
Line items by booking date: ${dateLines || 'none'}
Online bookings: ${online} | Offline/phone bookings: ${offline}
Booking source: ${sourceLines}
Arrival month breakdown (line items): ${arrivalLines}
Site type breakdown: ${siteLines}
Lead time: same-day=${leadBuckets.same_day} | 1-7days=${leadBuckets.one_to_7} | 8-30days=${leadBuckets.eight_to_30} | 31-90days=${leadBuckets.thirty1_to_90} | 90+days=${leadBuckets.over_90}
IMPORTANT: This report covers only the most recent email batch (last 2 days). It is NOT a cumulative total of all 2026 bookings.`;
}

function summarizeCancellation(data) {
  if (!data || !data.raw_rows || !data.raw_rows.length) return null;
  const rows = data.raw_rows;
  const reportDate = data.report_date || 'unknown';
  const byDate = {};
  rows.forEach(r => {
    const d = r['Cancelation Date'] || r['cancellation_date'] || '';
    if (d) byDate[d] = (byDate[d] || 0) + 1;
  });
  const dates = Object.keys(byDate).sort().slice(-14);
  const recentActivity = dates.map(d => `${d}: ${byDate[d]} cancels`).join(' | ');
  return `== LIVE CANCELLATION DATA (report date: ${reportDate}) ==
Total cancellations in report: ${rows.length}
Total cancel fees collected: $${data.total_cancel_fees?.toLocaleString() || 0}
Total lost revenue: $${data.total_lost_revenue?.toLocaleString() || 0}
Cancellations by date (recent): ${recentActivity || 'no date data'}`;
}

exports.handler = async function(event, context) {

  // ── GET: fetch Drive data for dashboard display ──────────────
  if (event.httpMethod === 'GET') {
    const [snapshot, status, cancellation, origination] = await Promise.all([
      fetchDriveFile('DRIVE_SNAPSHOT_ID'),
      fetchDriveFile('DRIVE_STATUS_ID'),
      fetchDriveFile('DRIVE_CANCELLATION_ID'),
      fetchDriveFile('DRIVE_ORIGINATION_ID'),
    ]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Tell Netlify and all browsers never to cache this response
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Surrogate-Control': 'no-store',
      },
      body: JSON.stringify({ snapshot, status, cancellation, origination }),
    };
  }

  // ── POST: answer a chat question via Claude ──────────────────
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' })
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

  const [origination, cancellation, snapshot] = await Promise.all([
    fetchDriveFile('DRIVE_ORIGINATION_ID'),
    fetchDriveFile('DRIVE_CANCELLATION_ID'),
    fetchDriveFile('DRIVE_SNAPSHOT_ID'),
  ]);

  let liveContext = '';
  if (snapshot) {
    liveContext += `\n== LIVE SNAPSHOT (${snapshot.snapshot_date}) ==\n`;
    liveContext += `Total nights on books: ${snapshot.total_nights?.toLocaleString()}\n`;
    liveContext += `Total revenue on books: $${snapshot.total_revenue?.toLocaleString()}\n`;
    liveContext += `Blended rate: $${snapshot.blended_rate?.toFixed(2)}/night\n`;
    const months = ['May','Jun','Jul','Aug','Sep'];
    months.forEach(m => {
      if (snapshot.totals?.[m]) liveContext += `${m}: ${snapshot.totals[m].toLocaleString()} nights\n`;
    });
  }

  const origSummary = summarizeOrigination(origination);
  if (origSummary) liveContext += '\n' + origSummary;

  const cancelSummary = summarizeCancellation(cancellation);
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
        messages: messages,
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Surrogate-Control': 'no-store',
      },
      body: JSON.stringify({ reply: text }),
    };
  } catch(err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Function error: ' + err.message }),
    };
  }
};
