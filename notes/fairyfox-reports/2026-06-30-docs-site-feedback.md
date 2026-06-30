# Process report — docs-site standard feedback (2026-06-30)

**Procedure:** node-side experience feeding back to the hub (`process-reports`
standard). Surfaced while matching the fairyfox-games landing page to the
fairyfox.io homepage chrome. **These are requests for the *system* to adopt across
all projects — not one-off fixes for this node.**

## Feedback for `hub/standards/docs-site/`

1. **Way-home should not be duplicated.** When a project's header copies the hub
   chrome, the **brand/Home link already is the way home** to `fairyfox.io/`. Adding
   a separate "← Back to Fairy Fox" control on top of that is redundant and looks
   heavier/less transparent. Recommendation: the standard should say the persistent
   way-home is satisfied by the brand (and/or a Home nav item) linking to the hub;
   a dedicated back-button is optional and discouraged when Home is present. (Owner
   asked for this to apply to **all** projects — it's the system's call.)

2. **Tags want a real, system-wide model.** The hub renders tags as plain
   `<span class="tag">` chips (display only) — no tag pages, no filtering, nothing
   clickable. Projects want **standardized, clickable/searchable tags** (filter the
   collection, browse by tag across the mesh). This should be defined once at the
   hub (a shared tag vocabulary + an optional `/tags/` or client-side filter
   pattern) so every project does it the same way, rather than each node inventing a
   bespoke filter. fairyfox-games currently uses standardized individual `.tag`
   chips matching the hub and deliberately did **not** add a bespoke filter, pending
   the system pattern.

3. **"Games" nav slot.** The hub added a **Games** item to its primary nav, placed
   **right of Projects**. fairyfox-games mirrors that order (Home · Projects · Games
   · Docs · Downloads · Updates · About; About last). Worth codifying the slot/order
   so site-integrated nodes stay consistent.

## What was rough / suggestions

- Several of these only became visible by copying the homepage 1:1; the docs-site
  standard could ship a small reference header/footer snippet (the exact markup) so
  nodes match without reverse-engineering `_includes/`.
- A shared tag vocabulary in the hub registry (per-project `tags:` already exist)
  would let a future system-wide tag filter "just work" for every node.
