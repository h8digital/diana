export function maskCurrencyInput(rawValue: string): string {
	const digits = rawValue.replace(/\D/g, '');
	if (!digits) return '';
	const value = parseInt(digits, 10) / 100;
	return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseCurrencyInput(masked: string): number {
	const digits = masked.replace(/\D/g, '');
	return digits ? parseInt(digits, 10) / 100 : 0;
}

export function formatBRL(value: number): string {
	return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function attachCurrencyMask(input: HTMLInputElement): void {
	input.addEventListener('input', () => {
		input.value = maskCurrencyInput(input.value);
	});
}
