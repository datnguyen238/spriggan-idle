# Spriggan

Little worlds, slow days. Spriggan is a quiet browser park for short breaks and ambient play beside work or study. Sign in with Google, explore the park, and return to your progress on another device.

The park’s **Choose a world** guide shows the current attractions. Their names, descriptions, and routes are maintained in [`dist/landing-places.js`](dist/landing-places.js).

## Run locally

From the repository root, start a static server:

```sh
python3 -m http.server 8000 --directory dist
```

Open [localhost:8000](http://localhost:8000). Stop the server with **Ctrl+C**. Use the server instead of opening HTML files directly so browser modules and audio load correctly.

For local sign-in, allow the local origin in Google and the park-root return URL in Supabase. Browser storage and Web Locks support are required. Only one Spriggan tab can run at a time in the same browser profile and origin.

There is no package installation or bundling. The application is plain HTML, CSS, and JavaScript; 3D dependencies are vendored with the worlds that use them. Keep their license files alongside them.

## Find your way around the source

| Location | Purpose |
| --- | --- |
| `dist/index.html`, `landing*.js`, `landing.css`, `park.css` | Park artwork, attraction registry, walking paths, camera, and destination controls |
| `dist/login/` | Google sign-in screen and first-visit save choices |
| `dist/journal/` | Paper diary and dated park memories |
| `dist/<world>/` | Each world’s scene, controls, rules, saves, and assets |
| `dist/shared/` | Shared navigation, interface styles, entry flow, and reusable controls |
| `dist/previews/` | Artwork shown when choosing a destination |
| `tests/` | Node.js tests for game rules, persistence, and navigation |
| `PRODUCT.md` | Product purpose and constraints |
| `vercel.json` | Static deployment configuration |

Edit the files in `dist` and refresh the browser; these are the deployed source files. Keep world assets with their world and use relative URLs. The attraction registry, map landmarks and paths, and shared world menu work together to connect a destination to the park.

After editing deployed files, refresh their content-based asset versions before testing or deploying:

```sh
node tools/version-assets.cjs
node tools/version-assets.cjs --check
```

The tool updates local asset URLs when their contents change, including dependencies. Vercel runs it automatically before each deployment and gives these versioned assets a long browser cache; HTML and account data do not receive this cache policy. Vendored files stay unchanged. The read-only `--check` command fails when asset references need refreshing.

## Preserve player progress

Individual worlds save progress and preferences in browser storage immediately. The signed-in account also receives automatic cloud updates. Browser data belongs to its origin; a different port or domain has separate local storage. Clearing site data removes local progress that has not reached the cloud.

Keep existing storage keys and support existing saved values when changing a world. Preserve earned items, balances, timers, and preferences. Use a separate browser profile or test context for checks that create or remove progress.

Open **Your park** on the map to preview recent milestones, open the journal, return to your last world, and check your account's save status. The separate paper diary groups the 20 most recent automatic memories by date. Players read their milestones without editing entries; journal updates sync through the existing account save. Players do not need to press cloud save or load buttons. Existing browser progress is handled during sign-in, with an explicit choice when it differs from the account's park. The application blocks concurrent Spriggan tabs in the same browser profile so an old world's in-memory save cannot overwrite a newly loaded park. Manual file download and import controls are not part of the player interface.

The journal records changes in saved facts after its first visit to each world. It does not simulate events while the park is closed. Existing collections become the starting point; new discoveries and milestones appear as you play.

The diary uses a locally hosted Caveat handwriting font, with its license and source in `dist/journal/fonts/`. Its paper texture is a generated image; provenance accompanies the WebP. The existing journal data format, database snapshot, and row security are unchanged.

## Google sign-in and automatic saving

Signed-out visitors see the login page. After Google sign-in, Spriggan checks the account and loads its park before any world scripts run. New accounts can start a park or keep existing browser progress when offered. Progress then saves locally as the worlds update and syncs to Supabase in the background. A small status explains whether it is saved, waiting to sync, or needs attention.

Temporary connection failures keep pending changes on the device for retry. Cloud revisions prevent a second device from silently replacing a newer park; conflicting progress requires a choice before syncing continues. Sign-out returns to the login screen, and local ownership tracking keeps one account's progress from being uploaded to another account.

Public project settings live in `dist/shared/cloud-config.js`. Apply the [migration](supabase/migrations/202611190001_park_saves.sql) and configure the Google provider in Supabase. Cloud saves use one private snapshot per account; auth tokens are excluded. The static login screen is an experience gate; database grants, RLS, and the authenticated save function enforce private data access. OAuth still returns to the park root, so the login page itself needs no new Google callback configuration.

## Run tests

With Node.js installed:

```sh
node --test tests/*.test.cjs
```

Run a specific file with `node --test tests/<name>.test.cjs`. Check interface changes in the browser as well, including keyboard controls and a narrow viewport.

## Deploy

Import the repository into Vercel. [`vercel.json`](vercel.json) specifies no framework, `node tools/version-assets.cjs` as the asset preparation command, and `dist` as the output directory. Deploy the complete directory so relative scripts, audio, previews, and vendored dependencies remain available.

The same files can be served by another static host. Vercel’s analytics endpoint is supplied by Vercel; it is absent from the local Python server.
