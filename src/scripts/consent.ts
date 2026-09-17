export {};

declare global {
	interface Window {
		__loadTrackingScripts?: () => void;
		__loadLeadsterWidget?: () => void;
		__dianaOpenCookiePreferences?: () => void;
	}
}

// Se o formato de consentimento mudar (nova ferramenta, novo texto), suba a
// versão para que visitantes com uma decisão antiga voltem a ver o banner.
const CONSENT_KEY = 'diana_cookie_consent';
const CONSENT_VERSION = 1;

type ConsentValue = 'granted' | 'denied';

interface StoredConsent {
	value: ConsentValue;
	version: number;
	at: string;
}

function readConsent(): StoredConsent | null {
	try {
		const raw = localStorage.getItem(CONSENT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredConsent;
		if (parsed.version !== CONSENT_VERSION || (parsed.value !== 'granted' && parsed.value !== 'denied')) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeConsent(value: ConsentValue): void {
	try {
		localStorage.setItem(CONSENT_KEY, JSON.stringify({ value, version: CONSENT_VERSION, at: new Date().toISOString() } satisfies StoredConsent));
	} catch {
		// localStorage indisponível (modo privado, cookies bloqueados etc.) — a
		// escolha só vale para esta navegação, o banner volta na próxima visita.
	}
}

// Usado pelo formulário de leads e pelo clique no WhatsApp para decidir se o
// evento de conversão pode ser enviado à Meta (Conversions API).
export function hasMarketingConsent(): boolean {
	return readConsent()?.value === 'granted';
}

function loadTrackers(): void {
	window.__loadTrackingScripts?.();
	window.__loadLeadsterWidget?.();
}

function initConsent(): void {
	const banner = document.querySelector<HTMLElement>('[data-cookie-consent]');
	const acceptBtn = document.querySelector<HTMLButtonElement>('[data-cookie-accept]');
	const rejectBtn = document.querySelector<HTMLButtonElement>('[data-cookie-reject]');
	const whatsappFab = document.getElementById('whatsapp-fab');

	// O banner fica sobre o botão flutuante do WhatsApp (mesmo canto da tela) —
	// sobe o botão enquanto o banner estiver visível para não tampá-lo.
	const show = () => {
		banner?.classList.remove('hidden');
		whatsappFab?.classList.add('!bottom-40', 'sm:!bottom-24');
	};
	const hide = () => {
		banner?.classList.add('hidden');
		whatsappFab?.classList.remove('!bottom-40', 'sm:!bottom-24');
	};

	const stored = readConsent();
	if (stored?.value === 'granted') {
		loadTrackers();
	} else if (!stored) {
		show();
	}

	acceptBtn?.addEventListener('click', () => {
		writeConsent('granted');
		loadTrackers();
		hide();
	});
	rejectBtn?.addEventListener('click', () => {
		writeConsent('denied');
		hide();
	});

	// Link "Preferências de cookies" no rodapé — permite revogar/rever a
	// decisão a qualquer momento, como exige a LGPD.
	document.querySelectorAll<HTMLElement>('[data-open-cookie-preferences]').forEach((el) => {
		el.addEventListener('click', show);
	});
	window.__dianaOpenCookiePreferences = show;
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initConsent);
} else {
	initConsent();
}
