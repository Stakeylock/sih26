# Test checklist
Run what applies to your change before claiming done. All commands from repo root.

- [ ] `npm test` — complete Vitest suite must pass without failures.
- [ ] `npm run build` — typecheck + production build must succeed.
- [ ] `python tools/prep_iovnbd.py` — regenerates `public/data/*.json`; error metrics
      must stay physically plausible (final errors < 1000 m, drift % < 200) and
      holdout accuracy should beat majority class on every trip.
- [ ] `npm run dev` — app loads; Navigate / Replay lab / Evidence / Architecture views
      all render; IO-VNBD and BYOD modes replay end-to-end without NaNs.
- [ ] BYOD & Counterfactual: `/byod.html` loads, capture validates, counterfactual outage masks GPS cleanly.
- [ ] UI verification: Basic and Expert modes, desktop (1920x1080) and laptop (1366x768).
- [ ] Docs changes: no broken links, honest limitations maintained.
