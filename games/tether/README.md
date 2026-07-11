# Tether

**Hold to rope on and swing. Let go in the glowing arc to whip yourself across the gap.**

A one-mechanic, beat-your-own-score canvas game. Anchors hang ahead of you across an endless
sky. Rope onto one, swing beneath it, and let go — miss the next anchor and you fall past the
floor. One control: rope on, rope off.

Play it at `fairyfox.io/fairyfox-games/games/tether/`.

## The one decision

**When do you let go?**

Your exit velocity is the swing's *tangential* velocity, so the release angle **is** the launch
angle. That turns letting go into a pure projectile trade-off:

- **Too early**, near the bottom of the arc — fast, but **flat**. You skim out and hit the ground.
- **Too late**, near the top — high, but **slow**. You stall and drop short.
- **The sweet spot** is the classic ~45° launch, partway up the forward swing: the **whip**.

Land a whip and your multiplier grows (×2, ×3 … ×9) *and* the launch is boosted. Let go lazily
and it breaks back to ×1 with no boost. So the whip isn't merely points — it's the distance that
clears the next gap. **Skill and survival are the same act.**

Staying on the rope **pumps** the swing higher, exactly like a playground swing. Hold to wind up,
let go to launch.

### A strategy tip

Wind up before a wide gap. The arc you'll fly is `2 × rope length × (1 − cos amplitude)` — the
faster and higher your swing, the further the whip throws you. When you see **The Chasm** coming,
take an extra swing to build amplitude instead of releasing on the first pass. And on **Canopy**,
the long ropes make slow, heavy arcs: be patient, the window comes later than you think.

## Structure

Every game in this collection is split the same way — the split is non-negotiable, because it's
what lets the game be *proven* to work rather than merely *look* like it works:

| File | Role |
|------|------|
| `tether.core.js` | **Pure logic.** Plain data + pure functions. No DOM, no canvas, no timers. Seedable RNG. |
| `tether.core.test.js` | **Real tests** (`node --test`, zero deps) — physics, the whip, formations, determinism, regressions. |
| `tether.shell.js` | **Render shell.** Canvas, camera, input, the loop, localStorage. IO only. |
| `index.html` | The page + a boot-failure fallback. |

```sh
node --test          # from this folder
python -m http.server 8000   # then open /games/tether/ (ES modules need HTTP, not file://)
```

## How it grows

Tether ships on **varied structure + progression** and the full **growth architecture** from
birth.

**The run's skeleton varies.** A run is a *seeded sequence* of named anchor-lines pulled from a
stage-weighted pool, so no two runs share a shape:

| Formation | What it does |
|-----------|--------------|
| **Steady** | The calm baseline — even spacing, level height. |
| **Rise** | A staircase into the sky; ropes lengthen, swings go long and lazy. |
| **Stagger** | Alternating high and low — the rope length keeps changing, so the timing must be re-read every anchor. |
| **The Chasm** | One yawning span you can only clear on a genuine whip. |
| **Canopy** | Anchors at the ceiling: long ropes, slow heavy arcs, a narrower window. |
| **The Gauntlet** | The late crescendo — low anchors, tight together, no room to coast. |

`minStage` gates each one, so **climbing the stages opens the pool** (progression drives the
variety) and weights it toward the demanding lines late. The notable ones flash a quiet name cue
as you swing into them; the calm ones pass silently.

**Depth inside the one verb** (per `notes/reference/depth-inside-the-mechanic.md`) — none of it
is manualled; it's found by playing:

- **The snap** — a razor sub-window *inside* the whip, straddling the true 45° optimum. Boosts
  harder and pays a bonus. The whip arc is drawn on screen; the snap window inside it is not.
- **Slipstream** — a streak of snaps earns a timed double-score window.
- **A secret final stage** past the last named one, for the player who keeps pushing past "the end".

**The rest of the architecture:** a readable **stage arc** (Sway → Momentum → Airborne →
Freeflight → Skybreak) with a HUD chip and an ambient tint; a smooth **difficulty asymptote** so
the gaps creep wider forever and never plateau; and persistent **meta-progression**
(`tether.meta` — lifetime anchors/points/whips/snaps, furthest stage, 13 skill-safe badges, and a
run-report card). The legacy `tether.best` key is preserved, so no player ever loses their record.

## Design notes worth keeping

Two bugs nearly killed this game, and both are pinned by regression tests:

1. **The pendulum looped over the top.** A flat angular-speed clamp let a fast catch on a long
   rope carry enough energy to swing right over the anchor — after which the angle ran away
   unbounded (θ ≈ −28 rad) and the run could neither progress nor end. The cap is now on
   **energy**, not speed, so the amplitude — and therefore the angle — is bounded by construction.
2. **The pendulum froze solid.** Applying that same cap *outside* the cap angle pinned angular
   velocity at zero every tick, leaving the player hanging motionless in mid-air. Gravity must
   always still be able to swing you down.

Both presented the same way from the outside: a run that was alive but going nowhere. The soak
test now asserts the real invariant — **if a run is still breathing, it's because it's thriving,
not because it's stuck.**
