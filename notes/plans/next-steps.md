# Next Steps

Ordered, current. Remove as done; history lives in `../sessions/`.

> ## 🌿 Depth-layer rollout — 9 of 13 (as of v0.25.2, 2026-07-22)
>
> The lead GROW lever (`../reference/depth-inside-the-mechanic.md`). Carried by: Polarity
> (reference), Brim, Echo Chamber, Ink Bloom, Orbit Slingshot, Ricochet, Skyline, Loft and
> now **Poise**; Tether, Reprise, Ward and Drove ship with it from birth.
>
> **Still to convert, oldest first:** **Symmetry** (born 07-04) → **Arc** (07-05) →
> **Sluice** (07-06). None of the three carries *any* of the four items yet, so each is a
> full pass (no-plateau asymptote + hidden tech + the reversal it unlocks + a secret stage)
> rather than the partial top-up Poise and Loft needed. Sketches:
> - **Symmetry** — the one control is the *spread*, and twins already reward a single
>   symmetric read; the tech probably lives in catching a twin with both catchers dead
>   under their orbs (a mirrored precision window), not in a new input.
> - **Arc** — the charge is analogue and the bullseye is drawn; a razor sub-window inside
>   the bullseye is the obvious tech, but check it isn't just Ricochet's Dead Centre with
>   new paint (the depth doc's "genuinely distinct" bar applies to techs too).
> - **Sluice** — a snap combo already exists, so its tech has to be *inside* the snap
>   (routing before the channel has finished rearranging?) rather than a second combo.
>
> ## 🐞 Collection-wide CSS bug found in preview (v0.25.2) — the game-over headline
>
> Every game's shell has `.title { … -webkit-background-clip:text; background-clip:text; }`
> and then `#gameover .title { background:linear-gradient(…) }` / `.title.record { background:… }`.
> **The `background` shorthand resets `background-clip` to `border-box`**, so on the game-over
> screen the headline renders as a **solid gradient bar with invisible text** — the words
> "Off the beam" / "New best balance" are simply not there. Confirmed by screenshot in Poise,
> and fixed there (both rules now restate the clip). **All 16 games have the same two rules**
> (`Select-String -Path games\*\index.html -Pattern '\.title\.record\s*\{[^}]*background:linear'`),
> so the rest of the collection is still showing it.
>
> Left for a housekeeping run rather than folded in here, because the standing rule is to
> **eyeball every visual change before shipping** — that's 15 more game-over screens to
> preview, which is a run of its own. The fix per game is two lines; the preview is the work.
>
> **Open maintenance (deliberately not folded into a game run):** two Dependabot PRs are
> **major** GitHub Actions bumps — **#46** `actions/setup-node` 6.4.0 → **7.0.0** and **#31**
> `actions/attest-build-provenance` 2.4.0 → **4.1.1**. The provenance action is part of the
> release supply chain, so a bad bump breaks releases, not just CI. Take them together on a
> housekeeping run: read both changelogs for breaking changes, merge into `dev`, and prove a
> full release cycle before trusting them.

> ## ✅ RESOLVED 2026-07-10 — Arc v0.19.5 released; icon shipped as v0.19.6
>
> The deferred 07-09 Arc → varied-structure WIP was **finished and released this run** (PowerShell/`gh`
> were available): probe files deleted, full suite **384/384 green**, Arc headless-previewed in Chromium,
> `dev → main` PR #32 → tag `v0.19.5` → back-merged. Then shipped **v0.19.6** — the collection's own
> icon (favicon + social-share card + landing masthead; header brand fox left unchanged per the owner).
> **7 of 11 games on varied structure.**
>
> **Still open / next:**
> - **Remaining varied-structure conversions** (lowest-coverage-first): **Ricochet, Skyline, Poise** —
>   and **Loft**, but **Loft is a poor fit** for the spawn-cadence model (only ~5 orbs/run, on score
>   thresholds); reshape its unit (named *entry* patterns per new orb) or pick another game — don't
>   force a queue that never drains.
> - **Deferred maintenance:** triage open issues/PRs — `gh issue list` / `gh pr list` on a tooled run.

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
