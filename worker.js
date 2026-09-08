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
	const settings = await getSettings(env);
	const tracking = resolveTracking(env, settings);
	const pixelId = tracking.metaPixel;
	const accessToken = await resolveMetaCapiToken(env, settings);
	if (!tracking.enabled || !pixelId || !accessToken) return { ok: false, error: "not_configured" };

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
			`https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
		);
		return { ok: metaResponse.ok, meta: await metaResponse.json().catch(() => ({})) };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}

// ---------- settings ----------

const DEFAULT_SETTINGS = {
	lead_email_enabled: "0",
	lead_email_to: "",
	resend_from: "",
};

// Editáveis pelo painel. A API key da Resend (resend_api_key) é tratada à parte:
// guardada criptografada (resend_api_key_enc) e nunca devolvida ao navegador.
const EDITABLE_SETTINGS = ["lead_email_enabled", "lead_email_to", "resend_from"];

const HIDDEN_SETTINGS = ["resend_api_key_enc"];

async function getSettings(env) {
	const settings = { ...DEFAULT_SETTINGS };
	if (!env.DB) return settings;
	try {
		const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
		for (const row of results || []) settings[row.key] = row.value;
	} catch (err) {
		console.error("settings read failed", err);
	}
	return settings;
}

function escapeHtml(value) {
	return String(value ?? "").replace(
		/[&<>"']/g,
		(ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
	);
}

function splitAddresses(raw) {
	return String(raw || "")
		.split(/[,;\s]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

// ---------- cores do site (tema configurável no CRM) ----------

// Cada cor da marca: chave em `settings` (theme_*), a CSS custom property que o
// Tailwind usa (--color-*, ver src/styles/global.css) e o valor padrão. Um valor
// não definido / inválido cai no padrão do build.
const THEME_COLORS = [
	{ key: "theme_navy", cssVar: "--color-navy", default: "#0e183c" },
	{ key: "theme_navy_light", cssVar: "--color-navy-light", default: "#1c2a54" },
	{ key: "theme_navy_soft", cssVar: "--color-navy-soft", default: "#4a5578" },
	{ key: "theme_gold", cssVar: "--color-gold", default: "#ffdd5a" },
	{ key: "theme_gold_deep", cssVar: "--color-gold-deep", default: "#e8b923" },
	{ key: "theme_paper", cssVar: "--color-paper", default: "#f8f9fc" },
	{ key: "theme_mist", cssVar: "--color-mist", default: "#eef1f8" },
];

function isHexColor(value) {
	return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function buildThemeCss(settings) {
	const decls = THEME_COLORS.filter((c) => isHexColor(settings[c.key]))
		.map((c) => `${c.cssVar}:${settings[c.key].trim().toLowerCase()}`)
		.join(";");
	// `:root:root` (especificidade 0,2,0) para vencer o `:root` do @theme do
	// Tailwind independentemente da ordem dos <link> no <head>.
	return decls ? `:root:root{${decls}}` : "";
}

async function handleThemeCss(env) {
	const settings = await getSettings(env);
	const css = buildThemeCss(settings) || "/* tema padrão */";
	return new Response(css, {
		headers: {
			"Content-Type": "text/css; charset=utf-8",
			"Cache-Control": "public, max-age=60",
			...CORS_HEADERS,
		},
	});
}

async function handleGetTheme(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const settings = await getSettings(env);
	const theme = {};
	const defaults = {};
	for (const c of THEME_COLORS) {
		theme[c.key] = isHexColor(settings[c.key]) ? settings[c.key].trim().toLowerCase() : "";
		defaults[c.key] = c.default;
	}
	return json({ ok: true, theme, defaults });
}

async function handleUpdateTheme(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	const updates = [];
	for (const c of THEME_COLORS) {
		if (body[c.key] === undefined) continue;
		const raw = String(body[c.key] ?? "").trim();
		if (raw === "") {
			updates.push([c.key, ""]); // vazio = voltar ao padrão do build
		} else if (isHexColor(raw)) {
			updates.push([c.key, raw.toLowerCase()]);
		} else {
			return json({ ok: false, error: `Cor inválida em ${c.key}: "${raw}" (use #rrggbb).` }, 400);
		}
	}

	if (updates.length === 0) return json({ ok: false, error: "no_fields" }, 400);

	const r = await upsertSettings(env, updates);
	return r.ok ? json({ ok: true }) : json({ ok: false, error: r.error }, 500);
}

