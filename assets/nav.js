// nav.js — site-header navigation behaviour (progressive enhancement).
// The header works with JS off; this only adds the mobile hamburger toggle and
// closes the open menu on Escape. Shared by every docs page. The games nav is a
// flat row (no dropdowns), so this stays small and focused.
(function () {
  "use strict";
  var header = document.querySelector(".site-header");
  if (!header) return;
  var toggle = header.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("nav-open")) {
      header.classList.remove("nav-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }
  });
})();
