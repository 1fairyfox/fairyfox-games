# Fairy Fox Games

<!-- Project / community -->
[![Contributors](https://img.shields.io/github/contributors/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/graphs/contributors)
[![Stars](https://img.shields.io/github/stars/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/stargazers)
[![Forks](https://img.shields.io/github/forks/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/network/members)

<!-- Activity / release -->
[![Last commit](https://img.shields.io/github/last-commit/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/commits)
[![Version](https://img.shields.io/github/v/tag/1fairyfox/fairyfox-games?style=flat-square&label=version)](https://github.com/1fairyfox/fairyfox-games/releases)

<!-- Build / quality -->
[![CI](https://img.shields.io/github/actions/workflow/status/1fairyfox/fairyfox-games/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/1fairyfox/fairyfox-games/actions/workflows/ci.yml)

<!-- Security -->
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/1fairyfox/fairyfox-games?style=flat-square&label=scorecard)](https://securityscorecards.dev/viewer/?uri=github.com/1fairyfox/fairyfox-games)

<!-- Docs / deploy -->
[![Docs](https://img.shields.io/badge/docs-fairyfox.io-4c9?style=flat-square&logo=readthedocs&logoColor=white)](https://fairyfox.io/fairyfox-games/)

<!-- Issues / PRs / license -->
[![Open issues](https://img.shields.io/github/issues/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/issues)
[![Open PRs](https://img.shields.io/github/issues-pr/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/pulls)
[![License](https://img.shields.io/github/license/1fairyfox/fairyfox-games?style=flat-square)](LICENSE)

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
| **Brim** | Hold to pour, let go to stop — except the stream is still falling, and it lands anyway. Stop above the line, under the rim, and stop in the gold to build your multiplier. You can't stop where you want; you have to stop early. | [`games/brim/`](games/brim/) |
| **Ward** | Shards close in on your core from every side — orbit your shield to block them before they land. Three strikes ends it. Catch one dead-centre and defence turns into a climbing multiplier. Point, hold the line, and see how deep you can hold. | [`games/ward/`](games/ward/) |
| **Skyline** | Drop a sliding slab onto your tower — only the overlap stays, so the overhang is sliced off. Flush drops keep the full width; precision is the only way up. The wind shifts as you climb, so no two towers rise the same. | [`games/skyline/`](games/skyline/) |
| **Ricochet** | Aim and fire one shot that ricochets off the walls, sweeping up every target in its path. Bank several in one shot — a shot that hits nothing costs a life. | [`games/ricochet/`](games/ricochet/) |
| **Orbit Slingshot** | Your probe orbits a planet. Hold to fire a prograde thrust and bend your path through the targets — without crashing or flying off into space. | [`games/orbit-slingshot/`](games/orbit-slingshot/) |
| **Ink Bloom** | Steer a growing line, drink glowing motes to grow, and don't cross your own trail. The longer you live, the less room you leave yourself. | [`games/ink-bloom/`](games/ink-bloom/) |
| **Echo Chamber** | An echo ring expands from the centre — catch it the instant it crosses the target band. Every hit tightens the window. Three lives. | [`games/echo-chamber/`](games/echo-chamber/) |
| **Reprise** | The pads play a phrase — watch it, then echo it back in the same order. Each call you land grows by one and plays a touch faster. Echo on the beat and you'll find there's more here than that. | [`games/reprise/`](games/reprise/) |
| **Poise** | Tilt the beam to balance a rolling ball — roll it over the glowing target to score, without letting it slip off either end. The targets arrive in named routes, and it grows twitchier the longer you last. | [`games/poise/`](games/poise/) |
| **Loft** | Keep the glowing orbs aloft — tap a falling orb to bat it back up. You can only strike on the way down, and every few points another orb joins the air. | [`games/loft/`](games/loft/) |
| **Tether** | Hold to rope onto an anchor and swing; let go in the glowing arc to whip yourself across the gap. Too early and you fly flat into the ground, too late and you stall — the sweet spot is both your score and your survival. | [`games/tether/`](games/tether/) |
| **Polarity** | Charged gates rush in — flip your charge, cyan or magenta, to match each one and phase through. Clash and it's over. The deeper you go, the more there is to find. | [`games/polarity/`](games/polarity/) |
| **Arc** | Hold to build power, release to lob a shot at 45° — judge the distance and land it on the pad. Nail the bright centre for a bullseye and keep the combo alive. | [`games/arc/`](games/arc/) |
| **Symmetry** | One control, two catchers locked in a mirror — spread them around the centre to catch falling orbs on both sides. You can't always save both, so read ahead and chase the twins. | [`games/symmetry/`](games/symmetry/) |
| **Sluice** | Coloured sparks fall one at a time — send each into the channel that matches its colour before it lands. The channels keep rearranging, so read the row and route early for a combo. | [`games/sluice/`](games/sluice/) |

<!-- GAMES:END -->

_(A new one joins most days.)_

## Contributing

Yes please — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to add a game and the
few things it asks of one. Open an issue first if you want to talk it through, or just
send a PR. Bug reports and "I'd love a game that does X" ideas are equally welcome via
the [issue templates](.github/ISSUE_TEMPLATE/).

## License

[MIT](LICENSE) © Fairy Fox. Play, fork, learn from, and build on these freely.
