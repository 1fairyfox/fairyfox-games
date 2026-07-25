<#
.SYNOPSIS
    Provision the CI service secrets every applicable fairyfox node needs — securely,
    from a masked prompt, straight into GitHub Actions via `gh`.

.DESCRIPTION
    Three services want a per-repo secret before their GitHub Actions workflows can run:

        SONAR_TOKEN      SonarCloud   quality gate + tech-debt analysis
        CODECOV_TOKEN    Codecov      coverage upload
        SCORECARD_TOKEN  OpenSSF      Scorecard branch-protection / publish (a PAT)

    This is the shared tool referenced by the `ci-secrets` standard
    (../standards/ci-secrets.md) and the "fairyfox repo tokens" trigger. For each
    secret it prints exactly where to get the value, then prompts for it with the
    input CONCEALED (Read-Host -AsSecureString). The value never touches disk, the
    shell history, this script's command line, or an AI transcript — it is streamed to
    `gh secret set ... --body-file -` over stdin and the plaintext copy is zeroed
    immediately after.

    Leave a prompt BLANK and press Enter to SKIP that secret — nothing is sent to `gh`
    for it. Skip the ones a given repo doesn't use (e.g. a repo with no SonarCloud
    project just skips SONAR_TOKEN).

.PARAMETER Repo
    Target repository as OWNER/NAME (e.g. 1fairyfox/random-ai-prompt). Optional —
    defaults to the repo of the current directory, resolved via `gh repo view`.

.PARAMETER Only
    Optional subset of secret names to prompt for (the rest are not offered). E.g.
    -Only SONAR_TOKEN,CODECOV_TOKEN.

.EXAMPLE
    ./repo-tokens.ps1
    Auto-detect the current repo and walk all three secrets (blank = skip).

.EXAMPLE
    ./repo-tokens.ps1 -Repo 1fairyfox/despawned-items -Only SCORECARD_TOKEN
    Set only the Scorecard PAT on a named repo.

.NOTES
    Requires the GitHub CLI (`gh`), authenticated (`gh auth login`) with a token that
    can write repository secrets (the default `gh` login scope does). Read-only apart
    from the secrets it writes; prints `gh secret list` at the end so you can confirm.
#>
[CmdletBinding()]
param(
    [string]$Repo,
    [string[]]$Only
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- The secrets this tool knows how to provision -----------------------------
# One row per secret: the GitHub Actions secret name, a human label, where to get
# the value, and a terse how-to. Add a row here to teach the tool a new secret.
$Secrets = @(
    [ordered]@{
        Name  = 'SONAR_TOKEN'
        Label = 'SonarCloud — quality gate & tech-debt analysis'
        Url   = 'https://sonarcloud.io/account/security'
        How   = @(
            'Sign in to SonarCloud with GitHub, then Account > Security.'
            'Enter a name (e.g. the repo), click Generate, and copy the token.'
            'Project-scoped alternative: the project > Administration >'
            'Analysis Method > GitHub Actions also hands you an analysis token.'
        )
    },
    [ordered]@{
        Name  = 'CODECOV_TOKEN'
        Label = 'Codecov — coverage upload'
        Url   = 'https://app.codecov.io/gh/1fairyfox'
        How   = @(
            'Sign in to Codecov with GitHub and open the repository.'
            'Configuration > General > Repository Upload Token — copy it.'
            '(Direct: app.codecov.io/gh/1fairyfox/<repo>/config/general)'
        )
    },
    [ordered]@{
        Name  = 'SCORECARD_TOKEN'
        Label = 'OpenSSF Scorecard — branch-protection read / publish (a PAT)'
        Url   = 'https://github.com/settings/tokens/new'
        How   = @(
            'GitHub > Settings > Developer settings > Personal access tokens >'
            'Tokens (classic) > Generate new token (classic).'
            'Scopes: public_repo (or repo for a private repo) + read:org.'
            'Name it SCORECARD_TOKEN, generate, and copy.'
        )
    }
)

function Write-Rule { param([string]$Char = '-') Write-Host ($Char * 74) -ForegroundColor DarkGray }

# --- Preflight: gh present and authenticated ----------------------------------
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) not found on PATH. Install it: https://cli.github.com/  then run 'gh auth login'."
}
try { gh auth status 2>&1 | Out-Null } catch {
    throw "gh is not authenticated. Run 'gh auth login' first."
}

# --- Resolve the target repo --------------------------------------------------
if (-not $Repo) {
    try { $Repo = (gh repo view --json nameWithOwner -q .nameWithOwner 2>$null).Trim() } catch { }
}
if (-not $Repo) {
    throw "Could not determine the target repo. Pass -Repo OWNER/NAME (or run inside the repo's git clone)."
}

# --- Filter to the requested subset, if any -----------------------------------
$rows = $Secrets
if ($Only) {
    $wanted = [System.Collections.Generic.HashSet[string]]::new([string[]]$Only, [System.StringComparer]::OrdinalIgnoreCase)
    $rows = $Secrets | Where-Object { $wanted.Contains($_.Name) }
    if (-not $rows) { throw "None of -Only [$($Only -join ', ')] match known secrets: $($Secrets.Name -join ', ')." }
}

Write-Host ''
Write-Rule '='
Write-Host " fairyfox repo tokens  ->  $Repo" -ForegroundColor Cyan
Write-Host " Input is concealed. Leave a prompt BLANK + Enter to SKIP that secret." -ForegroundColor Cyan
Write-Rule '='

$set = @(); $skipped = @()

foreach ($s in $rows) {
    Write-Host ''
    Write-Host (" {0}" -f $s.Name) -ForegroundColor Yellow -NoNewline
    Write-Host ("  ({0})" -f $s.Label) -ForegroundColor Gray
    Write-Host ("   Get it: {0}" -f $s.Url) -ForegroundColor Green
    foreach ($line in $s.How) { Write-Host ("     - {0}" -f $line) -ForegroundColor DarkGray }

    $secure = Read-Host -Prompt ("   Paste {0} (blank = skip)" -f $s.Name) -AsSecureString

    if (-not $secure -or $secure.Length -eq 0) {
        Write-Host "   -> skipped" -ForegroundColor DarkYellow
        $skipped += $s.Name
        continue
    }

    # SecureString -> plaintext, streamed to gh over stdin, then zeroed. The value
    # is never written to disk, an argument, or the shell history.
    $bstr  = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        $plain | gh secret set $s.Name --repo $Repo --body-file - | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "gh secret set $($s.Name) failed (exit $LASTEXITCODE)." }
        Write-Host "   -> set on $Repo" -ForegroundColor Green
        $set += $s.Name
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        if (Get-Variable -Name plain -Scope 0 -ErrorAction SilentlyContinue) { $plain = $null }
    }
}

# --- Summary + confirmation ---------------------------------------------------
Write-Host ''
Write-Rule '='
Write-Host (" set:     {0}" -f ($(if ($set)     { $set -join ', ' }     else { '(none)' }))) -ForegroundColor Green
Write-Host (" skipped: {0}" -f ($(if ($skipped) { $skipped -join ', ' } else { '(none)' }))) -ForegroundColor DarkYellow
Write-Rule '='
if ($set) {
    Write-Host ''
    Write-Host " Secrets now on ${Repo}:" -ForegroundColor Cyan
    gh secret list --repo $Repo
}
