import { getCookie, uuid } from './tracking';

export {};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupReveal(): void {
	const targets = document.querySelectorAll<HTMLElement>('.reveal');
	if (!targets.length) return;

	if (reduceMotion || !('IntersectionObserver' in window)) {
		targets.forEach((el) => el.classList.add('in-view'));
		return;
	}

	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('in-view');
					io.unobserve(entry.target);
				}
			});
		},
		{ threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
	);
	targets.forEach((el) => io.observe(el));
}

function animateCount(el: HTMLElement): void {
	const text = el.textContent ?? '';
	const match = text.match(/(\d+)/);
	if (!match) return;

	const target = parseInt(match[1], 10);
	const prefix = text.slice(0, match.index);
	const suffix = text.slice((match.index ?? 0) + match[1].length);

	if (reduceMotion) return;

	const duration = 1400;
	let start: number | null = null;

	function step(ts: number): void {
		if (start === null) start = ts;
		const progress = Math.min((ts - start) / duration, 1);
		const eased = 1 - Math.pow(1 - progress, 3);
		const current = Math.round(target * eased);
		el.textContent = `${prefix}${current}${suffix}`;
		if (progress < 1) requestAnimationFrame(step);
		else el.textContent = `${prefix}${target}${suffix}`;
	}
	requestAnimationFrame(step);
}

function setupCountUp(): void {
	const section = document.querySelector<HTMLElement>('#informacoes');
	const numbers = document.querySelectorAll<HTMLElement>('[data-count]');
	if (!section || !numbers.length || !('IntersectionObserver' in window)) return;

	let done = false;
	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting && !done) {
					done = true;
					numbers.forEach(animateCount);
					io.disconnect();
				}
			});
		},
		{ threshold: 0.4 }
	);
	io.observe(section);
}

function setupHeroParallax(): void {
	if (reduceMotion) return;
	const photo = document.querySelector<HTMLElement>('[data-parallax]');
	if (!photo) return;

	let ticking = false;
	window.addEventListener(
		'scroll',
		() => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				const y = window.scrollY || window.pageYOffset;
				if (y < window.innerHeight * 1.2) {
					photo.style.transform = `translateY(${Math.min(y * 0.08, 60)}px)`;
				}
				ticking = false;
			});
		},
		{ passive: true }
	);
}

function setupWhatsAppContactTracking(): void {
	const firedForElement = new WeakSet<Element>();

	document.addEventListener(
		'click',
		(event) => {
			const target = event.target as Element | null;
			const link = target?.closest<HTMLAnchorElement>('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com"]');
			if (!link) return;

			// A single click can bubble through nested elements only once per link, but
			// guard anyway in case something re-dispatches synthetic click events.
			if (firedForElement.has(link)) return;
			firedForElement.add(link);

			const eventId = uuid();

			if (typeof window.gtag === 'function') {
				window.gtag('event', 'contact', { method: 'whatsapp', event_id: eventId });
			}
			if (typeof window.fbq === 'function') {
				window.fbq('track', 'Contact', {}, { eventID: eventId });
			}

			fetch('/api/contact', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				keepalive: true,
				body: JSON.stringify({
					eventId,
					source: 'whatsapp',
					fbp: getCookie('_fbp'),
					fbc: getCookie('_fbc'),
					pageUrl: window.location.href,
				}),
			}).catch(() => {});
		},
		true
	);
}

function setupTimeOnPageTracking(): void {
	const thresholds = [15, 30, 60];

	thresholds.forEach((seconds) => {
		window.setTimeout(() => {
			if (typeof window.fbq === 'function') {
				window.fbq('trackCustom', 'TimeOnPage', { seconds });
			}
			if (typeof window.gtag === 'function') {
				window.gtag('event', 'time_on_page', { seconds });
			}
		}, seconds * 1000);
	});
}

function init(): void {
	setupReveal();
	setupCountUp();
	setupHeroParallax();
	setupWhatsAppContactTracking();
	setupTimeOnPageTracking();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
