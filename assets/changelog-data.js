/*
 * Player-facing changelog for Fairy Fox Games — a single, plain data source (no build
 * step) that both the homepage "Recently updated" strip and the full changelog page read.
 *
 * Newest first. Each entry is written for a PLAYER, not a developer: what actually changed
 * about playing the game. The daily maintainer prepends one entry per run, so the list is
 * the visible record of the collection growing. Keep entries short and concrete.
 *
 *   date  — ISO day (YYYY-MM-DD), used for relative-date display + ordering
 *   game  — display name, or "The collection" / "The site" for cross-cutting changes
 *   slug  — games/<slug>/ folder for a "Play" link, or null for non-game entries
 *   kind  — "new" (a brand-new game) | "grow" (an existing game got deeper) | "site"
 *   text  — one or two sentences, player-facing
 *
 * ES module: the homepage strip and the changelog page `import { CHANGELOG }`.
 */
export const CHANGELOG = [
  {
    date: "2026-07-06", game: "Sluice", slug: "sluice", kind: "new",
    text: "A brand-new game: sort the falling sparks. Each coloured spark drops down the middle — send it into the channel that matches its colour before it lands. The twist: the channels keep rearranging, so you have to read the row, not memorise a key. Route early for a rising combo, wait to be safe when it scrambles, and don't let three slip past. It speeds up and adds channels through the stages, and every run is built from shifting patterns — Shuffle, Cascade, Rush, The Churn."
  },
  {
    date: "2026-07-06", game: "Ink Bloom", slug: "ink-bloom", kind: "grow",
    text: "No two blooms grow the same anymore: motes now arrive in shifting patterns — a sweeping Vine you chase across the field, a wide Ring you loop, a tight Thicket to thread your growing trail through, and a rare prism Spectrum greed-rush. The meaner patterns unlock as you climb the stages, so runs keep opening up the deeper you go."
  },
  {
    date: "2026-07-06", game: "The site", slug: null, kind: "site",
    text: "New reading menu: tap the “Aa” button in the header to switch theme (light, sepia, or dark), pick an accent colour, and set the text size — the site remembers your choice, and it carries across the whole of fairyfox.io. The pages now match the main site's look, seamlessly."
  },
  {
    date: "2026-07-05", game: "The farm", slug: null, kind: "site",
    text: "Fairy Fox Games is now an AI-managed game farm: new games are planted (a fresh one every few days) and the ones already here keep growing deeper, on their own, over time. Same games you love — a clearer promise."
  },
  {
    date: "2026-07-05", game: "Echo Chamber", slug: "echo-chamber", kind: "grow",
    text: "Every run is now a shifting sequence of target cadences — Even, Pulse, Near, Far, Climb, Scatter — and climbing the stages unlocks the trickier ones, so the rhythm of the catches keeps building and no two runs feel the same."
  },
  {
    date: "2026-07-05", game: "Polarity", slug: "polarity", kind: "grow",
    text: "Every run is now built from a shifting sequence of named formations — a rhythmic Staircase, a restful Hold, a relentless Zipper, tight Bursts, and The Wall — pulled from a seeded pool, so no two runs share the same shape. The tougher ones announce themselves as you enter them."
  },
  {
    date: "2026-07-05", game: "Arc", slug: "arc", kind: "new",
    text: "New game: Arc. Hold to build power, release to lob a shot at a fixed 45° — the whole skill is judging the distance and dialling the power to land on the pad. Nail the bright centre for a bullseye and keep the combo alive across three lives."
  },
  {
    date: "2026-07-05", game: "Loft", slug: "loft", kind: "grow",
    text: "Loft now nudges you when a run ends just short of your best — the honest “so close, one more” line."
  },
  {
    date: "2026-07-04", game: "Symmetry", slug: "symmetry", kind: "new",
    text: "New game: Symmetry. One control moves two catchers locked in a mirror; you often can't save both sides at once, so read ahead — and chase the gold twins for a bonus."
  },
  {
    date: "2026-07-03", game: "Poise", slug: "poise", kind: "new",
    text: "New game: Poise. Tilt a beam to balance a rolling ball and roll it over the glowing target without letting it slip off either end. It gets twitchier the longer you last."
  },
  {
    date: "2026-07-02", game: "The collection", slug: null, kind: "grow",
    text: "Every game gained a run arc: named stages you climb, an ambient colour that shifts as you go, and lifetime badges that stick across runs — so no run is wasted and the collection keeps opening up the more you play."
  },
  {
    date: "2026-07-02", game: "Ink Bloom", slug: "ink-bloom", kind: "grow",
    text: "Prism motes are now a real greed call — triple points, but they grow your trail three times as fast, so every one you eat costs you room."
  },
  {
    date: "2026-07-02", game: "Polarity", slug: "polarity", kind: "grow",
    text: "The multiplier rework: land a needed flip at the last instant to grow a ×2…×9 combo; flip early to play safe and it resets to ×1. Ride the edge for a huge score, or take the steady trickle."
  },
  {
    date: "2026-07-02", game: "The site", slug: null, kind: "site",
    text: "The collection now sorts by most-recently-updated, with each card showing when it last changed — an at-a-glance sense of what's fresh."
  },
  {
    date: "2026-07-01", game: "Loft", slug: "loft", kind: "new",
    text: "New game: Loft. Keep the glowing orbs aloft — tap a falling orb to bat it back up. You can only strike on the way down, and every few points another orb joins the air."
  }
];
