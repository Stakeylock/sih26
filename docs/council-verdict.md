# Council Verdict — AstraNav-IDR pre-submission stress test
Run 2026-09-19 ~09:00 by Buffy (all five personas; other agents rate-limited).
Method: each persona argued from the repo's real state only — no invented numbers.
Cross-checked against: Evidence metrics, Model Inspector bundle, docs/final-ppt-outline.md.

---

## The Contrarian
The strongest case against: **the headline win is thin and the model half-fails.**
On the flagship 60 s outage (S1-B60), raw INS ends at 624.62 m and the full system
at 442.17 m — a 29% cut. That sounds strong until a judge does the arithmetic:
the vehicle is still **442 metres off after one minute without GPS**. A hostile
framing: "after all this machinery, your car thinks it's half a kilometre away
from where it is." Worse, the model's own bundle (Model Inspector, LOTO cells)
shows cross-mount accuracy of **43.7% on S3a — below the 48.4% majority
baseline**. Our own honesty display hands attackers the weapon: "your learned
component is worse than guessing the most common class when the phone moves cars."
And the Evidence view itself admits "no estimator dominates every segment" —
so a judge can ask which segments we LOSE and why we'd ship a system that
sometimes loses to a 200-line complementary filter.

## The Industry Outsider
Naive questions experts are too close to ask:
1. "Why is this a **browser tab**? The problem statement says *phone* navigation.
   Where's the app I can install?" — Our answer is a roadmap slide. The judge
   hears "they couldn't build it in time." This is the single biggest
   expectation gap; nothing in the app overclaims it, but the PS does.
2. "You replay a recorded drive. The GPS was cut *by you*, in software. Real
   tunnels have multipathy, temperature drift, and the phone heating in a
   windshield mount. What changes?" — Our honest answer (adapter suppresses
   accelerometer propagation) is scientifically right but reads as an excuse
   unless presented as a *decision with a reason*.
3. "29% better — is that good? What's the industry bar?" — We never position
   the number. Judges have no scale for 442 m.
4. "Five team members, and I see one shared repo with agent logs — who actually
   built what?" — AGENTS.md is public in the repo. If judges open it, the
   multi-agent workflow needs to read as *engineering discipline*, not as
   students outsourcing to AI. The LOG's verify-everything pattern actually
   reads well; make sure nobody is embarrassed by it.

## The Practitioner
What breaks in the room, from real demo experience:
1. **Browser state is a live grenade.** We ship localStorage (pinned runs,
   Basic/Expert toggle, ablation toggles). Any teammate fiddling before the
   demo leaves a weird state: wrong source, paused at t=71, stale pinned run
   with errors from an older build. There is no "reset to pristine" ritual
   documented. Fix: a documented 30-second cold-start ritual (clear storage →
   reload → judge mode) and rehearse it.
2. **Zoom + follow + layer toggles** on the map are fun until a judge grabs the
   laptop and follows a *different* trace, concludes we're showing the wrong
   line. The legend helps (now always visible), but during Q&A someone will
   toggle layers off. Rehearse turning everything back on in one click.
3. **The 12-seed sweep is button-triggered and synchronous.** On a slow laptop
   12 sims could take seconds with the button reading "Sweeping…". Fine — but
   do NOT click it live unless rehearsed; the ms readout varies and judges see
   hesitation.
4. **Fonts/monitor:** the console is dense at 1080p. On a projector at 800×600
   (it happens), the trust panel truncates. Video is safe; live demo needs a
   browser zoom plan (Ctrl+0, 90%).

## The Risk Officer
Worst realistic outcomes, ranked by likelihood × damage:
1. **Accidental overclaim in Q&A.** The deck is honest; a nervous teammate
   ad-libbing "this would work on any phone in any tunnel" is the most
   likely way to lose trust. Mitigation: one rehearsed limitations paragraph,
   same wording for everyone.
2. **The 43.7% LOTO cell.** If a judge reads the Model Inspector before we
   narrate it, we must own it in one sentence: "discrete motion modes survive
   mount transfer *better than regression would*; the number below baseline is
   exactly why we anchor on physical constraints — and we report it because
   hiding it is how navigation systems kill people." (Rehearse; do not improvise.)
3. **CI red at submission moment.** `.github/workflows/ci.yml` runs on push. If
   the final commit pushes a red build at 2:50 PM, that's visible. Rule: last
   push happens ≥30 min before deadline, after the full check suite.
4. **Repo weight:** `astranav-core-blackout-synthetic.json` (1.8 MB) +
   `astranav-tunnel-synthetic.json` at root are unreferenced by code. Harmless,
   but if judges browse the root they may click a stale Sept-10 export whose
   numbers differ from the frozen metrics — an inconsistency trap. Either
   reference them somewhere as "legacy demo exports" or remove before final push.
5. **Determinism saves us** — the same run always produces the same numbers, so
   PPT table and app can't disagree *on the same build*. Verify the PPT numbers
   were regenerated after the 2af8af4 engine fixes (Antigravity's doc sync claims
   they were; spot-check slide 9 against Evidence one final time).

## The Customer
Would the evaluation panel want it? What actually buys scores:
- **They buy trust artifacts.** Judge Report export, provenance, protocol, CI —
  nobody else will have machine-generated evidence. Lead with it.
- **They buy the *why*, not the %:** "we show you when we're wrong" (integrity
  bound, fallback card, OOD gate) is the demo sentence that separates us from
  499 teams demoing a map that never fails.
- **They don't buy infrastructure stories** (C++ core, ONNX) unless asked.
  Roadmap slide stays one slide.
- **The video is the product.** Judges may never touch the app. The first 30
  seconds must show: real data badge → outage hits → tab title flips "⚠ GNSS
  DENIED" → ellipse grows honestly → error-gap chart balloons → reacquisition.
  That sequence IS the pitch.

---

## VERDICT: **PROCEED — with 3 changes before noon**

The project is genuinely differentiated (real dataset, live filter, integrity
story, honest labeling). The risks above are presentation-level, not
engineering-level. Do these first:

1. **Reframe the headline number everywhere the raw error appears** (PPT slide 9,
   video script, Evidence narration): "442 m" never appears alone — always
   "442 m vs 625 m INS — 29% of the drift removed, with an envelope that told
   you how wrong it could be." Positioning, not hiding.
2. **Rehearse the two attack answers** (43.7% LOTO cell; "still 442 m off")
   with fixed wording, all team members, before recording. Both answers already
   exist in the app's honest displays — the script must walk TO them, not
   wait for them to be found.
3. **Cold-start ritual + final consistency sweep:** document 5-step demo reset;
   verify slide-9 numbers against the frozen build; decide fate of the two
   unreferenced root JSONs before the last push.

*(Owner notes: #1 is Antigravity's docs domain — prompt ready; #2 is a team task,
script points provided in this file; #3 is Buffy + user.)*
