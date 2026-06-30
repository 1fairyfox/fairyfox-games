# Ink Bloom

Steer a steadily growing line of ink. Drink the glowing **motes** to score and grow.
Your own trail is solid — touch it (or a wall) and the run ends. The longer you
survive, the longer and fatter you get, so success steadily shrinks your own safe
space. Calm, then panic.

**Controls:** move the mouse (or drag a finger) to steer — the head turns toward the
pointer at a capped rate, so it flows in curves rather than snapping. Click or press
**Space** to restart. Your best score is saved locally in `localStorage`.

## How it's built

```
ink-bloom/
├── index.html            # player shell: canvas, input, fixed-timestep loop, eye-candy
├── ink-bloom.core.js     # pure simulation — no DOM/canvas/timers, fully JSDoc'd
├── ink-bloom.core.test.js
└── package.json          # { "type": "module" }
```

All the rules live in `ink-bloom.core.js` as plain data and pure functions
(`createGame`, `tick`, `steer`, `stepHead`, `hitWall`, `hitSelf`, `tryEat`, …). The
shell never decides game logic — it reads state and draws it, feeds input in, and
calls `tick()` on a fixed 60 Hz timestep.

### Design note: the trail ordering

The trail array is **oldest-first, newest-last**; after a step the head is the last
element. Self-collision checks every point *except* the newest `GAP` (the "neck"
right behind the head, which is always adjacent and not a real loop). An early version
seeded the starting trail with the newest point at index 0 — putting an old,
collidable point exactly on the head and killing the player on frame one. `reset()`
seeds the trail the correct way, and the test suite guards it
(`REGRESSION: a fresh run does not self-collide on frame one`).

## Test

```sh
node --test          # from this folder (Node 18+, zero dependencies)
```

The suite covers the math helpers, reset/trail invariants, steering (capped rate,
shortest-way, convergence), head stepping, walls, self-collision (including the
frame-one regression and a long circling run), motes (deterministic spawn, eating →
score/growth/respawn), and a full scripted run that eats then dies into a wall.

## Tuning

All feel constants live in `CONFIG` at the top of `ink-bloom.core.js` — speed, turn
rate, radius growth, the collision neck, mote size, growth per mote, hue rotation.
They're injectable per game instance, which is also how the tests stay deterministic.
