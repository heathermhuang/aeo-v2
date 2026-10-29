# AEO v2 DigitalOcean staging

Staging uses one dedicated Singapore droplet, local persistent PostgreSQL and
Caddy HTTPS. The proposed lightweight `s-1vcpu-2gb` plan was $12/month
($0.01786/hour), with 50 GB disk, when queried on 2026-10-29. Recheck the API
before provisioning and obtain explicit approval of the chosen paid plan.
Build images off-host and upload them; this small host is intended for light
staging traffic, not compilation or load testing. Configure 2 GB of swap.
Provider calls are disabled. No v1 database, accounts, reports, DNS root record
or production routes are changed by this setup.

## Deploy

1. Build the candidate's Linux amd64 image and pass the container acceptance
   job. Save its exact source revision and image identity in the release record.
2. Create a dedicated Ubuntu 24.04 droplet with a dedicated SSH key, Docker,
   Compose and a firewall allowing SSH, HTTP and HTTPS. No public database or
   app port is needed. Do not attach another project's keys or credentials.
3. Copy `compose.yml` and `Caddyfile` into `/opt/aeo-v2`. Load the tested image.
   Generate dedicated secrets directly on the host and write `/opt/aeo-v2/.env`
   with mode 0600. Do not upload a local environment or reuse v1 credentials.
   The environment must contain `AEO_IMAGE`,
   `AEO_STAGING_HOST`, random hex `POSTGRES_PASSWORD`, `APP_SECRET`,
   `TWO_FACTOR_ENCRYPTION_KEY`, and a bcrypt `AEO_STAGING_PASSWORD_HASH`.
   Escape dollar signs in the bcrypt hash for Compose, or single-quote its
   value in `.env`. Keep all credentials and SSH private keys out of source.
4. Add a DNS-only A record for the dedicated staging hostname. Keep aeo.io's
   existing production records. Caddy obtains the HTTPS certificate.
5. Run `docker compose up -d`, then inspect `docker compose ps` and app logs.
   Startup applies upstream, GEOInflow and AEO migrations in order; migration
   failure stops the app. Database and application ports remain private.
6. Verify unauthenticated HTTPS is rejected, authenticated health is healthy,
   inherited management APIs return 404, and requests cannot override the
   trusted client address. Exercise two isolated accounts in desktop and phone
   browsers. The shared staging password is an extra gate for this candidate;
   it does not qualify customer identity verification or recovery.

All staging requests, including tracker traffic, require the staging access
gate. External tracking is intentionally unavailable until an authorized real
site test defines its exact intake and access configuration.

## Backup and rollback

Before each update, record `docker compose images`, the previous `.env` image
value and a logical database backup. For example:

```sh
umask 077
mkdir -p backups
docker compose exec -T db pg_dump -U aeo_v2 -d aeo_v2_staging -Fc > backups/before-update.dump
```

Verify restoration into a separate throwaway database before calling the backup
usable. Never rehearse restoration over the running staging database. Roll back
the image by restoring the previous `AEO_IMAGE` value and running
`docker compose up -d app`. If schema changes are incompatible, restore the
verified backup into a new volume and route the old image to that restored
database. Never use `docker compose down -v` against the retained database.

This is a staging runbook. Public replacement remains subject to
[the replacement acceptance requirements](../../docs/aeo/REPLACEMENT.md).

The approved $12/month deployment and hosted evidence are recorded in
[the staging qualification](../../docs/aeo/STAGING_QUALIFICATION_20261029.md).