// Grava pares [chave, valor] na tabela `settings` (upsert em lote).
async function upsertSettings(env, pairs) {
	const statements = pairs.map(([key, value]) =>
		env.DB.prepare(
			"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		).bind(key, value)
	);
	try {
		await env.DB.batch(statements);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: `Falha ao gravar no banco — ${String((err && err.message) || err)}` };
	}
}

// ---------- rastreamento (Meta Pixel/CAPI, Google Analytics/Ads) ----------

// Campos de texto simples editáveis no CRM (o token da CAPI é tratado à parte,
// criptografado em meta_capi_token_enc).
const TRACKING_KEYS = ["tracking_enabled", "ga4_id", "google_ads_id", "google_ads_label", "meta_pixel_id"];

const TRACKING_VALIDATORS = {
	ga4_id: /^G-[A-Z0-9]{4,20}$/i,
	google_ads_id: /^AW-\d{6,15}$/,
	google_ads_label: /^[A-Za-z0-9_-]{3,80}$/,
	meta_pixel_id: /^\d{6,20}$/,
};

// Escapa para uma string JS: só passam caracteres seguros de ID (validados na
// gravação); o resto vira \xNN, neutralizando aspas e </script>.
function jsStrSafe(value) {
	return String(value ?? "").replace(/[^A-Za-z0-9._/-]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));
}

// Config de rastreamento efetiva: valor salvo no CRM tem prioridade; senão a var
// do Worker (definida no deploy) mantém o comportamento atual.
function resolveTracking(env, settings) {
	let adsId = (settings.google_ads_id || env.GOOGLE_ADS_ID || "").trim();
	let adsLabel = (settings.google_ads_label || env.GOOGLE_ADS_LABEL || "").trim();
	// aceita "AW-123456/AbCdEf" colado inteiro no campo de ID
	if (!adsLabel && adsId.includes("/")) {
		const parts = adsId.split("/");
		adsId = parts[0];
		adsLabel = parts[1] || "";
	}
	return {
		enabled: (settings.tracking_enabled ?? "1") !== "0",
		ga4: (settings.ga4_id || env.GA4_ID || "").trim(),
		adsId,
		adsLabel,
		metaPixel: (settings.meta_pixel_id || env.PIXEL_FACEBOOK || "").trim(),
	};
}

// HTML injetado no <head> das páginas públicas (substitui o marcador
// <meta name="x-diana-track">). Mantém o mesmo formato do BaseLayout antigo:
// carrega o gtag.js, inicializa GA4/Ads e o Meta Pixel, e publica
// window.__TRACKING_IDS__ para os scripts do site (tracking.ts / effects.ts).
function buildTrackingHead(t) {
	if (!t.enabled) return "";
	const out = [];
	const loaderId = t.ga4 || t.adsId;
	if (loaderId) {
		const gadsTarget = t.adsId && t.adsLabel ? `${t.adsId}/${t.adsLabel}` : t.adsId;
		out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderId)}"></script>`);
		out.push(
			"<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;" +
				"gtag('js',new Date());" +
				(t.ga4 ? `gtag('config','${jsStrSafe(t.ga4)}');` : "") +
				(t.adsId ? `gtag('config','${jsStrSafe(t.adsId)}');` : "") +
				`window.__TRACKING_IDS__={ga4:'${jsStrSafe(t.ga4)}',gads:'${jsStrSafe(gadsTarget)}',fbPixel:'${jsStrSafe(t.metaPixel)}'};</script>`
		);
	}
	if (t.metaPixel) {
		out.push(
			"<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?" +
				"n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;" +
				"n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];" +
				"s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');" +
				`fbq('init','${jsStrSafe(t.metaPixel)}');fbq('track','PageView');</script>` +
				`<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${encodeURIComponent(t.metaPixel)}&ev=PageView&noscript=1"/></noscript>`
		);
	}
	return out.join("");
}

// Cache curto por isolate: a config muda raramente e não vale um SELECT por página.
let _trackingCache = null;

async function getTrackingCached(env) {
	if (_trackingCache && Date.now() - _trackingCache.at < 60000) return _trackingCache.value;
	const value = resolveTracking(env, await getSettings(env));
	_trackingCache = { at: Date.now(), value };
	return value;
}

async function resolveMetaCapiToken(env, settings) {
	if (settings.meta_capi_token_enc && env.CRM_SESSION_SECRET) {
		try {
			return await decryptSecret(settings.meta_capi_token_enc, env.CRM_SESSION_SECRET);
		} catch {
			/* cai para a var do Worker */
		}
	}
	return env.TOKEN_PIXEL_META || "";
}

