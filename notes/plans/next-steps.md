# Next Steps

Ordered, current. Remove as done; history lives in `../sessions/`.

> **Hard lesson from v0.10.1 (Polarity playtest): meta-progression can't rescue a dull
> core.** Stages/badges are a scoreboard *around* the loop; if the second-to-second
> decision isn't tense, the game is still boring. So Wave 1 for each game now leads with a
> **core-fun pass** — make the moment-to-moment choice have teeth (risk/reward, variety,
> density, real reads) — *before* wrapping it in stages/meta. Polarity's precision-combo
> (late-flip multiplier) is the worked example.

1. **Roll out Growth Architecture Wave 1 to all 7 games** — the current focus. Promote
   each game's milestones → **stages** (pure core + tests), add the **meta save blob**
   (`<slug>.meta`, backward-compatible with legacy `<slug>.best`), a **stage HUD chip**,
   and a **stage-change juice beat**. Pattern: `../reference/growth-architecture.md`;
   per-game specifics + sequencing: `growth-roadmap.md`. **Polarity is the reference
   build** — replicate its shape to the other six. Lowest-wave game first.
2. **Then Wave 2 (achievements + cosmetic unlocks + run-report card) and Wave 3 (a
   skill-safe mode each)** per the roadmap — one game per few daily runs, so the whole
   collection visibly grows together over months.
3. **Keep growing each game a little deeper daily** — but now *along the roadmap*, not
   as random polish: a new stage name, an achievement, a cosmetic, a near-miss stat.
   Always through the simple-but-deep checklist. Never convoluted (the hard constraint).
4. **Keep inventing fresh, mechanically-distinct experiments.** Verbs used so far:
   steer (Ink Bloom), time-a-catch (Echo Chamber), thrust/physics (Orbit Slingshot),
   flip-match (Polarity), aim-and-bounce (Ricochet), precision-stack (Skyline),
   keep-aloft/rhythm (Loft), balance (Poise), mirror-coordination (Symmetry), judge-power
   / charge-and-release (Arc). Reach for a genuinely new verb next — e.g. route/connect,
   sort, grow-and-release, swing/grapple.

5. **Eyeball Arc in a real browser** (Chrome preview MCP was down on its ship run
   2026-07-05, so it shipped on a headless shell smoke test instead of a live preview).
   Confirm the charge gauge, arc flight, pad/bullseye, and lives pips read cleanly and
   nothing overflows/clips; note any polish for a follow-up PATCH.

## From the hub-standards adoption (v0.9.0/0.9.1) — optional follow-ups

3. **Confirm branch protection end-to-end.** `main` is protected (solo config); releases are
   PR-based. Make sure the daily maintainer + system-update tasks release via `gh pr` (per
   updated `CLAUDE.md`), not a direct push.
4. **Optional: add an OpenSSF Scorecard workflow** (`scorecard.yml`) if the badge should
   auto-refresh; the API computes on demand for now. (Signed-Releases and Security-Policy
   checks are already satisfied by `release.yml` + private vuln reporting + `SECURITY.md`.)
5. **Fonts are latin-only.** If any game ever needs extended Latin/other glyphs, add the
   `latin-ext` woff2 subset alongside (kept out for now to stay lean).

_Done in v0.9.1: private vulnerability reporting enabled; signed-release workflow added;
subproject `.subnav` added; legal pages scoped to the project._
