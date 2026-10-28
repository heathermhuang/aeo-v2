# AEO v2

A simpler, private workspace for understanding AI answers, crawler access and website outcomes. Built from GEOInflow with an AEO interface and a hosted SaaS tenant boundary.

The main workflow is **add a website → connect a source → inspect a finding → choose the next step**. Four destinations keep the product focused: Overview, AI answers, Crawl access, Traffic and conversions.

This is a replacement candidate. The existing aeo.io remains in production until [replacement acceptance](docs/aeo/REPLACEMENT.md) passes. Billing stays off. Missing inputs never become fake zeroes or invented visibility scores.

## Development

Use Node 22.23.4 and pnpm 12.3.4, as pinned by the upstream lockfile. Docker with Compose provides an isolated PostgreSQL development database; native PostgreSQL 16 can also be used with a dedicated database and loopback port.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm aeo:env
docker compose --env-file .env.local -f .local/compose.yml up -d --wait
pnpm exec dotenv -e .env.local -- prisma generate
pnpm exec node scripts/build-prisma-client.js
pnpm exec dotenv -e .env.local -- prisma migrate deploy
pnpm exec dotenv -e .env.local -- node scripts/liekan-migrate.mjs
pnpm exec dotenv -e .env.local -- node scripts/aeo/migrate.mjs
pnpm build:packages
pnpm build:tracker
pnpm aeo:dev
```

Open http://127.0.0.1:3102 and create an isolated development account. The factory administrator is disabled by AEO migration 002. The generated .env.local contains private random development secrets and is ignored by Git and Docker. Candidate PostgreSQL initially uses port 15472; choose a different unused loopback port in DATABASE_URL when using native PostgreSQL.

## Checks

```sh
pnpm exec tsc --noEmit
pnpm test:aeo
pnpm test:aeo:acceptance
pnpm build:app
```

The API acceptance script requires an already-running loopback app and the dedicated aeo_v2_candidate database. It creates labelled synthetic tenants and evidence, and tests provider behavior through an injected transport without making paid calls. Browser testing should also exercise sign-in, domain setup, source connection, navigation, a raw answer, a crawl error, export and account/site switching on desktop and phone widths.

## Deployment

Dockerfile.aeo builds the candidate. The runtime requires DATABASE_URL, APP_SECRET and an HTTPS AEO_PUBLIC_URL. Keep AEO_SIGNUP_ENABLED off on public infrastructure until verified access and recovery are integrated. Set DEFAULT_LOCALE=en-US. No customer demo telemetry is seeded by the AEO entrypoint.

Schedule scripts/aeo/maintenance.mjs with an ordinary daily scheduler to expire session and rate-limit metadata. Retain PostgreSQL backups and rehearse restore. Provider work additionally requires a dedicated credential/model and explicit per-workspace and installation allowances; see [configuration and cutover requirements](docs/aeo/REPLACEMENT.md).

[Upstream provenance](docs/aeo/UPSTREAM.md) · [GEOInflow documentation](docs/aeo/GEOInflow-README.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
