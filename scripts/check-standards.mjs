#!/usr/bin/env node
// check-standards.mjs — machine-check the mesh invariants that ARE grep/API-checkable,
// so they stop relying on a human noticing (repo-hygiene / checklists-are-contracts).
// Zero dependencies; runtime-agnostic (bare `node`, any stack). Wire into CI + the local
// gate. Adapt the globs/among the checks to your repo; each check is independently skippable.
//
//   node scripts/check-standards.mjs        → exit 1 (+ a list) on any violation
//
// What it catches (all cheap, all previously slipped past review):
//   C1  A docs template marks a PRIMARY-nav item OTHER THAN "Projects" active on a
//       sub-project page (docs-site 05: active = Projects, always). Fails on an active
//       Docs/Home/Updates/About in the shared header partial.
//   C2  VERSION != the newest git tag on main (versioning: VERSION == newest main tag).
//       Informational off `main` (dev is legitimately ahead); enforced on `main`.
//   C3  (optional) The subnav block is missing the right-aligned `.subnav-repo` anchor
//       or contains a raw github.com link in the CENTRE zone (docs-site 05).
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

let fail = 0;
const bad = (msg) => { console.error(`VIOLATION  ${msg}`); fail++; };
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// ---- C1: active primary-nav item on a sub-project docs page must be "Projects" --------
// Point these at wherever your build emits/holds the shared header (a template, an include,
// or a built page). Any <a ... class="...active...">Home|Docs|Updates|About</a> is wrong.
const HEADER_CANDIDATES = [
  "docs-theme/chrome/header.html", "docs-theme/pages/_shell.html",
  "docs/ff-header.html", "_includes/header.html", "assets/docs-theme/header.html",
];
for (const p of HEADER_CANDIDATES) {
  const html = read(p);
  if (!html) continue;
  const activeAnchor = /<a\b[^>]*class="[^"]*\bactive\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
  for (const m of html.matchAll(activeAnchor)) {
    const label = m[1].trim();
    if (/^(Home|Docs|Updates|About)$/i.test(label))
      bad(`${p}: primary nav marks "${label}" active — a sub-project page must mark "Projects" (docs-site 05).`);
  }
}

// ---- C2: VERSION == newest tag on main --------------------------------------------------
const version = (read("VERSION") || "").split("\n").map((l) => l.trim())
  .find((l) => l && !l.startsWith("#"));
if (version) {
  let branch = "";
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim(); } catch {}
  let newestTag = "";
  try { newestTag = execSync("git describe --tags --abbrev=0 origin/main 2>/dev/null || git describe --tags --abbrev=0", { encoding: "utf8" }).trim().replace(/^v/, ""); } catch {}
  if (newestTag && version !== newestTag) {
    const msg = `VERSION (${version}) != newest main tag (${newestTag}).`;
    if (branch === "main") bad(msg);                 // enforced on main
    else console.log(`note: ${msg} (ok on ${branch || "a work branch"} — dev may be ahead)`);
  }
}

// ---- C3 (optional): subnav shape --------------------------------------------------------
// Uncomment + point at your emitted subnav to assert the right-aligned repo anchor exists
// and no raw github link sits in the centre zone.
// const subnav = read("docs-theme/chrome/subnav.html");
// if (subnav) {
//   if (!/class="[^"]*subnav-repo/.test(subnav)) bad("subnav: missing right-aligned .subnav-repo anchor.");
// }

if (fail) { console.error(`\n${fail} standards violation(s).`); process.exit(1); }
console.log("check-standards: OK");
