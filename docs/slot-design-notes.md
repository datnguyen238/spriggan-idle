# Golden Seed: research and prototype design

Research checked 30 September 2026. The studies below concern monetary gambling, laboratory simulations, or operator records. Their findings inform design choices; they do not establish that this free browser prototype is addictive, safe, or clinically effective.

## What keeps a slot machine compelling

| Element | What the primary source supports | Translation into this prototype (design inference) |
| --- | --- | --- |
| Unpredictable rewards | Haw (2008) examines random-ratio reward schedules and explains why the distribution of early wins and unrewarded trials matters alongside average win frequency. | Keep independent, openly weighted random reels for surprise. Publish the probabilities; previous results never change the next result. Garden progress advances on every completed spin. |
| Near misses | Clark et al. (2009) found that near misses were unpleasant yet increased the desire to continue in a simplified slot task when participants selected their gamble. Some brain responses overlapped with those to wins. | Do not arrange artificial near misses, add “almost!” messages, or prolong a reveal when two symbols match. A natural pair is simply a refund. |
| Apparent personal control | In the same Clark study, selecting the gamble increased perceived chances of winning. The near-miss motivation effect depended on that personal control. | One Spin action starts a predetermined random result. There are no hold, nudge, timing, or stop controls implying skill changes the odds. |
| Reinforcing sights and sounds | Dixon et al. (2010) measured 40 novice players. Wins and payouts below the wager produced similar skin-conductance responses, both exceeding ordinary losses. | Show cost, gross return, and net change together. Celebrate positive net wins and permanent garden unlocks; call a cost-returning pair “Seeds returned,” not a win. Audio starts off. |
| Frequent repeated events | Auer and Griffiths (2023) analyzed 763,490 sessions from 43,731 players at one online operator. Faster event frequency was associated with more bets. Game characteristics alone explained only 7.7% of bet-count variance; this observational study did not demonstrate causation or diagnose addiction. | Require a fresh action for every spin; no autoplay or held-key repeat. Use the same reveal duration for every outcome and let players leave at any point with settled progress saved. The duration is an aesthetic choice, not a validated safety threshold. |

## Repository principles

The landing page promises “LITTLE WORLDS, SLOW DAYS” and “No rush.” The pond and farm turn simple actions into visible growth and named creatures. Sound requires interaction; browser saves persist through return visits. Their rules and save validation are separate from Canvas rendering, with graceful handling when storage is unavailable.

Golden Seed follows those conventions: warm wood, foliage, quiet pixel artwork, garden growth, local persistence, and an optional visit back to Stillwater Pond. The final collectible is the pond’s existing golden koi, **Kin**, with its existing appearance and lifecycle. Research-informed engagement comes from surprise, understandable feedback, and a growing place to care for. Unlimited free seeds, a bounded prototype collection journey, and clear outcomes are product choices rather than conclusions proved by the cited studies.

## Test version rules

- Three independent reels: leaf 30%, flower 25%, egg 20%, chicken 12%, koi 8%, golden seed 5% on each reel.
- Start with 200 seeds; each spin costs 10. Exactly two matching symbols return 10. Triples return 40 / 60 / 100 / 200 / 400 / 1,000 seeds respectively. Three different symbols return zero. Only one payout applies.
- Exact exhaustive probabilities: refund pairs **48.843%**, positive-net triples **5.299%**, any return **54.142%**. Expected gross return is **8.3772 seeds per spin**, or **83.772%** of the cost. These correct the earlier proposal’s estimates. A short session can differ substantially.
- When balance is below 10, **Gather seeds** restores it to 100 immediately. No purchases, cash value, waiting period, streak, or daily return requirement.
- Every spin grows the garden. Flowers arrive at 8 total spins, lanterns at 20, lotus at 35, and golden Kin at 60. A triple golden seed can unlock Kin early: its independent probability is **0.05³ = 1 in 8,000** per spin. The 60-spin guarantee is deliberately a short test-version path; it does not change reel odds.
- Reveal lasts approximately 2.1 seconds regardless of outcome. Motion can be disabled; reduced-motion preferences are respected. Sound is opt in. Save the completed outcome when a spin starts so reload cannot cancel a loss or duplicate a reward.
- An explicit **Welcome Kin to your pond** action transfers the existing golden koi type into the same browser’s pond save. Preserve all existing koi, settings, and growth; enforce the pond’s 12-koi limit and at most one golden koi. A full pond keeps the reward available for later.

## Primary sources

1. Haw, J. (2008). [Random-ratio schedules of reinforcement: The role of early wins and unreinforced trials](https://doi.org/10.4309/jgi.2008.21.6). *Journal of Gambling Issues*, 21, 56–67. [Author’s university repository record and abstract](https://researchportal.scu.edu.au/esploro/outputs/journalArticle/Random-ratio-schedules-of-reinforcement-the-role/991012821246302368).
2. Clark, L., Lawrence, A. J., Astley-Jones, F., & Gray, N. (2009). [Gambling near-misses enhance motivation to gamble and recruit win-related brain circuitry](https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/). *Neuron*, 61, 481–490. [DOI](https://doi.org/10.1016/j.neuron.2008.12.031).
3. Dixon, M. J., Harrigan, K. A., Sandhu, R., Collins, K., & Fugelsang, J. A. (2010). [Losses disguised as wins in modern multi-line video slot machines](https://doi.org/10.1111/j.1360-0443.2010.03050.x). *Addiction*, 105, 1819–1824.
4. Auer, M., & Griffiths, M. D. (2023; published online 2022). [The relationship between structural characteristics and gambling behaviour: An online gambling player tracking study](https://link.springer.com/article/10.1007/s10899-022-10115-9). *Journal of Gambling Studies*, 39, 265–279.
