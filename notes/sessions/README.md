# Session Logs

The running history — **what changed each working session and why.** One file per
day in month folders: `sessions/YYYY-MM/YYYY-MM-DD.md`.

`../status.md` holds the *current* state; these hold the *story*.

## The system

Append to *today's* file (create it + the `YYYY-MM/` folder if it's the first
entry of the day). Newest entry on top. Skeleton:

```markdown
# YYYY-MM-DD — Session Log

## <short title> — <one-line outcome>

What changed, root cause if a bug, files touched, verification result, follow-up.
Plain English, no diff noise.
```

Cross-link to `../reference/` for reusable lessons and `../status.md` for current
health. The changelog (`../version.md`) is per *commit*; this is per *day*.
