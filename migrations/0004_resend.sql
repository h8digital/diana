-- Troca o envio de e-mail de novos leads de SMTP para a API da Resend.

DELETE FROM settings WHERE key IN (
	'smtp_host',
	'smtp_port',
	'smtp_secure',
	'smtp_user',
	'smtp_from',
	'smtp_pass_enc'
);

INSERT INTO settings (key, value) VALUES
	('resend_from', 'Diana Dutra Investimentos <naoresponda@infodianainvestimentos.com.br>')
ON CONFLICT(key) DO NOTHING;
