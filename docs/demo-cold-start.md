# Demo Cold-Start Ritual — 60 seconds, every time
Use before EVERY run-through, recording take, and the live evaluation.
Print this or keep it open on a phone. No step skipped, no improvising.

## 0. Before you touch the browser (30 s)
1. Dev server running? `npm run dev` → note the port (check console output).
2. Close every other tab and app that makes noise (Teams, WhatsApp Web).
3. Fullscreen the browser window (F11) at the END of setup, not the start.

## 1. Reset state to pristine (15 s)
1. Open the app URL.
2. F12 → Console → paste:
   `localStorage.clear(); location.reload();`
3. Confirm the header reads **MODE: SYNTHETIC · Local & offline** after reload.

## 2. Load the money run (10 s)
1. Ctrl K → "Switch to IO-VNBD" (or use the source switcher).
2. Pick **S1-B60-A · Urban circuit** (the 624 m vs 442 m segment).
3. Confirm: **MODE: IO-VNBD REPLAY · REAL DATA** badge is visible.

## 3. Pre-flight check (5 s, every take)
- [ ] Map shows 5 traces; legend reads them all (INS dashed amber, cyan ours, lime route, dotted coral classical, gray reference).
- [ ] Press Space once (motion starts), Space again (pause) — transport works.
- [ ] Tab title says "AstraNav-IDR — Team Recalibrate".

## 4. Start (2 s)
1. Ctrl K → "2-min judge demo" (or press the pulsing START DEMO badge).
2. Judge mode narrates; you drive Q&A from TrustPanel + Explainability.

## If anything looks wrong mid-demo
- Ellipse gone? Ablation toggles off → Replay Lab → restore defaults (all 4 on).
- Numbers look tiny/odd? Wrong segment → reset, re-pick S1-B60-A.
- Everything frozen? F5 — the replay is deterministic; it comes back identical.

## The two rehearsed answers (from docs/council-verdict.md — word-for-word)
- **"Still 442 m off?"** → "442 m versus 625 m raw INS on identical sensors —
  29% of the drift removed in one minute, and the integrity envelope told you
  the honest uncertainty the whole way. Seamless navigation is about knowing
  how wrong you are, not pretending you're right."
- **"Your LOTO shows 43.7% — below baseline?"** → "Exactly why the architecture
  anchors on physics. Discrete motion modes transfer across mounts better than
  regression would — and where the model is unsure, the OOD gate suspends it
  and the constraints carry navigation. We report the weakness because hiding
  it is how navigation systems get people lost."

## 5. BYOD closing-demo preflight (flagship demonstration)
1. Canonical BYOD file ready on laptop.
2. Configure → YOUR DRIVE (BYOD) → Load Capture.
3. Confirm header badge: **MODE: OWN DRIVE · GPS-REFERENCED · LIVE FILTER**.
4. Capture health: Counterfactual eligible = YES.
5. In Replay Lab, seek cursor to rehearsed outage point.
6. Click "LOSE GNSS AT CURRENT TIME" (30s preset).
7. Confirm header tag flips to **MODE: OWN DRIVE · SYNTHETIC OUTAGE (CF)** and counterfactual banner appears.
8. Replay through outage; confirm REACQUISITION card transitions to RELOCKED.
9. Open Evidence → verify "Judge report" HTML generates with honest disclosures.
