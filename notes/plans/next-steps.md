# Next Steps

Ordered, current. Remove as done; history lives in `../sessions/`.

1. **Finish landing-page + README registration for `ricochet`** (deferred this run —
   see the concurrency blocker below). The new **Ricochet** game is built, green
   (20/20), and committed to `dev`, but it is NOT yet listed in the root
   `index.html` collection grid / footer, the root `README.md` "The games" table, or
   the masthead "Games" count — because those shared files were being edited by a
   concurrent run when this run finished. Once the tree is uncontended: add the
   Ricochet card (tags **Aim**, **Geometry**), bump the masthead count, add the
   README row, then **release** (a MINOR — new game — via a `release/X.Y.0` branch)
   and **bump `VERSION`** (0.4.2 → 0.5.0).
2. **Reconcile the concurrent run's in-flight work.** When this run ended, the working
   tree had uncommitted changes from another daily-maintainer instance: ink-bloom
   "prism motes", echo-chamber milestones+combo (its `*.core.test.js` was RED — "a
   dead-on catch is perfect…"), and a root-`index.html` masthead restructure, plus an
   `update-check` report. A later run must verify those land green (fix the failing
   echo-chamber test) before any `dev → main` release.
