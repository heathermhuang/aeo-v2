# AEO v2 hosted staging — 2026-10-29

Staging is deployed at <https://staging.aeo.io>, behind a dedicated staging
access password. The current aeo.io production Worker, database and accounts
were not changed.

## Deployment identity

- DigitalOcean droplet `613730799`, `aeo-v2-staging-20261029`, Singapore `sgp1`.
- Approved plan: `s-1vcpu-2gb`, 1 CPU, 2 GB RAM, 50 GB disk, $12/month
  ($0.01786/hour). No paid backups or other paid add-ons were enabled.
- Ubuntu 24.04, Docker Compose, 2 GB swap, local persistent PostgreSQL 16 and
  Caddy HTTPS. Only SSH, HTTP and HTTPS are exposed. Ports 3000 and 5432 were
  verified inaccessible from outside the host.
- Executable source: `906f5889f8744d1369235cde23a8339add113e58`. Later commits
  add documentation and a manually invoked hosted test without changing app code.
- Local tested image ID:
  `sha256:258f8a00b5b1100e7e5b86c9e1fbaa6852a7f73a94756688c5759f7551627d2a`.
- Host-loaded image ID:
  `sha256:43247292e48b9090a6f549bede723a03d64681cd3d2c419d39193982f8c43edd`.
  Docker reported different identifiers after save/load. All 21 filesystem
  layer digests match. The canonical digest of Architecture, Os, RootFS and
  Config matches on both hosts:
  `0b93bcf1421aa9aefe088a8b58cc2ef0d751069390f405e1bf1e5a4122a4481e`.

Dedicated application, database, encryption and access secrets were generated
directly on the droplet in root-only files. No v1 or other project's secrets
were reused. Secrets, SSH private keys and access credentials remain outside Git.

## Observed acceptance

- HTTPS certificate validation succeeded. Unauthenticated health returned 401;
  authenticated health returned `status: ok` and `billingEnabled: false`.
- `tests/aeo/hosted-smoke.mjs` passed 52 checks through public HTTPS. It uses
  synthetic accounts only, checks its exact staging origin before sending the
  dedicated access credential, and makes no paid answer calls.
- The hosted checks cover independent tenants, denied foreign reads/writes,
  immediate membership revocation, read-only roles, Secure/HttpOnly/SameSite
  cookies, exact-origin mutation checks, private cache headers, blocked inherited
  management APIs, log/inventory/answer imports, import idempotency, private
  exports, preserved evidence provenance, missing-data states and UTC receipt
  timestamps. The disabled provider created no answer job.
- Live Caddy configuration sets the trusted client address from the socket and
  deletes caller-supplied Cloudflare/Vercel/CloudFront/EdgeOne/Umami identity
  headers and the staging Authorization header before proxying to the app.
- In standard Chrome, staging access and app sign-in passed. The overview's
  actionable crawl finding led to `/synthetic-page`, HTTP 403, and the explicit
  `Unverified identity claim` label. Desktop evidence is saved in the local
  ignored screenshot directory. The in-app browser did not complete Basic Auth;
  standard Chrome was used successfully instead.
- A backup restored successfully into separate database
  `aeo_v2_restore_20261029`: both source and restored databases retained three
  AEO migrations and two synthetic websites. PostgreSQL and the app restarted
  successfully, demonstrating persistent data and idempotent startup.
- Post-deploy host memory showed roughly 1.2 GB available and no swap in use
  during this light synthetic exercise. This is not a load-test qualification.

The backup is `/opt/aeo-v2/backups/qualification-20261029.dump`, mode 0600 on
the staging host. It is a same-host rehearsal backup, not disaster-recovery or
offsite-backup qualification. App rollback must retain the database volume;
see [deployment and rollback instructions](../../deploy/aeo/README.md).

## Remaining before production replacement

Staging is operational; production replacement remains gated on verified
account ownership/recovery and v1 identities, dedicated bounded live-provider
collection, authorized real-site data, v1 report migration and rollback, and the
final real-user task comparison. Hosted phone acceptance was not independently
completed in this continuation. The earlier phone evidence applies only to
unchanged UI code. No synthetic receipt proves real traffic, conversion growth,
consumer answer quality, or customer acceptance.

To repeat the hosted check intentionally:

```sh
AEO_HOSTED_SYNTHETIC_TEST=1 node tests/aeo/hosted-smoke.mjs
```

It requires the dedicated credential file in the ignored `.local` directory,
creates three synthetic accounts and two websites, and writes a private browser
fixture plus an aggregate result. Do not schedule it or run it against production.
