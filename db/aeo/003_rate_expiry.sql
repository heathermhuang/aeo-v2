ALTER TABLE aeo_rate_limit ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now()+interval '2 days';
CREATE INDEX IF NOT EXISTS aeo_rate_expiry ON aeo_rate_limit(expires_at);
