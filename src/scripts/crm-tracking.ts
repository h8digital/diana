// Config de rastreamento (/crm/tracking). Lê e grava em /api/crm/tracking.
export {};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $$ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const FIELDS: Record<string, string> = {
	ga4_id: 'trk-ga4',
	google_ads_id: 'trk-ads-id',
	google_ads_label: 'trk-ads-label',
	meta_pixel_id: 'trk-pixel',
};

let dirty = false;
// origem de cada campo quando a página carregou: "panel" | "server" | ""
let sources: Record<string, string> = {};

async function api<T = any>(path: string, options: RequestInit = {}): Promise<{ status: number; data: T }> {
	const res = await fetch(path, {
		...options,
		headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
	});
	const data = await res.json().catch(() => ({}));
	return { status: res.status, data };
}

function setStatus(message: string, kind: 'ok' | 'error' | 'info'): void {
	const el = $<HTMLSpanElement>('trk-status');
	el.textContent = message;
	el.classList.toggle('hidden', !message);
	el.classList.remove('text-red-600', 'text-emerald-600', 'text-navy-soft');
	el.classList.add(kind === 'ok' ? 'text-emerald-600' : kind === 'error' ? 'text-red-600' : 'text-navy-soft');
}

// Mostra/oculta o selo "✓" ao lado do rótulo de um campo.
function refreshCheck(key: string): void {
	const badge = $$<HTMLSpanElement>(`[data-check="${key}"]`);
	if (!badge) return;
	const label = badge.querySelector('[data-check-label]') as HTMLElement | null;

	let show = false;
	let text = '';
	if (key === 'meta_capi_token') {
		// não há input de leitura para o token; usa só o estado do servidor + o que foi digitado agora
		const typed = $<HTMLInputElement>('trk-capi').value.trim() !== '';
		if (typed) { show = true; text = 'novo — não salvo'; }
		else if (sources[key] === 'panel') { show = true; text = 'salvo'; }
		else if (sources[key] === 'server') { show = true; text = 'no servidor'; }
	} else {
		const value = $<HTMLInputElement>(FIELDS[key]).value.trim();
		if (value) {
			show = true;
			text = sources[key] === 'server' ? 'no servidor' : sources[key] === 'panel' ? 'salvo' : 'não salvo';
		}
	}

	if (label) label.textContent = text;
	badge.classList.toggle('hidden', !show);
	badge.classList.toggle('flex', show);
}

function refreshAllChecks(): void {
	[...Object.keys(FIELDS), 'meta_capi_token'].forEach(refreshCheck);
}

function markDirty(key?: string): void {
	dirty = true;
	setStatus('', 'info');
	if (key) refreshCheck(key);
}

async function load(): Promise<void> {
	const { status, data } = await api('/api/crm/tracking');
	if (status !== 200) {
		setStatus(`Não foi possível carregar: ${data?.error || 'erro'}`, 'error');
		return;
	}

	const t = data.tracking || {};
	const eff = data.effective || {};
	sources = data.sources || {};

	$<HTMLInputElement>('trk-enabled').checked = t.tracking_enabled !== '0';
	// preenche com o valor salvo no painel ou, na falta, com o valor efetivo
	// (que pode vir da configuração do servidor) — assim a Diana vê o que está no ar.
	for (const [key, id] of Object.entries(FIELDS)) {
		$<HTMLInputElement>(id).value = t[key] || eff[key] || '';
	}

	$<HTMLInputElement>('trk-capi').value = '';
	const hint = $<HTMLParagraphElement>('trk-capi-hint');
	if (sources.meta_capi_token === 'server') {
		hint.textContent = 'Há um token configurado no servidor. Preencha aqui só para substituí-lo.';
		hint.classList.remove('hidden');
	} else if (sources.meta_capi_token === 'panel') {
		hint.textContent = 'Já existe um token salvo. Deixe em branco para mantê-lo.';
		hint.classList.remove('hidden');
	} else {
		hint.classList.add('hidden');
	}

	const warning = $<HTMLParagraphElement>('trk-warning');
	if (data.serverSecretMissing) {
		warning.textContent = 'O servidor está sem CRM_SESSION_SECRET — o token da API de Conversões não pode ser guardado. Fale com o desenvolvedor.';
		warning.classList.remove('hidden');
	} else {
		warning.classList.add('hidden');
	}

	refreshAllChecks();
	dirty = false;
}

async function save(): Promise<void> {
	const btn = $<HTMLButtonElement>('trk-save');
	btn.disabled = true;
	setStatus('Salvando…', 'info');

	const payload: Record<string, unknown> = {
		tracking_enabled: $<HTMLInputElement>('trk-enabled').checked,
	};
	for (const [key, id] of Object.entries(FIELDS)) {
		payload[key] = $<HTMLInputElement>(id).value.trim();
	}
	const capi = $<HTMLInputElement>('trk-capi').value.trim();
	if (capi) payload.meta_capi_token = capi;

	const { status, data } = await api('/api/crm/tracking', { method: 'PATCH', body: JSON.stringify(payload) });
	btn.disabled = false;

	if (status === 200) {
		dirty = false;
		setStatus('Salvo! O site aplica em até 1 minuto.', 'ok');
		void load();
	} else {
		setStatus(`Não foi possível salvar: ${data?.error || 'erro desconhecido'}`, 'error');
	}
}

async function init(): Promise<void> {
	const { status } = await api('/api/crm/me');
	if (status !== 200) {
		$('trk-auth').classList.remove('hidden');
		return;
	}
	$('trk-main').classList.remove('hidden');

	for (const [key, id] of Object.entries(FIELDS)) {
		$(id).addEventListener('input', () => markDirty(key));
	}
	$('trk-capi').addEventListener('input', () => markDirty('meta_capi_token'));
	$('trk-enabled').addEventListener('change', () => markDirty());
	$('trk-save').addEventListener('click', () => void save());
	window.addEventListener('beforeunload', (e) => {
		if (dirty) e.preventDefault();
	});

	await load();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	void init();
}
