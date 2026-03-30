// Netlify Function: ask.js
// Proxies questions to Claude API. Keeps your API key server-side and secret.
// Deploy this at: netlify/functions/ask.js
// Set environment variable ANTHROPIC_API_KEY in your Netlify site dashboard.

const PARK_CONTEXT = `
You are a data analyst assistant for Yellowstone Grizzly RV Park in West Yellowstone, MT.
You have access to the park's complete pacing model data for the 2025 and 2026 seasons.
Answer questions concisely and accurately using the data below. When citing numbers, be precise.
If asked about something not in the data, say so clearly.

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
Jun: +1,024
Jul: +2,524
Aug: +3,545
Sep: +3,734

Demand-adjusted basis (gross post-Mar-27 bookings minus matched cancels):
May: +1,551
Jun: +1,845
Jul: +3,382
Aug: +3,835
Sep: +4,154

== 2025 PLATEAU DATES (when each month stopped filling) ==
May: Jun 25, 2025 (snapshot peak 3,186; rent roll 3,577 — 391 walk-up gap)
Jun: Jul 3, 2025 (perfect match at 6,724)
Jul: ~Aug 1, 2025 (perfect match at 6,931)
Aug: Sep 4, 2025 (perfect match at 6,333)
Sep: Oct 5, 2025 (perfect match at 6,212)

== 2025 FILL CURVE MILESTONES (nights on books by date) ==
Date       | May   | Jun   | Jul   | Aug   | Sep
Mar 27     | 2,377 | 5,700 | 4,407 | 2,788 | 2,478
Apr 30     | 2,672 | 5,897 | 4,729 | 3,010 | 2,689
May 31     | 3,180 | 6,490 | 5,432 | 3,509 | 3,112
Jun 22     | 3,184 | 6,691 | 6,007 | 4,142 | 3,831
Jul 3      | 3,186 | 6,724 | 6,177 | 4,287 | 3,929
Jul 29     | 3,186 | 6,724 | 6,913 | 5,153 | 4,455
Aug 23     | 3,186 | 6,724 | 6,931 | 6,186 | 4,820
Sep 7      | 3,186 | 6,724 | 6,931 | 6,333 | 5,353
Sep 16     | 631   | 6,724 | 6,931 | 6,333 | 5,714
Sep 25     | 631   | 6,724 | 6,931 | 6,333 | 6,111
Oct 1      | 631   | 6,724 | 6,931 | 6,333 | 6,212
Oct 16     | 631   | 6,724 | 6,931 | 6,333 | 6,212

== 2026 ON BOOKS AT MAR 30 (latest snapshot) ==
May: 2,325 (vs 2025: −252, −10.6%)
Jun: 5,174 (vs 2025: −526, −9.2%)
Jul: 3,897 (vs 2025: −510, −11.6%)
Aug: 2,765 (vs 2025: −23, −0.8%)
Sep: 1,997 (vs 2025: −481, −19.4%)
Total: 16,158 nights | −1,592 vs 2025 (−9.0%)
2026 blended rate on books: $168.67/night (+15.9% vs 2025)
2026 revenue on books: ~$2,726,000

== 2026 BOOKING VELOCITY (Oct 2025 – Mar 30 2026) ==
Oct–Nov 2025: 25–55 nights/day (slow opening)
Dec 2025: 35–61 nights/day
Jan–Mar 2026: 75–117 nights/day (strong, above 2025 avg of 99.7/day)
Mar 27–30 2026: 99.3 nights/day (exactly at 2025 pre-season average)
Recent 7-day (Mar 23–30): +623 nights, ~$105K revenue
Recent 30-day (Mar 1–30): +2,713 nights, ~$457K revenue

== PROJECTIONS (Mar 30 2026, snapshot late fill basis) ==
Conservative (11% cancel, 85% LF): 24,936 nights | $4.21M | −16.3% vs 2025
Base (9% cancel, 100% LF):         27,121 nights | $4.57M | −8.9% vs 2025
Optimistic (7% cancel, 105% LF):   28,066 nights | $4.73M | −5.7% vs 2025

Formula: projected = min((on_books × (1 − cancel_rate)) + (late_fill × lf_adj), 97% capacity)

== SITE TYPE PACING (Mar 30 2026 vs Mar 27 2025) ==
Site Type        | 2025 nts | 2026 nts | Sites 25 | Sites 26 | Raw ratio | Demand ratio
Presidential     | 546      | 850      | 5        | 8        | 1.56x     | 0.97x
Prem Pull-Thru   | 3,756    | 2,524    | 39       | 32       | 0.67x     | 0.82x
Pull-Thru        | 3,829    | 4,283    | 64       | 70       | 1.12x     | 1.02x
Prem Back-In     | 1,799    | 1,410    | 23       | 21       | 0.78x     | 0.86x
Back-In          | 3,333    | 3,197    | 51       | 51       | 0.96x     | 0.96x
Gallatin         | 2,265    | 1,580    | 24       | 24       | 0.70x     | 0.70x
Prem Forest      | 1,284    | 1,262    | 12       | 12       | 0.98x     | 0.98x
Cabin            | 581      | 335      | 9        | 6        | 0.58x     | 0.86x

Key concerns: Gallatin (0.70x — genuine demand problem, unchanged supply) · Prem Pull-Thru (0.82x after supply adjustment)

== CANCELLATION POLICY ==
>31 days before arrival: 10% fee
7–31 days before arrival: 50% fee
<7 days before arrival: 100% fee
Payment taken upfront at booking. 2025 = first full year policy-aware bookings.

== AUTOMATED PIPELINE ==
Campspot emails daily reports → reservationsgrizzly@gmail.com → Google Apps Script runs 7am MT daily → parses CSVs → writes JSON to Google Drive → dashboard fetches on open
First automated run expected Mar 31, 2026.
`;

exports.handler = async function(event, context) {
  // Only allow POST
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
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

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
        system: PARK_CONTEXT,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Function error: ' + err.message }),
    };
  }
};
