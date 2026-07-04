# Fairy Fox Games

<!-- Project / community -->
[![Contributors](https://img.shields.io/github/contributors/junebug12851/fairyfox-games?style=flat-square&logo=github)](https://github.com/junebug12851/fairyfox-games/graphs/contributors)
[![Stars](https://img.shields.io/github/stars/junebug12851/fairyfox-games?style=flat-square&logo=github)](https://github.com/junebug12851/fairyfox-games/stargazers)
[![Forks](https://img.shields.io/github/forks/junebug12851/fairyfox-games?style=flat-square&logo=github)](https://github.com/junebug12851/fairyfox-games/network/members)

<!-- Activity / release -->
[![Last commit](https://img.shields.io/github/last-commit/junebug12851/fairyfox-games?style=flat-square)](https://github.com/junebug12851/fairyfox-games/commits)
[![Version](https://img.shields.io/github/v/tag/junebug12851/fairyfox-games?style=flat-square&label=version)](https://github.com/junebug12851/fairyfox-games/releases)

<!-- Build / quality -->
[![CI](https://img.shields.io/github/actions/workflow/status/junebug12851/fairyfox-games/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/junebug12851/fairyfox-games/actions/workflows/ci.yml)

<!-- Security -->
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/junebug12851/fairyfox-games?style=flat-square&label=scorecard)](https://securityscorecards.dev/viewer/?uri=github.com/junebug12851/fairyfox-games)

<!-- Docs / deploy -->
[![Docs](https://img.shields.io/badge/docs-fairyfox.io-4c9?style=flat-square&logo=readthedocs&logoColor=white)](https://fairyfox.io/fairyfox-games/)

<!-- Issues / PRs / license -->
[![Open issues](https://img.shields.io/github/issues/junebug12851/fairyfox-games?style=flat-square)](https://github.com/junebug12851/fairyfox-games/issues)
[![Open PRs](https://img.shields.io/github/issues-pr/junebug12851/fairyfox-games?style=flat-square)](https://github.com/junebug12851/fairyfox-games/pulls)
[![License](https://img.shields.io/github/license/junebug12851/fairyfox-games?style=flat-square)](LICENSE)

An experiment with an ever-growing, ever-expanding library of small, simple games —
the kind you can start in a second and lose a few happy minutes to. New ones are added
all the time, and the collection keeps widening as it goes.

Some are tiny, some are clever; all of them are here to be played and enjoyed.

**▶ Play them:** <https://fairyfox.io/fairyfox-games/> — each game at
`https://fairyfox.io/fairyfox-games/<game>/`.

Part of the [Fairy Fox](https://fairyfox.io) project mesh, with the door open:
**contributions are welcome** — see [CONTRIBUTING.md](CONTRIBUTING.md). File an issue,
suggest a game, fix a bug, or send a whole new one.

## What's here

Each game lives in its own self-contained folder under [`games/`](games/) — its own
little world, with everything it needs and nothing reaching across to another game.
Open a game's folder and you'll find the game itself plus a short README on how it
works.

```
fairyfox-games/
├── games/
│   └── ink-bloom/          # one folder per game (self-contained)
│       ├── index.html      #   the game — open it and play
│       ├── ink-bloom.core.js
│       ├── ink-bloom.core.test.js
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
| **Echo Chamber** | Catch the expanding echo as it crosses the target band; the window keeps tightening. | [`games/echo-chamber/`](games/echo-chamber/) |
| **Orbit Slingshot** | Hold to thrust your probe around a planet's gravity; sweep the targets, don't crash or escape. | [`games/orbit-slingshot/`](games/orbit-slingshot/) |
| **Polarity** | Flip your charge to match each incoming gate; clash and you're destroyed. It speeds up. | [`games/polarity/`](games/polarity/) |
| **Ricochet** | Aim and fire one shot that ricochets off the walls, sweeping up every target in its path. | [`games/ricochet/`](games/ricochet/) |
| **Skyline** | Drop a sliding slab onto your tower — the overhang is sliced off, so only precision keeps it climbing. | [`games/skyline/`](games/skyline/) |
| **Loft** | Keep the glowing orbs aloft — tap a falling orb to bat it up; you can only strike on the way down, and more orbs keep joining. | [`games/loft/`](games/loft/) |
| **Poise** | Tilt a beam to balance a rolling ball; roll it over the target to score without letting it slip off either end. It grows twitchier as you go. | [`games/poise/`](games/poise/) |
| **Symmetry** | One control, two mirrored catchers — spread them around the centre to catch orbs on both sides. You can't always save both, so read ahead and chase the twin pairs. | [`games/symmetry/`](games/symmetry/) |

_(A new one joins most days.)_

## Contributing

Yes please — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to add a game and the
few things it asks of one. Open an issue first if you want to talk it through, or just
send a PR. Bug reports and "I'd love a game that does X" ideas are equally welcome via
the [issue templates](.github/ISSUE_TEMPLATE/).

## License

[MIT](LICENSE) © Fairy Fox. Play, fork, learn from, and build on these freely.