async function handleGetTracking(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const s = await getSettings(env);
	const resolved = resolveTracking(env, s);

	// "panel" = salvo no CRM; "server" = só na var do Worker; "" = não configurado.
	const src = (dbValue, effectiveValue) => (dbValue ? "panel" : effectiveValue ? "server" : "");

	return json({
		ok: true,
		tracking: {
			tracking_enabled: (s.tracking_enabled ?? "1") !== "0" ? "1" : "0",
			ga4_id: s.ga4_id || "",
			google_ads_id: s.google_ads_id || "",
			google_ads_label: s.google_ads_label || "",
			meta_pixel_id: s.meta_pixel_id || "",
		},
		effective: {
			ga4_id: resolved.ga4,
			google_ads_id: resolved.adsId,
			google_ads_label: resolved.adsLabel,
			meta_pixel_id: resolved.metaPixel,
		},
		sources: {
			ga4_id: src(s.ga4_id, resolved.ga4),
			google_ads_id: src(s.google_ads_id, resolved.adsId),
			google_ads_label: src(s.google_ads_label, resolved.adsLabel),
			meta_pixel_id: src(s.meta_pixel_id, resolved.metaPixel),
			meta_capi_token: s.meta_capi_token_enc ? "panel" : env.TOKEN_PIXEL_META ? "server" : "",
		},
		serverSecretMissing: !env.CRM_SESSION_SECRET,
	});
}

async function handleUpdateTracking(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	const updates = [];
	for (const key of TRACKING_KEYS) {
		if (body[key] === undefined) continue;
		if (key === "tracking_enabled") {
			updates.push([key, body[key] === true || body[key] === "1" || body[key] === 1 ? "1" : "0"]);
			continue;
		}
		const raw = String(body[key] ?? "").trim();
		if (raw === "") {
			updates.push([key, ""]);
			continue;
		}
		const rule = TRACKING_VALIDATORS[key];
		if (rule && !rule.test(raw)) {
			return json({ ok: false, error: `Valor inválido em ${key}: "${raw}".` }, 400);
		}
		updates.push([key, raw]);
	}

	if (typeof body.meta_capi_token === "string" && body.meta_capi_token.trim() !== "") {
		if (!env.CRM_SESSION_SECRET) {
			return json({ ok: false, error: "O servidor está sem CRM_SESSION_SECRET — o token da API de Conversões não pode ser guardado." }, 500);
		}
		try {
			updates.push(["meta_capi_token_enc", await encryptSecret(body.meta_capi_token.trim(), env.CRM_SESSION_SECRET)]);
		} catch (err) {
			return json({ ok: false, error: `Falha ao criptografar o token — ${String((err && err.message) || err)}` }, 500);
		}
	}

	if (updates.length === 0) return json({ ok: false, error: "no_fields" }, 400);

	const r = await upsertSettings(env, updates);
	if (!r.ok) return json({ ok: false, error: r.error }, 500);
	_trackingCache = null;
	return json({ ok: true });
}

// Injeta os scripts de rastreamento nas respostas HTML públicas, substituindo o
// marcador que o BaseLayout coloca quando enableTracking está ligado.
async function injectTracking(res, env) {
	const ct = res.headers.get("content-type") || "";
	if (!ct.includes("text/html")) return res;

	let head;
	try {
		head = buildTrackingHead(await getTrackingCached(env));
	} catch (err) {
		console.error("tracking resolve failed", err);
		return res;
	}

	// A resposta passa a depender da config de rastreamento (não só do arquivo),
	// então tira os validadores para o navegador não reaproveitar um HTML com IDs
	// antigos via 304.
	const headers = new Headers(res.headers);
	headers.delete("ETag");
	headers.delete("Last-Modified");
	const rewritten = new Response(res.body, { status: res.status, statusText: res.statusText, headers });

	return new HTMLRewriter()
		.on('meta[name="x-diana-track"]', {
			element(el) {
				if (head) el.replace(head, { html: true });
				else el.remove();
			},
		})
		.transform(rewritten);
}

// ---------- secret encryption (AES-GCM, chave derivada de CRM_SESSION_SECRET) ----------

async function deriveAesKey(secret) {
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt: new TextEncoder().encode("diana-crm/secret/v1"), iterations: 100000, hash: "SHA-256" },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

