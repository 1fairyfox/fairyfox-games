# Depth Inside the Mechanic — the missing layer ("there's *more* here")

_Written from owner feedback (2026-07-10): "I get everything down in 5 minutes, then it's
'oh, it's just one of those games' — the gimmick where the 5 minutes you played is all there
is. You keep mentioning progression and stages but I don't see it." This doc is the research
+ understanding behind the fix. Read it with `game-design.md` (the broad why) and
`varied-structure.md` (run-to-run variety). **This is the layer those two were missing in
practice.**_

## The diagnosis (read this first — it's the whole point)

Our games chase "depth" with two tools, and the owner has correctly felt that **neither
tool creates the feeling of depth**:

- **Meta-progression** (badges, lifetime counters, run-report). By its own admission in
  `game-design.md`, this *"sits around the loop and is invisible on a fresh play."* It's a
  reason to *return*, not a reason the *current five minutes* feel deep.
- **Varied structure** (formation shuffling). This stops a run feeling *identical* to the
  last, but every formation sits at a **fixed intensity** and the hardest one unlocks a
  third of the way in — so within minutes the player has *seen the whole hand*. Variety ≠
  escalation; **reshuffling the same pieces at the same ceiling is exactly the "gimmick"
  feeling.**

And the one axis that *is* felt — raw speed — **plateaus early** (Polarity caps gate speed
at ~100 gates cleared, then it's flat forever). So the honest summary is: **after five
minutes the player has seen the entire ceiling of the mechanic, and nothing new is
underneath.** That is the bug. It is not a missing difficulty knob.

## What the owner actually asked for (in their words, decoded)

> "deeper means I feel like there's *more* to the game… not complicated, not absurdly hard…
> the user needs to be curious what's more. Little powers or advanced tricks you learn only
> by playing deeper. Maybe secret parts of the level, maybe other stages. Not just 'throw in
> a new difficulty because they got this one' — then it's just 'oh, it's going to get harder
> until I can't play,' and they lose interest. Genuine stuff that makes the user want to
> progress deeper and unlock surprises. Put in hard work and it pays off."

Decoded into design terms, that is a request for **four specific things, none of which is
"more difficulty"**:

1. **A high skill ceiling** — the one input keeps rewarding practice; there is always a
   better way to play it you haven't mastered yet.
2. **Discoverable technique ("tech")** — advanced ways to use the mechanic that the game
   does **not** teach; you find them by playing, and finding one is a jolt of "oh!"
3. **Secrets & surprises** — hidden states, events, or places that reward going deeper, so
   curiosity ("what's more?") is answered with genuine payoff, not just a bigger number.
4. **Substantive stages** — stages that change **what you do**, not just how fast — an
   honest arcade track (one line, escalating, with *new texture* per tier), which the owner
   explicitly says *is* fun.

## The core principle: depth ≠ complexity

The canonical distinction (Gamasutra/Game Developer, Accidental Cyclops, and the Go/Tetris
literature): **complexity is how many moving parts a game has; depth is how much can be done
with them.** Go has almost no rules and near-infinite depth. So the goal is **never "add
parts."** It is **"make the parts we have do more"** — more meaning, more interactions, more
skill expression from the *same one verb*. If a proposed addition is a second verb, it's a
new game, not depth (per the simple-but-deep checklist).

This is the guardrail that keeps "deeper" from becoming "bloated," which the owner explicitly
fears. Every idea below adds **depth without a new control**.

## The toolkit — five ways to get depth from one mechanic

### 1. Second-order interactions (the Pac-Man lesson)
Pac-Man is one verb (move) but has enormous depth because the **power pellet reverses the
dynamic** — ghosts become prey, edible for an escalating 200→1600 chain, spawning emergent
tactics (herd the ghosts, eat four on one pellet). The mechanic *means something different*
in a new context. **For us:** find a state where the one input flips meaning — a window where
the "safe" play becomes the greedy play, or where holding vs. releasing the same control does
opposite things. Depth is the *interaction*, not a new button.

### 2. Discoverable technique — the skill ceiling the game doesn't teach
The strongest "there's more here" feeling comes from **tech**: an advanced use of the basic
input that isn't in any tooltip, that a curious player stumbles into, and that measurably
rewards them. (Fighting-game tech, Mario Kart shortcuts, speedrun routing — all
player-discovered, all raise the ceiling with playtime.) **For us:** design one or two
*legal, emergent* techniques into the sim — e.g. a rhythm, a pre-charge, a chained input
timing — that we **deliberately do not explain**, that a good player will find, and that pay
off when found. It must arise from the existing rules (not a secret second control), and it
must be *safe to not know* (a beginner still plays fine). This is the single highest-leverage
item on the list.

### 3. Secrets & surprises — curiosity gets a real payoff
"Unlock surprises… hard work pays off." Hidden mechanics *"add depth and replayability,
encouraging players to explore."* **For us:** seed genuine hidden content that only deep play
reveals — a secret stage past the "end," a rare event that only triggers on a hard condition,
a hidden scoring state, an Easter-egg beat. Crucially it is **discovered, not announced** —
the reward is the surprise itself. One or two per game, deep enough that most players won't
hit them in five minutes, so the game keeps a card face-down.

### 4. Substantive stages — the honest arcade track
Stages today only change speed + tint. Make at least some stage transitions **change the
texture of play** — introduce a new wrinkle to the *same* mechanic (a new gate behavior, a
field rule, a rhythm shift). This is the "extended-tutorial → escalating complexity" arc of
good arcade design: each tier teaches one new thing in a safe moment, then leans on it. The
owner likes arcade escalation; the fix is that a stage must occasionally deliver a **new
thing to do**, not just a bigger number.

### 5. Remove the plateau — but pair intensity with texture
Uncap the ramp so mastery always meets rising pressure (no flat forever), **but** the owner's
warning is law: *pure* rising difficulty with nothing new = "it just gets harder until I quit."
So every increment of difficulty past the old cap should arrive **with** one of items 1–4
(a new interaction, a place to use tech, a surprise, a substantive stage). Difficulty is the
*pressure that makes the depth matter*, never the depth itself.

## How this sits with flow (so it doesn't become "absurdly hard")

Keep the flow rules from `game-design.md`: challenge tracks skill; **give the player a
breath** between spikes; the first stage is the tutorial; teach by playing. Depth items are
**layered underneath** and are **safe to not engage** — a beginner rides the calm on-ramp and
has fun; the curious player finds the tech, the secret, the reversal, and gets the "there's
*more* here" that keeps them past five minutes. Both halves — "learn in 3 seconds" and "deep
to master" — protected at once.

## The extra checklist for a depth change (adds to the simple-but-deep six)

Before shipping a "depth" addition, beyond the existing six in `game-design.md`, ask:

- **Does it make the *current five minutes* feel deeper, or only reward returning?** If it's
  only meta/return, it does **not** fix this complaint. Must land in-run.
- **Is it depth or complexity?** More done with the same verb = yes. A new part/control = no.
- **Is there something to *discover*?** At least one element the player finds rather than is
  told. Announced-everything has no "what's more?".
- **Safe to not know?** A first-timer plays fine without ever engaging the deep layer.
- **Does difficulty arrive *with* new texture,** not alone?

## Application to the collection

Polarity is the reference build for this layer, the same way it was for varied structure.
The concrete Polarity plan lives in `../plans/2026-07-10-depth-inside-the-mechanic.md`.
Once the feel is proven and approved, the GROW job rolls the layer across the collection one
game at a time — **always a player-visible, in-run change, logged to the changelog** — the
same cadence as the varied-structure rollout. Update `growth-roadmap.md` to make this the
lead lever (it supersedes "add one more formation" as the default grow step, because the owner
has told us variety alone isn't landing).

## Sources

- [Design 101: Complexity vs. Depth — Game Developer](https://www.gamedeveloper.com/design/design-101-complexity-vs-depth)
- [Depth vs. Complexity — Accidental Cyclops](https://www.accidentalcyclops.com/depth-vs-complexity/)
- [What is depth and how do you add it to your game? — Game Developer](https://www.gamedeveloper.com/game-platforms/what-is-depth-and-how-do-you-add-it-to-your-game-)
- [What Depth Really Means to Game Design — Game Wisdom](https://game-wisdom.com/critical/depth-game-design)
- [Skill Ceiling & Skill Floor: Easy to Learn, Hard to Master — Game Design Skills](https://gamedesignskills.com/gaming/skill-ceiling-skill-floor/)
- [Designing games with a single mechanic — The Dark Imp](https://www.thedarkimp.com/blog/2025/05/12/designing-games-with-a-single-mechanic/)
- [One Pixel, One Interaction, One Game: Minimalist Game Design (arXiv)](https://arxiv.org/pdf/2207.03827)
- [Emergent Gameplay Mastery — Number Analytics](https://www.numberanalytics.com/blog/emergent-gameplay-mastery-game-design-techniques)
- [Exploring Hidden Game Mechanics — Game Stats Wiki](https://gamestatswiki.online/exploring-hidden-game-mechanics/)
- [Difficulty curves: how to get the right balance — Game Developer](https://www.gamedeveloper.com/design/difficulty-curves-how-to-get-the-right-balance-)
- [How arcade developers implement progressive difficulty — Arcade Game Machine FAQ](http://toycranemachine.com/FAQ/6284.html)
- [Make it difficult, not punishing (flow & learning curves) — Ricardo Valério, Medium](https://ricardo-valerio.medium.com/make-it-difficult-not-punishing-7198334573b8)
