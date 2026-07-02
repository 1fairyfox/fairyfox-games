# Next Steps

Ordered, current. Remove as done; history lives in `../sessions/`.

1. **Keep growing each game a little deeper daily** — content + light, on-mechanic
   depth (a tip, a milestone, a meaningful stat/feedback), staying simple and clean.
   Never let a game become convoluted (the hard constraint).
2. **Keep inventing fresh, mechanically-distinct experiments.** Verbs used so far:
   steer (Ink Bloom), time-a-catch (Echo Chamber), thrust/physics (Orbit Slingshot),
   flip-match (Polarity), aim-and-bounce (Ricochet), precision-stack (Skyline). Reach
   for a genuinely new verb next — e.g. balance, route/connect, sort, grow-and-release.

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
