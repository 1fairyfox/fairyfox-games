# Standard: Research Capture — understanding lands in the notes

The most perishable thing a project produces is **understanding** — a value's real meaning, what a
routine actually does, a constraint the system can't survive, a field that turns out to be dead.
Code can be rewritten from notes; notes cannot be rewritten from code. So: **if you understood
something you didn't understand before, write it down — in `notes/`, in the same session, without
being asked.** Distilled from pokered-save-editor-2's standing rule; general to every project.

> Canonical, project-agnostic standard. It sits on top of [`notes-system.md`](notes-system.md)
> (where notes live) and feeds [`engineering-quality.md`](engineering-quality.md) (build on
> verified understanding, not a guess).

## The rules

**When:** by default, in every session — not "if it seems important", not "at the end of the
project". A new or expanded understanding is captured the moment it's gained.

**The shape of a research pass (none of these steps is optional):**

1. **Go to the primary source.** The upstream spec / reference implementation / the real system —
   not memory, not a previous version, not what a thing is *called*.
2. **Verify when it's load-bearing.** If a conclusion is something real will be built on, **prove
   it** against the actual system (a probe, an emulator/console, a golden output) and **commit the
   probe** — a careful reading of the source has been wrong before, and the check catches it (see
   [`testing.md`](testing.md)'s oracle rule).
3. **Write the reference note** — `notes/reference/<topic>.md`: the real names, ranges, who writes
   it, who reads it, what the system does with edge/hack values, and the traps. **Plain English**,
   so someone who doesn't already know the domain can learn it from the file.
4. **Say what it means for the code.** A research pass usually turns up real bugs in the current
   model — list them, and fix them **before** building anything new on top of the corrected
   understanding.
5. **Wire it up.** A row in the notes map, a line in `status.md`, an entry in today's session log,
   and a link from the plan it feeds — so the knowledge is reachable, not stranded.

**Static co-location is a lead, never evidence.** Two things sitting next to each other (two flags
for one subject, two records in one block) proves nothing about how they interact — adjudicate on
the real system before asserting. (pse2's shelved conflict-flags system is the cautionary tale.)

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Non-trivial findings have a **reference note** in `notes/reference/` (not only in a session log) | scan `notes/reference/`; does recent understanding have a home |
| Load-bearing conclusions were **verified against the real system**, with the probe committed | look for probe/verification scripts alongside the claims |
| Reference notes are **plain-English and teachable**, with the traps named | read one — could a newcomer learn the domain from it |
| A research pass that found a model bug **fixed it before building on top** | trace a recent finding → its fix → then the feature |
| New notes are **wired in** (map row, status, session log, plan link) | follow the links from a recent reference note |
