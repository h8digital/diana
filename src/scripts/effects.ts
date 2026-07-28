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

function init(): void {
	setupReveal();
	setupCountUp();
	setupHeroParallax();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
