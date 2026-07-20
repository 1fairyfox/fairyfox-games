# Standard: Coins (reading-engagement points)

**Coins** are a light, shared engagement layer across the Fairy Fox mesh: reading a page
you haven't opened **today** — anywhere same-origin under `fairyfox.io` — earns a coin. The
counter lives in the shared chrome (a small button beside the reader "Aa" button) and the
balance is shared, via one origin-wide key, across every same-origin fairyfox.io site in the
same browser. Coins exist to make reading and exploring the mesh **quietly rewarding**.

> Canonical, project-agnostic standard. The behaviour ships as the master
> [`assets/js/coins.js`](docs-site/chrome/README.md) in the shared-chrome bundle; a project
> gets it by adopting the chrome (it is one of the pulled master files, loaded after
> `reader.js`). This standard governs **what coins are, how they're earned, and — most
> importantly — how a project may use them.**

## The prime directive: subtle, never central

Coins are a garnish, not the meal. **They must never be overused.** A project may add its own
coin moments, but only where they genuinely fit, and always as a *small extra* feeling — never
the point of the experience, never a gate, never something a user must farm.

- **Never gate.** Coins must not unlock, restrict, or grant exclusive access to anything. The
  core experience is always fully available to someone with zero coins. If a feature is off
  without coins, that is a violation of this standard.
- **Extra reward, not the reward.** Use coins to *add* a touch of delight on top of something
  already satisfying — never as the thing the user is working toward.
- **Restraint by default.** If you are unsure whether a spot warrants a coin, it doesn't.
  Sprinkle, don't shower. A project that grants coins constantly cheapens them mesh-wide.
- **Never at the brand's expense.** A coin flourish must not clutter the UI, distract from the
  project's own content, or degrade the brand/chrome quality (see
  [`docs-site/06-content-and-organization.md`](docs-site/06-content-and-organization.md)). If a
  coin moment makes the page worse, remove it.

## Earning model (fixed — do not reimplement)

Earning is owned by the shared `coins.js`; a project does **not** re-implement or alter it.

- **First view of a page today:** **+1**, with a **10%** chance of **+2** instead.
- **Repeat view of a page already seen today:** a **1%** chance of a **+1** bonus, capped at
  **10** such bonuses per day.
- **Reading pages** (`data-read` / `data-story`) show an estimated **read time** and add two
  reader-earned sources: a **read-through bonus** (+1) for genuinely reading a page longer than
  ~2 minutes to the end (reached the end + a fair dwell; once per page/day), and a rare **hidden
  coin** — a word marked *very* subtly, a **<2%** roll made **once per page (ever, not per day)**,
  with claims capped at **3 per day**.
- At most one automatic grant per page load (the hidden coin is claimed by the reader, not
  automatic). "Today" is the local calendar day; the day's counters (seen, read-through, bonus,
  hidden-claims) reset at midnight and the balance carries over — but the **hidden-coin roll set is
  persistent** (a page is only ever rolled once).
- State is stored under the versioned origin-wide key **`fairyfox:coins:a`** — a spendable
  `coins` balance, a lifetime `earned`, the day's `seen` set, the day's `bonus` count, and
  `todayEarned`. It lives only in the browser and is never sent to a server (disclose it in the
  project's legal pages — see [`legal-docs.md`](legal-docs.md)).

## Durability — strive to persist

**Strive to keep a user's coins (and reader settings) across site updates** — a site update, an
internal data-structure change, or a sub-project taking over the shared state should carry them
forward, not drop them. Balances and preferences are the user's; treat them as durable and take
deliberate care not to *cause* loss through carelessness. (This is an engineering discipline, not a
user-facing guarantee — user copy says "we strive to keep them", never "never lost".)

- **Evolve the shape in place.** Read the stored value and merge it against defaults (as
  `coins.js` does — unknown/missing fields are tolerated, integers are sanitised), so ordinary
  schema growth needs no new key and drops nothing.
- **If a key version ever must change, migrate — never abandon.** Bumping `fairyfox:coins:a`
  (or `fairyfox:reader:b`) means reading the old key and writing the carried-over data into the
  new one, not starting from zero. An orphaned old key is data loss and is **not allowed**.
- **Sub-projects must not reset it.** A project adopting or wrapping the shared state inherits
  the same duty: read what's there, keep it, add to it. Never clear or overwrite the wallet or
  the reader prefs on load. The balance only ever changes by the earning rules or an explicit,
  user-initiated `spend`.
- **Fail safe.** If storage is unreadable/corrupt, fall back to defaults for *this session*
  without overwriting what's on disk unnecessarily; never wipe a user's balance to "recover".

## The project API — `window.FairyFoxCoins`

Read and (sparingly) adjust the balance through the global the chrome exposes:

| Call | Does |
|------|------|
| `get()` | current spendable balance |
| `earnedTotal()` | lifetime earned (never decreases) |
| `earnedToday()` | coins earned today |
| `onChange(fn)` | subscribe to balance changes; returns an unsubscribe fn |
| `spend(n, reason)` | deduct `n` **if** the balance covers it; returns `true`/`false` |
| `reward(n, reason)` | grant a small, engagement-tied bonus (use rarely) |

A `fairyfox:coins` DOM event fires on `document` for every change
(`detail: { balance, delta, reason }`) so a game or page can react.

### Using it well (grant / reduce where it makes sense)

Projects **may** add their own coin moments if they genuinely improve the experience. Good
uses are small, earned, and optional:

- **Grant** a coin or two for a real, one-time accomplishment — finishing a game level for the
  first time, completing a tutorial, reading a long guide to the end. Tie it to genuine
  engagement, not idle time or repetition.
- **Spend** on purely cosmetic extras a user opts into — a confetti burst, an alternate colour,
  a fun reroll — where *not* spending costs the user nothing real. Always handle `spend`
  returning `false` gracefully: the feature simply isn't taken, never blocked.
- **Games can make the easiest use of coins** — a small bonus for a personal best, an optional
  cosmetic shop — but the same restraint applies: the game is fully playable and enjoyable at
  zero coins.

Anti-patterns (do not do these): daily "log in for coins" grinds; coins required to continue;
paywall-shaped "spend to unlock"; nagging the user to earn; inflating grants so coins feel
worthless; any coin UI that competes with the project's own content for attention.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| The coin counter comes from the **shared chrome** (`coins.js` pulled from master), not a re-implementation | diff against master `assets/js/coins.js`; confirm it's loaded after `reader.js` |
| **Persistence — enforced.** Neither the hub nor any sub-project loses a user's coins or reader prefs through carelessness: the store is read-and-merged (not replaced) on load, a key-version change migrates the old data forward (doesn't orphan a key), and nothing clears the wallet except the user (their `spend`, the **Clear my data** button, or a browser reset) | read every place the project touches `fairyfox:coins:a` / `fairyfox:reader:b`; confirm no reset/overwrite-on-load and any migration carries data |
| The project **gates nothing** on coins — the full experience works at zero balance | use/read the project with an empty wallet |
| Any project-added coin moments are **subtle, optional, and engagement-tied** — no grinds, no nags, no paywall shapes | exercise the coin moments; read where `reward`/`spend` are called |
| Coin UI does **not** clutter or detract from the project's own brand/content | look at the pages that add coin moments |
| The local coins store is **disclosed** in the project's Privacy/Cookies pages | read the legal pages ([`legal-docs.md`](legal-docs.md)) |
