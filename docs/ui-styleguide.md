# AstraNav-IDR UI Styleguide
> **Version:** 1.0 · **Author:** Bob (IBM), UI/UX Design Lead  
> **Scope:** All `src/components/**`, `src/App.tsx`, `src/styles.css`.  
> **Law:** This document is binding. Every edit must satisfy it. When in doubt, cut — don't add.

---

## 1. Design Tokens

### 1.1 Colour System — ONE accent palette (never extend it)

All hexes are pulled directly from `src/styles.css :root`. No other accent colours may be introduced.

| Token | Hex | Semantic role | Usage rule |
|-------|-----|---------------|------------|
| `--lime` | `#d9f5a0` | Map-assisted output · primary action · active indicator | Buttons, active nav rail marker, map-assisted trace, heading dial, GNSS-OK status |
| `--cyan` | `#62cbd4` | ES-EKF primary estimate | ES-EKF trace, pipeline row, ml-card border tint |
| `--amber` | `#f2bb75` | INS / IMU dead-reckoning | INS trace, pipeline row, warm-tone status |
| `--coral` | `#f49484` | Classical EKF comparator | Classical trace, denied/warning borders, error state text |
| `--violet` | `#b9a6ed` | Uncertainty / ML model output | ML sparkline, ML pipeline row, OOD indicator |
| `--muted` | `#84959a` | Secondary/inactive text | Labels, subtitles, non-critical copy |
| `--line` | `#28353a` | Structural dividers | Borders, separators, hr lines |
| `--panel` | `#151f24` | Panel backgrounds | Telemetry sidebar, evidence page bg |
| `--mono` | (CSS var) | `"Cascadia Code", Consolas, monospace` | All numeric telemetry, timestamps, code labels |

**GNSS semantic states** (text + border simultaneously — never colour only):

| State | Text colour | Border/bg | Text label |
|-------|-------------|-----------|------------|
| TRUSTED (default) | `#bcdda9` on `#1b3028` border `#42594a` | lime-family | "trusted" |
| DEGRADED | `#e0c986` on `#302c20` border `#5c533b` | amber-family | "degraded" |
| DENIED | `#eab696` on `#352a21` border `#614c3d` | coral-family | "denied" |
| REACQUIRING | `#bdb0e4` on `#292538` border `#4b425f` | violet-family | "reacquiring" |

**Background scale** (darkest → lightest):

```
#0e1519  root bg
#10191e  rail bg
#111b20  workspace outer
#111c20  map surface
#151f24  telemetry/panel
#15242b  stage-detail bg
#17262b  pipeline-row bg
#1b2c34  scenario option
```

### 1.2 Spacing Grid — 8 px base unit

All spacing must be a multiple of 8 px (or half-unit 4 px for tight in-component gaps only).

| Name | px | Usage |
|------|----|-------|
| `space-1` | 8 px | Tight inline gap (icon + text), chip padding |
| `space-2` | 16 px | Internal card padding small |
| `space-3` | 24 px | Card padding, rail vertical padding |
| `space-4` | 32 px | Page horizontal padding, section gap |
| `space-6` | 48 px | Major section separation |
| `space-0.5` | 4 px | Exceptionally tight: badge internal, pipeline-row-number col |

Existing CSS that deviates (e.g. `padding: 21px`) is legacy and should be nudged to `24px` in the polish pass.

### 1.3 Type Scale

All body text uses `Inter, "Segoe UI", sans-serif` (from `:root`). Numeric telemetry **must** use `var(--mono)`.

| Role | Size | Weight | Letter-spacing | Notes |
|------|------|--------|----------------|-------|
| Hero heading | 31 px | 500 | -1.1 px | `h1` in page |
| Section heading | 24 px | 450 | -0.6 px | `lab-config h2`, `system-page h2` |
| Panel heading | 16 px | 500 | -0.4 px | `trust-heading h2`, `ledger-heading h2` |
| Card heading | 12–13 px | 500 | 0 | `.chart-title h3`, `.evidence-detail h3` |
| Wordmark | 22 px | 650 | -1 px | Brand only |
| Body / label | 12 px | 400 | 0 | Most copy |
| Small body | 11 px | 400 | 0 | Table cells, event copy |
| Panel section label | 8–9 px | 550 | +1.3–1.8 px | ALL CAPS tracker labels, `.panel-title`, `.section-label` |
| Mono telemetry large | 33 px | 400 | -1.3 px | Speed display |
| Mono telemetry mid | 18–28 px | 400 | -1 px | Metric values |
| Mono telemetry small | 8–10 px | 400 | 0 | Pipeline row values, ml-card-meta |
| Footer / sub-label | 7–8 px | 400–500 | +0.8–1.4 px | Timeline ticks, stage numbers |

