const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const SESSION_COOKIE = "crm_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function json(data, status) {
	return new Response(JSON.stringify(data), {
		status: status || 200,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});
}

// ---------- crypto / lead-tracking helpers ----------

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

async function sendMetaConversion(env, { eventName, eventId, name, phone, objective, fbp, fbc, pageUrl, request, testEventCode }) {
	if (!env.TOKEN_PIXEL_META || !env.PIXEL_FACEBOOK) return { ok: false, error: "not_configured" };

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
				event_name: eventName || "Lead",
				event_time: Math.floor(Date.now() / 1000),
				event_id: eventId || crypto.randomUUID(),
				action_source: "website",
				event_source_url: pageUrl || request.headers.get("Referer") || undefined,
				user_data: userData,
				custom_data: objective ? { content_name: objective } : undefined,
			},
		],
		test_event_code: testEventCode || undefined,
	};

	try {
		const metaResponse = await fetch(
			`https://graph.facebook.com/v21.0/${env.PIXEL_FACEBOOK}/events?access_token=${env.TOKEN_PIXEL_META}`,
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
		);
		return { ok: metaResponse.ok, meta: await metaResponse.json().catch(() => ({})) };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}

async function handleLead(request, env) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	const { eventId, name, phone, objective, fbp, fbc, pageUrl, testEventCode } = body || {};
	if (!name || !phone) return json({ ok: false, error: "missing_fields" }, 400);

	if (env.DB) {
		try {
			const firstStage = await env.DB.prepare("SELECT id FROM stages ORDER BY position ASC LIMIT 1").first();
			if (firstStage) {
				await env.DB.prepare(
					"INSERT INTO leads (name, phone, objective, stage_id, page_url, event_id) VALUES (?, ?, ?, ?, ?, ?)"
				)
					.bind(name, phone, objective || null, firstStage.id, pageUrl || null, eventId || null)
					.run();
			}
		} catch (err) {
			console.error("D1 insert failed", err);
		}
	}

	const metaResult = await sendMetaConversion(env, { eventName: "Lead", eventId, name, phone, objective, fbp, fbc, pageUrl, request, testEventCode });
	return json({ ok: true, meta: metaResult });
}

async function handleContact(request, env) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	const { eventId, fbp, fbc, pageUrl, source, testEventCode } = body || {};
	const metaResult = await sendMetaConversion(env, {
		eventName: "Contact",
		eventId,
		objective: source,
		fbp,
		fbc,
		pageUrl,
		request,
		testEventCode,
	});
	return json({ ok: true, meta: metaResult });
}

// ---------- auth ----------

function base64UrlEncode(bytes) {
	let str = typeof bytes === "string" ? bytes : String.fromCharCode(...new Uint8Array(bytes));
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
	const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
	return atob(padded);
}

async function hmacSign(data, secret) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return base64UrlEncode(sig);
}

function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return result === 0;
}

async function createSessionToken(username, secret) {
	const payload = JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS });
	const payloadB64 = base64UrlEncode(payload);
	const sig = await hmacSign(payloadB64, secret);
	return `${payloadB64}.${sig}`;
}

async function verifySessionToken(token, secret) {
	if (!token) return null;
	const [payloadB64, sig] = token.split(".");
	if (!payloadB64 || !sig) return null;
	const expectedSig = await hmacSign(payloadB64, secret);
	if (!timingSafeEqual(sig, expectedSig)) return null;
	try {
		const payload = JSON.parse(base64UrlDecode(payloadB64));
		if (!payload.exp || payload.exp < Date.now()) return null;
		return payload;
	} catch {
		return null;
	}
}

function parseCookies(request) {
	const header = request.headers.get("Cookie") || "";
	const cookies = {};
	header.split(";").forEach((part) => {
		const idx = part.indexOf("=");
		if (idx === -1) return;
		cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
	});
	return cookies;
}

async function getSession(request, env) {
	if (!env.CRM_SESSION_SECRET) return null;
	const cookies = parseCookies(request);
	return verifySessionToken(cookies[SESSION_COOKIE], env.CRM_SESSION_SECRET);
}

function sessionCookieHeader(token, maxAgeSeconds) {
	return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function handleLogin(request, env) {
	if (!env.CRM_USERNAME || !env.CRM_PASSWORD || !env.CRM_SESSION_SECRET) {
		return json({ ok: false, error: "not_configured" }, 500);
	}
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}
	const { username, password } = body || {};
	const validUser = typeof username === "string" && timingSafeEqual(username, env.CRM_USERNAME);
	const validPass = typeof password === "string" && timingSafeEqual(password, env.CRM_PASSWORD);
	if (!validUser || !validPass) return json({ ok: false, error: "invalid_credentials" }, 401);

	const token = await createSessionToken(username, env.CRM_SESSION_SECRET);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Set-Cookie": sessionCookieHeader(token, SESSION_TTL_MS / 1000),
			...CORS_HEADERS,
		},
	});
}

function handleLogout() {
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
			...CORS_HEADERS,
		},
	});
}

function requireAuth(handler) {
	return async (request, env, ctx) => {
		const session = await getSession(request, env);
		if (!session) return json({ ok: false, error: "unauthorized" }, 401);
		return handler(request, env, ctx, session);
	};
}

// ---------- CRM data routes ----------

