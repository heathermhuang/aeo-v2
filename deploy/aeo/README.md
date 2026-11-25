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

## Production crawler range freshness

The production app must use both `compose.yml` and `compose.production.yml`.
A release using the base file alone changes the app's canonical origin to
staging and rejects production sign-in.

The maintenance command uses the published crawler registry and the existing
source leases. It retains range changes that exceed the qualification threshold
for review. It does not connect a site log source or create a log import.

1. Deploy the CI-qualified image with the production Compose override. Verify
   the live sign-in canary and confirm the CLI works with
   `docker compose -f compose.yml -f compose.production.yml exec -T app node dist/aeo-crawler-ranges.mjs --status`.
2. From the production host, install the service and timer from the reviewed
   revision. Run the service once and inspect the result in
   `journalctl -u aeo-crawler-ranges.service -n 10`. Check current timestamps,
   candidate changes and failed sources independently of the process exit code.
3. Enable the timer with `systemctl enable --now aeo-crawler-ranges.timer`.
   To stop recurring refreshes, disable the timer. The reviewed range history
   and active pointers are preserved.

## Production origin crawler logs

Caddy captures crawler-like `GET` and `HEAD` requests to `/` and `/robots.txt`
that reach the AEO.io origin with its authenticated edge headers. CDN-only
responses and traffic outside those paths are outside this source's coverage.
The dedicated access log keeps the fixed route, method, status, timing, size,
bounded User-Agent and trusted client IP. Caddy omits request and response
headers, cookies and queries. The raw spool is mode 0600 and rotates hourly,
with a 24-hour/24-file retention limit and 1 MiB per file. The existing crawler
importer masks IP addresses before database storage.

1. Deploy the qualified app image with both production Compose files.
2. Bind `AEO_ORIGIN_SITE_ID` and `AEO_ORIGIN_OWNER_ID` in a root-only
   `/opt/aeo-v2/origin-crawl.env` to the existing AEO.io site and verified team
   owner. Install `import-origin-crawl.py`, the service and the timer from the
   same revision. Validate the candidate Caddyfile in the ingress container
   before reloading it. Preserve the previous config for rollback.
3. Send a uniquely labeled synthetic `AEO-Crawl-Canary` request through
   the public edge, run the service once, and verify the import and the owner
   report. The scheduled job uses the existing tenant-scoped import ledger.
   Enable the timer and check its next trigger and service result.
4. Check `/var/lib/aeo-origin-crawl/state.json` for the last successful pass,
   last submitted batch, rejects and rotation gaps. An idle pass can succeed
   without collecting any requests. Cursors advance after acknowledged imports,
   and retrying the same batch is safe. An unread rotated-file loss is counted
   and causes the detecting invocation to fail. An import overlapping another
   configured automatic source is rejected by the existing import contract.

To stop collection, disable the timer and restore the prior Caddyfile. Retain
the import history and cursor state for reconciliation. This deployment adds no
separate log delivery service or public intake route.
