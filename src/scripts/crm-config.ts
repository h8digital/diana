// Editor de cores do site (/crm/config). Lê e grava em /api/crm/theme; a prévia
// é um iframe do site real onde injetamos as variáveis CSS ao vivo.

interface ThemeColor {
	key: string;
	cssVar: string;
}

const THEME: ThemeColor[] = [
	{ key: 'theme_navy', cssVar: '--color-navy' },
	{ key: 'theme_navy_light', cssVar: '--color-navy-light' },
	{ key: 'theme_navy_soft', cssVar: '--color-navy-soft' },
	{ key: 'theme_gold', cssVar: '--color-gold' },
	{ key: 'theme_gold_deep', cssVar: '--color-gold-deep' },
	{ key: 'theme_paper', cssVar: '--color-paper' },
	{ key: 'theme_mist', cssVar: '--color-mist' },
];

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

let defaults: Record<string, string> = {};
// "" = usar o padrão do build; "#rrggbb" = cor personalizada
const custom: Record<string, string> = {};
let dirty = false;

function isHex(v: string): boolean {
	return HEX_RE.test(v.trim());
}

function normalizeHex(v: string): string {
	let s = v.trim().toLowerCase();
	if (s && !s.startsWith('#')) s = '#' + s;
	return s;
}

function toPickerHex(v: string): string {
	const s = normalizeHex(v);
	if (/^#[0-9a-f]{3}$/.test(s)) {
		return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
	}
	return /^#[0-9a-f]{6}$/.test(s) ? s : '#000000';
}

function effective(key: string): string {
	return custom[key] || defaults[key] || '#000000';
}

async function api<T = any>(path: string, options: RequestInit = {}): Promise<{ status: number; data: T }> {
	const res = await fetch(path, {
		...options,
		headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
	});
	const data = await res.json().catch(() => ({}));
	return { status: res.status, data };
}

// ---------- prévia ----------

const iframe = () => $<HTMLIFrameElement>('#cfg-preview');
let previewTimer = 0;

function injectPreview(): void {
	const doc = iframe().contentDocument;
	if (!doc || !doc.head) return;
	let style = doc.getElementById('__cfg_preview__') as HTMLStyleElement | null;
	if (!style) {
		style = doc.createElement('style');
		style.id = '__cfg_preview__';
		doc.head.appendChild(style);
	}
	const decls = THEME.map((t) => `${t.cssVar}:${effective(t.key)}`).join(';');
	// especificidade acima do :root:root servido por /api/site/theme.css
	style.textContent = `:root:root:root{${decls}}`;
}

function schedulePreview(): void {
	window.clearTimeout(previewTimer);
	previewTimer = window.setTimeout(injectPreview, 80);
}

// ---------- estado dos campos ----------

function syncRow(key: string): void {
	const picker = $<HTMLInputElement>(`[data-picker="${key}"]`);
	const hex = $<HTMLInputElement>(`[data-hex="${key}"]`);
	const reset = $<HTMLButtonElement>(`[data-reset="${key}"]`);
	const value = effective(key);
	picker.value = toPickerHex(value);
	if (document.activeElement !== hex) hex.value = value;
	reset.classList.toggle('hidden', !custom[key]);
}

function setColor(key: string, value: string): void {
	custom[key] = value; // "" ou "#hex" já normalizado/validado
	dirty = true;
	setStatus('', 'info');
	syncRow(key);
	schedulePreview();
}

function bindRow(key: string): void {
	const picker = $<HTMLInputElement>(`[data-picker="${key}"]`);
	const hex = $<HTMLInputElement>(`[data-hex="${key}"]`);
	const reset = $<HTMLButtonElement>(`[data-reset="${key}"]`);

	picker.addEventListener('input', () => setColor(key, picker.value.toLowerCase()));

	hex.addEventListener('input', () => {
		const v = normalizeHex(hex.value);
		if (isHex(v)) setColor(key, v);
	});
	hex.addEventListener('blur', () => {
		const v = normalizeHex(hex.value);
		if (v === '' ) {
			setColor(key, '');
		} else if (isHex(v)) {
			setColor(key, v);
		} else {
			syncRow(key); // valor inválido: descarta o que foi digitado
		}
	});

	reset.addEventListener('click', () => setColor(key, ''));
}

function setStatus(message: string, kind: 'ok' | 'error' | 'info'): void {
	const el = $<HTMLSpanElement>('#cfg-status');
	el.textContent = message;
	el.classList.toggle('hidden', !message);
	el.classList.remove('text-red-600', 'text-emerald-600', 'text-navy-soft');
	el.classList.add(kind === 'ok' ? 'text-emerald-600' : kind === 'error' ? 'text-red-600' : 'text-navy-soft');
}

// ---------- carregar / salvar ----------

async function load(): Promise<void> {
	const { status, data } = await api('/api/crm/theme');
	if (status !== 200) {
		setStatus(`Não foi possível carregar: ${data?.error || 'erro'}`, 'error');
		return;
	}
	defaults = data.defaults || {};
	for (const t of THEME) {
		custom[t.key] = isHex(data.theme?.[t.key] || '') ? String(data.theme[t.key]).toLowerCase() : '';
		bindRow(t.key);
		syncRow(t.key);
	}
	dirty = false;
	injectPreview();
}

async function save(): Promise<void> {
	const btn = $<HTMLButtonElement>('#cfg-save');
	btn.disabled = true;
	setStatus('Salvando…', 'info');

	const payload: Record<string, string> = {};
	for (const t of THEME) payload[t.key] = custom[t.key] || '';

	const { status, data } = await api('/api/crm/theme', { method: 'PATCH', body: JSON.stringify(payload) });
	btn.disabled = false;

	if (status === 200) {
		dirty = false;
		setStatus('Salvo! O site público atualiza em até 1 minuto.', 'ok');
		// recarrega a prévia para refletir o CSS já servido pelo Worker
		iframe().contentWindow?.location.reload();
	} else {
		setStatus(`Não foi possível salvar: ${data?.error || 'erro desconhecido'}`, 'error');
	}
}

async function resetAll(): Promise<void> {
	if (!window.confirm('Restaurar todas as cores para o padrão do site?')) return;
	for (const t of THEME) {
		custom[t.key] = '';
		syncRow(t.key);
	}
	dirty = true;
	injectPreview();
	await save();
}

// ---------- boot ----------

async function init(): Promise<void> {
	const { status } = await api('/api/crm/me');
	if (status !== 200) {
		$('#cfg-auth').classList.remove('hidden');
		return;
	}
	$('#cfg-main').classList.remove('hidden');

	iframe().addEventListener('load', injectPreview);
	$('#cfg-save').addEventListener('click', () => void save());
	$('#cfg-reset-all').addEventListener('click', () => void resetAll());
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
