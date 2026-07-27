(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Ambient background layer.
  var bg = document.createElement("div");
  bg.className = "wow-bg";
  bg.setAttribute("aria-hidden", "true");
  bg.innerHTML =
    '<span class="orb orb-a"></span>' +
    '<span class="orb orb-b"></span>' +
    '<span class="orb orb-c"></span>' +
    '<span class="orb orb-d"></span>';
  document.body.insertBefore(bg, document.body.firstChild);

  // Scroll reveal: tag top-level content blocks inside each section and fade them in.
  var revealSelectors = [
    ".elementor-widget:not(.elementor-widget-form)",
    ".elementor-icon-list-item",
  ];
  var revealTargets = new Set();
  document.querySelectorAll(revealSelectors.join(",")).forEach(function (el) {
    revealTargets.add(el);
  });
  revealTargets.forEach(function (el) {
    el.classList.add("reveal");
  });

  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealTargets.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealTargets.forEach(function (el) {
      el.classList.add("in-view");
    });
  }

  // Subtle hero parallax.
  if (!reduceMotion) {
    var heroPhoto = document.querySelector(".elementor-element-34dbbf5");
    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var y = window.scrollY || window.pageYOffset;
          if (heroPhoto && y < window.innerHeight * 1.2) {
            heroPhoto.style.transform = "translateY(" + Math.min(y * 0.12, 90) + "px)";
          }
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  // Count-up animation for the stat numbers ("+ 600", "+ 50 milhões", "+ 20 anos").
  var statBlocks = [".elementor-element-0cc2823", ".elementor-element-5a6d896", ".elementor-element-3502792"];
  var counted = false;
  function animateCount(el) {
    var text = el.textContent;
    var match = text.match(/(\d+)/);
    if (!match) return;
    var target = parseInt(match[1], 10);
    var prefix = text.slice(0, match.index);
    var suffix = text.slice(match.index + match[1].length);
    if (reduceMotion) return;
    var duration = 1400;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(target * eased);
      el.textContent = prefix + current + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = prefix + target + suffix;
    }
    requestAnimationFrame(step);
  }

  var statsSection = document.querySelector(".elementor-element-4682808");
  if (statsSection && "IntersectionObserver" in window) {
    var statsIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !counted) {
            counted = true;
            statBlocks.forEach(function (sel) {
              var p = document.querySelector(sel + " p");
              if (p) animateCount(p);
            });
            statsIo.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    statsIo.observe(statsSection);
  }
})();
