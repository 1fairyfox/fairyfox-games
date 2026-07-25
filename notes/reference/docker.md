# Standard: Docker — local-first build, test, setup & install

**Use Docker whenever it helps — and it usually does.** A container gives a project a
reproducible, throwaway environment to build in, test in, and install/run from, on any
machine. The owner develops on **Windows with Docker available**, so anything that "needs
Linux" — a Linux-only build, a Linux test matrix, a server image, an install/setup flow — can
and should run **locally in a container**, not be quietly deferred to the online CI runner.

> Canonical, project-agnostic standard (the version other repos copy). It sits alongside
> [`agent-tooling.md`](agent-tooling.md) (execute locally, don't hand off; PowerShell on
> Windows) and [`testing.md`](testing.md) (real multi-layer tests, gate before ship) — Docker
> is how a Windows box runs the Linux half of both.

## The rule

- **Local-first, CI-as-backstop.** The online CI is the *gate* that must stay green before a
  release — it is **not** the place you go to *discover* whether a Linux build or test passes.
  Run it locally in Docker first, iterate there, and let CI confirm. **Defaulting Linux-only
  work to "push and see what CI says" is the anti-pattern this standard closes** — it's slow,
  it burns CI minutes, and it hides a capability the developer already has on the desktop.
- **Containerize the three loops where it helps:**
  - **Build** — a reproducible build image so the project compiles the same way everywhere,
    independent of what happens to be installed on the host.
  - **Test** — run the suite (especially a **Linux-only** toolchain, a service the app talks
    to, or a matrix the host can't reproduce) in a container locally. Pair it with the
    [testing](testing.md) gate: the same tests CI runs, runnable on the desktop first.
  - **Setup / install / run** — a container (or `docker compose`) that stands the project up
    from scratch, so onboarding, an install flow, or a demo is one reproducible command rather
    than a page of host-specific steps.
- **Fix Docker problems — don't write them off.** When the Docker path breaks — a Dockerfile
  that won't build, a base-image or platform mismatch, a bind-mount/line-ending/permissions
  issue on Windows, a slow layer — **take the time to fix it.** A broken or awkward container
  setup is a **bug to fix**, not a reason to abandon Docker and fall back to CI-only or
  host-only. The point of the standard is that the local Linux capability *works*; leaving it
  broken and routing around it is the failure.
- **Windows ↔ Linux is exactly what it's for.** A Windows dev box targeting a Linux runtime is
  the common mesh shape; Docker is the bridge (and it composes with the PowerShell-on-Windows
  rule in [`agent-tooling`](agent-tooling.md) — you drive `docker` from PowerShell). Watch the
  Windows gotchas and fix them: CRLF in files copied into a Linux image (honour
  `.gitattributes`), volume-mount path/permission differences, and `linux/amd64` vs `arm64`
  platform pins.
- **Vendor the Docker assets in-repo.** The `Dockerfile` / `compose.yaml` / any helper scripts
  live in the project (committed), so the environment is versioned with the code — not a
  one-off nobody else can reproduce.

## When it doesn't apply

Docker is "whenever possible / whenever it helps," not a mandate to containerize a project that
gains nothing from it. A pure static site or a trivial script with no Linux-only step and no
reproducibility problem needn't ship a Dockerfile — say so honestly rather than adding a
container that earns nothing. But **"the build/test is Linux-only" is precisely when it does
apply** — that's the case the standard exists for, and "left it to CI" is not an acceptable
answer there.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| A project with a **Linux-only or reproducibility-sensitive** build/test/setup ships a **working, committed Docker path** (`Dockerfile`/`compose.yaml`) used **locally** | look for the Docker assets; confirm they build/run |
| Linux build/test is **run locally in Docker first**, with CI as the backstop — not "pushed to see what CI says" | check the workflow docs / `CLAUDE.md`; local run is the primary loop |
| **Docker problems were fixed, not routed around** — no "gave up on Docker, CI-only" where a container was the right tool | look for a disabled/abandoned Dockerfile + a note that the fix was skipped |
| The **setup/install/run** flow is reproducible in a container where that helps | try the documented `docker`/`compose` up path |
| Windows↔Linux gotchas handled (CRLF per `.gitattributes`, mount/permission, platform pin) | build the image on the Windows host; confirm no CRLF/permission breakage |
| A project that legitimately **doesn't need Docker** says so honestly (not a silent skip) | the adoption manifest records `N-A(reason)`, not an unexplained gap |
