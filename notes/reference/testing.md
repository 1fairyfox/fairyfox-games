# Standard: Testing & Verification

Every mesh project **proves** its work rather than merely making it *look* right. Tests are
real, layered, and run before shipping; a visual change is previewed with human eyes first.
This standard distils the practice the projects already share (games' pure-core split + real
tests, pse2's console/emulator oracle, Random AI Prompt's two-gate isomorphic verify).

> Canonical, project-agnostic standard. It says *what* verification a project owes, not which
> framework to use — pick the stack's native runner (`node --test`, QtTest/CTest, Vitest, …).

## The rules

1. **Split pure logic from rendering, so it can be tested headlessly.** The simulation / core
   logic lives in pure modules — plain data + pure functions, **no DOM, canvas, timers, or I/O** —
   and the shell does rendering, input, and the loop. This separation is **non-negotiable, even
   for trivial features**: it is what lets a thing be *proven* to work instead of *looking* like
   it works. (Games: `*.core.js` + `*.core.test.js`; a Qt app: model/logic classes tested by
   `tst_*`, QML on top.)
2. **Real, multi-layer tests — not token ones.** Cover the layers that can actually break:
   math/data, state transitions, boundaries, win/lose or success/failure paths, and
   integration where units meet. **One or two cheap asserts is not coverage.** A test suite that
   can't fail on a real regression isn't doing its job.
3. **A bug fix ships with its failing-case test** — the regression rule. Every fixed defect lands,
   **in the same change**, with a test that fails on the pre-fix behavior and passes on the fix, so
   it can never silently return. **Demonstrate** the fail-then-pass (revert the fix, watch it fail,
   restore) rather than assuming it. Put the test in the **right home**: logic/data bugs in the
   unit/regression suite; UI/layout/z-order bugs in the end-to-end lane, written **functionally**
   (e.g. hit-test with `elementFromPoint` for stacking) rather than as brittle pixel baselines. Give
   each a one-line symptom + date/version note so the guard is self-documenting. Skip only the truly
   trivial (a cosmetic tweak with no behavior to assert). This is the single highest-leverage test a
   project writes.
4. **Run the gate before shipping; only proceed on green.** The project's full suite runs (and
   passes) before a release. Where the code runs in **more than one runtime** (e.g. an isomorphic
   engine under Node *and* the browser), one gate isn't enough — verify **each** runtime (a green
   Node suite doesn't prove the browser bundle resolves).
5. **Use the truth oracle where one exists.** When the real system can grade the work
   byte-for-byte — a console/emulator, a reference implementation, a golden file — **test against
   it**, and commit the probe. A careful reading of the source has been wrong before; the oracle
   catches it (pse2's `tst_emu_parity` against the real cartridge is the exemplar).
6. **Preview visual changes with human eyes before shipping — a standing rule.** Never release a
   UI/visual change unseen. Serve it, render the changed pages, **hard-reload** to dodge stale
   assets, and self-critique the whole page (overflow, clipping, nav, responsiveness, light/dark).
   For an agent: capture it headless while working, then **show the image / open it** for review
   before the release. Automated tests don't see a broken layout — a person does.
7. **Tests are living, wired into the workflow.** The suite runs in CI on `dev`/`main` and locally
   before release (see [`git-workflow.md`](git-workflow.md) — feature branches aren't CI-tested, so
   the `dev` merge is the gate). Keep it green; a red or skipped suite is a stop-ship.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Core/logic is **separated from rendering** and unit-tested headlessly | look for pure modules + their tests; confirm no DOM/canvas in the tested core |
| Tests are **multi-layer and real** (not one-or-two token asserts) | read the tests; do they cover state/boundaries/paths, not just construction |
| **Every recent bug fix** carries a regression test | spot-check fixed-bug commits for an accompanying failing-case test |
| The **full suite runs green before release**, each runtime covered | CI config + a recent green run; multi-runtime projects verify each |
| A **truth oracle** is used where one exists (console/reference/golden) | look for the parity/probe tests |
| **Visual changes are previewed** before shipping | the workflow/CLAUDE.md names it; evidence in session logs/PRs |
