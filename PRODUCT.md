# Spriggan

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
People taking a quiet break or keeping a small ambient game beside work and study. Desktop and mobile browsers are both first-class.

## Product Purpose
Little worlds, slow days. Explore an amusement park and enter simple, persistent games. The scene and its inhabitants are the experience; interface should leave space for them.

## Capabilities and Constraints
Preserve the six established games: pond, chicken farm, hex meadow, dumpling shop, claw arcade, and Golden Seed. The seventh world, The Fishing Dock, sits along the park’s river and offers gentle timing-based fishing and a persistent fish field guide. Preserve existing game mechanics, rewards, browser saves, rain and sound preferences, focus timers, keyboard input and mobile controls. The app is static HTML/CSS/JavaScript hosted on Vercel. Players sign in with Google before entering the park. Their account's park loads before gameplay starts, then local progress syncs automatically to Supabase. Existing browser progress receives an explicit choice when it differs from the account's park. Local ownership tracking separates accounts, and server revision checks require a choice when devices diverge. Pending changes survive temporary connection failures on the device. Only one active Spriggan tab runs per browser profile and origin, using Web Locks. Browser storage and Web Locks support are required. A park journal records saved milestones. Manual cloud save/load and backup file controls are omitted. The static login gate controls the experience; database RLS and authenticated functions enforce private cloud access. Multiplayer is not implemented.

## Brand Commitments
Spriggan; little worlds, slow days. Quiet, playful, ambient, pastel, welcoming. Each game has its own material and setting, within a shared app. The user explicitly authorized artwork as well as interface redesign on 2026-11-17. Preserve the atmosphere; remove generic presentation. No train map.

## Product Principles
- Make sign-in simple, then open the player's park with progress ready and saving handled in the background.
- Let the living world lead, with controls tucked away but easy to reach.
- Keep earned progress and existing economies intact.
- Make mobile as considered as desktop.

## Evidence on Hand
Working games in dist; existing previews in dist/previews; behavioral tests in tests. Existing illustrated worlds and user feedback are the design reference. No testimonials or commercial claims are supplied.
