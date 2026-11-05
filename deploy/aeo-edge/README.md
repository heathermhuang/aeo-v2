# AEO edge gateway

The gateway uses a service binding to the retained `aeo-io` Worker and a dedicated
secret to reach the existing Docker origin. The tracked site ID and GA4 measurement ID
are public identifiers. `AEO_EDGE_ORIGIN_KEY` and `AEO_PREVIEW_AUTH` are secrets; never
put them in configuration, URLs, screenshots or source.

The checked-in configuration has no production routes. `observe` retains the v1 app;
`freeze` holds v1 writes for reconciliation; `production` serves the v2 surface and permits only v1 reads, existing authentication
and private-share resolution. Private previews require the existing staging gate and
never inject actual-site telemetry. Query strings/fragments are excluded from measurement.

Run `node --test tests/aeo/edge.test.mjs` and Wrangler's deploy dry run before release.
Generate Wrangler binding types independently when changing configuration. The Workers
scope is excluded from the Next.js TypeScript project so its environment declarations
do not add required Worker variables to Node's application environment.

Retain the old Worker/custom-domain attachment. The production gateway is an additional
route; deleting that exact route restores the original custom-domain Worker. Record the
route identity and verify the fallback in the release record before root replacement.
