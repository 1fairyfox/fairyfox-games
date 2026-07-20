# Standard: Engineering Quality

The mesh's standing quality bar. Every project — a save editor, a prompt engine, a games farm, a
story farm — holds to the same floor: clean, correct, finished work, documented and tested, with
no rough-in left for "later". This is the value the projects state in their own words ("no hacks,
no temporary fixes"; "do the long work"; "best craftsmanship, always"); this standard makes it
shared and checkable.

> Canonical, project-agnostic standard. Its companion is [`testing.md`](testing.md) (proof) — this
> one is about the *bar* the code and the work are held to.

## The rules

1. **No hacks, no temporary fixes, no bad fallbacks.** Prefer the correct, clean solution even
   when it's the longer route. If the only path you can see is hacky, **surface it and ask** rather
   than commit it. A silent workaround is worse than a stated blocker.
2. **Do the long work — no rough-in, no "clean it up later".** Big features are built as **phases,
   one finished body of work at a time** — designed, built, reviewed, tested, documented — before
   the next begins. **A phase that is 90% done is not done.** When work is deep, plan it across
   *more* phases, not fewer, and put the hours into each. Comprehensive-and-right outranks soon.
3. **Best craftsmanship, always — proportionate, never absent.** From the smallest utility to the
   largest system, the work is genuinely well made: clear structure, honest naming, care visible in
   the result. "It's only a small thing" is not licence to phone it in.
4. **Clean, modern, modular, focused code.** Small focused units, clear boundaries, no needless
   duplication, current idioms for the stack. Structure the code so the next person (or the next
   session) can reason about it.
5. **Full documentation + doc-comments.** Public surfaces carry doc-comments; the project's docs
   explain how it's built and used, kept current (see [`docs-lifecycle.md`](docs-lifecycle.md) and,
   for the docs *site*, [`docs-site/`](docs-site/)). Undocumented cleverness is a liability.
6. **Fearless refactoring, behind the test gate.** Improve structure whenever it pays — and when
   you do, **update the tests with it** ([`testing.md`](testing.md)); the green suite is what makes
   a refactor safe rather than a gamble. Don't leave known-worse structure standing out of fear.
7. **Fidelity to the source of truth.** Where the project stewards someone's data or a real format,
   change **only** what the task requires and leave the rest exactly as it was (pse2's byte-exact
   save fidelity is the sharpest case; the principle — don't rewrite/normalize/reorder what you
   weren't asked to — is general). Corrupting the user's data is among the worst outcomes.
8. **UX is not negotiable where there's a user.** No clunky, janky, or interrupting behaviour; the
   polished result is the bar, not a nice-to-have.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| No hacks/temp-fixes/bad-fallbacks shipped in place of the correct solution | read recent changes; look for TODO-hack markers, silent workarounds |
| Features land **finished**, not rough-in ("later" is not a plan) | spot-check recent features for done-ness (built+reviewed+tested+documented) |
| Code is clean/modern/modular/focused | read a sample of recent modules |
| Public surfaces carry **doc-comments**; docs are current | grep for doc-comments; open the docs |
| Refactors came **with test updates**, not test rot | look at refactor commits for accompanying test changes |
| The project's **source-of-truth fidelity** is respected (only-what-was-asked changed) | for data/format stewards, confirm no incidental rewrites |
