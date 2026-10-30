# AEO v2 replacement acceptance

The current aeo.io continues serving production. This candidate does not automatically change its DNS, routes, database or accounts.

## Implemented candidate

- Four main destinations: Overview, AI answers, Crawl access, Traffic and conversions.
- Private server sessions with HttpOnly cookies, password-change revocation and exact-origin mutations.
- The hosted routing surface blocks inherited administration/private APIs so legacy endpoints cannot bypass the SaaS limits.
- Ordinary customer identities; team ownership, read-only and manager roles; membership checked on every private request and before publishing provider results.
- Team-wide site/member/answer limits with transaction locks; durable, idempotent provider attempts with no automatic paid retry.
- Native GEOInflow log and inventory imports; raw receipt status separate from qualified traffic; complete inventory denominators independent of bounded display tables.
- Private exports with no raw IP, hashed IP, full User-Agent, credentials or session bearer.
- Conversion events count observed occurrences; they are not attributed AI conversions. Crawl observations do not establish citations or rankings. Captured answers retain their acquisition method.

## Local acceptance

Use tests/aeo/acceptance.ts against an explicitly isolated PostgreSQL database named aeo_v2_candidate and a loopback app origin. It creates synthetic accounts and data. The provider transport is injected for failure, replay and revocation tests; it makes no paid provider calls. Browser checks exercise the authored UI and the real tracker against a separately labelled synthetic website.

The acceptance report must identify the exact revision, build, database and runtime. A passing synthetic test is not a claim of real customer adoption, live provider quality or traffic improvement.

## Required before replacing aeo.io

1. Deploy this exact candidate on a staging origin with persistent PostgreSQL, HTTPS and an ingress configuration that strips untrusted identity headers before setting trusted values. Confirm migrations, readiness and restore from backup there.
2. Integrate verified account access and recovery. The ownership/recovery code now requires email proof and provides a guarded v1 archive claim path. Live inbox delivery/recovery and the final v1 delta/cutover still require acceptance. Public cutover requires a verified identity/recovery flow and an explicit v1 account migration rehearsal.
3. Configure a dedicated answer-provider credential, one allowed model and explicit workspace/installation usage allowances. Test real answer collection and failure handling with a bounded approved allowance. Collection stays off without these values.
4. Connect an authorized real website, server/CDN logs, inventory and actual conversion instrumentation. Confirm timestamps, classification/verification limits, supported referrer attribution and missing-data behavior.
5. Rehearse export and restoration of v1 reports. Preserve raw v1 evidence and provenance; do not relabel imported records as v2 observations. Keep v1 available read-only during transition.
6. Verify mobile and desktop tasks, membership revocation, tenant isolation, quota enforcement, private cache headers, operational monitoring and a reversible route change on staging.
7. Record the exact old/new release identities, backup reference and rollback command. Then route production traffic to the accepted candidate, verify it live, and retain the previous route for rollback.

The Docker image must also be built and started successfully before container deployment. A host compilation pass does not substitute for an image startup pass.

## Provider configuration

AEO_ANSWER_API_KEY is a dedicated OpenRouter credential. AEO_ANSWER_MODEL selects one server-owned model. AEO_ANSWER_DAILY_LIMIT sets the workspace daily attempt allowance (maximum 30). AEO_ANSWER_INSTALLATION_DAILY_LIMIT sets the total installation allowance (maximum 100). Both allowances must be positive to perform work. Daily allowances reset on the UTC calendar day; analytics windows cover the last 30 elapsed days. API responses are labelled; the current collector requests no search and does not represent a consumer interface.

Keep credentials out of source, screenshots, reports and test fixtures. Do not share credentials across projects. No provider call is enabled by a browser-supplied key, model, tenant or billing entitlement.

The ordered 2026-10-29 continuation is recorded in [execution](EXECUTION_20261029.md), [identity](IDENTITY.md) and [v1 migration](V1_MIGRATION.md). Implementation and operator tests do not satisfy the remaining real-site, bounded live-provider or independent customer acceptance gates.

See the [final 2026-10-29 operator qualification](FINAL_QUALIFICATION_20261029.md) for live inbox recovery, the three-call provider pilot, authorized real-site evidence, hosted viewport tests and remaining production gates.
