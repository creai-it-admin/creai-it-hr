-- One bounded, oldest-first range for explicit retention; running jobs are excluded.
CREATE INDEX runs_retention ON ingest_runs(finished_at,id) WHERE status<>'running';