async function handleListLeads(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const { results } = await env.DB.prepare(
		"SELECT id, name, phone, objective, stage_id, notes, value, page_url, created_at, updated_at FROM leads ORDER BY created_at DESC"
	).all();
	return json({ ok: true, leads: results });
}

async function handleUpdateLead(request, env, ctx, session, id) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	const fields = [];
	const values = [];
	if (body.stage_id !== undefined) {
		fields.push("stage_id = ?");
		values.push(body.stage_id);
	}
	if (body.notes !== undefined) {
		fields.push("notes = ?");
		values.push(body.notes);
	}
	if (body.value !== undefined) {
		const numericValue = Number(body.value);
		if (!Number.isFinite(numericValue) || numericValue < 0) return json({ ok: false, error: "invalid_value" }, 400);
		fields.push("value = ?");
		values.push(numericValue);
	}
	if (fields.length === 0) return json({ ok: false, error: "no_fields" }, 400);

	fields.push("updated_at = datetime('now')");
	values.push(id);

	await env.DB.prepare(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
	return json({ ok: true });
}

async function handleDeleteLead(request, env, ctx, session, id) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	await env.DB.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
	return json({ ok: true });
}

async function handleListStages(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const { results } = await env.DB.prepare("SELECT id, name, position FROM stages ORDER BY position ASC").all();
	return json({ ok: true, stages: results });
}

async function handleCreateStage(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}
	const name = (body?.name || "").trim();
	if (!name) return json({ ok: false, error: "missing_name" }, 400);

	const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS maxPos FROM stages").first();
	const position = (maxRow?.maxPos || 0) + 1;
	const result = await env.DB.prepare("INSERT INTO stages (name, position) VALUES (?, ?)").bind(name, position).run();
	return json({ ok: true, id: result.meta.last_row_id, position });
}

async function handleUpdateStage(request, env, ctx, session, id) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}
	const fields = [];
	const values = [];
	if (body.name !== undefined) {
		fields.push("name = ?");
		values.push(body.name.trim());
	}
	if (body.position !== undefined) {
		fields.push("position = ?");
		values.push(body.position);
	}
	if (fields.length === 0) return json({ ok: false, error: "no_fields" }, 400);
	values.push(id);
	await env.DB.prepare(`UPDATE stages SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
	return json({ ok: true });
}

async function handleDeleteStage(request, env, ctx, session, id) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const leadCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE stage_id = ?").bind(id).first();
	if ((leadCount?.n || 0) > 0) {
		return json({ ok: false, error: "stage_not_empty" }, 409);
	}
	const stageCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM stages").first();
	if ((stageCount?.n || 0) <= 1) {
		return json({ ok: false, error: "last_stage" }, 409);
	}
	await env.DB.prepare("DELETE FROM stages WHERE id = ?").bind(id).run();
	return json({ ok: true });
}

async function handleReorderStages(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}
	const order = Array.isArray(body?.order) ? body.order : null;
	if (!order) return json({ ok: false, error: "invalid_order" }, 400);

	const statements = order.map((item, idx) =>
		env.DB.prepare("UPDATE stages SET position = ? WHERE id = ?").bind(idx + 1, item.id)
	);
	await env.DB.batch(statements);
	return json({ ok: true });
}

// ---------- router ----------

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const { pathname } = url;
		const method = request.method;

		if (method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
		}

		if (pathname === "/api/lead" && method === "POST") {
			return handleLead(request, env);
		}

		if (pathname === "/api/contact" && method === "POST") {
			return handleContact(request, env);
		}

		if (pathname === "/api/crm/login" && method === "POST") {
			return handleLogin(request, env);
		}
		if (pathname === "/api/crm/logout" && method === "POST") {
			return handleLogout();
		}
		if (pathname === "/api/crm/me" && method === "GET") {
			const session = await getSession(request, env);
			return session ? json({ ok: true, username: session.u }) : json({ ok: false }, 401);
		}

		if (pathname === "/api/crm/leads" && method === "GET") {
			return requireAuth(handleListLeads)(request, env);
		}
		const leadMatch = pathname.match(/^\/api\/crm\/leads\/(\d+)$/);
		if (leadMatch && method === "PATCH") {
			return requireAuth((req, e, ctx, session) => handleUpdateLead(req, e, ctx, session, Number(leadMatch[1])))(request, env);
		}
		if (leadMatch && method === "DELETE") {
			return requireAuth((req, e, ctx, session) => handleDeleteLead(req, e, ctx, session, Number(leadMatch[1])))(request, env);
		}

		if (pathname === "/api/crm/stages" && method === "GET") {
			return requireAuth(handleListStages)(request, env);
		}
		if (pathname === "/api/crm/stages" && method === "POST") {
			return requireAuth(handleCreateStage)(request, env);
		}
		if (pathname === "/api/crm/stages/reorder" && method === "PATCH") {
			return requireAuth(handleReorderStages)(request, env);
		}
		const stageMatch = pathname.match(/^\/api\/crm\/stages\/(\d+)$/);
		if (stageMatch && method === "PATCH") {
			return requireAuth((req, e, ctx, session) => handleUpdateStage(req, e, ctx, session, Number(stageMatch[1])))(request, env);
		}
		if (stageMatch && method === "DELETE") {
			return requireAuth((req, e, ctx, session) => handleDeleteStage(req, e, ctx, session, Number(stageMatch[1])))(request, env);
		}

		return env.ASSETS.fetch(request);
	},
};
