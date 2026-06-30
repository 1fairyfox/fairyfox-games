# Fairy Fox Games

A collection of small, self-contained **canvas games** — the one-mechanic,
*beat-your-own-score* kind. The aim is a fresh, polished little experiment most
days: easy to pick up, hard to put down, and honest about quality even when the
idea is simple.

**▶ Play them:** <https://fairyfox.io/fun/> (embedded player) — or directly at
`https://fairyfox.io/fairyfox-games/<game>/`.

This is part of the [Fairy Fox](https://fairyfox.io) project mesh. It is **not** a
silent side project: it has tests, docs, and an open door. **Contributions are
welcome** — see [CONTRIBUTING.md](CONTRIBUTING.md). File an issue, suggest a game,
fix a bug, or submit a whole new one.

## What's here

Each game is a self-contained folder under [`games/`](games/). Every game is built
the same disciplined way, however simple it is:

- **A pure logic core** (`*.core.js`) — the whole simulation as plain data and pure
  functions, with **no DOM, canvas, or timers**. Fully documented with JSDoc.
- **A test suite** (`*.core.test.js`) — real, multi-layer unit tests run with Node's
  built-in test runner. No dependencies.
- **A player shell** (`index.html`) — canvas rendering, input, and the game loop,
  wired onto the tested core. Persists your best score in `localStorage`.

Splitting logic from rendering is what makes the games testable headlessly and keeps
"it looks great but doesn't work" from happening — the core is provable, the shell is
thin.

```
fairyfox-games/
├── games/
│   └── ink-bloom/          # one folder per game (self-contained, liftable)
│       ├── index.html      #   player shell (canvas, input, loop)
│       ├── ink-bloom.core.js       # pure logic — no DOM
│       ├── ink-bloom.core.test.js  # node --test
│       └── README.md       #   how this game works
├── index.html              # landing page listing the games
├── notes/                  # living project notes (status, sessions, decisions)
└── .github/                # CI, Pages deploy, issue + PR templates
```

## Run a game locally

The games are static — no build step. Serve the folder over HTTP (ES modules need a
server, not `file://`):

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/ink-bloom/
```

## Run the tests

Zero dependencies — just Node 18+ (built-in test runner):

```sh
npm test            # from the repo root: runs every game's *.test.js
# or per game:
cd games/ink-bloom && node --test
```

CI runs the full suite on every push and pull request.

## The games

| Game | What you do | Folder |
|------|-------------|--------|
| **Ink Bloom** | Steer a growing line, eat motes, don't cross your own trail. | [`games/ink-bloom/`](games/ink-bloom/) |

_(A new one joins most days.)_

## Contributing

Yes please — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. The short version: a new game
is a new folder under `games/` with a documented `*.core.js`, a real `*.core.test.js`,
and an `index.html` shell. Open an issue first if you want to talk it through, or just
send a PR. Bug reports and "I'd love a game that does X" ideas are equally welcome via
the [issue templates](.github/ISSUE_TEMPLATE/).

## License

[MIT](LICENSE) © Fairy Fox. Play, fork, learn from, and build on these freely.
