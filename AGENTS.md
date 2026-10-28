# AEO v2 engineering instructions

This is the AEO fork of GEOInflow at 9eb3aefc5a3fa8d4be8026fe468d6927cd017ed4, built on Umami. Retain upstream copyright and license notices. The user authorized a simpler multi-tenant AEO experience and end-to-end qualification before replacing aeo.io.

- Work on codex/* branches. Origin is heathermhuang/aeo-v2; upstream is yaojingang/GEOInflow and is read-only. No dual-push rules from upstream transfer to this fork.
- Preserve the current AEO production app and its historical data until replacement acceptance and a reversible migration are verified.
- New product code belongs in src/lib/aeo, src/components/aeo and src/app/api/aeo. Keep upstream ingestion, evidence and migration contracts intact.
- Every private operation checks current session and tenant membership, including background work, imports and exports. Customer accounts are never system administrators. Mutations require same-origin requests. Credentials never enter reports or source control.
- No demo telemetry in customer workspaces. Missing input, observed zero, partial evidence and unsupported analysis must be distinct. Crawl activity never proves citations, rankings or acquisition.
- Use the established AEO light workspace, restrained emerald actions, clear labels, progressive disclosure and usable phone layouts.
- Run targeted unit, API, real PostgreSQL isolation and browser journey checks for changed behavior. Record actual tested versions and gaps. Production replacement requires end-to-end acceptance, real collection, migration/rollback and operational readiness.