**Rule:** Every numerical value in telemetry panels (speed, bound, outage, error, confidence) must render in `var(--mono)` with tabular figures. No numeric value in a proportional font.

---

## 2. Component Inventory — Canonical Specs

### 2.1 Panel Title (`.panel-title`)

```
font-size: 8px; letter-spacing: 1.3px; color: #7c959d;
display: flex; justify-content: space-between; align-items: center;
```
- Paired with a small icon (14 px Lucide) on the left span and an optional live-light or secondary icon on the right.
- `.panel-title.secondary` adds `margin: 21px 0 13px` for mid-panel sub-sections.
- Never use bold weight; the tracking and caps provide hierarchy.

### 2.2 Status Chip (`.status`)

```
font-family: var(--mono); font-size: 9px;
display: inline-flex; align-items: center; gap: 6px;
border: 1px solid; border-radius: 5px; padding: 5px 8px;
text-transform: capitalize; white-space: nowrap;
```
States: default (lime-family) · `.denied` (coral) · `.degraded` (amber) · `.reacquiring` (violet).  
**Must always include the text label — never colour dot alone.**  
The dot `<i>` at 5×5 px is a redundancy aid, not the primary signal.

### 2.3 Pipeline Row (`.pipeline-row`)

```
grid-template-columns: 19px 19px minmax(0,1fr) auto;
align-items: center; gap: 8px;
border: 1px solid #2a3e44; border-radius: 6px; padding: 8px;
background: #17262b;
```
Tone variants: `.ins` → amber icon · `.ml` → violet icon · `.ekf` → cyan icon · `.map` → lime icon.  
Number column: 8 px mono, `#607b83`.  State column: 8 px mono, `#a7bf93`.

### 2.4 Cards — Trust Block (`.trust-block`)

```
border: 1px solid #334c3e; border-radius: 7px;
background: linear-gradient(125deg, #21332a99, #19262955); padding: 12px;
```
States: `.denied` / `.degraded` → warm borders · `.reacquiring` → violet border.  
Inner `h3`: 12 px / 500.  Body `p`: 10 px / `#8a9f9e`.

### 2.5 GNSS Card (`.gnss-card`)

```
margin-top: 14px; border: 1px solid #304b50; border-radius: 7px;
padding: 11px; background: #15272bd9;
```
Heading font: 8 px, tracking 1 px. Value `b`: 9 px mono.  
States: `.denied`/`.degraded` (warm) · `.reacquiring` (violet).

### 2.6 ML Card (`.ml-card`)

```
border: 1px solid #4a4563; border-radius: 7px; padding: 11px;
background: linear-gradient(135deg, #29263c, #18242b);
```
States: `.suspended` / `.ood` (warm amber) · `.disabled` (neutral dark).  
Sparkline SVG: 280×60 viewBox, stroke `var(--violet)`, width 2 px.

### 2.7 Button — Primary (`.button.primary`)

```
background: var(--lime); color: #213221; border-color: var(--lime);
font-weight: 600; border-radius: 7px; padding: 10px 14px; font-size: 11px;
```
Secondary button: `background: #1c292e; border: 1px solid #37474d`.

### 2.8 Metric Cell (`.metric`)

```
padding: 20px 15px; border-right: 1px solid #283c44;
```
Value: `font: 28px var(--mono); color: #d0e5b6; letter-spacing: -1px`.  
Label: 10 px, `#8ba1aa`. Sub-label: 9 px, `#657e88`.

### 2.9 Chart Panel (`.chart-panel`)

```
border: 1px solid #2b4048; border-radius: 8px;
background: #152129; padding: 17px;
```
Grid lines: `stroke: #29363b; stroke-dasharray: 3 6`.  
Trace widths: INS 2 px amber · Classical 2 px coral · EKF 2.2 px cyan · Map 2.5 px lime · Bound 1.5 px violet dashed.

### 2.10 Dialog / Modal

```
background: #17242b; border: 1px solid #52625a; border-radius: 14px;
width: 470px; padding: 25px; box-shadow: 0 30px 120px #0008;
backdrop: blur(4px) #050e16a8;
```

### 2.11 Toggle (`.toggle-control`)

```
display: flex; justify-content: space-between; align-items: center;
width: 100%; background: transparent; padding: 10px 0; font-size: 12px;
```
Track: 30×17 px, radius 20 px. Thumb: 11×11 px circle. Active: `background: #435738`, thumb `var(--lime)` translated 13 px.

