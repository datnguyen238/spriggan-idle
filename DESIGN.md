---
name: Spriggan
description: "Little worlds, slow days. A collection of inhabited miniature places."
colors:
  paper: "#f4eedf"
  ink: "#304a40"
  muted: "#57685b"
  line: "#c4c7b6"
  sage: "#748f79"
  clay: "#b76f54"
  blue: "#8ca2a0"
  straw: "#d5ba79"
  well: "#e4e5d5"
  selected: "#dbe2cf"
  pond-paper: "#203f3b"
  pond-ink: "#f3ecda"
  pond-muted: "#c7d7c7"
  pond-line: "#688579"
  pond-well: "#17352f"
  pond-selected: "#3b5f4c"
  hex-paper: "#28473b"
  hex-ink: "#f4eedf"
  hex-muted: "#d1ddc6"
  hex-line: "#6a866f"
  hex-well: "#1e3d32"
  hex-selected: "#426550"
  kitchen-paper: "#263a45"
  kitchen-ink: "#f1e3ce"
  kitchen-muted: "#c2cecc"
  kitchen-line: "#68818a"
  kitchen-well: "#1b303b"
  kitchen-selected: "#3d5960"
  park-ground: "#d5dabe"
  park-evening-ground: "#42594e"
  slots-ground: "#e7e9d9"
  slots-enamel: "#cedbd0"
  slots-rim: "#819e91"
  journal-ink: "#344b61"
  journal-desk: "#586f5e"
typography:
  display:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "clamp(25px,2.4vw,36px)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-.03em"
  brand:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "25px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-.03em"
  title:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-.02em"
  body:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0"
  control:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  timer:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-.03em"
  journal-writing:
    fontFamily: "Caveat, Nunito Sans, sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: "40px"
    letterSpacing: "0"
  journal-date:
    fontFamily: "Caveat, Nunito Sans, sans-serif"
    fontSize: "43px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0"
  journal-title:
    fontFamily: "Caveat, Nunito Sans, sans-serif"
    fontSize: "clamp(54px,5vw,72px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0"
rounded:
  farm: "4px"
  control: "6px"
  inspection: "8px"
  surface: "12px"
spacing:
  compact: "8px"
  related: "12px"
  section: "16px"
  mobile-gutter: "18px"
  panel: "22px"
  desktop-gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
  button-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  world-navigation:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  destination-select:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
  controller:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "22px"
    width: "300px"
    typography: "{typography.body}"
  focus-timer:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "12px 16px"
    width: "320px"
  brand:
    typography: "{typography.brand}"
---

# Design System — Spriggan

## Overview

**Creative North Star — “Little places, made by hand”**

Spriggan presents a collection of inhabited miniature places. Quiet, playful scenes fill the viewport while compact controls support direct interaction. Geometry-driven artwork supplies each place with its own material and atmosphere.

A shared botanical mark, humanist lettering and consistent spacing connect the park and its six games. The shared surface roles change with the setting. Pond uses dark teal, hex uses deep green, and the kitchen uses nighttime slate. Farm, slots and claw keep their pixel orchard, pastel enamel and sculpted-plush character.

The implemented source is the reference. Shared styles live in `dist/shared/spriggan.css`, fonts in `dist/shared/fonts.css`, and timer measurement and play shortcuts in `dist/shared/world-ui.js`. Route HTML, CSS, canvas and SVG renderers retain world artwork.

**Key Characteristics**

- Scene-led composition with directly reachable play actions.
- Shared typography and botanical identity across six distinct settings.
- Fixed-size controller surfaces with internal scrolling and hidden scrollbars.
- Responsive controls positioned around the measured focus timer.

## Colors

The palette combines botanical ink, warm paper, weathered sage and soft clay, ceramic blue and straw accents. Frontmatter values are normative. Unprefixed names correspond to shared `--sg-*` roles. World-prefixed entries record scoped overrides.

### Primary

Botanical ink supplies text and primary actions on light surfaces. Paper supplies the control background. Dark worlds override these roles, producing pale primary buttons against their dark panels.

### Secondary

