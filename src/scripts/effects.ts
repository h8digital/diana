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

function setupHeroDotSpotlight(): void {
	if (reduceMotion) return;
	const hero = document.querySelector<HTMLElement>('#inicio');
	const layer = hero?.querySelector<HTMLElement>('[data-dot-spotlight]');
	if (!hero || !layer) return;

	let rafId = 0;
	let x = 0;
	let y = 0;

	function apply(): void {
		layer!.style.setProperty('--spot-x', `${x}px`);
		layer!.style.setProperty('--spot-y', `${y}px`);
		rafId = 0;
	}

	hero.addEventListener(
		'pointermove',
		(e) => {
			const rect = hero.getBoundingClientRect();
			x = e.clientX - rect.left;
			y = e.clientY - rect.top;
			layer!.style.opacity = '1';
			if (!rafId) rafId = requestAnimationFrame(apply);
		},
		{ passive: true }
	);

	hero.addEventListener(
		'pointerleave',
		() => {
			layer!.style.opacity = '0';
		},
		{ passive: true }
	);
}

function setupTestimonialCarousels(): void {
	const roots = document.querySelectorAll<HTMLElement>('[data-carousel]');

	roots.forEach((root) => {
		const viewport = root.querySelector<HTMLElement>('[data-carousel-viewport]');
		const track = root.querySelector<HTMLElement>('[data-carousel-track]');
		const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-carousel-slide]'));
		const dotsContainer = root.querySelector<HTMLElement>('[data-carousel-dots]');
		const prevBtn = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
		const nextBtn = root.querySelector<HTMLButtonElement>('[data-carousel-next]');
		if (!viewport || !track || slides.length < 2) return;

		let index = 0;
		let timer: number | null = null;

		const dots = slides.map((_, i) => {
			const dot = document.createElement('button');
			dot.type = 'button';
			dot.className = 'carousel-dot';
			dot.setAttribute('aria-label', `Ir para depoimento ${i + 1}`);
			dot.addEventListener('click', () => goTo(i, true));
			dotsContainer?.appendChild(dot);
			return dot;
		});

		function render(): void {
			slides.forEach((slide, i) => {
				const offset = i - index;
				slide.classList.toggle('is-active', offset === 0);
				slide.classList.toggle('is-adjacent', Math.abs(offset) === 1);
			});
			dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));

			const slide = slides[index];
			if (!slide || !viewport) return;
			const viewportCenter = viewport.clientWidth / 2;
			const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
			if (track) track.style.transform = `translateX(${viewportCenter - slideCenter}px)`;
		}

		function goTo(i: number, userTriggered = false): void {
			index = (i + slides.length) % slides.length;
			render();
			if (userTriggered) restartAutoplay();
		}

		function next(): void {
			goTo(index + 1);
		}
		function prev(): void {
			goTo(index - 1);
		}

		function startAutoplay(): void {
			if (reduceMotion) return;
			stopAutoplay();
			timer = window.setInterval(next, 4500);
		}
		function stopAutoplay(): void {
			if (timer !== null) {
				window.clearInterval(timer);
				timer = null;
			}
		}
		function restartAutoplay(): void {
			stopAutoplay();
			startAutoplay();
		}

		prevBtn?.addEventListener('click', () => {
			prev();
			restartAutoplay();
		});
		nextBtn?.addEventListener('click', () => {
			next();
			restartAutoplay();
		});

		root.addEventListener('mouseenter', stopAutoplay);
		root.addEventListener('mouseleave', startAutoplay);

		let touchStartX = 0;
		let touchDeltaX = 0;
		viewport.addEventListener(
			'touchstart',
			(e) => {
				touchStartX = e.touches[0]?.clientX ?? 0;
				touchDeltaX = 0;
				stopAutoplay();
			},
			{ passive: true }
		);
		viewport.addEventListener(
			'touchmove',
			(e) => {
				touchDeltaX = (e.touches[0]?.clientX ?? touchStartX) - touchStartX;
			},
			{ passive: true }
		);
		viewport.addEventListener('touchend', () => {
			if (Math.abs(touchDeltaX) > 40) {
				if (touchDeltaX < 0) next();
				else prev();
			}
			startAutoplay();
		});

		window.addEventListener('resize', render);

		render();
		startAutoplay();
	});
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
	setupHeroDotSpotlight();
	setupTestimonialCarousels();
	setupWhatsAppContactTracking();
	setupTimeOnPageTracking();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
