// DDDs (códigos de área) oficialmente válidos no Brasil.
const VALID_BR_DDDS = new Set([
	'11', '12', '13', '14', '15', '16', '17', '18', '19',
	'21', '22', '24', '27', '28',
	'31', '32', '33', '34', '35', '37', '38',
	'41', '42', '43', '44', '45', '46', '47', '48', '49',
	'51', '53', '54', '55',
	'61', '62', '63', '64', '65', '66', '67', '68', '69',
	'71', '73', '74', '75', '77', '79',
	'81', '82', '83', '84', '85', '86', '87', '88', '89',
	'91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export function validateEmail(value: string): string | null {
	if (!value) return 'Informe seu e-mail.';
	if (!EMAIL_PATTERN.test(value)) return 'Informe um e-mail válido.';
	return null;
}

export function validatePhoneDigits(digits: string, isBrazil: boolean): string | null {
	if (!digits) return 'Informe seu WhatsApp.';
	if (/^(\d)\1+$/.test(digits)) return 'Número inválido.';

	if (isBrazil) {
		if (digits.length !== 11) return 'Informe DDD + celular com 9 dígitos.';
		if (!VALID_BR_DDDS.has(digits.slice(0, 2))) return 'DDD inválido.';
		if (digits[2] !== '9') return 'Informe um número de celular válido (com o 9º dígito).';
		return null;
	}

	if (digits.length < 7 || digits.length > 14) return 'Informe um número de telefone válido.';
	return null;
}
