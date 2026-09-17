export interface Country {
	iso: string;
	name: string;
	dial: string;
	flag: string;
}

// Brasil primeiro (padrão do formulário); demais países em ordem alfabética por nome.
export const COUNTRIES: Country[] = [
	{ iso: 'BR', name: 'Brasil', dial: '55', flag: '🇧🇷' },
	{ iso: 'DE', name: 'Alemanha', dial: '49', flag: '🇩🇪' },
	{ iso: 'AO', name: 'Angola', dial: '244', flag: '🇦🇴' },
	{ iso: 'AR', name: 'Argentina', dial: '54', flag: '🇦🇷' },
	{ iso: 'BO', name: 'Bolívia', dial: '591', flag: '🇧🇴' },
	{ iso: 'CA', name: 'Canadá', dial: '1', flag: '🇨🇦' },
	{ iso: 'CL', name: 'Chile', dial: '56', flag: '🇨🇱' },
	{ iso: 'CO', name: 'Colômbia', dial: '57', flag: '🇨🇴' },
	{ iso: 'ES', name: 'Espanha', dial: '34', flag: '🇪🇸' },
	{ iso: 'US', name: 'Estados Unidos', dial: '1', flag: '🇺🇸' },
	{ iso: 'FR', name: 'França', dial: '33', flag: '🇫🇷' },
	{ iso: 'IT', name: 'Itália', dial: '39', flag: '🇮🇹' },
	{ iso: 'JP', name: 'Japão', dial: '81', flag: '🇯🇵' },
	{ iso: 'MX', name: 'México', dial: '52', flag: '🇲🇽' },
	{ iso: 'MZ', name: 'Moçambique', dial: '258', flag: '🇲🇿' },
	{ iso: 'PY', name: 'Paraguai', dial: '595', flag: '🇵🇾' },
	{ iso: 'PE', name: 'Peru', dial: '51', flag: '🇵🇪' },
	{ iso: 'PT', name: 'Portugal', dial: '351', flag: '🇵🇹' },
	{ iso: 'GB', name: 'Reino Unido', dial: '44', flag: '🇬🇧' },
	{ iso: 'UY', name: 'Uruguai', dial: '598', flag: '🇺🇾' },
];

export const DEFAULT_COUNTRY_ISO = 'BR';
