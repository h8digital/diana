export const siteConfig = {
	name: 'Diana Dutra Investimentos e Consórcios',
	title: 'Diana Dutra Investimentos | Estratégias com Consórcios para Construção de Patrimônio',
	description:
		'Especialista em estratégias com consórcios para construção e alavancagem de patrimônio. Mais de 20 anos ajudando clientes com planejamento financeiro inteligente.',
	url: 'https://www.dianadutrainvestimentos.com.br',
	whatsapp: {
		number: '5551999181068',
		message: 'Olá Diana, vim através do site e gostaria de tirar algumas dúvidas, pode me ajudar?',
	},
	email: 'contato@dianadutrainvestimentos.com.br',
	phoneDisplay: '(51) 99918-1068',
	address: {
		line1: 'Rua Ereda Weber, 143',
		line2: 'Esquina Av. Presidente Vargas',
		line3: 'Bairro União',
		city: 'Estância Velha – RS',
		cep: 'CEP 93610-000',
		cnpj: '34.750.090/0001-50',
		mapsEmbedUrl:
			'https://maps.google.com/maps?q=Rua%20Ereda%20Weber%2C%20143%20Est%C3%A2ncia%20Velha%20%E2%80%93%20RS%20Brasil&t=m&z=15&output=embed&iwloc=near',
		mapsLink: 'https://share.google/gdQ8PlaQzpcPRsWNT',
	},
	nav: [
		{ label: 'Início', href: '#inicio' },
		{ label: 'Informações', href: '#informacoes' },
		{ label: 'Depoimentos', href: '#depoimentos' },
		{ label: 'Para quem é', href: '#paraquem' },
		{ label: 'Especialista', href: '#especialista' },
	],
} as const;

export function whatsappUrl(message = siteConfig.whatsapp.message): string {
	return `https://api.whatsapp.com/send?phone=${siteConfig.whatsapp.number}&text=${encodeURIComponent(message)}`;
}
