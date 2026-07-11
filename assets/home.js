// home.js — landing-page enhancements (ES module). Orders the game grid by most
// recently updated (with a quiet "Updated <date>" line per card) and fills the
// "Recently updated" strip from the shared changelog data. Progressive: with JS
// off, the cards still render (in source order, without the date line).
import { relDate, fullDate } from "./reldate.js";
import { CHANGELOG } from "./changelog-data.js";

const grid = document.getElementById("game-grid");
if (grid) {
  const cards = Array.prototype.slice.call(grid.querySelectorAll(".game-card"));
  cards.forEach((c) => {
    const iso = c.getAttribute("data-updated");
    if (!iso) return;
    const line = document.createElement("div");
    line.className = "card-updated";
    line.textContent = "Updated " + relDate(iso);
    line.title = fullDate(iso);            // exact date on hover
    const play = c.querySelector(".play");
    if (play) c.insertBefore(line, play); else c.appendChild(line);
  });
  // Stable sort: newest data-updated first; equal dates keep their source order.
  cards.slice().sort((a, b) => {
    const av = a.getAttribute("data-updated") || "", bv = b.getAttribute("data-updated") || "";
    return av < bv ? 1 : (av > bv ? -1 : 0);
  }).forEach((c) => grid.appendChild(c));
}

// Recently-updated strip — the latest few game changelog entries, newest first.
// Site-wide notes (no `slug`) live on the full changelog page, not here.
const section = document.getElementById("recent");
const list = document.getElementById("recent-list");
const data = (CHANGELOG || []).filter((e) => e && e.slug);
if (section && list && data.length) {
  data.slice(0, 4).forEach((e) => {
    const item = document.createElement("div");
    item.className = "recent-item";
    const d = document.createElement("span");
    d.className = "r-date";
    d.textContent = relDate(e.date);
    d.title = fullDate(e.date);
    const t = document.createElement("span");
    t.className = "r-text";
    const b = document.createElement("b");
    b.textContent = e.game + " — ";
    t.appendChild(b);
    t.appendChild(document.createTextNode(e.text));
    item.appendChild(d);
    item.appendChild(t);
    list.appendChild(item);
  });
  section.hidden = false;
}

// Tag filter — filter the grid in place by mechanic. Progressive enhancement: the bar
// is hidden until this wires it, so a JS-off visitor simply sees every game.
const filterBar = document.getElementById("game-filter");
if (grid && filterBar) {
  const fcards = Array.prototype.slice.call(grid.querySelectorAll(".game-card"));
  const fbtns = Array.prototype.slice.call(filterBar.querySelectorAll("[data-filter]"));
  filterBar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    const tag = btn.getAttribute("data-filter");
    fcards.forEach((c) => {
      const tags = (c.getAttribute("data-tags") || "").split(/\s+/);
      c.hidden = !(tag === "*" || tags.indexOf(tag) !== -1);
    });
    fbtns.forEach((b) => b.classList.toggle("is-on", b === btn));
  });
  filterBar.hidden = false;
}

// Per-card "?" description disclosures — native <details>, so they toggle fine with JS off.
// This adds the expected niceties: only one open at a time, and close on an outside click or
// Escape (returning focus to the button that was open).
const infos = Array.prototype.slice.call(document.querySelectorAll(".game-card .card-info"));
if (infos.length) {
  infos.forEach((d) => {
    d.addEventListener("toggle", () => {
      if (d.open) infos.forEach((o) => { if (o !== d) o.open = false; });
    });
  });
  document.addEventListener("click", (e) => {
    infos.forEach((d) => { if (d.open && !d.contains(e.target)) d.open = false; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    infos.forEach((d) => {
      if (!d.open) return;
      d.open = false;
      const s = d.querySelector("summary");
      if (s) s.focus();
    });
  });
}
