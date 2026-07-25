# Standard: README Badges

Every repo's README opens with a **status badge block** carrying the **full canonical set,
in a fixed order, by default** — so the repo's health, release, security posture, and links
are legible at a glance. Badges aren't decoration: each one is a live signal (CI state,
coverage, Scorecard, quality gate) that also nudges the project to actually wire up the
service behind it.

> Canonical, project-agnostic standard (the version other repos copy). Copy-paste block:
> [`templates/README-badges.md`](../templates/README-badges.md). Several badges front the
> same services as [supply-chain-hardening](supply-chain-hardening.md) (Scorecard) and
> [dependencies](dependencies.md) (CI/coverage).

## The rule — the full set is required by default, in order

The badge block is **default-complete**: an onboarded project carries **all** of the
canonical badges below, **in the fixed order given**, all in the same style
(`?style=flat-square`). This is the same governance the owner set for a project's
[details](onboarding-existing-project.md#7-register-with-the-hub-hub-side-change) —
**complete by default; omission is a decision only the *user* makes at onboarding, never
the AI on its own judgment.** So:

- **Swap the equivalent, don't drop.** Where a project differs, replace the line with its
  equivalent rather than removing it: version → `github/package-json/v` (npm) or
  `github/v/tag` (non-npm); CI/coverage/deploy → whichever service the project uses (a
  static site's deploy badge is **Pages**, a built app's is **Netlify**). The slot stays;
  only the source changes.
- **Add / expand where the project has more.** A project published to a registry adds the
  **distribution** badges (Hangar / Modrinth / npm / crates.io); a project with extra live
  signals may add them after the required set. "Required in order" is a **floor**, not a
  ceiling.
- **Omit only on a user-granted exception.** If a project genuinely has no service behind a
  slot *and no equivalent* (e.g. a server plugin with no web deploy target for the deploy
  badge), that slot is dropped **only when the user grants the exception at onboarding** —
  recorded as a dated row in [`adoption-manifest.md`](../templates/notes-skeleton/reference/adoption-manifest.md).
  **The AI never decides on its own that a badge "doesn't apply" and quietly drops it** —
  that silent descope is the failure this rule closes ([`checklists-are-contracts`](checklists-are-contracts.md)).
- **The one automatic exemption: the social/preview image.** A repo's social-preview /
  Open-Graph image can't be generated automatically, so it is **out of scope for this
  standard** — its absence is never a badge gap. Everything else is default-required.

### The required order (top row → bottom)

1. Contributors · 2. Stars · 3. Forks · 4. Watchers · 5. Last commit · 6. Commits (total) ·
7. Version · 8. CI · 9. Coverage · 10. Code quality · 11. Quality gate · 12. Tech debt ·
13. OpenSSF Scorecard · 14. Docs · 15. Deploy (Netlify **or** Pages) · 16. Open issues ·
17. Closed issues · 18. Open PRs · 19. Closed PRs · 20. License.

Grouped into rows for readability (community · activity/release · build/quality · security ·
docs/deploy · issues/PRs/license), but the **order above is canonical** — don't reshuffle.
An optional **runtime/platform** badge (Java · Paper · Node) may sit just before CI where it
identifies the project, and **distribution** badges follow License; neither is part of the
required 20, so their absence is not a gap.

## The canonical set (grouped)

| Group | Badges |
|-------|--------|
| **Project / community** | contributors, stars, forks, **watchers** |
| **Activity / release** | last-commit, **commit-activity/total commits**, version (from `package.json` or latest tag) |
| **Runtime** | **language/platform** *(e.g. Java, Paper, Node — if it identifies the project)* |
| **Build / quality** | CI (Actions workflow), coverage (Codecov), code quality (CodeFactor), quality gate (SonarCloud), **tech debt (SonarCloud)** |
| **Security** | OpenSSF Scorecard |
| **Docs / deploy** | docs (→ `fairyfox.io/<key>/`), **Pages** and/or **Netlify** deploy *(whichever applies)* |
| **Issues / PRs / license** | open **and closed** issues, open **and closed** PRs, license |
| **Distribution** *(commented until published)* | Hangar / Modrinth / npm / crates.io — enable per project once it ships to that registry |

Link each badge to the thing it reports (the Actions tab, the Codecov project, the
releases page, the LICENSE), so a click goes somewhere useful. The **docs** badge always
points at the project's page on the shared domain, `https://fairyfox.io/<key>/`, tying the
repo back into the mesh.

## Per-slot notes (swap the source, keep the slot)

These say *which* source fills each required slot for a given project — not whether the slot
appears (it does, by default):

- **Version (7)** — npm repo → `github/package-json/v` (set `filename=` for a monorepo
  sub-package); otherwise → `github/v/tag`.
- **CI / Coverage / Code quality / Quality gate / Tech debt (8–12)** — these back onto
  services the mesh standardizes on (the project's CI workflow, Codecov, CodeFactor,
  SonarCloud). The badge is required, which means **wire the service** as part of
  onboarding — a permanently "unknown" badge is a *gap to close by wiring it*, not a licence
  to drop the badge. If a service is genuinely inapplicable to the project's kind, that's the
  user-exception path above, recorded — not an AI call.
- **Deploy (15)** — a built app → **Netlify**; a static site → **Pages**. It's one slot with
  two sources; pick the one that matches the project. A project with **no web deploy target
  at all** (e.g. a server plugin shipping a `.jar`) drops this slot only via the recorded
  user exception, and typically **adds distribution badges** (Hangar/Modrinth) in its place.
- **Scorecard (13)** — public repos (the Scorecard action + API are free for public repos);
  a private repo drops it via the recorded exception.
- **Docs (14)** — always points at the project's page on the shared domain,
  `https://fairyfox.io/<key>/`.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| The README opens with the badge block, consistent `flat-square` style | open the README |
| **All 20 required badges are present, in the canonical order** (§The required order) | walk the block top-to-bottom against the numbered list |
| Each slot is filled by the **right source for this project** (version tag vs package-json; deploy = Pages vs Netlify; CI/coverage wired) — a swap, never a silent drop | cross-check the project's actual services against each slot |
| **Any omitted slot has a recorded user exception** in `adoption-manifest.md` — no badge dropped on the AI's own "doesn't apply" call | diff present badges vs the required 20; for each missing one, find the dated user-granted exception row (none → `missing`) |
| The **docs** badge points at `fairyfox.io/<key>/` | click/inspect the docs badge |
| Each badge links to its source | inspect the badge links |
| A permanently "unknown"/grey required badge is treated as a **gap to wire the service**, not left as-is | look for grey badges; confirm the backing service is wired (or a recorded exception) |
