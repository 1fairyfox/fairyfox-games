// changelog-page.js — render the full changelog list (ES module) from the shared
// data source, newest first, each entry written for a player. Progressive: a
// <noscript> fallback on the page points at the collection when JS is off.
import { relDate, fullDate } from "./reldate.js";
import { CHANGELOG } from "./changelog-data.js";

const list = document.getElementById("cl-list");
const KIND = { new: "New game", grow: "Update", site: "Site" };

if (list && Array.isArray(CHANGELOG)) {
  CHANGELOG.forEach((e) => {
    const item = document.createElement("article");
    item.className = "cl-item";

    const meta = document.createElement("div");
    meta.className = "cl-meta";
    const date = document.createElement("span");
    date.className = "cl-date";
    date.textContent = relDate(e.date);
    date.title = fullDate(e.date);
    const kind = document.createElement("span");
    kind.className = "cl-kind " + (e.kind || "grow");
    kind.textContent = KIND[e.kind] || "Update";
    meta.appendChild(date);
    meta.appendChild(kind);

    const body = document.createElement("div");
    body.className = "cl-body";
    const h = document.createElement("h3");
    h.className = "cl-game";
    if (e.slug) {
      const a = document.createElement("a");
      a.href = "./games/" + e.slug + "/";
      a.textContent = e.game;
      h.appendChild(a);
    } else {
      h.textContent = e.game;
    }
    const p = document.createElement("p");
    p.className = "cl-text";
    p.textContent = e.text;
    body.appendChild(h);
    body.appendChild(p);

    item.appendChild(meta);
    item.appendChild(body);
    list.appendChild(item);
  });
}
