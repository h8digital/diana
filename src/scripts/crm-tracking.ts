// Config de rastreamento (/crm/tracking). Lê e grava em /api/crm/tracking.
export {};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const FIELDS: Record<string, string> = {
	ga4_id: 'trk-ga4',
	google_ads_id: 'trk-ads-id',
	google_ads_label: 'trk-ads-label',
	meta_pixel_id: 'trk-pixel',
};

let dirty = false;

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

function markDirty(): void {
	dirty = true;
	setStatus('', 'info');
}

async function load(): Promise<void> {
	const { status, data } = await api('/api/crm/tracking');
	if (status !== 200) {
		setStatus(`Não foi possível carregar: ${data?.error || 'erro'}`, 'error');
		return;
	}

	const t = data.tracking || {};
	$<HTMLInputElement>('trk-enabled').checked = t.tracking_enabled !== '0';
	for (const [key, id] of Object.entries(FIELDS)) {
		$<HTMLInputElement>(id).value = t[key] || '';
	}

	$<HTMLInputElement>('trk-capi').value = '';
	const hint = $<HTMLParagraphElement>('trk-capi-hint');
	if (data.metaCapiTokenSet) {
		hint.textContent = data.metaCapiTokenFromEnv
			? 'Há um token configurado no servidor. Preencha aqui para substituí-lo.'
			: 'Já existe um token salvo. Deixe em branco para mantê-lo.';
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

	for (const id of [...Object.values(FIELDS), 'trk-capi']) {
		$(id).addEventListener('input', markDirty);
	}
	$('trk-enabled').addEventListener('change', markDirty);
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
