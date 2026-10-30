# Upstream provenance

AEO v2 is a fork of [GEOInflow](https://github.com/yaojingang/GEOInflow) pinned initially to `9eb3aefc5a3fa8d4be8026fe468d6927cd017ed4` (2026-10-27). GEOInflow is the Liekan derivative of Umami, pinned by its own compatibility contract to Umami v3.4.1 at `559e3c607c23d2c72d9bd4f6481bda428255323c`.

The MIT license and existing Umami and Liekan copyright notices remain in LICENSE. THIRD_PARTY_NOTICES.md and bundled dataset/font/vendor notices remain intact. GEOInflow's publishers are 猎看科技 and 北京日报社智源GEO. AEO is an independent derivative, not a claim of publisher endorsement.

The AEO customer interface is src/components/aeo and src/app/page.tsx. AEO sessions, tenancy and API orchestration are src/lib/aeo and src/app/api/aeo. Upstream collection, traffic-quality views, crawler classification, import deduplication and immutable migrations remain in their original directories. The unchanged factory administrator is disabled by an additive AEO migration; customized operator identities are preserved.

Origin is heathermhuang/aeo-v2. The yaojingang/GEOInflow upstream is read-only. Upstream development instructions and publication permissions do not transfer to this independent fork.

## Integration on 2026-10-29

Reviewed main `5d66c239670689f83c52d8b7f30c4020d9a02ea2` (11 commits after
our base). Integrated the application changes as a reviewed patch: migrations
057–065 with their original checksums, retention/queue safety, dashboard dependency
and scheduling improvements, and singular/plural Cloudflare destination probes.
AEO's four-view UI, private route allowlist, UTC connections, image startup and
license notices are retained. Inherited storage/administration routes remain blocked.

Excluded upstream-only public-history workflow, publication/push scripts, policy,
script aliases and upstream development instructions. They encode the publisher's
own remotes and independent-history requirements, not this fork's release policy.
The execution checkout has an upstream fetch remote and a disabled push URL.
No maintainer contact, endorsement or upstream PR is implied.

Retention is not activated for AEO: this deployment does not run the upstream
analytics worker and exposes no retention mutation API. If that worker is enabled
later, AEO requires an explicit retention enablement setting before its pump runs.
Raw receipts, logs, imports, answer evidence and legacy archives are preserved.
