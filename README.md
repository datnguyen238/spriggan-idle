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
- **Nature sounds** adds quiet wind by day and the included crickets by moonlight. **Gentle music** adds a soft, original generated melody. These layers work alongside rain and start only after a click.
- Space pauses or resumes when focus is outside the controls.
- Hide or show the control panel without losing your pond settings.

Your koi, names, feeding progress, and pond settings are saved automatically in this browser. Returning shows a welcome message; saved sounds wait for **Resume saved sounds**. Clearing browser data resets the pond, and saves do not sync across devices. If storage is unavailable, the pond still works for the current visit.

Fed koi gradually grow with elapsed time, including time away. Ten eaten food pieces support roughly one day of growth; each koi stores up to three days of nourishment and can grow up to 35% larger. A golden koi has an 18% chance to join on a daily check after your first day, provided the pond has space. Reloading does not grant extra attempts, and only one golden koi lives in a pond at a time.

Occasionally a dragonfly or frog visits a lily pad, or a leaf or petals drift past. Only one event appears at a time, with quiet gaps between visits. Pause freezes these animations too.

Page markup and styles are in `dist/index.html`; animation and controls are in `dist/app.js`, saved data and growth in `dist/pond-life.js`, ambient audio in `dist/pond-audio.js`, and plant collisions in `dist/pond-plants.js`. Edit these files and refresh the page to see your changes. Keep the entire `dist` folder, including both WAV files, together when deploying. The font loads from Google Fonts when online; a system font is used offline.

## Publish with Vercel

Import this GitHub repository into Vercel. The included `vercel.json` serves the `dist` folder directly, with no build step. After deploying, share the production URL.

## Check saved data and growth

With Node.js installed, run `node --test tests/*.test.cjs`.
