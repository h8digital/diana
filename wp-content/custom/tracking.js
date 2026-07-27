(function () {
  "use strict";

  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function fireLead(form) {
    const ids = window.__TRACKING_IDS__ || {};
    const eventId = uuid();

    const nameField = form.querySelector('[name="form_fields[name]"]');
    const phoneField = form.querySelector('[name="form_fields[field_a956f75]"]');
    const objectiveField = form.querySelector('[name="form_fields[field_991710f]"]');

    const name = nameField ? nameField.value.trim() : "";
    const phone = phoneField ? phoneField.value.trim() : "";
    const objective = objectiveField ? objectiveField.value.trim() : "";

    // Google Analytics 4
    if (typeof gtag === "function" && ids.ga4) {
      gtag("event", "generate_lead", {
        event_id: eventId,
        currency: "BRL",
        content_name: objective || "consorcio",
      });
    }

    // Google Ads conversion (account-level; add a conversion label here once one exists for a precise conversion action)
    if (typeof gtag === "function" && ids.gads) {
      gtag("event", "conversion", {
        send_to: ids.gads,
        event_id: eventId,
      });
    }

    // Meta Pixel (client-side)
    if (typeof fbq === "function") {
      fbq("track", "Lead", { content_name: objective || "consorcio" }, { eventID: eventId });
    }

    // Meta Conversions API (server-side, same-origin, fire-and-forget)
    try {
      fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          eventId: eventId,
          name: name,
          phone: phone,
          objective: objective,
          fbp: getCookie("_fbp"),
          fbc: getCookie("_fbc"),
          pageUrl: window.location.href,
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  function init() {
    const form = document.querySelector("#formulario form.elementor-form");
    if (!form) return;

    form.addEventListener("submit", function () {
      if (typeof form.checkValidity === "function" && !form.checkValidity()) return;
      fireLead(form);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
