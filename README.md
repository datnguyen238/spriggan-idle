# Spriggan

Little worlds, slow days. Spriggan is a quiet browser park for short breaks and ambient play beside work or study. Explore the park, choose an attraction, and return to the progress saved in your browser.

The park’s **Choose a world** guide shows the current attractions. Their names, descriptions, and routes are maintained in [`dist/landing-places.js`](dist/landing-places.js).

## Run locally

From the repository root, start a static server:

```sh
python3 -m http.server 8000 --directory dist
```

Open [localhost:8000](http://localhost:8000). Stop the server with **Ctrl+C**. Use the server instead of opening HTML files directly so browser modules and audio load correctly.

There is no build step or package installation. The application is plain HTML, CSS, and JavaScript; 3D dependencies are vendored with the worlds that use them. Keep their license files alongside them.

## Find your way around the source

| Location | Purpose |
| --- | --- |
| `dist/index.html`, `landing*.js`, `landing.css`, `park.css` | Park artwork, attraction registry, walking paths, camera, and destination controls |
| `dist/<world>/` | Each world’s scene, controls, rules, saves, and assets |
| `dist/shared/` | Shared navigation, interface styles, entry flow, and reusable controls |
| `dist/previews/` | Artwork shown when choosing a destination |
| `tests/` | Node.js tests for game rules, persistence, and navigation |
| `PRODUCT.md` | Product purpose and constraints |
| `vercel.json` | Static deployment configuration |

Edit the files in `dist` and refresh the browser; these are the deployed source files. Keep world assets with their world and use relative URLs. The attraction registry, map landmarks and paths, and shared world menu work together to connect a destination to the park.

## Preserve local progress

Individual worlds save progress and preferences in browser storage. Saves belong to that browser and origin; a different port or domain has separate storage. Clearing site data clears those saves.

Keep existing storage keys and support existing saved values when changing a world. Preserve earned items, balances, timers, and preferences. Use a separate browser profile or test context for checks that create or remove progress.

Open **Your park** on the map to see saved milestones, return to your last world, and manage optional cloud copies. Guests keep saving in the browser. Loading a cloud copy keeps the previous browser park available through **Restore previous browser park**. Close other Spriggan tabs first so an older autosave cannot overwrite restored progress. Manual file download and import controls are not part of the player interface.

The journal records changes in saved facts after its first visit to each world. It does not simulate events while the park is closed. Existing collections become the starting point; new discoveries and milestones appear as you play.

## Optional Google sign-in and cloud copies

**Your park** also offers Google sign-in when the Supabase project is ready. Signing in leaves the browser park untouched. Signed-in players choose **Save to cloud** or **Load cloud save**; cloud copies update only when requested. Replacing either copy requires review, and loading a cloud park keeps a recoverable copy of the previous browser park. Sign-out preserves local play.

Public project settings live in `dist/shared/cloud-config.js`. Configure the database and Google provider using [the setup guide](docs/cloud-saves-setup.md) and [migration](supabase/migrations/202611190001_park_saves.sql). The client checks Google provider availability before enabling sign-in. Cloud saves use one private snapshot per account, server revision checks, and explicit conflict resolution. Auth tokens are excluded from cloud and recovery snapshots.

## Run tests

With Node.js installed:

```sh
node --test tests/*.test.cjs
```

Run a specific file with `node --test tests/<name>.test.cjs`. Check interface changes in the browser as well, including keyboard controls and a narrow viewport.

## Deploy

Import the repository into Vercel. [`vercel.json`](vercel.json) specifies no framework, no build command, and `dist` as the output directory. Deploy the complete directory so relative scripts, audio, previews, and vendored dependencies remain available.

The same files can be served by another static host. Vercel’s analytics endpoint is supplied by Vercel; it is absent from the local Python server.
