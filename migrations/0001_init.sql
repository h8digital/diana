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

-- Only seed the default stages when the table is empty, so re-running this
-- migration (e.g. the first time `wrangler d1 migrations apply` succeeds against
-- a DB whose tables were created by other means) never duplicates them.
INSERT INTO stages (name, position)
SELECT name, position FROM (
	SELECT 'Novo' AS name, 1 AS position
	UNION ALL SELECT 'Em contato', 2
	UNION ALL SELECT 'Qualificado', 3
	UNION ALL SELECT 'Fechado', 4
	UNION ALL SELECT 'Perdido', 5
)
WHERE NOT EXISTS (SELECT 1 FROM stages);
