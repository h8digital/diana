export function maskBrPhone(rawValue: string): string {
	const digits = rawValue.replace(/\D/g, '').slice(0, 11);

	if (digits.length === 0) return '';
	if (digits.length <= 2) return `(${digits}`;
	if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
	if (digits.length <= 10) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(digits.length - 4)}`;
	}
	return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function attachPhoneMask(input: HTMLInputElement): void {
	input.addEventListener('input', () => {
		const cursorFromEnd = input.value.length - (input.selectionStart ?? input.value.length);
		input.value = maskBrPhone(input.value);
		const newPos = input.value.length - cursorFromEnd;
		input.setSelectionRange(newPos, newPos);
	});
}
