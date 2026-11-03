---
name: Spriggan
description: The Little Worlds Retreat — quiet, personal, gently playful.
colors:
  pine-green: "#142f2b"
  pine-highlight: "#2d5141"
  parchment: "#f3ecd9"
  soft-moss: "#b8c8b3"
  shell-rule: "#dbe5bd25"
  account-paper: "#f3eedf"
  account-ink: "#29483c"
  action-green: "#3d624d"
  action-green-hover: "#4c725a"
  action-parchment: "#fbf6e7"
  field-paper: "#fbf8ee"
  account-focus: "#d7ba78"
  pond-paper: "#efeada"
  pond-ink: "#294239"
  farm-panel: "#294333f5"
  farm-text: "#ffffff"
  seed-paper: "#f4f1e8"
  seed-ink: "#3d514c"
  seed-action: "#5e7b70"
  kitchen-night: "#222a3c"
  kitchen-cyan: "#9ec5c7"
  kitchen-pink: "#d8a7bf"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(39px, 4.6vw, 63px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-2px"
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "23px"
    fontWeight: 400
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "14px"
    lineHeight: 1.8
  label:
    fontFamily: "monospace"
    fontSize: "10px"
    lineHeight: 1.3
  action:
    fontFamily: "monospace"
    fontSize: "11px"
    lineHeight: 1.5
  field:
    fontFamily: "system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.4
  pond-title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.045em"
  pond-body:
    fontFamily: "'DM Sans', system-ui, sans-serif"
rounded:
  field: "6px"
  world-preview: "9px"
  account-card: "18px"
  account-nav: "22px"
  pond-panel: "17px"
  farm-launcher: "7px"
  circle: "50%"
spacing:
  shell-inset: "42px"
  world-grid-gap: "25px"
  account-card-inline: "30px"
  account-card-top: "27px"
  action-inline: "16px"
  action-block: "11px"
  field-inline: "12px"
  field-block: "10px"
components:
  button-primary:
    backgroundColor: "{colors.action-green}"
    textColor: "{colors.action-parchment}"
    typography: "{typography.action}"
    rounded: "{rounded.field}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-green-hover}"
  button-secondary:
    backgroundColor: "#faf6e9"
    textColor: "#52694c"
    typography: "{typography.action}"
    rounded: "{rounded.field}"
    padding: "11px 16px"
  text-field:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.account-ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  account-nav:
    typography: "{typography.label}"
    rounded: "{rounded.account-nav}"
    padding: "0 12px"
  status-badge:
    backgroundColor: "#dce4cf66"
    textColor: "#5d7355"
    rounded: "20px"
    padding: "6px 8px"
  account-card:
    backgroundColor: "{colors.account-paper}"
    textColor: "{colors.account-ink}"
    rounded: "{rounded.account-card}"
    padding: "27px 30px 0"
  world-preview:
    backgroundColor: "#23493c"
    rounded: "{rounded.world-preview}"
  pond-launcher:
    backgroundColor: "{colors.pond-paper}"
    textColor: "{colors.pond-ink}"
    rounded: "{rounded.circle}"
    width: "52px"
    height: "52px"
  farm-launcher:
    backgroundColor: "{colors.farm-panel}"
    textColor: "{colors.farm-text}"
    rounded: "{rounded.farm-launcher}"
    width: "52px"
    height: "52px"
---

# Design System: Spriggan

## Overview

**Creative North Star: "The Little Worlds Retreat"**

Spriggan is quiet, personal, and gently playful. The shared shell pairs pine green, parchment, and soft moss with serif headings, small utility labels, fine borders, and soft layers. Controls are familiar and restrained, with playful details specific to each world. These descriptions were confirmed by the owner; the values above are extracted from the existing implementation.

The worlds belong to one collection without becoming interchangeable. Preserve the pond's fluid illustration and round controls, the farm's pixel artwork and squarer controls, the meadow's full-screen landscape, Little Folds' after-hours counter, and Golden Seed's light mechanical cabinet. This record captures the incumbent design; it does not authorize a redesign or normalize all routes into one palette.

**Key Characteristics:**
- Quiet shared framing around distinct interactive worlds.
- Serif scene titles with practical utility text.
- Soft layers that lift controls gently above each world.
- Familiar and restrained controls with world-specific playful details.
- Existing keyboard, sound, pause, and reduced-motion choices remain usable.

Source evidence is the current CSS cascade and markup, supported by existing world previews. Live computed-style verification was unavailable because local browser access is disabled; preview images are supporting evidence rather than proof of every current control state.

## Colors

Pine green, parchment, and soft moss describe the shared palette; individual worlds retain their existing colors.

### Primary

- **Pine green** (`colors.pine-green`): the landing and account backdrop. Pine highlight supplies their existing ambient background layering.
- **Action green** (`colors.action-green`): account primary actions, with the recorded hover shade. This is the actual button color, not the unused alternative green declared in the account stylesheet.

### Secondary

- **Soft moss** (`colors.soft-moss`): supporting copy and quieter metadata in the shared shell.
- **Kitchen cyan and pink**: accents scoped to Little Folds. They do not replace the shared shell palette.
- **Seed action**: Golden Seed's existing action color, scoped to that mini-game.

### Neutral

- **Parchment** (`colors.parchment`): the shared shell's main light text.
- **Account paper and ink**: the account form surface and readable dark text.
- **Pond paper and ink**: the pond controller surface and text.
- **Shell rule**: the thin translucent shared divider treatment.
- Farm, kitchen, and Golden Seed values are explicitly scoped; matching role names do not make them global replacements.

**The World Identity Rule.** Reuse the current route's palette before borrowing another world's colors; preserve the distinct identities within the shared collection.

## Typography

The landing, account, farm, meadow, kitchen, and Golden Seed use Georgia with Times New Roman and serif fallbacks for titles and much of their copy. Monospace text carries utility labels and controls. The pond deliberately uses Fraunces for headings and DM Sans for body and controls. Account text inputs use system UI text.

The frontmatter display role records the landing headline; headline records its world titles. Account headings use their own responsive range (40–58px), regular weight, and compact line height. Golden Seed's title is 54px on desktop and 44px on mobile. Pond scene headings are 22–26px, smaller than the shared landing display. These are route roles, not one universal type scale.

Supporting copy commonly spans 12–14px. Some incumbent metadata is only 6–9px: this is an observation, not a recommended legibility floor for new UI. Preserve hierarchy without copying small utility text into essential instructions, forms, or error messages.

**The Role Before Size Rule.** Keep scene titles, supporting copy, actionable labels, and metadata distinct; retain each route's font family instead of imposing the landing pairing on the pond.

## Layout

The landing shell is centered at a maximum width of 1200px, with the recorded shell inset. World previews form three equal columns with the recorded grid gap; below 850px the gap reduces, and below 600px the list becomes a single column capped at 380px. Previews are square and show actual world imagery.

The account shell has a maximum width of 1120px. Its desktop main area pairs an introduction with a form column up to 440px and a 70px gap. At 900px the gap becomes 35px; at 720px it becomes a single column capped at 500px. The form remains usable without the decorative introduction.

Pond, farm, meadow, and kitchen are full-viewport scenes with overlay navigation and compact controllers. Primary controllers sit near the bottom right; focus timers sit near the bottom center. Keep mobile controller height, `--timer-space`, and safe-area offsets working together. Golden Seed remains a scrollable, centered page with an 860px main area and a cabinet up to 690px wide.

## Elevation & Depth

Soft layers lift controls gently above each world. Thin translucent borders and changes in tone separate regions; shadows support the layer instead of becoming a new decorative motif. Golden Seed's inset cabinet and stepped mechanical shadows, and the farm's pixel-like timer shadow, remain local exceptions that express their worlds.

### Shadow Vocabulary

- Account card: `0 18px 55px #041c2630`.
- Floating pond/farm controller: `0 12px 36px #001b2440`.
- Shared account notice: `0 8px 30px #061f2940`.
- Account dialog: `0 20px 90px #071e2280`; its backdrop uses a 3px blur.
- World preview hover: `0 10px 30px #041e2638`.

**The Scene First Rule.** Raise the controls enough to separate them from the illustration while keeping the world itself visually dominant.

## Shapes

The shared shell uses fine borders and softly curved cards. Account fields and buttons use the field radius; the account card and world-preview radii have separate roles. Account navigation is pill-shaped. Values in frontmatter are role-based extractions, not evidence of a universal spacing or corner scale in the source.

World launchers preserve their silhouettes: the pond is circular, the farm uses squarer corners, the meadow uses a compact rounded control, and the kitchen uses a circular launcher. Do not round the farm's pixel vocabulary into the pond's shapes. The meadow's current canvas is full-screen and unframed; earlier framed-map rules in its stylesheet are superseded by the final cascade.

## Components

### Buttons

Familiar and restrained, with a clear action hierarchy. Account primary and secondary buttons use the frontmatter treatments and a minimum height of 44px. Hover changes the surface, focus remains explicit, and disabled controls use reduced opacity. Account primary actions have the small stepped shadow in the sidecar; Golden Seed's pressed cabinet controls retain their own tactile behavior.

### Fields

Account fields use the recorded paper, ink, field typography, padding, and radius, with a minimum height of 46px. Focus changes the border and adds an outline. Labels, help, verification, and error text remain meaningful controls and content rather than decoration.

### Cards and Previews

The account card uses the recorded paper treatment and its dedicated shadow. World previews preserve square artwork, a fine border, and their existing hover lift; the farm preview keeps pixelated rendering. Hover image scale is modest (1.035) and disabled for reduced motion. Actual world previews remain the visual evidence; placeholder illustrations are not equivalent assets.

### Navigation and Status

Shared account navigation inherits each route's colors rather than applying a fixed global surface. The account pill has a minimum height of 44px, a thin border derived from the current text color, and visible hover and keyboard-focus states. Save status stays textual and distinguishes queued, saving, cloud-saved, device-only, and conflict states.

### World Controllers and Timers

Compact launchers reveal floating panels after the world's handlers are ready. Preserve accessible names, expanded state, keyboard access, panel scrolling, and the controller/timer relationship. Pond panels are 230px wide; farm panels are 258px. Their full treatments and launcher samples are in the sidecar.

Transitions are short and attached to a state: preview border/shadow changes use 0.25s, preview image scale uses 0.6s, and floating controls use approximately 0.2–0.25s. Honor reduced-motion behavior. Continuous world animation and the mini-game reveal are scene behavior, not effects to add to every component.

## Do's and Don'ts

### Do:

- **Do** preserve each world's existing palette, type, artwork, and controller silhouette inside the shared collection.
- **Do** keep the scene visible and group controls into the existing compact controller pattern.
- **Do** retain visible focus, keyboard alternatives, explicit status text, pause, sound, and reduced-motion choices.
- **Do** use the final stylesheet cascade as evidence; earlier overridden values are not the current design.
- **Do** use actual world previews when representing the existing games.

### Don't:

- **Don't** impose the pond's fonts or circular controls on the pixel farm, or apply the kitchen's night accents to every route.
- **Don't** treat small incumbent metadata sizes as the target for essential new instructions or forms.
- **Don't** hide save failures or action states behind color or decorative icons alone.
- **Don't** promote Golden Seed's mechanical bevels, lever motion, or stepped shadows into general navigation and form styling.
- **Don't** turn this documentation pass into new UI, new claims, or an unrequested visual replacement.
