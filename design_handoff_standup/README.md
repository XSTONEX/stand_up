# Handoff: Stand UP! — macOS reminder app

## Overview
**Stand UP!** is a lightweight macOS utility that nudges the user to **stand up, move, and drink water** at regular intervals. It lives primarily in the **menu bar** (with a click-through popover) and the **Dock**, and has a small **main window** for at-a-glance status plus reminder settings.

The core visual metaphor is a pair of **progress rings**:
- a **Sit/Stand ring** (left) that counts down the current sitting or standing interval, with a small figure icon at its center, and
- a **Water ring** (right) that counts down to the next hydration break, with a glass-of-water icon whose fill level tracks progress.

When an interval elapses, the relevant ring turns **red (alert)**, the center icon **breathes** (pulses), and inline **action buttons** appear directly inside the ring (e.g. *Start / Skip*, *Done / Skip*, *Next*).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show the intended look, layout, and behavior. **They are not production code to ship directly.**

The task is to **recreate these designs in Stand UP!'s real codebase**, using that environment's established patterns and libraries. This is a macOS desktop app, so the natural target is **native macOS — SwiftUI (or AppKit)** using `NSStatusItem` for the menu-bar item, an `NSPopover` for the click-through panel, and a normal window for the main view. If you are instead wrapping this in a cross-platform shell (Electron/Tauri/etc.), recreate the same visuals in that stack. Either way, treat the HTML as the **spec for pixels and behavior**, not as source to embed.

> The rings, water-fill, and icon compositions are the important part to get right. Everything else (frosted-glass window chrome, traffic lights) is standard macOS chrome your platform gives you for free — don't hand-rebuild it if the OS provides it.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, ring geometry, and interaction states are final and intentional. Recreate them precisely. The one deliberate abstraction: the desktop **wallpaper behind the window is faked** with a gradient (so the frosted glass has something to blur) — in the real app the glass vibrancy comes from the actual desktop via `NSVisualEffectView` / SwiftUI material, so you do **not** need that gradient.

---

## Screens / Views

There are **four surfaces**, all driven by the same ring components:

### 1. Main window
- **Purpose:** at-a-glance status of both timers + adjust reminder intervals.
- **Frame:** the window card is **360 px wide**, auto-height, corner radius **22 px**, frosted-glass material. In the prototype it sits inside a faux 440×540 desktop.
- **Layout (top → bottom):**
  1. **Title bar** — 48 px tall. Three macOS traffic-light dots at left (12 px each, 8 px gap); centered title **"Stand UP!"** (13 px / 600). In the real app this is the standard window title bar.
  2. **Ring row** — two modules side by side, each 152 px wide, 22 px gap, 14 px top padding. Left = Sit/Stand ring, right = Water ring (see **Components**). Each ring is 130×130 px with a caption 10 px below it.
  3. **Divider** — 1 px hairline, inset 24 px left/right, 14 px above.
  4. **Reminders block** — section label **"Reminders"** (11 px / 600, letter-spacing 0.8 px), then three stepper rows and one toggle (see below). 24 px horizontal padding.
- **Reminders rows** (label left, control right, each row 42 px tall):
  - `Sitting` — stepper, default **45 min**
  - `Standing` — stepper, default **5 min**
  - `Water break` — stepper, default **30 min**
  - `Launch at login` — toggle switch, default **ON**
  - Stepper control: pill (radius 13, height 26), `−` button (28 px) / tabular value (min-width 56, centered, 12 px / 600) / `+` button (28 px). Buttons get a subtle hover background.
  - Toggle: 38×23 track, radius 12, 20 px white knob; **ON = accent color**.

### 2. Menu-bar popover (`variant="popover"`)
- **Purpose:** the primary quick interaction, opened by clicking the menu-bar icon.
- **Identical to the main window minus the Reminders block** — just the title bar + the two rings, with 16 px bottom padding. Present it as an `NSPopover` anchored under the status item.

### 3. Menu-bar icon (NSStatusBar **template** image, renders at **18 pt**)
- **Purpose:** always-visible status in the system menu bar.
- **Monochrome template image** — black in a light menu bar, white in a dark one, **auto-inverted by the system** (set `NSImage.isTemplate = true`; do not bake in a color).
- At 18 pt a full double-ring reads as mud, so the icon **collapses to a single double-ring outline + center dot**:
  - `<circle r=6.4 stroke=1.5>` + `<circle r=2.6 stroke=1.5>` + center `<circle r=0.6 filled>` on an 18×18 viewBox.
