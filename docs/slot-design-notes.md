# Golden Seed: pastel mini-game

This replaces the earlier wooden garden prototype. Current rules are defined in `dist/slots/slots-life.js` and documented in the README.

## Visual direction

A centered sage cabinet with cream, pale blue, and sand reel windows, hand-drawn vector symbols, a simple brass lever, and a soft landscape background. Equal space on both sides keeps the cabinet centered independently of the lever. It shares Spriggan's serif typography and relaxed pacing while looking distinct from the pond and pixel farm.

## Rules

Choose a map before spending 10 seeds. Exactly two matching symbols award 20, a net gain of 10 after the spin cost. Any three matching symbols unlock the chosen map's collectible: Kin for the pond or Buttercup for the farm. All six symbols have equal chances per independent reel; triple probability is 1/36, pair probability 90/216. Triples award the friend, not seeds. No progress-based collectible unlocks remain.

Start at 200 seeds. A purse below the spin cost refills to 50 at the next local midnight, once per calendar day. No immediate refill, missed-day accumulation, purchase, or cash conversion. Existing version 1 and 2 saves receive a one-time increase to at least 200 seeds; higher balances and earned prizes are preserved.

## Interaction and saves

A fresh action starts each spin; no autoplay, held-key repeat, artificial near misses, or timing advantage. All outcomes use the same reveal duration. A pair displays both its 20-seed award and its 10-seed net gain. Motion reduction and optional sound are supported.

Results persist before reveal. Prizes have explicit claim actions and stable IDs; partial storage-write retries cannot add duplicates. A full pond retains a pending unlock. Both maps protect new prize arrivals from stale open-tab saves. Already owned golden koi remain, but the pond's random golden event has been removed.

## Adding worlds

Golden Seed has its own mini-game section above the landing page’s map grid; the grid retains an Incoming tile. The reward selector is a native dropdown populated from `SlotsLife.DESTINATIONS`, with no two-column or two-map layout assumption. New available destinations need a registry entry with unique save flags, a matching prize illustration, a claim handler in `slots.js`, and their actual map/save integration. Selection, result decoding, unlocks, labels, and friend illustrations use the registry. Only implemented maps are selectable; future maps are not placeholder prizes.