async function encryptSecret(plain, secret) {
	const key = await deriveAesKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
	const combined = new Uint8Array(iv.length + ct.length);
	combined.set(iv, 0);
	combined.set(ct, iv.length);
	return base64UrlEncode(combined);
}

async function decryptSecret(payload, secret) {
	const key = await deriveAesKey(secret);
	const raw = Uint8Array.from(base64UrlDecode(payload), (c) => c.charCodeAt(0));
	const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
	return new TextDecoder().decode(pt);
}

// ---------- e-mail (Resend HTTP API) ----------

function withTimeout(promise, ms, label) {
	return Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: tempo limite excedido (${ms}ms)`)), ms)),
	]);
}

async function sendMailViaResend(config, mail) {
	let res;
	try {
		res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: config.from,
				to: mail.to,
				subject: mail.subject,
				html: mail.html,
				text: mail.text,
			}),
		});
	} catch (err) {
		throw new Error(`não foi possível contatar a API da Resend — ${String((err && err.message) || err)}`);
	}

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const detail = data && (data.message || data.error || data.name);
		throw new Error(`a Resend recusou o envio (HTTP ${res.status})${detail ? ` — ${detail}` : ""}`);
	}
	return data;
}

// ---------- lead e-mail notifications ----------

// A API key vem primeiro da secret RESEND_API_KEY do Worker; se não houver,
// cai para a key salva (criptografada) no painel. O remetente vem do painel
// (resend_from) ou da var RESEND_FROM.
async function resolveResendConfig(env, settings) {
	const from = settings.resend_from || env.RESEND_FROM;
	if (!from) {
		return { ok: false, error: "Remetente da Resend não configurado (campo Remetente no painel ou a var RESEND_FROM)." };
	}

	if (env.RESEND_API_KEY) {
		return { ok: true, config: { apiKey: env.RESEND_API_KEY, from } };
	}

	if (!settings.resend_api_key_enc) {
		return { ok: false, error: "API key da Resend não configurada (secret RESEND_API_KEY no Worker ou campo API key no painel)." };
	}
	if (!env.CRM_SESSION_SECRET) return { ok: false, error: "CRM_SESSION_SECRET ausente no servidor." };
	let apiKey;
	try {
		apiKey = await decryptSecret(settings.resend_api_key_enc, env.CRM_SESSION_SECRET);
	} catch {
		return { ok: false, error: "Não foi possível descriptografar a API key da Resend salva. Salve a API key novamente." };
	}
	return { ok: true, config: { apiKey, from } };
}

function buildLeadEmailContent(lead) {
	const { name, phone, email, objective, pageUrl, source } = lead;
	const phoneDigits = normalizeBrPhone(phone);
	const waLink = phoneDigits ? `https://api.whatsapp.com/send?phone=${phoneDigits}` : "";
	const receivedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

	const fields = [
		["Nome", name || "—", escapeHtml(name || "—")],
		[
			"Telefone",
			phone || "—",
			phone ? `${escapeHtml(phone)}${waLink ? ` &nbsp;·&nbsp; <a href="${waLink}">abrir WhatsApp</a>` : ""}` : "—",
		],
		["E-mail", email || "—", email ? escapeHtml(email) : "—"],
		["Objetivo", objective || "—", escapeHtml(objective || "—")],
		["Origem", source || "Formulário do site", escapeHtml(source || "Formulário do site")],
		["Página", pageUrl || "—", pageUrl ? `<a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a>` : "—"],
		["Recebido em", `${receivedAt} (Brasília)`, `${escapeHtml(receivedAt)} (horário de Brasília)`],
	];

	const html = `
		<div style="font-family:Arial,Helvetica,sans-serif;color:#1a2b4a;max-width:520px">
			<h2 style="margin:0 0 4px">Novo lead pelo site</h2>
			<p style="margin:0 0 16px;color:#5a6b8a">Um contato acabou de se cadastrar.</p>
			<table style="border-collapse:collapse;width:100%">
				${fields
					.map(
						([label, , valueHtml]) =>
							`<tr><td style="padding:8px 12px;border:1px solid #e2e6ef;background:#f6f8fc;font-weight:bold;white-space:nowrap">${label}</td><td style="padding:8px 12px;border:1px solid #e2e6ef">${valueHtml}</td></tr>`
					)
					.join("")}
			</table>
		</div>`;

	const text = `Novo lead pelo site\n\n${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}`;

	return { subject: `Novo lead pelo site: ${name || "sem nome"}`, html, text };
}

