// reldate.js — relative-date helper (ES module, no build step, dependency-free).
//
// relDate(iso) → a friendly "2 days ago" / "today" string; fullDate(iso) → the exact
// "Jul 5, 2026" for a tooltip. Pure and progressive: pages render a plain date with JS
// off and the importing module upgrades it. Dates are ISO calendar days (YYYY-MM-DD),
// compared in the visitor's local time — no network, no tracking, nothing stored.

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(iso) {
  const p = (iso || "").split("-");
  if (p.length !== 3) return null;
  const d = new Date(+p[0], (+p[1]) - 1, +p[2]);
  return isNaN(d.getTime()) ? null : d;
}

/** Exact, human date for a tooltip: "Jul 5, 2026". */
export function fullDate(iso) {
  const d = parse(iso);
  return d ? MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() : "";
}

/** Friendly relative date: today / yesterday / N days ago / last week / N weeks ago / … */
export function relDate(iso) {
  const d = parse(iso);
  if (!d) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  if (days < 14) return "last week";
  if (days < 30) return Math.floor(days / 7) + " weeks ago";
  if (days < 60) return "last month";
  if (days < 365) return Math.floor(days / 30) + " months ago";
  const y = Math.floor(days / 365);
  return y === 1 ? "a year ago" : y + " years ago";
}