---

## 3. New Component Specs (Phase 1.5)

### 3.1 ConstraintsPanel

Layout: vertical stack of filter rows inside a `.telemetry`-style panel.  
Each row: `display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 11px;`  
- Status glyph: `✓` in lime (`#d9f5a0`) or `✕` in coral (`#f49484`), 11 px mono, 20 px min-width.  
- Label: 11 px, `#c3d5d9`, semibold 500.  
- Reason: 10 px, `#84959a`, normal weight, `margin-left: auto` or second line.  
Panel title: `.panel-title` pattern — "ACTIVE FILTER UPDATES" label + `Filter` icon.  
No badges, no chips, no glow.

### 3.2 JudgeOverlay

Position: `position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%); z-index: 50;`  
Card: `background: #14232b; border: 1px solid #3a5260; border-radius: 10px; padding: 16px 20px; min-width: 320px; max-width: 520px;`  
Counter: `font: 9px var(--mono); color: #7a9aaa; letter-spacing: 1.2px;` — "01 / 06" style.  
Title: 14 px, weight 500, `#ccdfe5`.  
Body: 12 px, `#8dadb8`, line-height 1.6.  
Animation: `opacity 0→1` over 220 ms ease-out + `translateY(6px)→0`. No scale, no glow.  
Hidden entirely (returns `null`) when `callout === null`.

### 3.3 TrustPanel

Layout: `display: grid; grid-template-columns: 1fr 1fr; gap: 8px;`  
Each card: `border: 1px solid #2e4450; border-radius: 7px; padding: 12px; background: #15242b;`  
Card header: status word in 8 px mono, ALL CAPS, coloured per state.  
Card value: 18–20 px mono, `#c8dde5`.  
Card why: 9 px, `#7b9aaa`, italic or muted.  
Status colouring must follow the same GNSS semantic table (§1.1) — text AND border both shift.  
MAP MATCH card: when `iovnbd` is defined, show `border-color: #3e4a50; color: #5a7280` with "unavailable in replay" why-text; no hiding (always rendered, just visually degraded).

---

## 4. Anti-Slop Ban List

The following patterns are **banned** in this codebase. Any instance found during polish must be removed or converted:

| Pattern | Why banned |
|---------|------------|
| Purple/blue gradient backgrounds | Decorative, carries no information, cheap |
| Glowing background blobs (`filter: blur` on `div`s, radial-gradient splats) | Zero information density, looks cheap |
| Glassmorphism panels (heavy `backdrop-filter: blur` on non-dialog panels) | Distracting in a data-dense console |
| Random status dots not tied to a real state enum | Meaningless decoration |
| Decorative chips/badges with no data (e.g. floating "LIVE", "AI", "POWERED BY") | Vibe-coded, penalised by judges |
| Second accent colour invented outside the token table | Breaks coherence |
| Numeric values in proportional font | Tabular numerals in mono are required for telemetry |
| Status by colour alone (no text label) | Accessibility fail |
| Arbitrary paddings not on 4/8 px grid | Inconsistency |
| `box-shadow` with colour glow (`#lime`, `#cyan` drop-shadows on elements) | Glow blobs, forbidden |

The ONE allowed `filter: url(#glow)` is the SVG `feGaussianBlur` on EKF/Map trace paths in `CityMap.tsx` (SVG-internal, not CSS glow on DOM elements) — this is a technical visualisation choice. It should be reviewed: if the traces read clearly without it, remove it in Phase 2.

---

## 5. Redundancy Prune List

Items to delete or consolidate in Phase 2. Each entry includes file + approximate line.

