# Ricochet

A one-mechanic bank-shot game. A launcher sits at the bottom of the field with a few
glowing **targets** floating above it. **Aim, then fire a single shot** — it flies in
a straight line and *bounces off the walls*, sweeping up every target its path passes
through. Bank one shot through several targets for a big **chain**. A shot that
collects **nothing** costs a life; three misses end the run. As your score climbs the
targets **shrink**, so the easy straight-line shots dry up and reading the ricochet
becomes the whole game. Beat your own score.

**Controls:** move the mouse (or finger) to aim — a dashed guide shows the first leg
of the shot. Click, tap, or press **Space** to fire. Your best score is saved locally
in `localStorage`.

**Tip:** aim *off the walls*, not just straight at the nearest target. Two targets
roughly in a line — directly or via one bounce — are a free double; chasing single
targets burns shots you'll want once the orbs shrink.

## How it's built

Like every Fairy Fox game, the simulation is a **pure logic core** with no DOM,
canvas, or timers:

- [`ricochet.core.js`](ricochet.core.js) — the whole game as plain data + pure
  functions, JSDoc'd, with an injectable seeded RNG so target placement is
  reproducible. The centrepiece is **`computeShot`**: given the aim, it traces the
  full bounce polyline and returns which targets the path collects, in order — the
  tricky geometry lives here, proven by tests rather than eyeballed on screen.
- [`ricochet.shell.js`](ricochet.shell.js) — the browser player: canvas, aiming
  input, the fixed-timestep loop, the flying-shot animation, particle/flash
  eye-candy, and the best score in `localStorage`. Loaded as an external module;
  `index.html` carries a boot-failure fallback so a load error is never a silently
  dead screen.
- [`ricochet.core.test.js`](ricochet.core.test.js) — the test suite.

The shell traces the aim with `computeShot` to draw the guide, animates a dot along
the returned polyline (popping targets as it reaches them), and then **commits the
shot with the core's `fire()`** — which recomputes the identical, deterministic
result and mutates score/lives/field. What you watch and what the core records can
never disagree.

## Play locally

ES modules need HTTP, not `file://`:

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/ricochet/
```

## Test

```sh
cd games/ricochet && node --test     # zero dependencies, Node 18+
```

Covers the math helpers and score-driven target shrink, aim clamping (a shot always
leaves the launcher going up, preserving the horizontal sense), reset/field
invariants, deterministic in-bounds spawning, the **`computeShot` regression guard**
(every vertex of every shot stays inside the box — straight-up, steep, and
corner-seeking aims — with a fixed bounce count), collection order along the path,
and `fire()` (chain scoring + refill, a zero-collect shot costing a life, death at
zero, dead-state inertness, and a deterministic scripted run).

### Design note: reflection that never escapes the box

A naive bounce loop can let the projectile tunnel a hair past a wall on a grazing or
corner hit and then fly off to infinity — a hang or a blank path. `computeShot`
clamps every bounce vertex back inside the field, and the suite pins that *every*
vertex of *every* shot stays within the walls.

## Tuning

All feel constants live in `CONFIG` at the top of `ricochet.core.js` — launcher
offset, bounce count, how many targets are on the field, target size and how fast it
shrinks with score, lives, spawn spacing, and the minimum upward aim. They're
injectable per game instance, which is also how the tests stay deterministic (e.g. a
no-bounce game makes a "guaranteed miss" provable).
