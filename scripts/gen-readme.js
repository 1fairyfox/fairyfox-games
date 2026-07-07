#!/usr/bin/env node
// Regenerate the "## The games" table in README.md from the _games/ collection — the
// single source of truth for game metadata. Run after adding or editing a game:
//
//   node scripts/gen-readme.js
//
// Zero-dependency ES module: parses the small, controlled front matter directly (no YAML
// lib). The table is written between the <!-- GAMES:START ... --> / <!-- GAMES:END -->
// markers in README.md; everything outside the markers is left untouched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const gamesDir = path.join(root, "_games");
const readmePath = path.join(root, "README.md");
const START = "<!-- GAMES:START";
const END = "<!-- GAMES:END -->";

function parseFrontMatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!mm) continue;
    let [, key, val] = mm;
    val = val.trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      out[key] = val.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  }
  return out;
}

const games = fs
  .readdirSync(gamesDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => parseFrontMatter(fs.readFileSync(path.join(gamesDir, f), "utf8")))
  .filter((g) => g.slug && g.title)
  // newest-updated first; ties broken by title (matches the landing order).
  .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.title.localeCompare(b.title)));

const rows = games
  .map((g) => `| **${g.title}** | ${g.tagline} | [\`games/${g.slug}/\`](games/${g.slug}/) |`)
  .join("\n");
const table = `| Game | What you do | Folder |\n|------|-------------|--------|\n${rows}`;

let readme = fs.readFileSync(readmePath, "utf8");
const block = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!block.test(readme)) {
  console.error(`README markers not found — expected "${START} … ${END}".`);
  process.exit(1);
}
const startLine = readme.match(new RegExp(`${START}[^\\n]*`))[0]; // keep the start comment verbatim
readme = readme.replace(block, `${startLine}\n\n${table}\n\n${END}`);
fs.writeFileSync(readmePath, readme);
console.log(`README game table synced: ${games.length} games.`);
