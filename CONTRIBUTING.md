# Contributing to Fairy Fox Games

Thanks for being here — contributions are genuinely welcome, whether that's a bug
report, a new-game idea, a tweak to an existing game, or a whole new game. This is an
open, friendly project. You don't need permission to start.

## Ways to help

- **Report a bug** — use the [bug report](.github/ISSUE_TEMPLATE/bug_report.md) issue
  template. A title, what you did, and what went wrong is plenty.
- **Suggest a game** — use the [new game idea](.github/ISSUE_TEMPLATE/new-game-idea.md)
  template. One mechanic, one screen, one "beat your own score" hook is the sweet spot.
- **Improve an existing game** — tuning, feel, accessibility, a clearer comment. Small
  PRs are great.
- **Add a new game** — see below.

## The quality bar (it's the same for everyone, including simple games)

However small the game, it ships to the same standard as the rest of the mesh:

1. **Separate logic from rendering.** The simulation lives in a pure `*.core.js`
   module — plain data and pure functions, **no DOM, no canvas, no timers**. The
   `index.html` shell does rendering, input, and the loop, and nothing else of
   substance.
2. **Document it.** JSDoc on the core's exported functions and types. A short
   per-game `README.md` describing the mechanic and controls.
3. **Test it for real.** A `*.core.test.js` with **multi-layer** coverage — not one or
   two token tests. Cover the math, the state transitions, the win/lose conditions,
   and a regression test for any bug you fix. Tests use Node's built-in runner (`node
   --test`), zero dependencies.
4. **Keep it self-contained.** A game is one folder under `games/` that could be lifted
   out on its own. Use relative paths; don't reach across games.

If a change fixes a bug, add the failing-case test in the same PR.

## Adding a new game

```
games/<your-game>/
├── index.html              # player shell (canvas + input + loop)
├── <your-game>.core.js     # pure logic, JSDoc'd, no DOM
├── <your-game>.core.test.js
├── package.json            # { "type": "module" }  (so .js is ESM)
└── README.md               # mechanic, controls, how to test
```

The quickest start is to copy [`games/ink-bloom/`](games/ink-bloom/) and replace the
mechanic — it's the reference implementation for this structure.

## Local dev

```sh
# play it (ES modules need HTTP, not file://)
python -m http.server 8000        # then open http://localhost:8000/games/<your-game>/

# test it
npm test                          # all games, from the repo root
cd games/<your-game> && node --test   # just yours
```

## Pull requests

- Branch from `dev`; PRs target `dev`. (Releases flow `dev → main`, tagged.)
- Keep PRs focused. Describe what you changed and how you tested it.
- CI must be green (it runs `node --test` across all games).
- Be kind in reviews and issues. We're here to make small fun things well.

## Code of conduct

Be respectful and welcoming. Harassment or unkindness isn't welcome here; good-faith
questions and rough first drafts very much are.