async function sendLeadEmail(env, settings, lead) {
	const to = splitAddresses(settings.lead_email_to);
	if (to.length === 0) return { ok: false, error: "sem destinatário configurado" };

	const resolved = await resolveResendConfig(env, settings);
	if (!resolved.ok) return resolved;

	try {
		await withTimeout(sendMailViaResend(resolved.config, { to, ...buildLeadEmailContent(lead) }), 15000, "envio Resend");
		return { ok: true };
	} catch (err) {
		console.error("Resend send failed", err);
		return { ok: false, error: String((err && err.message) || err) };
	}
}

function notifyLeadByEmail(env, ctx, lead) {
	const task = (async () => {
		try {
			const settings = await getSettings(env);
			if (settings.lead_email_enabled !== "1") return;
			await sendLeadEmail(env, settings, lead);
		} catch (err) {
			console.error("lead email notification failed", err);
		}
	})();
	if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(task);
	else return task;
}

async function handleLead(request, env, ctx) {
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

	notifyLeadByEmail(env, ctx, { name, phone, objective, pageUrl, source: "Formulário do site" });

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

async function handleLeadsterWebhook(request, env, ctx, url) {
	const token = url.searchParams.get("token");
	if (!env.LEADSTER_WEBHOOK_TOKEN || token !== env.LEADSTER_WEBHOOK_TOKEN) {
		return json({ ok: false, error: "unauthorized" }, 401);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	// Leadster posts a flat { name, phone, email, url } shape when the webhook's
	// field mapping is configured; otherwise a nested { lead: {...} } shape.
	const lead = body.lead || body || {};
	const name = lead.name || lead.nome || "";
	const phone = lead.phone || lead.telefone || "";
	const email = lead.email || "";
	const pageUrl = body.url || lead.url || undefined;

	if (!name && !phone && !email) {
		return json({ ok: false, error: "missing_fields" }, 400);
	}

	const leadName = name || email || "Lead via Leadster";
	const eventId = crypto.randomUUID();

	if (env.DB) {
		try {
			const firstStage = await env.DB.prepare("SELECT id FROM stages ORDER BY position ASC LIMIT 1").first();
			if (firstStage) {
				await env.DB.prepare(
					"INSERT INTO leads (name, phone, objective, stage_id, notes, page_url, event_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
				)
					.bind(leadName, phone || "", "leadster", firstStage.id, email ? `Email: ${email}` : null, pageUrl || null, eventId)
					.run();
			}
		} catch (err) {
			console.error("D1 insert failed (leadster)", err);
		}
	}

	notifyLeadByEmail(env, ctx, { name: leadName, phone, email, objective: "leadster", pageUrl, source: "Leadster" });

	const metaResult = await sendMetaConversion(env, {
		eventName: "Lead",
		eventId,
		name: leadName,
		phone,
		objective: "leadster",
		pageUrl,
		request,
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

// ---------- settings routes ----------

async function handleGetSettings(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const all = await getSettings(env);
	const settings = { ...all };
	for (const key of HIDDEN_SETTINGS) delete settings[key];
	return json({
		ok: true,
		settings,
		resendKeySet: Boolean(all.resend_api_key_enc) || Boolean(env.RESEND_API_KEY),
		resendKeyFromEnv: Boolean(env.RESEND_API_KEY),
		serverSecretMissing: !env.CRM_SESSION_SECRET,
	});
}

async function handleUpdateSettings(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "invalid_json" }, 400);
	}

	const updates = [];
	for (const key of EDITABLE_SETTINGS) {
		if (body[key] === undefined) continue;
		let value = body[key];
		if (key === "lead_email_enabled") value = value === true || value === "1" || value === 1 ? "1" : "0";
		else value = String(value).trim();
		updates.push([key, value]);
	}

	// A API key só é gravada quando um valor novo e não-vazio é enviado; caso
	// contrário mantém a que já está salva.
	if (typeof body.resend_api_key === "string" && body.resend_api_key.trim() !== "") {
		if (!env.CRM_SESSION_SECRET) {
			return json({ ok: false, error: "O servidor está sem CRM_SESSION_SECRET — a API key não pode ser guardada. Fale com o desenvolvedor." }, 500);
		}
		try {
			updates.push(["resend_api_key_enc", await encryptSecret(body.resend_api_key.trim(), env.CRM_SESSION_SECRET)]);
		} catch (err) {
			return json({ ok: false, error: `Falha ao criptografar a API key — ${String((err && err.message) || err)}` }, 500);
		}
	}

	if (updates.length === 0) return json({ ok: false, error: "no_fields" }, 400);

	const statements = updates.map(([key, value]) =>
		env.DB.prepare(
			"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		).bind(key, value)
	);
	try {
		await env.DB.batch(statements);
	} catch (err) {
		return json({ ok: false, error: `Falha ao gravar no banco — ${String((err && err.message) || err)}` }, 500);
	}
	return json({ ok: true });
}

async function handleTestEmail(request, env) {
	if (!env.DB) return json({ ok: false, error: "db_not_configured" }, 500);
	const settings = await getSettings(env);
	const to = splitAddresses(settings.lead_email_to);
	if (to.length === 0) return json({ ok: false, error: "Informe ao menos um e-mail de destino antes de testar." }, 400);

	const resolved = await resolveResendConfig(env, settings);
	if (!resolved.ok) return json({ ok: false, error: resolved.error }, 400);

	const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
	try {
		await withTimeout(
			sendMailViaResend(resolved.config, {
				to,
				subject: "Teste de configuração — CRM Diana Dutra",
				text: `E-mail de teste enviado pelo painel do CRM em ${now}. Se você recebeu, o envio pela Resend está funcionando.`,
				html: `<p>E-mail de teste enviado pelo painel do CRM em <strong>${escapeHtml(now)}</strong>.</p><p>Se você recebeu, o envio pela Resend está funcionando. ✅</p>`,
			}),
			15000,
			"envio Resend"
		);
		return json({ ok: true });
	} catch (err) {
		return json(
			{
				ok: false,
				error: String((err && err.message) || err),
			},
			502
		);
	}
}

// ---------- router ----------

export default {
	async fetch(request, env, ctx) {
		try {
			return await route(request, env, ctx);
		} catch (err) {
			console.error("unhandled worker error", err);
			const url = new URL(request.url);
			if (url.pathname.startsWith("/api/")) {
				return json({ ok: false, error: `Erro interno — ${String((err && err.message) || err)}` }, 500);
			}
			throw err;
		}
	},
};

async function route(request, env, ctx) {
	const url = new URL(request.url);
	const { pathname } = url;
	const method = request.method;

	if (method === "OPTIONS") {
		return new Response(null, { headers: CORS_HEADERS });
	}

	if (pathname === "/api/lead" && method === "POST") {
		return handleLead(request, env, ctx);
	}

	if (pathname === "/api/contact" && method === "POST") {
		return handleContact(request, env);
	}

	if (pathname === "/api/site/theme.css" && method === "GET") {
		return handleThemeCss(env);
	}

	if (pathname === "/api/leadster-webhook" && method === "POST") {
		return handleLeadsterWebhook(request, env, ctx, url);
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

	if (pathname === "/api/crm/settings" && method === "GET") {
		return requireAuth(handleGetSettings)(request, env);
	}
	if (pathname === "/api/crm/settings" && method === "PATCH") {
		return requireAuth(handleUpdateSettings)(request, env);
	}
	if (pathname === "/api/crm/settings/test" && method === "POST") {
		return requireAuth(handleTestEmail)(request, env);
	}

	if (pathname === "/api/crm/theme" && method === "GET") {
		return requireAuth(handleGetTheme)(request, env);
	}
	if (pathname === "/api/crm/theme" && method === "PATCH") {
		return requireAuth(handleUpdateTheme)(request, env);
	}

	if (pathname === "/api/crm/tracking" && method === "GET") {
		return requireAuth(handleGetTracking)(request, env);
	}
	if (pathname === "/api/crm/tracking" && method === "PATCH") {
		return requireAuth(handleUpdateTracking)(request, env);
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

	// Em navegações (Accept: text/html) tiramos os headers condicionais para o
	// asset server devolver o HTML completo e o Worker reinjetar o rastreamento
	// atual — um 304 traria IDs antigos do cache do navegador. Sub-recursos
	// (JS/CSS/imagens) seguem com revalidação normal.
	let assetReq = request;
	if ((request.headers.get("Accept") || "").includes("text/html")) {
		assetReq = new Request(request);
		assetReq.headers.delete("If-None-Match");
		assetReq.headers.delete("If-Modified-Since");
	}
	return injectTracking(await env.ASSETS.fetch(assetReq), env);
}