Sage supplies input accents. Straw supplies keyboard focus and the claw drop control. Clay and ceramic blue belong to the shared accent vocabulary and painted park material character.

### Neutral

Muted colors carry instructions and secondary status. Line colors divide groups and outline secondary actions. Well and selected values distinguish timer modes and pressed controls. Pond, hex and kitchen each supply six local surface roles. Farm, claw and slots use the shared light controller palette. The park adds day and evening ground colors. Golden Seed adds pale ground, enamel and painted rim colors.

The kitchen steamer note keeps the shared light paper and botanical ink. Artwork palettes remain local to each renderer.

## Typography

Bricolage Grotesque supplies the brand, headings, counters and timer numerals. Nunito Sans supplies UI text, instructions and controls. Both are locally hosted Latin WOFF2 files covering variable weights (400–700), with `font-display` set to `swap`. OFL license texts ship beside them in `dist/shared/fonts`.

### Hierarchy

- World headings use the display role and become (26px) on mobile. Park arrival headings use (23px), then (22px). Golden Seed uses (36px), then (32px).
- The brand role reduces to (22px) on mobile and (20px) on the narrowest screens.
- Controller titles use the title role. Shared controller text uses the body role. Descriptive copy uses (13px) with line-height (1.6), limited to (30ch) in introductions and (26ch) on mobile.
- Controls use the control role. Compact UI labels use the label role. Timer numerals use the timer role. Counter values use display lettering with UI-font labels.

## Layout

Most worlds occupy a viewport-sized scene. Brand and return navigation anchor the upper edge, title copy sits below at the left, controller toggles anchor the lower right, and persistent play shortcuts sit at the lower left. Desktop uses the desktop-gutter spacing token. Headers occupy (82px), and titles begin at (105px).

Controller shells use a width of (300px), capped at `calc(100vw - 32px)`. Farm, hex, kitchen and claw content uses a desktop height of `min(520px, calc(100dvh - 220px))`. Pond uses a fixed internal scrolling height of `min(480px, calc(100dvh - 265px))`. Content scrolls internally with hidden Firefox and WebKit scrollbars and clipped horizontal overflow. Applicable panels contain overscroll.

At widths up to (720px), the gutter becomes the mobile-gutter token, the header respects the top safe area, and titles begin at `calc(92px + var(--sg-safe-top))`. The timer becomes `calc(100% - 36px)` wide, capped at (360px), with a bottom safe-area offset. A ResizeObserver writes its actual height to `--sg-timer-height`. The derived `--sg-controls-bottom` places actions and toggles above the timer with a (12px) gap. Panel heights adapt to that available space. The mobile hex notification uses `calc(240px + var(--sg-safe-top))` to clear the title and counters.

Claw has a separate mobile arrangement for its cabinet, depth control, status and play actions, with controller content capped at (430px). Golden Seed is a vertically flowing page with a centered main container capped at (950px), machine wrapper capped at (650px), and content groups capped at (520px). Main horizontal padding changes from (36px) to (18px) on mobile.

At heights up to (500px), the compact timer sits at the lower left, controller content fits `calc(100dvh - 120px)`, and introductory copy and transient messages are hidden. Expanded timer state hides the overlapping play-action tray on timer-equipped worlds. Claw keeps its separate actions. Widths up to (350px) tighten header spacing and the brand.

## Elevation & Depth

Controller and inspection surfaces use the shared ambient shadow. Navigation and many controls use flat surfaces and fine outlines. Park signs carry short grounding shadows. Golden Seed has an outer cabinet shadow and recessed reel shadow. The sidecar records these exact values. World surfaces remove backdrop blur.

Focus uses a straw outline (2px) with an offset of (4px). The shared easing declaration is `cubic-bezier(.16,1,.3,1)`. Reduced-motion preference disables CSS transitions and smooth scrolling in the shared layer. Local renderers supply water depth, terrain, lantern light and plush shading.

## Shapes

Controls and navigation use the control radius. Controller shells, timer and koi inspection use the surface radius. Farm controller, timer and toggle use the farm radius to fit the pixel orchard, and bird inspection uses the inspection radius. Golden Seed’s cabinet has rounded upper corners and a heavier lower edge. Fine borders use the active world’s line role.

