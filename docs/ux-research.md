# UX & Design Research Audit for AstraNav-IDR (SIH 2026)

Independent design, UX, and implementation research audit mapped to SIH judge psychology.

## Top 5 Recommendations (Ranked by Impact/Effort)

| Finding | Source | Why it matters for judges | Concrete change | Owner suggestion | Effort |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. "Double Encoding" for Traces** | UX Planet / a11y | 8% of men are colorblind. Relying purely on `--cyan`/`--amber` fails WCAG. | Apply SVG `stroke-dasharray` to traces (e.g., INS dashed, EKF solid, Classical dotted). | Buffy | S |
| **2. Onboarding Keyboard Hints** | Linear / 21st.dev | Judges decide in the first 10 seconds. Clear calls-to-action reduce cognitive load. | Add a faint `[Space]` badge on a "Press to Start Demo" overlay before playback begins. | Buffy | S |
| **3. Action-Oriented Empty States** | Mobbin / 21st.dev | Judges punish dead-ends. Empty states must guide the user to the next logical action. | Add "Switch to Synthetic" buttons in `RunLibrary`/`DiagnosticsView` when real data is missing. | Antigravity | S |
| **4. Sortable Data Tables** | 21st.dev | Judges look for specific edge cases. Tables without sorting feel like static images. | Add column-header click sorting (Outage, Final Error) to `RunLibrary` & `ExperimentsView`. | Antigravity | M |
| **5. Time-Synchronized Ledger** | NASA OpenMCT / Grafana | Proves the system is real-time. Correlating events builds "Mission Control" credibility. | Hovering an event in the Timeline should draw a vertical crosshair line on `ChartsPanel`. | Buffy | L |

## Additional Findings & Context

### 1. Mission Control & Telemetry UI (NASA, Vercel, Linear)
*   **Contextual Insight:** NASA's OpenMCT heavily relies on a "Time Conductor." While we have a shared `t` cursor, event correlation is passive. Highlighting an event should ripple across all views.
*   **Information Density:** Linear prioritizes "at-a-glance" health. We have this in `TrustPanel`, but we need to ensure the most critical failure mode (GNSS Denied) aggressively dims non-essential telemetry to guide the eye.

### 2. SIH Judge Psychology (Hackathon Demo Patterns)
*   **The "So What?" Factor:** Judges see 50+ projects. They tire of pure tech. The Q&A is where wins happen.
*   **Proof over Polish:** A working prototype is better than a faked UI. If a feature is broken, it's better to show an honest error state (our `FallbackCard` does this perfectly) than to hide it.
*   **Recorded Safety Net:** Always have a 2-minute seamless recording ready in case the live browser engine crashes due to resource limits during the presentation.

### 3. Component Patterns (21st.dev & Mobbin)
*   **Stat Tiles:** Our stat tiles are text-heavy. Incorporating simple inline SVG sparklines (using `var(--violet)` for ML trend) would elevate them to production-grade SaaS aesthetics.
*   **Command Palette:** Buffy's `Cmd+K` palette is excellent. To match Linear, we should add visual keyboard shortcut hints (e.g., `↑/↓ to navigate`) aligned to the right of the search input.

### 4. Data-Viz Accessibility (Dark Theme)
*   **Contrast & Layering:** Since shadows fail on `#151f24` backgrounds, we must use border-color state shifting (which we currently do via `.status` tokens). 
*   **Tabular Numerals:** We are correctly using `var(--mono)` (`font-variant-numeric: tabular-nums`). This prevents UI jitter during live replays and is a strong professional signal.

---

## Addendum: Navigate View — First 10 Seconds Audit

*Research sources: 21st.dev onboarding beacon patterns; Mobbin SaaS dark-dashboard first-run flows; AngelHack/DevPost hackathon judge psychology research.*

### What a judge sees in the first 10 seconds

| Second | What happens | Gap |
| :--- | :--- | :--- |
| 0 | Page loads: map visible, traces rendered, vehicle dot static at t=12 | Nothing is moving — dead-looking |
| 0–2 | Heading "Navigation, uninterrupted." + two action buttons in workspace heading | Buttons buried above the fold on smaller screens |
| 3–5 | Playback bar: small `▶ 0:12 / 2:00`, no affordance explaining what the demo does | Judge scans for the "start" point, doesn't find it fast |
| 5–10 | Map shows 5 coloured traces but NO visible legend (legend only inside `CityMap` map-tools toggle) | Judges can't decode amber/cyan/coral/lime instantly |

The existing `[Space]` hint overlay (Buffy audit #2) partially addresses second 0–2 but only appears over the map, not near the playback bar where the eye naturally lands.

### 3 Concrete Suggestions (Navigate, first 10 s)

| # | Finding | Source | Why it matters | Concrete change | Owner | Effort | Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| N1 | **Floating "start" CTA near playback** | 21st.dev beacon pattern / Mobbin onboarding | Judges look at the bottom playback bar immediately. A pulsing `▶ Start Demo` badge just above the timeline, visible only when `!playing && t <= 12`, eliminates the "where do I click?" moment. | In `Playback.tsx`: render a `<div className="demo-start-hint">▶ Start Demo</div>` positioned above the track, animate with CSS `@keyframes pulse-opacity`, hidden on play or `t > 12`. | Buffy (owns `src/components/Playback.tsx`) | S | [REQUEST] filed |
| N2 | **Persistent inline trace legend strip** | Mobbin mission-control dark dashboards | The 5 coloured traces (amber INS / cyan EKF / lime MAP / coral Classical / teal Live) are indecipherable to first-time judges without a legend. The existing legend is hidden behind a toggle. | In `CityMap.tsx`: render a small `<div className="map-legend-strip">` with coloured swatches + labels pinned bottom-left of the SVG viewport, always visible (not behind toggle), 10px font, `var(--muted)` text, using existing colour tokens and dash-pattern double-encoding. | Buffy (owns `src/components/CityMap.tsx`) | S | [REQUEST] filed |
| N3 | **Live stat hook in the workspace subtitle** | AngelHack "Show don't tell" / hackathon opening-screen psychology | The subtitle "Follow the journey. Understand the confidence." is evergreen but says nothing specific. When `view === "navigate"` and `t > 0`, replacing it with a live stat line (e.g. "**±47 m** bound · **TRUSTED** GNSS · outage in **38 s**") makes the app look genuinely live in the first frame judges see it. | In `App.tsx`: change the navigate-view `<p>` to render live values from `replay.snapshot` when `replay.t > 0`. | Claude Code (owns `src/App.tsx`) | S | [REQUEST] filed |

### Why these 3 and not others

*   **Beacons and multi-step tours** (react-tourlight, React Joyride) are the canonical 21st.dev/Mobbin pattern for SaaS onboarding, but they require a new dependency and user persistence state — both banned by `docs/constraints.md`. Our existing `[Space]` hint overlay + Judge Mode callouts already cover the guided-tour need.
*   **Progress step indicators** (21st.dev "1 of 4" wizards) don't apply because we're not a form flow; the playback timeline already serves as the progress metaphor.
*   **Split-layout modals with dashboard previews** (Mobbin onboarding) would require significant layout rework crossing multiple ownership zones; not worth the risk with submission imminent.
