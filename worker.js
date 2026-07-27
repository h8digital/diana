const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function onlyDigits(value) {
  return (value || "").replace(/\D/g, "");
}

function normalizeBrPhone(raw) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : "55" + digits;
}

async function handleLead(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!env.TOKEN_PIXEL_META || !env.PIXEL_FACEBOOK) {
    // Tracking not configured for this environment (e.g. local/dry run) - accept silently.
    return json({ ok: false, error: "not_configured" });
  }

  const { eventId, name, phone, objective, fbp, fbc, pageUrl } = body || {};

  const phoneDigits = normalizeBrPhone(phone);
  const [firstName, ...rest] = (name || "").trim().split(/\s+/).filter(Boolean);
  const lastName = rest.join(" ");

  const userData = {
    client_ip_address: request.headers.get("CF-Connecting-IP") || undefined,
    client_user_agent: request.headers.get("User-Agent") || undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
  };
  if (phoneDigits) userData.ph = [await sha256Hex(phoneDigits)];
  if (firstName) userData.fn = [await sha256Hex(firstName)];
  if (lastName) userData.ln = [await sha256Hex(lastName)];

  const payload = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId || crypto.randomUUID(),
        action_source: "website",
        event_source_url: pageUrl || request.headers.get("Referer") || undefined,
        user_data: userData,
        custom_data: objective ? { content_name: objective } : undefined,
      },
    ],
  };

  try {
    const metaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${env.PIXEL_FACEBOOK}/events?access_token=${env.TOKEN_PIXEL_META}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const metaResult = await metaResponse.json().catch(() => ({}));
    return json({ ok: metaResponse.ok, meta: metaResult });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/lead") {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleLead(request, env);
      }
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    return env.ASSETS.fetch(request);
  },
};
