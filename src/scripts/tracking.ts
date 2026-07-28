export {};

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
		fbq: ((...args: unknown[]) => void) & { queue?: unknown[] };
		__TRACKING_IDS__?: { ga4: string; gads: string; fbPixel: string };
	}
}

export function fireLeadTracking(eventId: string, objective: string): void {
	const ids = window.__TRACKING_IDS__;

	if (typeof window.gtag === 'function' && ids?.ga4) {
		window.gtag('event', 'generate_lead', {
			event_id: eventId,
			currency: 'BRL',
			content_name: objective || 'consorcio',
		});
	}

	if (typeof window.gtag === 'function' && ids?.gads) {
		window.gtag('event', 'conversion', {
			send_to: ids.gads,
			event_id: eventId,
		});
	}

	if (typeof window.fbq === 'function') {
		window.fbq('track', 'Lead', { content_name: objective || 'consorcio' }, { eventID: eventId });
	}
}

export function getCookie(name: string): string {
	const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
	return match ? decodeURIComponent(match[1]) : '';
}

export function uuid(): string {
	if (window.crypto?.randomUUID) return window.crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}
