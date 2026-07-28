CREATE TABLE IF NOT EXISTS stages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	position INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	phone TEXT NOT NULL,
	objective TEXT,
	stage_id INTEGER NOT NULL REFERENCES stages(id),
	notes TEXT,
	page_url TEXT,
	event_id TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage_id);

INSERT INTO stages (name, position) VALUES
	('Novo', 1),
	('Em contato', 2),
	('Qualificado', 3),
	('Fechado', 4),
	('Perdido', 5);
