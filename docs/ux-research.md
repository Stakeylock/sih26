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
