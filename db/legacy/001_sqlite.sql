CREATE TABLE IF NOT EXISTS source_postings (
 source TEXT NOT NULL, tenant_key TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL,
 ref_json TEXT NOT NULL, fields_json TEXT NOT NULL DEFAULT '{}', listing_hash TEXT,
 content_hash TEXT, revision INTEGER NOT NULL DEFAULT 0,
 first_seen_at TEXT NOT NULL, last_seen_in_list_at TEXT, last_observed_at TEXT,
 last_detail_verified_at TEXT, fetch_state TEXT NOT NULL DEFAULT 'pending',
 quality TEXT NOT NULL DEFAULT 'unavailable', issues_json TEXT NOT NULL DEFAULT '[]',
 next_check_at TEXT NOT NULL, failures INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(source, tenant_key, source_id)
);
CREATE INDEX IF NOT EXISTS postings_due ON source_postings(source,next_check_at);
CREATE TABLE IF NOT EXISTS posting_revisions (
 id INTEGER PRIMARY KEY, source TEXT NOT NULL, tenant_key TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL,
 version INTEGER NOT NULL, observed_at TEXT NOT NULL, changed_fields_json TEXT NOT NULL,
 before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 UNIQUE(source,tenant_key,source_id,version),
 FOREIGN KEY(source,tenant_key,source_id) REFERENCES source_postings(source,tenant_key,source_id)
);
CREATE TABLE IF NOT EXISTS analysis_tasks (
 id INTEGER PRIMARY KEY, source TEXT NOT NULL, tenant_key TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL,
 content_hash TEXT NOT NULL, revision INTEGER NOT NULL, input_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
 UNIQUE(source,tenant_key,source_id,content_hash),
 FOREIGN KEY(source,tenant_key,source_id) REFERENCES source_postings(source,tenant_key,source_id)
);
CREATE TABLE IF NOT EXISTS ingest_runs (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, mode TEXT NOT NULL, scope TEXT NOT NULL,
 started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, report_json TEXT NOT NULL
);
