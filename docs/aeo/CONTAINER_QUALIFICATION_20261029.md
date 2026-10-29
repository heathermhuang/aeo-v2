# AEO v2 container qualification — 2026-10-29

Executable candidate: `906f5889f8744d1369235cde23a8339add113e58`.
Local Linux amd64 image:
`sha256:258f8a00b5b1100e7e5b86c9e1fbaa6852a7f73a94756688c5759f7551627d2a`.

## Corrections

- Preserve AEO's route boundary instead of overwriting it with the upstream
  Docker proxy. Inherited management APIs must remain inaccessible.
- Run upstream, GEOInflow and AEO migrations before serving requests. Include
  their SQL data and upstream manifest in the runtime image. Migration failure
  stops startup, including the factory-administrator disabling migration.
- Add three container regressions and a CI job that builds the deployment
  image, starts an empty PostgreSQL database with a Singapore timezone default,
  and runs the full AEO acceptance suite through that image.

The regressions failed before the corrections. A first real startup then
identified the omitted `config/liekan/upstream.json`; including the manifest
resolved that packaged-file failure.

## Passed evidence

- [CI run 40803545041](https://github.com/heathermhuang/aeo-v2/actions/runs/40803545041):
  both native and container acceptance jobs succeeded on the candidate revision.
- Local image built with Node 22.23.4 and pnpm 12.3.4, then started against an
  isolated PostgreSQL 16 database. All three AEO migrations applied and production
  readiness returned healthy.
- The exact local image passed 80 API/database assertions: tenant isolation,
  revocation, quotas, imports, tracker delivery, receipt times, private responses,
  blocked inherited routes and provider failure/replay behavior.
- Six existing unit tests and three container regression tests passed.
- Real-browser signup, workspace creation, synthetic website setup and clear
  missing-data states passed against the local container. No browser errors
  were recorded for that journey. Previously recorded phone-layout evidence
  applies to unchanged UI code; this continuation independently checked desktop.
- Logical backup restored successfully into a separate test database. The
  restored AEO migration ledger retained all three migrations.
- Staging Compose configuration and Caddy configuration validated.

All accounts and evidence used in these checks were synthetic. Provider calls
were mocked or disabled; no paid answer calls occurred. Optional city geography
was skipped for the qualified image and remains unavailable rather than inferred.

## Staging and production boundary

The DigitalOcean deployment is prepared in `deploy/aeo/`. A dedicated AEO SSH
public key was registered after explicit approval. The initial $24/month plan
was not provisioned; a cheaper $12/month, 2 GB plan was proposed with compilation
kept off-host. Paid droplet creation requires approval of the selected plan.

No droplet, staging DNS record or production cutover had been created when
this qualification was recorded. Hosted HTTPS/ingress checks, verified account
ownership and recovery, bounded dedicated live-provider collection, authorized
real-site evidence, and v1 account/report migration and rollback remain required
before replacing aeo.io. See [replacement acceptance](REPLACEMENT.md).