The botanical logo is a round-stroked sprout within an open bowl-like curve. Preserve its inline SVG paths, current-color stroke and adjoining Spriggan wordmark. Shared styling renders the symbol at (26px) on desktop, (23px) on mobile and (22px) on the narrowest screens. The favicon uses the same symbol on a rounded paper tile with botanical ink.

## Components

### Buttons

Primary controls use active-world ink fill and paper text. Secondary controls use transparent fill and a line border. Pressed states use the selected role. Primary hover applies brightness (.94) with no translation. Disabled persistent actions use opacity (.55). The local claw drop control uses straw. Controller actions generally have (44px) minimum target heights. Play shortcuts and the toggle use (48px).

### Cards / Containers

Controllers use panel spacing padding and body typography. Their bounded content scrolls internally with hidden scrollbars. Pond koi inspection and farm bird inspection reuse world surfaces and display titles. Park destination detail uses paper and the shared shadow. Golden Seed reward content uses a horizontal row and top divider.

### Inputs / Fields

Input accents use sage and carets use world ink. Golden Seed’s destination select has a fine border, control radius, UI type (14px, weight 600) and a height of (46px). Sliders retain game-specific arrangements. Shared visible focus applies to buttons, links, inputs, selects and summaries.

### Navigation

Headers carry the botanical brand and outlined “All worlds” return link. The link uses compact UI text, current-color borders and a minimum target height of (44px). Park destinations use painted place signs and destination detail. Mobile park light and zoom controls stack at the upper right.

### Focus timer

The timer uses segmented modes, display numerals and compact actions. Its well and selected surfaces follow the world. Its measured rendered height drives mobile controls placement. Farm uses its tighter radius.

### Persistent play actions

The shared script forwards shortcuts to existing game controls and synchronizes text, disabled state and pressed state. Existing actions cover feeding, grain, creature invitation, making and steaming dumplings, coin insertion and claw dropping. Golden Seed keeps controls on its machine.

### World artwork

Pond retains dark teal water and moving koi. Farm retains crisp pixel orchard scenery. Hex retains a green faceted diorama. Little Folds uses a slate nighttime counter, bamboo steamers, pleated dumplings, steam and neighboring customers. Golden Seed uses pastel enamel and botanical reel illustrations. Claw uses a painted cabinet and rounded plush forms with radial shading and stitched details. These materials are implemented through route renderers and inline geometry.

### Park journal

The separate `/journal/` route is a read-only diary of automatically recorded park milestones. Its paper and handwriting treatment is specific to this route: a natural ivory paper texture repeats at (627px) over a muted botanical desk, with blue pen ink for the written memories. The generated texture ships as `dist/journal/paper-texture.webp`, with its generation provenance alongside the asset.

Caveat supplies the handwritten diary title, dates and memory text. The locally hosted variable WOFF2 covers weights (400–700), uses `font-display: swap`, and keeps its OFL license in `dist/journal/fonts`. The writing role is (28px) on a (40px) baseline; date headings are (43px, weight 600), and the diary title scales from (54px) to (72px, weight 600). Nunito Sans remains the interface voice, and the existing botanical brand stays intact.

Desktop presents two dated paper pages with a subtle central fold only when two pages are present. A single day has no fold. At widths up to (760px), the pages stack, the fold disappears, and the writing baseline becomes (38px). Date bookmarks and earlier/newer day controls navigate the existing memories; the page contains no personal-entry editor.

## Do's and Don'ts

- Do preserve the pond, pixel orchard, hex diorama, nighttime kitchen, pastel enamel slots and sculpted plush cabinet themes.
- Do use local display and UI font files for shared interface text.
- Do apply the active world’s paper, ink, muted and line roles to controller content.
- Do keep controller content scrollable within its established viewport-bounded dimensions.
- Do keep the botanical symbol and Spriggan wordmark together in the header.

- Don’t flatten the six world materials into a single artwork style.
- Don’t show native scrollbars on controller content.
- Don’t replace the botanical symbol with a generic game icon.
- Don’t let mobile hex notifications overlap its counters or let play controls overlap the expanded focus timer.
