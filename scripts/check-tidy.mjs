#!/usr/bin/env node
// check-tidy.mjs — uncommitted-file guard (repo-hygiene standard). Zero dependencies.
//
// Fails on any UNTRACKED, non-ignored file (`git status --porcelain` "??" entries) — the
// signature of "someone wrote a doc/report and never committed it". Gitignored machine junk
// never shows as "??", so it doesn't trip. Run BEFORE finishing a session (not in CI — a
// fresh checkout has none), e.g. `npm run tidy`.
//
//   node scripts/check-tidy.mjs       → exit 1 (and a list) on any stranded file
import { execSync } from "node:child_process";

const untracked = execSync("git status --porcelain", { encoding: "utf8" })
  .split("\n")
  .filter((l) => l.startsWith("?? "))
  .map((l) => l.slice(3));

if (untracked.length) {
  console.error("Untracked, non-ignored files (commit them or add to .gitignore):");
  for (const f of untracked) console.error("  " + f);
  console.error(`\n${untracked.length} stranded file(s).`);
  process.exit(1);
}
console.log("check-tidy: working tree clean of untracked files");
