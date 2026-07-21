#!/usr/bin/env node
// check-links.mjs — doc-drift gate (repo-hygiene standard). Zero dependencies.
//
// Walks every tracked *.md (minus generated/vendored trees) and fails on any RELATIVE
// link whose target file doesn't exist. Wired into `npm test` + CI so a rename/move/
// removal that leaves a dangling link turns the build red.
//
//   node scripts/check-links.mjs      → exit 1 (and a list) on any broken link
//
// Adapted from hub/templates/check-links.mjs: `notes/reference/` is added to SKIP because it
// is a VENDORED mirror of the hub standards — those files carry relative links to sibling hub
// paths (../templates/…, ../authorizations.yml, docs-site/…) that deliberately don't exist in
// this repo. The hub remains the source of truth for them; re-vendor on a fairyfox check.
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)_site\//,
  /(^|\/)vendor\//,
  /(^|\/)assets\/references\//,   // git-ignored read-only hub clone
  /(^|\/)notes\/reference\//,     // vendored hub-standards mirror (cross-repo links by design)
];
const files = execSync("git ls-files *.md **/*.md", { encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => !SKIP.some((re) => re.test(f)));

const LINK = /\[[^\]]*\]\(([^)]+)\)/g;   // [text](target)
let broken = 0;

for (const file of files) {
  const text = execSync(`git show HEAD:"${file}"`, { encoding: "utf8" });
  for (const m of text.matchAll(LINK)) {
    let target = m[1].trim().split(/\s+/)[0];          // drop optional "title"
    if (/^(https?:|mailto:|tel:|#|data:)/i.test(target)) continue;  // external / same-page
    target = target.replace(/[#?].*$/, "");            // strip fragment/query
    if (!target) continue;
    let path = target.startsWith("/") ? join(".", target) : resolve(dirname(file), target);
    if (existsSync(path)) continue;
    if (existsSync(path + ".md") || (existsSync(path) && statSync(path).isDirectory())) continue;
    console.error(`BROKEN  ${file}  ->  ${m[1]}`);
    broken++;
  }
}

if (broken) { console.error(`\n${broken} broken link(s).`); process.exit(1); }
console.log(`check-links: ${files.length} files OK`);
