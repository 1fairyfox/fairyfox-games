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

An **AI-managed game farm** — a library of small, simple games, planted and tended by AI.
New games are sown regularly and the ones already growing keep getting deeper, so the
collection widens *and* deepens on its own over time. The kind of games you can start in a
second and lose a few happy minutes to.

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

<!-- GAMES:START — generated from _games/ by scripts/gen-readme.js; run `node scripts/gen-readme.js` after adding or editing a game. Do not hand-edit between the markers. -->

| Game | What you do | Folder |
|------|-------------|--------|
| **Arc** | Hold to build power, release to lob a shot at 45° — judge the distance and land it on the pad. Nail the bright centre for a bullseye and keep the combo alive. | [`games/arc/`](games/arc/) |
| **Orbit Slingshot** | Your probe orbits a planet. Hold to fire a prograde thrust and bend your path through the targets — without crashing or flying off into space. | [`games/orbit-slingshot/`](games/orbit-slingshot/) |
| **Symmetry** | One control, two catchers locked in a mirror — spread them around the centre to catch falling orbs on both sides. You can't always save both, so read ahead and chase the twins. | [`games/symmetry/`](games/symmetry/) |
| **Ink Bloom** | Steer a growing line, drink glowing motes to grow, and don't cross your own trail. The longer you live, the less room you leave yourself. | [`games/ink-bloom/`](games/ink-bloom/) |
| **Sluice** | Coloured sparks fall one at a time — send each into the channel that matches its colour before it lands. The channels keep rearranging, so read the row and route early for a combo. | [`games/sluice/`](games/sluice/) |
| **Echo Chamber** | An echo ring expands from the centre — catch it the instant it crosses the target band. Every hit tightens the window. Three lives. | [`games/echo-chamber/`](games/echo-chamber/) |
| **Polarity** | Charged gates rush in — flip your charge, cyan or magenta, to match each one and phase through. Clash and it's over. The stream keeps speeding up. | [`games/polarity/`](games/polarity/) |
| **Poise** | Tilt the beam to balance a rolling ball — roll it over the glowing target to score, without letting it slip off either end. It grows twitchier the longer you last. | [`games/poise/`](games/poise/) |
| **Skyline** | Drop a sliding slab onto your tower — only the overlap stays, so the overhang is sliced off. Flush drops keep the full width; precision is the only way up. | [`games/skyline/`](games/skyline/) |
| **Loft** | Keep the glowing orbs aloft — tap a falling orb to bat it back up. You can only strike on the way down, and every few points another orb joins the air. | [`games/loft/`](games/loft/) |
| **Ricochet** | Aim and fire one shot that ricochets off the walls, sweeping up every target in its path. Bank several in one shot — a shot that hits nothing costs a life. | [`games/ricochet/`](games/ricochet/) |

<!-- GAMES:END -->

_(A new one joins most days.)_

## Contributing

Yes please — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to add a game and the
few things it asks of one. Open an issue first if you want to talk it through, or just
send a PR. Bug reports and "I'd love a game that does X" ideas are equally welcome via
the [issue templates](.github/ISSUE_TEMPLATE/).

## License

[MIT](LICENSE) © Fairy Fox. Play, fork, learn from, and build on these freely.
