# Demo script — the full walkthrough (and production acceptance test)

Run this end-to-end on namzilabs.co after each release. It doubles as the
sales demo: ~6 minutes, no slides, only real data.

## Setup (before recording)
- A Brevo account (free) and a Google account with a spreadsheet that has a
  header row (e.g. Date, Email, Deal Size, Source).
- Terminal open for the curl moment.

## The walkthrough

1. **Land on namzilabs.co** — homepage: "All your business data, one live
   dashboard." Click **Sign in**, enter the password. You land on the
   dashboard's three-step checklist.

2. **Connect the first tool (1 min).** Integrations → **Webhook** → Create my
   endpoint → copy the URL → Configure: name events `lead_created` →
   in the terminal:
   ```bash
   curl -X POST '<the URL>' -H 'content-type: application/json' \
     -d '{"id":"demo-1","email":"lead@bigco.com","name":"Dana Lead","source":"webinar"}'
   ```
   Watch the preview light up with that exact payload — *"this is real data,
   not a mock."* Name it, finish.

3. **Connect Google Sheets (1 min).** Integrations → Google Sheets → Connect
   Google account (read-only consent) → pick the spreadsheet → tab → choose
   the Email and Deal Size columns → see the last rows in the preview →
   finish. Mention: new rows land automatically every 5 minutes.

4. **Build a metric (45 s).** Metrics → New metric → click the
   **Lead created** card (live count already showing) → measurement: Count →
   name auto-suggests → Save. The right-hand preview mirrored every click
   with real numbers.

5. **Build a ratio KPI (45 s).** Create a second metric (e.g. Row added
   count), then **Combine two metrics** → numerator/denominator → the
   percentage renders instantly → Save. *"Show rate, reply rate, close rate —
   any KPI is two picks."*

6. **Assemble the dashboard (1 min).** Dashboard → Add widget → the metric as
   a **Number**, add the ratio as a **Line chart**, add a **Recent events**
   table. Drag to reorder, flip one to 2x width. Switch date ranges —
   everything follows instantly. Toggle "vs previous period".

7. **Set a goal (30 s).** On the number widget → target icon → "50 per week"
   → the pace bar appears, green if on pace.

8. **The live moment (closer).** Fire the curl again with a new id. Within
   30 seconds the number ticks up on screen without a refresh. *"Every tool
   you use, one live picture — that's Namzi."*

## Acceptance checks while running it
- [ ] Wizard preview showed real records for both tools
- [ ] Duplicate curl (same id) does NOT increase the count
- [ ] Date-range switch feels instant; widgets skeleton-load, never crash
- [ ] Goal pace state reads correctly at a glance
- [ ] Number updated within 30 s of the final curl
