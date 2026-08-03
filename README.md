# Fairy Fox Games

<!-- Project / community -->
[![Contributors](https://img.shields.io/github/contributors/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/graphs/contributors)
[![Stars](https://img.shields.io/github/stars/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/stargazers)
[![Forks](https://img.shields.io/github/forks/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/network/members)
[![Watchers](https://img.shields.io/github/watchers/1fairyfox/fairyfox-games?style=flat-square&logo=github)](https://github.com/1fairyfox/fairyfox-games/watchers)

<!-- Activity / release -->
[![Last commit](https://img.shields.io/github/last-commit/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/commits)
[![Commits](https://img.shields.io/github/commit-activity/t/1fairyfox/fairyfox-games?style=flat-square&label=commits)](https://github.com/1fairyfox/fairyfox-games/commits)
[![Version](https://img.shields.io/github/v/tag/1fairyfox/fairyfox-games?style=flat-square&label=version)](https://github.com/1fairyfox/fairyfox-games/releases)

<!-- Build / quality -->
[![CI](https://img.shields.io/github/actions/workflow/status/1fairyfox/fairyfox-games/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/1fairyfox/fairyfox-games/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/1fairyfox/fairyfox-games?style=flat-square&logo=codecov&logoColor=white)](https://app.codecov.io/gh/1fairyfox/fairyfox-games)
[![Code quality](https://img.shields.io/codefactor/grade/github/1fairyfox/fairyfox-games?style=flat-square&logo=codefactor&logoColor=white&label=code%20quality)](https://www.codefactor.io/repository/github/1fairyfox/fairyfox-games)
[![Quality gate](https://img.shields.io/sonar/quality_gate/junebug12851_fairyfox-games?server=https%3A%2F%2Fsonarcloud.io&style=flat-square&logo=sonarcloud&logoColor=white&label=quality%20gate)](https://sonarcloud.io/summary/new_code?id=junebug12851_fairyfox-games)
[![Tech debt](https://img.shields.io/sonar/tech_debt/junebug12851_fairyfox-games?server=https%3A%2F%2Fsonarcloud.io&style=flat-square&logo=sonarcloud&logoColor=white&label=tech%20debt)](https://sonarcloud.io/summary/new_code?id=junebug12851_fairyfox-games)

<!-- Security -->
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/1fairyfox/fairyfox-games?style=flat-square&label=scorecard)](https://securityscorecards.dev/viewer/?uri=github.com/1fairyfox/fairyfox-games)

<!-- Docs / deploy -->
[![Docs](https://img.shields.io/badge/docs-fairyfox.io-4c9?style=flat-square&logo=readthedocs&logoColor=white)](https://fairyfox.io/fairyfox-games/)
[![Pages](https://img.shields.io/github/actions/workflow/status/1fairyfox/fairyfox-games/pages.yml?branch=main&style=flat-square&logo=githubpages&logoColor=white&label=pages)](https://github.com/1fairyfox/fairyfox-games/deployments)

<!-- Issues / PRs / license -->
[![Open issues](https://img.shields.io/github/issues/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/issues)
[![Closed issues](https://img.shields.io/github/issues-closed/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/issues?q=is%3Aissue+is%3Aclosed)
[![Open PRs](https://img.shields.io/github/issues-pr/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/pulls)
[![Closed PRs](https://img.shields.io/github/issues-pr-closed/1fairyfox/fairyfox-games?style=flat-square)](https://github.com/1fairyfox/fairyfox-games/pulls?q=is%3Apr+is%3Aclosed)
[![License](https://img.shields.io/github/license/1fairyfox/fairyfox-games?style=flat-square)](LICENSE)

📖 **Documentation & play** — <https://fairyfox.io/fairyfox-games/>

An **AI-managed game farm** — a library of small, simple games, planted and tended by AI.
New games are sown regularly and the ones already growing keep getting deeper, so the
collection widens *and* deepens on its own over time. The kind of games you can start in a
second and lose a few happy minutes to.

Some are tiny, some are clever; all of them are here to be played and enjoyed.

## Get it

Everywhere this collection lives — pick your door in:

- **▶ Play (live)** — <https://fairyfox.io/fairyfox-games/> · each game at
  `https://fairyfox.io/fairyfox-games/<game>/` (static, published by GitHub Pages).
- **📖 Docs / project page** — <https://fairyfox.io/fairyfox-games/>.
- **⬇ Releases** — <https://github.com/1fairyfox/fairyfox-games/releases>.
- **⌨ Source** — <https://github.com/1fairyfox/fairyfox-games> (the `notes/` tree records
  how it's built).

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
| **Reel** | There's a catch on your line and it fights back. Hold to reel it in while it's calm; ease off the instant it thrashes or the line snaps. Snap back onto the reel the moment a thrash breaks for a haul and a growing multiplier. Three snapped lines end the run. | [`games/reel/`](games/reel/) |
| **Tether** | Hold to rope onto an anchor and swing; let go in the glowing arc to whip yourself across the gap. Too early and you fly flat into the ground, too late and you stall — the sweet spot is both your score and your survival. | [`games/tether/`](games/tether/) |
| **Sluice** | Coloured sparks fall one at a time — send each into the channel that matches its colour before it lands. The channels keep rearranging, so read the row and route early for a combo. | [`games/sluice/`](games/sluice/) |
| **Arc** | Hold to build power, release to lob a shot at 45° — judge the distance and land it on the pad. Nail the bright centre for a bullseye and keep the combo alive. | [`games/arc/`](games/arc/) |
| **Loom** | Send the thread over or under each peg and alternate to weave. Grab the gold beads, dodge the barbs, and cinch the interlace at the last instant to grow your multiplier. Three snags end the run. | [`games/loom/`](games/loom/) |
| **Symmetry** | One control, two catchers locked in a mirror — spread them around the centre to catch falling orbs on both sides. You can't always save both, so read ahead and chase the twins. | [`games/symmetry/`](games/symmetry/) |
| **Poise** | Tilt the beam to balance a rolling ball — roll it over the glowing target to score, without letting it slip off either end. The targets arrive in named routes, and it grows twitchier the longer you last. | [`games/poise/`](games/poise/) |
| **Drove** | Fireflies flee your glow — get behind them and press the drove into the lantern. A slow push always works; a perfect lunge darts one straight home and grows a multiplier. Spook three off the field and the night is over. | [`games/drove/`](games/drove/) |
| **Loft** | Keep the glowing orbs aloft — tap a falling orb to bat it back up. You can only strike on the way down, and every few points another orb joins the air. | [`games/loft/`](games/loft/) |
| **Brim** | Hold to pour, let go to stop — except the stream is still falling, and it lands anyway. Stop above the line, under the rim, and stop in the gold to build your multiplier. You can't stop where you want; you have to stop early. | [`games/brim/`](games/brim/) |
| **Ward** | Shards close in on your core from every side — orbit your shield to block them before they land. Three strikes ends it. Catch one dead-centre and defence turns into a climbing multiplier. Point, hold the line, and see how deep you can hold. | [`games/ward/`](games/ward/) |
| **Skyline** | Drop a sliding slab onto your tower — only the overlap stays, so the overhang is sliced off. Flush drops keep the full width; precision is the only way up. The wind shifts as you climb, so no two towers rise the same. | [`games/skyline/`](games/skyline/) |
| **Ricochet** | Aim and fire one shot that ricochets off the walls, sweeping up every target in its path. Bank several in one shot — a shot that hits nothing costs a life. | [`games/ricochet/`](games/ricochet/) |
| **Orbit Slingshot** | Your probe orbits a planet. Hold to fire a prograde thrust and bend your path through the targets — without crashing or flying off into space. | [`games/orbit-slingshot/`](games/orbit-slingshot/) |
| **Ink Bloom** | Steer a growing line, drink glowing motes to grow, and don't cross your own trail. The longer you live, the less room you leave yourself. | [`games/ink-bloom/`](games/ink-bloom/) |
| **Echo Chamber** | An echo ring expands from the centre — catch it the instant it crosses the target band. Every hit tightens the window. Three lives. | [`games/echo-chamber/`](games/echo-chamber/) |
| **Reprise** | The pads play a phrase — watch it, then echo it back in the same order. Each call you land grows by one and plays a touch faster. Echo on the beat and you'll find there's more here than that. | [`games/reprise/`](games/reprise/) |
| **Polarity** | Charged gates rush in — flip your charge, cyan or magenta, to match each one and phase through. Clash and it's over. The deeper you go, the more there is to find. | [`games/polarity/`](games/polarity/) |

<!-- GAMES:END -->

_(A new one joins most days.)_

## Contributing

Yes please — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to add a game and the
few things it asks of one. Open an issue first if you want to talk it through, or just
send a PR. Bug reports and "I'd love a game that does X" ideas are equally welcome via
the [issue templates](.github/ISSUE_TEMPLATE/).

## License

[MIT](LICENSE) © Fairy Fox. Play, fork, learn from, and build on these freely.

---

Part of the **[Fairy Fox](https://fairyfox.io)** project mesh — a family of small, open
projects that share standards and grow alongside each other. Browse the rest at
[fairyfox.io](https://fairyfox.io) · this collection's home is
[fairyfox.io/fairyfox-games/](https://fairyfox.io/fairyfox-games/).
