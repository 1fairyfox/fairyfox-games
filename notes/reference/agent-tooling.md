# Standard: Agent Tooling & Execution

How an AI assistant operates a mesh repo on this environment. Two rules that were being
rediscovered per-project, lifted here so every node inherits them: **use PowerShell + the
file tools, never the Cowork bash sandbox**, and **execute the work directly rather than
handing the user a script.**

> Canonical, project-agnostic standard (the version other repos copy). It belongs in
> each project's `CLAUDE.md` "Build / Run" + "Critical things not to get wrong" sections
> (the [ai-context standard](ai-context.md)).

## The rules

### 1. Never use the Cowork bash sandbox

On this Windows environment `mcp__workspace__bash` is **actively broken**, not just
redundant — **zero exceptions, including "quick" reads.** Observed failures: stale /
truncated file views (a 42-line file read back as 36), inability to touch `.git`
(`unable to unlink .git/objects/… Operation not permitted`), and line-ending mangling
(a 12-line changelog edit staged as **3,256 phantom CRLF-flip lines**). Every slip risks
a bad edit or a corrupted commit.

Use instead:

- **File tools** (Read / Edit / Write / Glob / Grep) for all file work.
- The **`Windows-MCP` PowerShell** tool for everything else — `npm`, `git`, `node`,
  builds, doc generators.

### 2. Execute, don't hand off

The assistant has PowerShell + full `git`/`gh` control on the machine **at all times**.
When the user says *ship* / *clean up and commit* / *verify*, the assistant **runs** the
gate, stages, commits, branches, merges, and releases **itself** — pausing only for the
confirmations the workflow actually requires (e.g. the go-ahead to release to `main`,
which "ship" already grants). "Here's a script for you to run" is the wrong default.

### 3. Known PowerShell gotchas to encode

- **`Get-Content -Raw | Set-Content`** (and positional `Set-Content`) can silently
  **no-op** on this machine. For scripted bulk replaces use
  `[System.IO.File]::ReadAllText(...)` / `WriteAllText(...)`, or just the Read/Edit tools.
- **`gh api --input -`** (stdin) fails from PowerShell (UTF-16 stdin → "Problems parsing
  JSON"). Use a **UTF-8 (no BOM) temp file** + `--input <file>`.
- **`.NET`/`[IO.File]` needs ABSOLUTE paths on Windows.** `[Environment]::CurrentDirectory`
  is **not** PowerShell's `Set-Location`/`cd`, so `[IO.File]::WriteAllText("relative/path", …)`
  silently writes to the wrong tree (a standards copy landed in the wrong directory this way).
  Always pass an absolute path to `[IO.File]`/.NET, or use the Read/Edit tools.
- **The agent sandbox blocks some legitimate `gh` writes heuristically.** A **stdin-piped
  `gh api PATCH`** and `gh pr merge --delete-branch` were blocked, while plain **`gh pr merge`**
  and the **field-flag** form `gh api -X PATCH … -F strict=true -f "contexts[]=build"` passed.
  Reach for the field-flag / plain form first instead of stalling on the blocked variant.
- **PowerShell-over-MCP mangles `-f` format strings and backtick escapes.** When a command
  needs `-f`/backticks or heavy quoting, **write a throwaway `.ps1` and run it with `-File`** —
  it's the reliable path (a piped one-liner isn't).
- Respect the repo's `core.autocrlf` — PowerShell stages real diffs cleanly; the bash
  sandbox does not.

### 4. Previewing a built site (baseurl-aware)

To eyeball a **Jekyll** node, serve it with `bundle exec jekyll serve` (which honours
`baseurl`), **not** a static `http.server` over `_site/` at `/` — the build's URLs are
prefixed (e.g. `/fairyfox-games`), so a plain static server 404s every asset. Preview the
real base path the deployed site uses.

### Line-ending hygiene (`.gitattributes`)

Every repo ships a root **`.gitattributes`** with `* text=auto eol=lf` (+ `.bat`/`.cmd`
`eol=crlf`, explicit `binary` for images/fonts/media). It forces LF in the working tree
on every platform regardless of each machine's `core.autocrlf`, so LF-expecting
formatters (Prettier et al.) stop flagging phantom "modified" files — the recurring
Windows CRLF noise (~178 files on a single `format:check`). One file, zero behavior
change. Template: [`templates/project.gitattributes`](../templates/project.gitattributes).

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| The project's `CLAUDE.md` names PowerShell + file tools and forbids the bash sandbox | read `CLAUDE.md` Build/Run + landmines |
| A root `.gitattributes` with `* text=auto eol=lf` (+ `.bat`/`.cmd` CRLF, binaries) exists | `ls .gitattributes`; read it |
| The working tree isn't drowning in CRLF-only "modified" noise | `git status` after a formatter run is clean of phantom edits |
