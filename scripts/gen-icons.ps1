<#
  gen-icons.ps1 — generate square app-style game icons via the OpenAI Images API.

  The "template" is each game's own card text (name / tags / description), wrapped in a
  shared style so all icons form a cohesive set. One 1024x1024 PNG per game, written to
  games/<slug>/icon.png.

  Usage (from repo root):
    pwsh ./scripts/gen-icons.ps1                 # all games
    pwsh ./scripts/gen-icons.ps1 -Only orbit-slingshot
    pwsh ./scripts/gen-icons.ps1 -Model dall-e-3 # force fallback model

  Reads OPENAI_API_KEY from .env (gitignored). The key is never printed or stored.
#>
[CmdletBinding()]
param(
  [string]$Only,
  [string]$Model = "gpt-image-1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# --- load key from .env (never echoed) ---------------------------------------
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) { throw ".env not found at $envPath — copy .env.example to .env and add your key." }
$apiKey = $null
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$') { $apiKey = $Matches[1].Trim('"').Trim("'") }
}
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "OPENAI_API_KEY is empty in .env — paste your key after the = sign." }

# --- shared icon style (the constant part of the template) -------------------
$style = @"
A polished square mobile game app icon in a premium dark-mode style: a matte, dark charcoal-navy
rounded-square badge (hex 1E1A24) with soft 3D depth and gentle edge highlights, sitting on a near-black
background (hex 121016). The badge itself is DARK — never light, white, grey, or frosted glass.
One bold, centered focal subject made of smooth flat-vector shapes with soft gradients and a warm glow,
standing out brightly against the dark badge. Accent palette: warm coral / red-orange (hex EF6149) as the
hero color, with cool cyan and violet highlights. High contrast, crisp clean edges, generous negative space,
cohesive with a matching set of dark game icons.
Absolutely no text, no letters, no numbers, no words, and no lettering anywhere in the image.
"@

# --- the games (card text = the swappable wording) ---------------------------
$games = @(
  @{ slug="ink-bloom";       name="Ink Bloom";       tags="Steering, Survival"; desc="Steer a growing line of ink, drink glowing motes to grow, and don't cross your own trail." }
  @{ slug="echo-chamber";    name="Echo Chamber";    tags="Timing, Reflex";     desc="An echo ring expands from the centre; catch it the instant it crosses the target band." }
  @{ slug="orbit-slingshot"; name="Orbit Slingshot"; tags="Physics, Gravity";   desc="A probe orbits a planet; a prograde thrust bends its path through targets in deep space without crashing or escaping." }
  @{ slug="polarity";        name="Polarity";        tags="Reflex, Matching";   desc="Charged gates rush in; flip your charge between cyan and magenta to match each one and phase through." }
  @{ slug="ricochet";        name="Ricochet";        tags="Aim, Precision";     desc="Aim and fire one shot that ricochets off the walls, sweeping up every target in its path." }
  @{ slug="skyline";         name="Skyline";         tags="Timing, Precision";  desc="Drop a sliding slab onto a tower; only the overlap stays, so precision keeps it climbing skyward." }
  @{ slug="loft";            name="Loft";            tags="Reflex, Timing";     desc="Keep glowing orbs aloft; tap a falling orb to bat it back up before it drops." }
)
if ($Only) { $games = $games | Where-Object { $_.slug -eq $Only }; if (-not $games) { throw "No game with slug '$Only'." } }

$headers = @{ Authorization = "Bearer $apiKey" }

function Invoke-IconGen($model, $prompt) {
  if ($model -eq "dall-e-3") {
    $body = @{ model="dall-e-3"; prompt=$prompt; size="1024x1024"; quality="hd"; response_format="b64_json"; n=1 }
  } else {
    $body = @{ model=$model; prompt=$prompt; size="1024x1024"; quality="high"; n=1 }
  }
  $json = $body | ConvertTo-Json -Depth 5
  $resp = Invoke-RestMethod -Method Post -Uri "https://api.openai.com/v1/images/generations" `
            -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 180
  return $resp.data[0].b64_json
}

foreach ($g in $games) {
  $prompt = "$style`nSubject: depict the essence of this arcade game as abstract iconography — game: $($g.name); themes: $($g.tags); $($g.desc)"
  $out = Join-Path $root ("games/{0}/icon.png" -f $g.slug)
  Write-Host ("→ {0} ({1}) ..." -f $g.name, $g.slug) -NoNewline
  try {
    $b64 = Invoke-IconGen $Model $prompt
  } catch {
    Write-Host " [$Model failed: $($_.Exception.Message); trying dall-e-3]" -NoNewline
    $b64 = Invoke-IconGen "dall-e-3" $prompt
  }
  [IO.File]::WriteAllBytes($out, [Convert]::FromBase64String($b64))
  Write-Host (" saved {0} ({1:N0} KB)" -f $out, ((Get-Item $out).Length/1KB))
}
Write-Host "Done."
