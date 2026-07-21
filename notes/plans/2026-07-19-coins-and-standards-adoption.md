# Plan — Full standards adoption + Coins across every game (2026-07-19)

Owner ask: adopt the hub batch (v0.16.0 → **v0.20.2**) in full, and integrate **coins** into
**all 15 games** — done very well, over as many phases as needed. Coins are a *tool the player
wants to leverage to do more*, never a gate, never a grind, never gambling.

## Design contract (the guardrails, from the owner + `coins.md`)

**Earning (bounded — never shower the player):**
- A game grants **at most ~3 coins per game per day** (hard cap, enforced in the game's own meta).
- Grant triggers, each +1, until the daily cap: **first play of the day**, **reaching a new stage**
  (a stage deeper than any reached earlier *today*), and a **new all-time record**.
- Grants use `FairyFoxCoins.reward(1, reason)`. The cap lives in the game (coins.js has no per-game
  notion). Ungrindable: you must actually play and progress; repetition earns nothing past the cap.

**Spending (consumable, cheap, bespoke, fun — NOT skins/backgrounds):**
- Per the owner: skins/backgrounds are out. A spend buys a **special / funny mode or a bonus
  option for a single run** — *consumable*, not a permanent unlock.
- **Cost 1 coin** (occasionally 2), and the player **can't spend much per session** — one fun-mode
  purchase applies to the next run only; it's re-bought if wanted again.
- **Never a gate:** every game is 100% playable and enjoyable at zero coins; the core mechanic,
  all stages, and record-keeping never depend on coins.
- **No gambling:** every spend yields a **known, chosen** result — no paid random rolls.
- **Records stay honest:** fun modes are cosmetic/juice by default (score still counts). Any mode
  that changes difficulty marks that run **"Fun run — not recorded"** so a purchase can never buy a
  personal best.
- `spend` returning `false` degrades gracefully (a soft "1 coin" hint, never a block).

**Restraint (the standard's prime directive + our own "stay simple" rule):** one coin affordance
per game, small and on the start/menu surface, never cluttering the play field or the clean HUD.

## Shared architecture (respects the non-negotiables)

Coins logic splits pure-from-render like everything else here:

- **`games/_shared/coins-earn.core.js`** — a pure module (no DOM/coins.js): `computeGrant({today,
  meta, firstPlayToday, maxStageThisRun, newRecord})` → `{grant, meta}` applying the 3/day cap and
  the daily rollover. Fully unit-tested (`games/_shared/coins-earn.core.test.js`, `node --test`).
- **`games/_shared/coins-game.js`** — a thin shell helper (loaded as a module by each game):
  loads/wires `window.FairyFoxCoins`, exposes `grantForRun(events)` (calls the pure core then
  `reward`), and `buyFunMode(cost)` (calls `spend`, returns success). No game logic.
- Each game's **shell** owns its own fun-mode rendering + the one menu control; each game's
  **core** is untouched except (where a mode changes difficulty) a pure flag that marks a run
  non-recording.
- Shared code is deliberate here — CLAUDE.md allows loosening strict per-game liftability "where
  shared code is worth more." Games still load only relative paths under the repo.

`coins.js` itself is **vendored verbatim** from the hub master (`assets/js/coins.js`), never
reimplemented; games load it so `window.FairyFoxCoins` + the shared wallet exist off the site chrome.

## Per-game coin moments (first pass — bespoke fun mode + uniform earn)

Earn is uniform (the 3/day rule above) for all 15. The **spend** is one bespoke consumable per game,
1 coin / next run, cosmetic-by-default so records stay honest:

| Game | Fun-mode spend (1 coin, one run) | Kind |
|------|----------------------------------|------|
| Polarity | **Disco** — gates cycle rainbow, bg equalizer pulse | cosmetic |
| Ward | **Aurora shield** — shield/core shift rainbow, blocks spark | cosmetic |
| Reprise | **Choir** — pads swap to a sung/instrument voice | cosmetic audio |
| Brim | **Fizz** — soda pour, foam + cork-pop on a brim | cosmetic |
| Tether | **Comet** — blazing comet tail on the swing | cosmetic |
| Ink Bloom | **Neon rave** — trail cycles neon with a beat pulse | cosmetic |
| Echo Chamber | **Ripple pool** — water-ripple visuals + drip sfx | cosmetic |
| Orbit Slingshot | **Retro** — green vector-CRT wireframe look | cosmetic |
| Ricochet | **Fireworks** — banks spark, hits burst fireworks | cosmetic |
| Skyline | **Jelly** — slabs squash-and-stretch wobble on landing | cosmetic |
| Loft | **Googly** — orbs get googly eyes + boing sfx | cosmetic funny |
| Poise | **Circus** — tightrope beam, clown ball | cosmetic |
| Symmetry | **Kaleidoscope** — mirrored trails paint colour | cosmetic |
| Arc | **Rainbow arc** — rainbow lob trail + splash on land | cosmetic |
| Sluice | **Paint** — sparks are paint blobs that splash | cosmetic |

(Where a later pass finds a game that wants a *do-more* bonus that ties in better than a fun mode,
it may swap in — e.g. a non-recording "warm-up" that starts deeper for practice — but only one
affordance per game, and never one that buys a record.)

## Phases

1. **Standards + templates** — vendor the 10 new + 5 changed hub standards into `notes/reference/`;
   add `check-links.mjs` + `check-tidy.mjs` (repo-hygiene) wired into the test gate; refresh the
   compliance/`CLAUDE.md` touchpoints. Docs + scripts only, no game code. (Pre-authorized by the
   `adopt-standards-by-default` ledger grant; still verified + reviewable-committed.)
2. **Coins infra + legal** — vendor `assets/js/coins.js`; load it in the landing chrome (reconcile
   with the local `_includes/` divergences; chrome bundle 2.0.0 → 2.2.1 for the coins wiring only)
   and in every game shell; legal brand-minimum (Privacy/Cookies disclose reader prefs + coins as
   device-only, Terms no-monetary-value clause, link the shared `/legal/coins/`, project-owned
   `…@fairyfox.io` contact) with bumped "Last updated". Preview in Chrome.
3. **Shared game-coins module + reference game** — build the pure earn-core + tests + shell helper;
   land the full earn+spend on **Polarity** (the reference build); preview.
4. **Roll out** — batches of ~3 games; each gets the uniform earn + its bespoke fun mode, `*.core`
   flag if non-recording, tests, headless-Chrome preview, a player changelog line. Ship each batch.
5. **Close** — full `npm test` green, release `dev → main` (PR + tag + back-merge), update
   `status.md`/changelog/legal, and write the fairyfox process report(s).

## Verification floor (every phase, per the ledger + testing.md)

Before *and* after each applying phase: `node --test "games/**/*.test.js"` green (+ the new shared
test), a headless-Chrome preview of any visual change, the standard's `## Verify`/compliance for what
was touched, and the project constraints (pure-core split, no gate, ≤3/day earn, honest records).
If verification can't complete, do not auto-apply — fall back to check-report-wait.

## Progress

- **Phases 1–3 — done 2026-07-19** (committed to `dev`, VERSION → 0.24.6; were left unpushed +
  unreleased until the batch below).
- **Phase 4, batch 1 — done 2026-07-20 (v0.24.7):** **Ward** (Aurora shield) + **Brim** (Fizz).
  Uniform capped earn + a cosmetic-only fun mode each; additive render, records honest, never a
  gate; 652/652 green; menus previewed headless. Released `dev → main` (this also shipped phases
  1–3). **Rollout: 3 of 15.**
  - **Note:** the hygiene scripts phase 1 planned (`check-links.mjs` / `check-tidy.mjs`) were
    never actually added — the real test gate is still `node --test`. Add them, or drop the claim,
    on a future run.
- **Phase 4, batch 2 — done 2026-07-20 (v0.24.8):** **Tether** (Comet) · **Ink Bloom** (Neon rave)
  · **Echo Chamber** (Ripple pool). Uniform capped earn + a cosmetic-only fun mode each; additive
  render, records honest, never a gate; 652/652 green; menus previewed headless. Ink Bloom needed
  a guard so the on-menu coin button doesn't trigger its move-to-begin start. **Rollout: 6 of 15.**
- **Phase 4, batch 3 — done 2026-07-20 (v0.24.9):** **Orbit Slingshot** (Retro CRT) · **Ricochet**
  (Fireworks) · **Skyline** (Jelly wobble). Uniform capped earn + a cosmetic-only fun mode each;
  additive/overlay render, records honest, never a gate; 652/652 green; menus previewed headless.
  **Rollout: 9 of 15.**
- **Phase 4, batch 4 — done 2026-07-20 (v0.24.10):** **Loft** (Googly) · **Poise** (Circus) ·
  **Symmetry** (Kaleidoscope). Uniform capped earn + a cosmetic-only fun mode each; drawn-overlay
  render, records honest, never a gate; 652/652 green; menus previewed headless. **Rollout: 12 of 15.**
- **Phase 4, final batch (queued):** Arc · Sluice. **Reprise (Choir) is deferred** — it wants a
  real audio layer, which the games don't have yet; don't rush WebAudio into a daily run.
- **Phase 5 — close:** once the 15 are done, a final pass over `status.md` / legal / process
  reports (the per-batch releases mean `main` is already current).
