-- Existing candidate emails are claims, not verified ownership. No backfill of verification.
CREATE TABLE aeo_identity (
 user_id uuid PRIMARY KEY REFERENCES "user"(user_id) ON DELETE CASCADE,
 email text NOT NULL UNIQUE CHECK(email=lower(trim(email))),
 verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aeo_identity_token (
 token_hash char(64) PRIMARY KEY,
 email text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('verify','recover')),
 workspace text NOT NULL,
 expected_user_id uuid,
 expected_password_hash char(64),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aeo_identity_token_expiry ON aeo_identity_token(expires_at);
-- Previously issued sessions must not bypass the newly required ownership proof.
DELETE FROM aeo_session;
