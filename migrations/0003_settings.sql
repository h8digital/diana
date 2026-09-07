CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT
);

INSERT INTO settings (key, value) VALUES
	('lead_email_enabled', '0'),
	('lead_email_to', 'contato@dianainvestimentos.com.br'),
	('smtp_host', ''),
	('smtp_port', '587'),
	('smtp_secure', 'starttls'),
	('smtp_user', ''),
	('smtp_from', '')
ON CONFLICT(key) DO NOTHING;
