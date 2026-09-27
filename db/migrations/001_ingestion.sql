CREATE TABLE source_postings (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source TEXT NOT NULL,
 tenant_key TEXT NOT NULL DEFAULT '',
 source_id TEXT NOT NULL,
 ref JSONB NOT NULL,
 fields JSONB NOT NULL DEFAULT '{}',
 listing_hash TEXT,
 content_hash TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
 first_seen_at TIMESTAMPTZ NOT NULL,
 last_seen_in_list_at TIMESTAMPTZ,
 last_observed_at TIMESTAMPTZ,
 last_detail_verified_at TIMESTAMPTZ,
 fetch_state TEXT NOT NULL DEFAULT 'pending' CHECK (fetch_state IN ('pending','ok','partial','failed')),
 quality TEXT NOT NULL DEFAULT 'unavailable' CHECK (quality IN ('text','mixed','image','unavailable')),
 issues JSONB NOT NULL DEFAULT '[]',
 next_check_at TIMESTAMPTZ NOT NULL,
 failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
 lease_token UUID,
 lease_until TIMESTAMPTZ,
 UNIQUE (source,tenant_key,source_id),
 CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX postings_due ON source_postings(source,next_check_at,id);
CREATE TABLE posting_revisions (
 posting_id BIGINT NOT NULL REFERENCES source_postings(id),
 version INTEGER NOT NULL CHECK (version > 0),
 observed_at TIMESTAMPTZ NOT NULL,
 content_hash TEXT NOT NULL,
 changed_fields TEXT[] NOT NULL,
 fields JSONB NOT NULL,
 quality TEXT NOT NULL CHECK (quality IN ('text','mixed','image','unavailable')),
 issues JSONB NOT NULL DEFAULT '[]',
 PRIMARY KEY (posting_id,version)
);
CREATE TABLE analysis_tasks (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 posting_id BIGINT NOT NULL,
 revision INTEGER NOT NULL,
 content_hash TEXT NOT NULL,
 analyzer_version TEXT NOT NULL DEFAULT 'v1',
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 lease_token UUID,
 lease_until TIMESTAMPTZ,
 last_error TEXT,
 result JSONB,
 completed_at TIMESTAMPTZ,
 UNIQUE (posting_id,content_hash,analyzer_version),
 FOREIGN KEY (posting_id,revision) REFERENCES posting_revisions(posting_id,version),
 CHECK ((status='running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK ((status='completed') = (completed_at IS NOT NULL))
);
CREATE INDEX analysis_pending ON analysis_tasks(available_at,id) WHERE status='pending';
CREATE INDEX analysis_expired ON analysis_tasks(lease_until,id) WHERE status='running';
CREATE TABLE ingest_runs (
 id UUID PRIMARY KEY,
 source TEXT NOT NULL,
 mode TEXT NOT NULL CHECK (mode IN ('discover','refresh')),
 scope TEXT NOT NULL,
 started_at TIMESTAMPTZ NOT NULL,
 finished_at TIMESTAMPTZ,
 status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed')),
 report JSONB NOT NULL
);
CREATE INDEX runs_recent ON ingest_runs(source,started_at DESC);
