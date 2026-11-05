CREATE TABLE IF NOT EXISTS aeo_session (
 token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
 password_hash char(64) NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aeo_session_expiry ON aeo_session(expires_at);
CREATE TABLE IF NOT EXISTS aeo_rate_limit (
 key char(64) NOT NULL, bucket bigint NOT NULL, attempts integer NOT NULL, PRIMARY KEY(key,bucket)
);
CREATE TABLE IF NOT EXISTS aeo_site_settings (
 website_id uuid PRIMARY KEY REFERENCES website(website_id) ON DELETE CASCADE,
 goal_event varchar(50), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS aeo_answer_run (
 id uuid PRIMARY KEY, website_id uuid NOT NULL REFERENCES website(website_id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES "user"(user_id), created_at timestamptz NOT NULL DEFAULT now(),
 question text NOT NULL CHECK(length(question) BETWEEN 5 AND 500),
 source_kind text NOT NULL CHECK(source_kind IN ('user_import','provider_api')),
 method text NOT NULL CHECK(length(method) BETWEEN 1 AND 160),
 answer text NOT NULL CHECK(length(answer) BETWEEN 1 AND 24000),
 claimed_observed_at timestamptz,
 content_hash char(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS aeo_answer_site ON aeo_answer_run(website_id,created_at DESC);

CREATE TABLE IF NOT EXISTS aeo_answer_job (
 id uuid PRIMARY KEY, website_id uuid NOT NULL REFERENCES website(website_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES "user"(user_id),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 question text NOT NULL, method text NOT NULL, request_hash char(64) NOT NULL,
 state text NOT NULL CHECK(state IN ('running','complete','failed')),
 error_code text, answer_id uuid REFERENCES aeo_answer_run(id),
 UNIQUE(website_id,request_id)
);
CREATE INDEX IF NOT EXISTS aeo_answer_job_usage ON aeo_answer_job(website_id,created_at DESC);
