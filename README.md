# Spriggan — Koi Pond

A small interactive koi pond built with plain HTML, CSS, JavaScript, and the Canvas API. No build step or packages are needed.

## Run locally

1. Download and unzip the project.
2. Start a local server from the project folder (needed for sound files):

```bash
python3 -m http.server 8000 -d dist
```

Then visit http://localhost:8000. Stop the server with Ctrl+C.

## Interact

- Click or tap water to drop food. The koi swim toward it. The pond holds up to 100 food pieces at once; feeding becomes available again as food is eaten or fades away.
- Tap a koi to see its name and rename it, or use the koi selector in the controls.
- Add a koi (up to 12), or choose **Remove a koi** and click the fish to remove. Escape cancels removal.
- Pause or resume, switch between daylight and moonlight, and adjust the swimming pace.
- Soft lily pads and lotus blossoms follow broad, gentle currents; leafy branches gently sway. Plain and flowering pads gently bounce away from one another and the pond edges instead of overlapping. Pause freezes their movement too.
- Toggle rain visuals with **Add rain**. Use the speaker button for rain sound and the volume slider to adjust it.
- **Nature sounds** plays the included cricket recording in both daylight and moonlight. **Gentle music** adds a soft, original generated melody. These layers work alongside rain and start only after a click.
- Space pauses or resumes when focus is outside the controls.
- Hide or show the control panel without losing your pond settings.

Your koi, names, feeding progress, and pond settings are saved automatically in this browser. Returning shows a welcome message; saved sounds resume on your first tap, or with **Resume saved sounds**. Returning from the background attempts to resume automatically; if the browser requires a gesture, tap the pond. Clearing browser data resets the pond, and saves do not sync across devices. If storage is unavailable, the pond still works for the current visit.

Fed koi gradually grow with elapsed time, including time away. Ten eaten food pieces support roughly one day of growth; each koi stores up to three days of nourishment, grows by 12% of its original size per fed day, and can grow up to 75% larger. A golden koi has an 18% chance to join on a daily check after your first day, provided the pond has space. Reloading does not grant extra attempts, and only one golden koi lives in a pond at a time.

Occasional groups visit for about a minute: four frogs, six dragonflies (daylight only), twelve drifting leaves, or thirty-two sakura petals. Frogs and dragonflies take individually randomized routes between lily pads, resting and hopping or flying onward. Leaves and petals follow varied curved paths. One group visits at a time, with quiet gaps between visits. Pause freezes these animations too. Golden koi remain permanent, with at most one in the pond.

Page markup and styles are in `dist/pond/index.html`; animation and controls are in `dist/pond/app.js`, saved data and growth in `dist/pond/pond-life.js`, ambient audio in `dist/pond/pond-audio.js`, plant collisions in `dist/pond/pond-plants.js`, and visitor routes in `dist/pond/pond-surprises.js`. Edit these files and refresh the page to see your changes. Keep the entire `dist` folder, including all WAV files, together when deploying. The font loads from Google Fonts when online; a system font is used offline.

## Publish with Vercel

Import this GitHub repository into Vercel. The included `vercel.json` serves the `dist` folder directly, with no build step. After deploying, share the production URL.

## Check saved data and growth

With Node.js installed, run `node --test tests/*.test.cjs`.

The canvas renders at up to 2× pixel density. On slower devices, decorative effects simplify while canvas resolution stays sharp.

## Visitor analytics

Vercel Web Analytics is included in `dist/pond/index.html` using the plain HTML integration; no npm package or React component is needed. Enable **Analytics** for this project in Vercel, push and deploy, then visit the live site. Visitor and page-view counts appear in the project's Analytics dashboard after collection begins.

The `/_vercel/insights/script.js` endpoint is provided by Vercel. A simple local server does not provide that endpoint; its local 404 does not affect the pond. Live collection must be verified after deployment; content blockers may prevent tracking.

Crickets use a persistent native audio player. Rain uses a decoded continuous loop. Both pause in the background and restart on return. A rejected restart shows the resume control; browser autoplay policy may still require a tap. Generated music continues to use Web Audio.

Rain uses one continuously looping AudioBufferSource, with no JavaScript timers or media-player handoffs at loop boundaries. `dist/pond/rain-seamless.wav` blends the original recording’s tail into its head with a 1.2-second equal-power overlap, producing a 13.8-second cyclic recording without fade-to-silence. Its decoded buffer is retained across background pauses; its playback context is recreated on return. Keep this file and `pond-rain-loop.js` in the deployed folder.

## Pomodoro timer

The bottom-center timer offers 25-minute focus, 5-minute rest, and 15-minute long breaks. Start, pause, resume, reset, or minimize it. Completing a focus session prepares a short break; every fourth completed focus session prepares a long break. Each next session starts when you choose. Its progress ring and four session dots show your progress, and completion is announced visually. The countdown uses a saved deadline, so it remains accurate across background tabs and reloads. Timer state stays in this browser independently of pond animation. Files: `dist/pond/pond-timer.js` and `dist/pond/pond-timer.css`.

## Map folders

```text
dist/
├── index.html    # Temporary redirect to the pond; future map selection page
├── pond/         # Current koi pond, including its Pomodoro timer and audio
└── pixel/        # Reserved for a future pixel map (.gitkeep only)
```

The pond is available at `/pond/`. The homepage redirects there until a map selection page is built. No pixel map or landing page is implemented yet. Put the future pixel map entry point at `dist/pixel/index.html`. Keep map-specific scripts and assets inside their map folder and use relative asset URLs.

Vercel's output directory remains `dist`; no deployment setting changes are needed. Browser saves use the same origin and storage keys, so moving the pond to `/pond/` preserves existing pond and timer data on the same domain.