| Item | File | Line (approx) | Action |
|------|------|---------------|--------|
| Duplicate navigation list rendered as toolbar tabs (same 4 items as rail) | `src/App.tsx` | ~165 | Keep rail nav; the `.toolbar-tabs` div is a secondary duplicate. Keep it for now — it provides quick keyboard switching. **Do NOT remove in Phase 2 without confirming usability.** Mark for review only. |
| `.map-vignette` `box-shadow: inset 0 0 100px 20px #10191e60` — decorative fade | `src/components/CityMap.tsx` | ~320 | Weak vignette is fine; do not remove, it grounds the map panel. |
| `filter: url(#glow)` on EKF + Map SVG paths (two instances) | `src/components/CityMap.tsx` | ~244, ~261 | Evaluate: if traces are legible without, remove. If SVG rendering already distinguishes, cut the `opacity=".2"` wide-stroke pass. |
| `.simulation-tag` `<i />` status dot in header — maps to no state enum | `src/App.tsx` | ~108 | The dot here is a pulse-style "live" indicator; it maps to the engine ready state. Keep, but in Phase 2 ensure it isn't faked (could be hidden when engine not ready). |
| `.event-dot` on timeline — 5 px dots for state transitions | `src/components/Playback.tsx` | ~56 | These map to real `state-*` events. Keep — they are functional. |
| Empty `<span />` spacer in map tools | `src/components/CityMap.tsx` | ~411 | `<span />` used as gap hack. Replace with CSS `gap` in Phase 2. |
| `.telemetry-note` "All values are simulated" note | `src/components/Telemetry.tsx` | ~228 | Keep — honest-labeling rule. |
| Redundant `<small>` "Prototype v0.2" in footer | `src/App.tsx` | ~221 | Keep — submission context. |
| `<span className="live-light" />` in Telemetry panel-title | `src/components/Telemetry.tsx` | ~63 | Maps to actual replay state (engine running). OK but verify it dims when paused. |

---

## 6. Accessibility Rules

These are non-negotiable:

1. **Status never colour-only.** Every `.status`, `.gnss-card`, `.map-signal`, `.trust-block`, `.pipeline-row` that changes colour must also change a text label.
2. **Visible focus.** `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--lime); outline-offset: 4px; }` — already present, must not be removed.
3. **ARIA labels.** All icon-only buttons must have `aria-label`. Existing coverage is good; verify in Phase 2.
4. **Contrast.** Minimum 4.5:1 for body text on panel backgrounds. Muted labels (`#84959a` on `#151f24`) are ~3.8:1 — acceptable for secondary metadata, not for primary data values.
5. **SVG charts.** Must have `role="img"` and `aria-label` (already present in Evidence + Telemetry). Keep these; do not strip in refactors.
6. **Toggle.** `role="switch"` + `aria-checked` already correct. Do not break this.

---

## 7. Layout Rules

- **8px grid.** All `padding`, `margin`, `gap` values must snap to 4 or 8 px increments.
- **Telemetry column.** Fixed at 296 px desktop, 260 px at ≤1280, 245 px at ≤1000. Do not widen or collapse.
- **Rail.** 76 px fixed, 64 px at ≤1000, horizontal bottom bar at ≤700. Do not change structure.
- **No new runtime network calls.** Fully offline; no CDN fonts, no map tiles, no API calls.
- **No new dependencies.** Use only what's in `package.json`. `lucide-react` and `src/engine/types.ts` are the only permitted imports for new components.

---

## 8. Phase 2 Polish Checklist

When `COMPONENTS FROZEN (functional)` appears in `AGENTS.md LOG`:

1. [ ] Apply 8 px grid nudges: any padding/margin not on grid → nearest valid value.
2. [ ] Normalise type: check every `font-size` against §1.3 scale. Remove one-off sizes.
3. [ ] Execute Prune List (§5): remove or convert listed items per their action.
4. [ ] Verify both data sources (synthetic + IO-VNBD replay) render correctly.
5. [ ] Verify Basic and Expert modes: no layout breaks, no missing context.
6. [ ] Test at desktop (≥1280), laptop (1000–1280), narrow (700–1000), and mobile (≤700).
7. [ ] Check all status chips: colour + text always paired.
8. [ ] Remove any accidental inline `style=` colour values that duplicate CSS classes.
9. [ ] Run `npm test` (13/13) + `npm run build` — zero new warnings.
10. [ ] Append log entry to `AGENTS.md`.

---

## 9. Production Design Principles (adapted, no external refs)

These principles are drawn from production engineering console patterns (Stripe, Linear, Vercel) adapted to our aerospace/automotive context:

- **Data density over decoration.** Every px of screen is earned by information. Whitespace is structural, not decorative.
- **Hierarchy through scale and tracking.** Section labels use tight 8 px ALL CAPS with wide tracking; values use large mono numerals. This creates a clear scan path without colour-abuse.
- **State is in the border.** Panel borders shift colour with system state (lime → amber → coral → violet). This is read peripherally without drawing the eye from the primary data.
- **Charts earn their height.** The error chart at ~265 px max-height shows four traces + a confidence band. Every pixel of height maps to meaningful error range. Never stretch charts decoratively.
- **Monochrome base, semantic accent.** The palette is near-monochrome dark teal/slate. The five accents (lime, cyan, amber, coral, violet) are navigational signals, not decoration. Their rarity is their power.
