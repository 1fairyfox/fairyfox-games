# Standard: Farm Operating Model

A **farm** is a mesh project that is a *growing collection* tended on a schedule — new items planted
periodically, existing items grown a little every day — rather than a single fixed release. Fairy
Fox Games and Fairy Fox Stories are the two farms; they share this operating model even though the
craft differs (games vs. fiction). This standard captures what a farm owes so a third farm inherits
the shape instead of reinventing it.

> Canonical, project-agnostic standard for the **integrated farm tier** (see
> [`../../_data/projects.yml`](../../_data/projects.yml) `integrated: true`; the farms render as
> pages of fairyfox.io under the **Farms** nav slot — [`docs-site/`](docs-site/)).

## The rules

1. **Grow daily; plant periodically.** The daily job **tends the collection** — it deepens at least
   one existing item a little each run, not only adds new ones. New items are *planted* on a slower
   cadence (a game most days; a book at most every few days). Growth, not just breadth.
2. **Items are first-class citizens, not throwaway demos.** Every item earns ongoing investment —
   maintenance, docs, tests, and real growth. None are dumped-and-forgotten.
3. **Every item carries real content / craft.** A game ships genuinely helpful content (a clear
   how-to, strategy, meaningful feedback); a book ships real craft (a living character, earned
   ending). No filler, no near-identical padding. **If it isn't good, it doesn't ship.**
4. **New items are genuinely distinct — never a re-skin.** Each new item is a mechanically or
   creatively *distinct* experiment. Check the existing set and the pitched ideas before building.
5. **Simple-but-deep is the hard constraint.** Growth must **never** make an item convoluted,
   cluttered, disorganized, or unstable. The UI/UX stays clean and polished — the bar is how it
   looks today. Depth lives in the mechanic or the story, not in clutter. If an addition risks the
   polish, it doesn't ship.
6. **Plan-first.** An item begins from a plan appropriate to its craft (a game concept; a book's
   full public **blueprint** — premise, form, arc, chapter plan — before a word of prose). Pantsing
   is the classic failure. (Aligns with [`planning.md`](planning.md).)
7. **Items are self-contained by default.** One folder per item (`games/<slug>/`, `stories/<slug>/`)
   with relative paths and no cross-item reaching — easy to reason about, move, or lift. A default,
   loosened only where shared code or a build step is worth more.
8. **The item is the focus, not the taxonomy.** The shelf presents individual items like a library;
   groupings (a universe, a category) are quiet context on an item, not bins the collection is filed
   into.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| The daily cadence **grows existing items**, not only adds new ones | session logs / changelog show deepening work, not just additions |
| Items carry **real content/craft**, no filler | open a few items; is there genuine value/craft |
| New items are **distinct**, not re-skins | compare recent additions against the existing set |
| Growth kept it **simple + polished** (nothing convoluted/unstable shipped) | use a recently-grown item; check the polish held |
| Items are **planned-first** and **self-contained** (one folder, relative paths) | look for the blueprint/concept + the folder shape |
