# Next Steps

Ordered, current. Remove as done; history lives in `../sessions/`.

1. **Keep growing each game a little deeper daily** — content + light, on-mechanic
   depth (a tip, a milestone, a meaningful stat/feedback), staying simple and clean.
   Never let a game become convoluted (the hard constraint).
2. **Keep inventing fresh, mechanically-distinct experiments.** Verbs used so far:
   steer (Ink Bloom), time-a-catch (Echo Chamber), thrust/physics (Orbit Slingshot),
   flip-match (Polarity), aim-and-bounce (Ricochet), precision-stack (Skyline). Reach
   for a genuinely new verb next — e.g. balance, route/connect, sort, grow-and-release.

## From the hub-standards adoption (v0.9.0) — optional follow-ups

3. **Confirm branch protection end-to-end.** `main` is now protected (solo config); the
   v0.9.0 release was the first PR-based one. Make sure the daily maintainer + system-update
   tasks release via `gh pr` (per updated `CLAUDE.md`), not a direct push.
4. **Turn on GitHub private vulnerability reporting** (Settings → Code security) so the
   `SECURITY.md` reporting path is live.
5. **Optional: add an OpenSSF Scorecard workflow** (`scorecard.yml`) if the badge should
   auto-refresh; the API computes on demand for now.
6. **Fonts are latin-only.** If any game ever needs extended Latin/other glyphs, add the
   `latin-ext` woff2 subset alongside (kept out for now to stay lean).
