# Standard: CI Service Secrets

Three CI integrations need a **per-repo GitHub Actions secret** before their workflows can
run. They're the values that make the [badges](badges.md), the coverage gate in
[testing](testing.md), and the Scorecard signal in
[supply-chain-hardening](supply-chain-hardening.md) actually light up rather than render
"unknown" forever. This standard names the three secrets, records where each value comes
from, and provides the tool that provisions them so nobody has to hunt for the links again.

> Canonical, project-agnostic standard (the version other repos copy). It provisions the
> secrets the services in [badges](badges.md), [testing](testing.md), and
> [supply-chain-hardening](supply-chain-hardening.md) depend on — it does not introduce the
> services themselves. Provisioning tool: [`../tools/repo-tokens.ps1`](../tools/repo-tokens.ps1).

## The secrets

| Secret | Service | What it unlocks | Where to get the value |
|--------|---------|-----------------|------------------------|
| `SONAR_TOKEN` | SonarCloud | Quality-gate + tech-debt analysis (and the Sonar badges) | [sonarcloud.io/account/security](https://sonarcloud.io/account/security) — Account › Security › Generate; or the project's Administration › Analysis Method |
| `CODECOV_TOKEN` | Codecov | Coverage upload from CI (and the coverage badge) | [app.codecov.io/gh/1fairyfox](https://app.codecov.io/gh/1fairyfox) — repo › Configuration › General › Repository Upload Token |
| `SCORECARD_TOKEN` | OpenSSF Scorecard | Branch-protection read / results publish above the default token's reach | [github.com/settings/tokens/new](https://github.com/settings/tokens/new) — classic PAT, scopes `public_repo` (or `repo`) + `read:org` |

All three are **single-line tokens**, set as repository secrets under the same name the
workflows reference (`secrets.SONAR_TOKEN`, etc.). Scorecard's is a GitHub **Personal
Access Token**, not a service key.

## Provisioning them — the tool

Run [`hub/tools/repo-tokens.ps1`](../tools/repo-tokens.ps1) (the **"fairyfox repo tokens"**
trigger). It prints the get-it link and a short how-to for each secret, then prompts for the
value with the **input concealed**. The value is streamed to `gh secret set … --body-file -`
over stdin and the plaintext copy is zeroed immediately — it never lands on disk, in the
shell history, in a command-line argument, or in an AI transcript.

- **Blank + Enter skips** a secret — nothing is sent to `gh` for it. Skip the ones a given
  repo doesn't use.
- **Target** defaults to the current directory's repo (`gh repo view`); override with
  `-Repo OWNER/NAME`. `-Only SONAR_TOKEN,CODECOV_TOKEN` prompts a subset.
- Requires an authenticated `gh` (`gh auth login`). It prints `gh secret list` at the end so
  you can confirm what's set.

## Applicability

"Applicable" is the only filter, exactly as in [badges](badges.md): a repo provisions the
secret for each service it actually wires. A repo with no SonarCloud project skips
`SONAR_TOKEN`; a repo with no coverage upload skips `CODECOV_TOKEN`. A secret is **required
when — and only when — a workflow references it**; an un-referenced secret is neither
expected nor faked. (fairyfox.io itself, a Jekyll site, wires none of the three and is N/A
across the board.)

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Every secret a workflow references is set on the repo | `gh secret list --repo OWNER/NAME`, cross-checked against `secrets.*` uses in `.github/workflows/` |
| No workflow references a secret that isn't set (nothing renders "unknown"/unauthenticated) | grep the workflows for `secrets.` and confirm each has a matching secret |
| The secret names match the canonical set (`SONAR_TOKEN`, `CODECOV_TOKEN`, `SCORECARD_TOKEN`) | inspect the secret list and the workflow references |
| A repo wiring none of the three is a clean N/A, not a gap | confirm no `secrets.{SONAR,CODECOV,SCORECARD}_TOKEN` reference exists to satisfy |
