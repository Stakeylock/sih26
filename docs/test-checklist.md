# Test checklist
Run what applies to your change before claiming done. All commands from repo root.

- [ ] `npm test` — 13 tests must pass (baseline, do not break).
- [ ] `npm run build` — typecheck + production build must succeed.
- [ ] `python tools/prep_iovnbd.py` — regenerates `public/data/*.json`; error metrics
      must stay physically plausible (final errors < 1000 m, drift % < 200) and
      holdout accuracy should beat majority class on every trip.
- [ ] `npm run dev` — app loads; Navigate / Replay lab / Evidence / Architecture views
      all render; IO-VNBD mode plays a real segment end-to-end without NaNs.
- [ ] UI changes (Bob): verify Basic AND Expert modes, desktop + narrow window.
- [ ] Docs changes (Antigravity): file opens, no broken relative links.
