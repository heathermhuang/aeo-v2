-- A historical archive is separate from every live collection/analytics table.
CREATE TABLE aeo_legacy_source (
 id uuid PRIMARY KEY,
 snapshot_sha256 char(64) NOT NULL UNIQUE,
 archive_sha256 char(64) NOT NULL,
 release_id text NOT NULL,
 source_database text NOT NULL,
 exported_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE aeo_legacy_account (
 source_id uuid NOT NULL REFERENCES aeo_legacy_source(id),
 legacy_id text NOT NULL,
 email text NOT NULL,
 eligible boolean NOT NULL,
 claimed_by uuid REFERENCES "user"(user_id),
 claimed_at timestamptz,
 PRIMARY KEY(source_id,legacy_id),
 UNIQUE(source_id,email)
);
CREATE INDEX aeo_legacy_account_email ON aeo_legacy_account(email) WHERE eligible;
CREATE TABLE aeo_legacy_record (
 source_id uuid NOT NULL REFERENCES aeo_legacy_source(id),
 kind text NOT NULL,
 legacy_id text NOT NULL,
 owner_id text,
 brand_id text,
 source_created_at text,
 raw text NOT NULL,
 sha256 char(64) NOT NULL,
 PRIMARY KEY(source_id,kind,legacy_id),
 FOREIGN KEY(source_id,owner_id) REFERENCES aeo_legacy_account(source_id,legacy_id)
);
CREATE INDEX aeo_legacy_record_owner ON aeo_legacy_record(source_id,owner_id,kind);