- **Alert state:** swap to a **filled glyph** (`r=6.4` filled, `r=2.6` knocked out) + a **red badge dot** (⌀9, color `#FF453A`) at the top-right with a 1.5 px halo in the menu-bar background color.
- (In the prototype's turn 2 these are shown enlarged in light/dark menu-bar mock-ups; the real asset is 18 pt.)

### 4. Dock icon (rings-only, live progress)
- **Purpose:** app tile in the Dock, reflecting live progress with no controls.
- **Rounded-square app tile**, corner radius 26 on a 128×128 viewBox, with a subtle top→bottom background gradient (light: `#FFFFFF`→`#E7F2F4`; dark: `#232E3D`→`#101823`) and a 1 px inner border.
- **Two concentric rings** centered in the tile:
  - **Outer** ⌀ r=38, stroke 10 — the **sitting** timer, accent color.
  - **Inner** ⌀ r=22, stroke 8 — the **water** timer, accent→accent-light gradient.
  - Both use round caps, start at 12 o'clock (`rotate(-90)`), and their `stroke-dasharray` encodes live percentage.
- The design also defines a **center standing-figure glyph** (`#dpG`: head dot + body/arms/legs strokes) intended to sit inside the inner ring at full icon detail. Provide the tile at **128 / 64 / 32 px**.

---

## Components (exact spec)

### Progress ring (shared)
- Geometry: `viewBox 130×130`, center (65,65), **radius R = 57**, circumference **C = 2πR ≈ 358.14**.
- Two stacked `<circle>`s: a **track** (`stroke = ringTrack`) and a **progress arc** on top.
- Progress arc: `stroke-dasharray = C`, `stroke-dashoffset = C × (1 − pct/100)`, `transform = rotate(-90 65 65)`, `stroke-linecap = round`.
- **`ringWidth` = 9 px default**, tweakable **6–13 px** (applies to both rings globally).

**Sit/Stand ring — color & content by `sitPhase`:**
| phase | ring % | ring color | center | caption (default) | caption color |
|---|---|---|---|---|---|
| `sitting` | `sitPct` | accent `#63EBE9` | `icon-sit.png` @ 36 px | "Sitting · 23 min left" | secondary |
| `alert` | 100 | **red `#FF6157`** | 2-button disc **Start / Skip** | "Time to stand up" | **red** |
| `standing` | `sitPct` | **warm `#F2B25C`** | `icon-stand.png` @ 40 px | "Standing · 3 min left" | secondary |
| `standDone` | 100 | accent | 1-button disc **Next** | "Done · next round" | secondary |

**Water ring — color & content by `waterPhase`:**
| phase | ring % | ring color | center | caption (default) | caption color |
|---|---|---|---|---|---|
| `countdown` | `waterPct` | accent→accent-light **gradient** | glass, fill = `waterPct` | "Water · 18 min left" | secondary |
| `alert` | ~5 | **red `#FF6157`** gradient | 2-button disc **Done / Skip** | "Time to hydrate" | **red** |

### Inline action disc
When a timer alerts, buttons render as a **circular disc (102 px, radius 50%)** overlaying the ring center, with a 7 px backdrop blur and a 1 px inset border:
- **Two-button** (Start/Skip, Done/Skip): split down the middle by a 1 px divider. Left = **primary** (`accent` at ~90% alpha, text `#083A39`, 600). Right = **secondary** (translucent, primary text, 500).
- **One-button** (Next): full disc, primary fill, text `#083A39` 600.
- Buttons use `cursor: default` in the mock; wire real handlers in code.

### Water glass (custom SVG, `viewBox 48×48`)
The glass is a tapered tumbler outline with an **animated fill**:
- Fill level maps `waterPct` 0–100 → a water surface Y between `yBot 37.2` (empty) and `yTop 15` (full).
- The surface is a shallow **quadratic wave** (`M x1 y Q … 24 y T x2 y`); the body is that surface closed to the bottom. A second faint wave line + a white glass highlight add life.
- Fill uses a vertical gradient `waterTop → waterBot` derived from the accent. On hydrate-alert the glass nearly empties and the ring/gradient go red.
- See `renderVals()` in `StandUpWindow.dc.html` for the exact path math — port it verbatim; it's fiddly.

---

## Interactions & Behavior
- **Timer lifecycle (sit):** `sitting` (counting down) → interval elapses → `alert` (ring red, full, breathing icon, *Start / Skip* disc, popover auto-opens) → user taps **Start** → `standing` (warm ring counts the standing interval) → elapses → `standDone` (*Next* disc) → next round returns to `sitting`. **Skip** advances without standing.
- **Timer lifecycle (water):** `countdown` (glass draining as time passes) → elapses → `alert` (red ring, near-empty glass, *Done / Skip*) → **Done** resets to a full glass / next countdown.
- **Auto-pop:** on a sit or water alert the menu-bar **popover should auto-open** to surface the action (noted on state 1b / 1e).
- **Breathing animation** (`@keyframes su-breathe`): `scale 1 → 1.09`, `opacity 0.82 → 1`, **1.9 s ease-in-out infinite**. Applied to the center glyph on `alert` and `standDone` to draw the eye.
- **Ring fill** should animate smoothly as the countdown ticks (animate `stroke-dashoffset`). The water surface likewise drops continuously.
- **Steppers** adjust the interval in minutes (`−` / `+`); **Launch at login** toggles the login-item.
- **Menu-bar icon** reflects the *soonest* pending timer and flips to the filled + red-badge alert glyph when either timer is due.

## State Management
Per the component's props, the state needed is:
- `mode`: `light` | `dark` (follow system appearance)
- `variant`: `window` | `popover` (which surface is rendering)
- `sitPhase`: `sitting` | `alert` | `standing` | `standDone`
- `waterPhase`: `countdown` | `alert`
- `sitPct`, `waterPct`: 0–100 progress of each ring (derived from elapsed/interval)
- `sitCaption`, `waterCaption`: optional caption overrides (otherwise derived from phase)
- **Global settings:** `accent` (color), `ringWidth` (px), plus the three interval durations (sitting 45, standing 5, water 30) and `launchAtLogin`.

Derived at render time (see `renderVals()`): ring dash offsets, alert colors, which center content shows, the water path geometry, and all light/dark tokens.

## Design Tokens

**Accent** (user-selectable; default first): `#63EBE9` cyan · `#6FC3FF` blue · `#8B7BFF` purple · `#5BE39B` green.
`accentLite` = accent mixed 50% toward white (used for ring gradients).

**Semantic:**
- Alert red: `#FF6157` (ring/caption) · badge red `#FF453A` (menu-bar dot)
- Standing warm: `#F2B25C`
- Primary-button text on accent: `#083A39`

**Neutrals / text:**
| token | light | dark |
|---|---|---|
| text primary | `#1C242C` | `#F4F7F9` |
| text secondary | `rgba(28,36,44,.55)` | `rgba(235,242,246,.55)` |
| icon base | `rgba(28,36,44,.72)` | `rgba(235,242,246,.82)` |
| window bg | `rgba(248,251,252,.62)` | `rgba(26,31,38,.55)` |
| window border | `rgba(255,255,255,.65)` | `rgba(255,255,255,.14)` |
| ring track | `rgba(28,36,44,.09)` | `rgba(255,255,255,.10)` |
| divider | `rgba(28,36,44,.09)` | `rgba(255,255,255,.09)` |
| control bg | `rgba(28,36,44,.06)` | `rgba(255,255,255,.09)` |

**Traffic lights:** close `#FF5F57` · min `#FEBC2E` · zoom `#28C840` (standard macOS; use the real title bar).

**Typography:**
- Family: **`Lora`**, then `Georgia`, `Songti SC`, serif (a warm serif — swap to your app's serif if Lora isn't bundled).
- Monospace labels (in the design-doc annotations only): `ui-monospace, Menlo`.
- Sizes: window title 13/600 · captions 12/500 · section label 11/600 (+0.8 letter-spacing) · setting row 13/400 · stepper value 12/600 tabular · disc button 13–15/500–600.

**Geometry / spacing:**
- Window width 360 · radius 22 · title bar 48 · module width 152 · ring box 130 · ring R 57 · ringWidth 9 (6–13) · disc 102 · row height 42 · stepper pill radius 13 / height 26 · toggle 38×23.
- Dock tile: 128 viewBox, radius 26, outer ring r38/stroke10, inner ring r22/stroke8.
- Menu-bar icon: 18×18, outline strokes 1.5, badge ⌀9.

**Shadows:** window `0 30px 70px rgba(8,22,38,.35)` + inset top highlight · dock tile drop-shadow scales with size · disc inset 1 px border.

## Assets
- **`icon-sit.png`** (497×519, transparent) — line illustration of a person sitting at a desk. Shown at 36 px in the sit ring. In dark mode it's inverted+brightened via CSS filter (`invert(1) brightness(1.7)`) — supply a proper light asset or tint in code instead.
- **`icon-stand.png`** (443×568, transparent) — person standing at a desk. Shown at 40 px in the standing state, same dark-mode handling.
- The **water glass**, **rings**, **dock tile**, and **menu-bar glyph** are all **inline SVG / CSS** (no raster assets) — recreate as vector in your platform.

## Files
Design references included in this bundle:
- **`StandUpWindow.dc.html`** — the core component: window + popover, both rings, all phases, water-fill math, all light/dark tokens. **This is the primary reference.** The logic lives in the `renderVals()` method inside the trailing `<script>`.
- **`Stand UP 设计稿.dc.html`** — the annotated design board: shows every state side by side (turn 1 = main window states + Dock icon; turn 2 = menu-bar icon light/dark + popovers) with designer notes. Good for seeing the intended matrix of states.
- **`Stand UP - Standalone (rendered preview).html`** — a self-contained, no-dependencies build of the design board. **Open this in a browser** to see everything rendered live without any tooling.
- **`support.js`** — the tiny runtime the two `.dc.html` files use to render. You don't need to port it; it's only here so the `.dc.html` files open standalone. Ignore it when implementing.
- **`icon-sit.png`, `icon-stand.png`** — the two figure assets.

> Reading order: open the **rendered preview** to see it, then read **`StandUpWindow.dc.html`** for exact values and the ring/water math. Ignore the `<x-dc>`, `<helmet>`, `<sc-if>`, `<sc-for>`, and `dc-import` wrappers — those are just the prototype's templating; the meaningful content is the inline styles and the `renderVals()` logic.
