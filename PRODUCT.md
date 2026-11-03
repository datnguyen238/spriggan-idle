# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Spriggan primarily serves students and workers during focus sessions and breaks. They use it for relaxation alongside light collectible progression. This audience and balance were confirmed by the owner during initialization.

## Product Purpose

Offer small interactive worlds that give people a place to settle during work or study and something familiar to return to during a break. Relaxation and collectible progression belong together: caring for a world and welcoming earned animals are part of the experience.

A successful experience lets someone enter a world, interact or let it accompany a session, and return to their saved progress. Quantitative success targets and audience research remain open.

## Positioning

Spriggan combines personal worlds, ambient interaction, focus timers, and collectible animals. Golden Seed rewards connect the mini-game to animals in the pond and farm; Little Folds connects cooking and shop earnings to virtual seeds. These are existing product mechanisms, not claims of market exclusivity or proven wellbeing outcomes.

## Operating Context

- Runs in desktop and mobile web browsers. The homepage is the entry point for choosing a world or Golden Seed.
- Stillwater Pond supports koi care, naming, growth, and pond settings.
- Sunny Side Farm supports feeding, eggs, hatching, animal growth, and collectible cows.
- Clover Keep is a meadow with visitors, guards, and persistent activity totals.
- Little Folds is a dumpling shop with cooking, customers, shop coins, and an explicit exchange from shop coins to seeds.
- Golden Seed uses virtual seeds for reel outcomes and collectible animal prizes. Kin is the golden koi; Buttercup is the cow.
- Focus and break timers, optional sound, and pause controls accompany the worlds. Browser audio can require a tap before playback; background behavior differs between desktop and mobile.

## Capabilities and Constraints

- Preserve the current site URL. Account features must not require a domain purchase, URL migration, or move to different hosting.
- The existing implementation uses plain HTML, CSS, JavaScript, and Canvas. Vercel serves `dist` without a build step. Local development uses `python3 -m http.server 8000 -d dist` from the repository root.
- Guest play is available without registration. Accounts use Firebase email/password authentication, with verified email required for cloud saves. Guest progress stays separate unless the player explicitly imports it.
- Account progress must survive sessions and travel across devices after a confirmed cloud save. Preserve earned animals, claim receipts, care, and linked game balances together. Significant events trigger account save requests; periodic saving backs up gradual changes.
- Make pending, cloud-saved, and failed saves distinguishable. Failed loading must not create a replacement world or overwrite existing account progress. Conflicting saves require an explicit choice.
- Pond timestamps and nourishment reconstruct elapsed growth when the player returns; uploading the current clock every second is unnecessary.
- Seeds currently have no cash value, and no real-money top-up feature is implemented. Exploring paid top-ups later is an owner-confirmed direction, not authorization to introduce payments. Pricing, payment providers, and the future economy remain undecided. Current client-owned saves are not an authoritative payment ledger.
- Changes to slot excitement and progression remain open product decisions; no new probability model or engagement target was selected during initialization.

## Brand Commitments

The existing product name is **Spriggan**. Existing copy includes “Little worlds, slow days” and “Somewhere quiet. Something yours.” It uses a personal, unhurried voice. This records the incumbent wording; initialization does not establish a new aesthetic direction or replace the existing interface.

## Evidence on Hand

- Runnable worlds and product copy: `dist/index.html`, `dist/pond/`, `dist/pixel/`, `dist/hex/`, `dist/dumplings/`, and `dist/slots/`.
- Account experience and setup: `dist/account/`, `dist/shared/accounts.js`, and `docs/accounts-setup.md`.
- Existing world previews: `dist/previews/`. Canvas artwork, ambient recordings, and generated music exist in the implementation.
- Repository documentation and deployment configuration: `README.md` and `vercel.json`.
- Automated regression checks: `tests/`. They verify behavior; they do not constitute user research or proof of relaxation or productivity benefits.
- No verified testimonials, customer counts, audience research, or outcome benchmarks have been supplied. Do not invent them.

## Product Principles

1. Support focus sessions and breaks through relaxation and light collectible progression.
2. Treat saved worlds and earned animals as lasting player progress; recovery and honest save status are part of the product.
3. Keep guest entry available, with an explicit account path for continuity across sessions and devices.
4. Let sound, motion, and active interaction respond to the player's situation and choices.
5. Keep future monetization distinct from current capabilities until its terms and implementation are deliberately chosen.

## Accessibility & Inclusion

Preserve the existing keyboard controls, labeled forms, koi and animal selectors, reduced-motion handling, pause controls, and sound controls. Canvas scenes have accompanying controls and status text, but these do not establish complete accessibility conformance. No formal accessibility target or additional audience-specific access needs have been confirmed.
