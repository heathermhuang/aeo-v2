# Source connection follow-through — 2026-10-29

This supplements the [qualification record](FINAL_QUALIFICATION_20261029.md).
The user requested end-to-end restoration of the existing Analytics authorization
and Cloudflare source access. No new provider spend or production cutover was authorized
by that restoration request.

## Cloudflare: usable evidence retrieved with the existing grant

The earlier REST 403 did not establish that all Cloudflare data was inaccessible.
Both authorized zones' current plans do not support legacy Logpull: it requires
Enterprise. A new Logs Read token alone would not unlock that endpoint. See
[Logpull availability](https://developers.cloudflare.com/logs/logpull/).

The existing grant successfully queried seven days of `httpRequestsAdaptiveGroups`
for aeo.io and plate.hk, restricted to their root/www hosts. The window was
2026-10-22T00:00:00Z through 2026-10-29T00:00:00Z. Queries were capped at 1,000 groups
per zone. These are sampled/estimated HTTP request aggregates, not a complete raw log,
browser visits, verified AI identities or conversion attribution. Private API/auth/share
paths and query material were omitted from the retained path evidence. Private traffic
volumes are not published here.

A separate 61-second live tail of the authorized `platehk` Worker observed 37 events;
35 public-path receipts were imported into the correct verified workspace, with no
operator probes generated, no rejected records and no duplicates in that batch. Cookies,
authorization headers and query strings were discarded. No browser-visit or conversion
row was fabricated from these server requests. This sample produced no AI-identified
requests under the application's classifier; it does not establish an absence of AI
crawling outside the sample or an independently verified customer population.

Individual-record GraphQL checks returned no usable rows for the requested windows;
that response is not treated as zero traffic. One schema/availability query encountered
a documented query-budget throttle; the bounded retry followed its cooling-off window.
The aggregate and live-tail evidence are retained separately in the ignored local
qualification directory, with acquisition time and source labels.

Cloudflare now gives at least 30 days of adaptive analytics history on every plan,
subject to dataset/field limits. See [analytics retention](https://developers.cloudflare.com/changelog/post/2026-10-02-30-days-analytics-on-every-plan/).
Logpush is also available on all plans with included usage followed by usage charges;
no continuous/billable export, plan upgrade or extra credential was created here.

## GA4: read-only authorization restored and actual source data checked

On 2026-10-30 the user completed Google's existing-client security warning and
read-only consent. The fresh loopback/PKCE callback completed at 04:29 UTC. The renewed
credential passed a live Analytics metadata check and was saved atomically with mode
0600, preserving the existing client, quota-project/account settings and the single
`https://www.googleapis.com/auth/analytics.readonly` scope. No Google credential was
uploaded to AEO staging, and no OAuth app was published or scope broadened.

The actual web-stream default hostnames matched plate.hk (`properties/524225496`)
and aeo.io (`properties/545695279`). Both properties use Asia/Hong_Kong. Bounded Data
API reports covered 2026-10-22 through 2026-10-28 inclusive, with exact root/www hostname
filters. The recent processing dates were excluded. Totals and event-name rows were
retained privately; event counts and key-event counts reconciled between the reports.
The returned reports exposed no sampling metadata or data loss from an “other” row.
These checks do not establish complete collection, human-only traffic or finality of
Google's processing. Private business traffic volumes are not published here.

Plate.hk has configured `purchase` and `lookup_exact_match` key events. The latter
has observed key-event occurrences in the checked window; a configured purchase alone
is not evidence of a purchase. AEO.io has a configured purchase key event but no observed
key-event occurrences in this window. These are GA4 observations, not proof of causal AI
attribution. GA4 aggregates were not inserted into v2 raw browser receipts, and the v2
browser-connection and conversion states were not changed by this external source check.

After the user explicitly approved metadata-only discovery, the search completed
across all properties and web streams available in the connected Google account, with
no metadata errors. No default web-stream URL matched `measurable.ai` or
`www.measurable.ai`. The private evidence records the enumeration bounds and complete
counts. Only property/stream names, identifiers and default URLs were retained for
this discovery; no traffic report was requested for any other site. The previously
rejected broader query was run only after the user granted this specific scope.

Measurable.ai remains unconnected through this account. This does not establish that
the site has no Analytics collection, no property under another identity, or no traffic;
a stream with another default URL is also not ruled out as a possible collection
source. No new property, stream, grant or tracking tag was created. A matching property/
stream accessible to the connected identity, or another explicit source mapping, is
needed before its traffic or key events can be qualified.

The installed Analytics adapter retains the old credential in its already-running
process. Its current tool call still returns `invalid_grant`; a fresh interpreter
running the same installed adapter's report function successfully read only the verified
Plate.hk property and exactly matched the official SDK result. This establishes that the
renewed credential and installed adapter work after reload. No unrelated chat process
was terminated, package patched or global MCP configuration changed. The current
in-memory adapter still needs a supported client reload before its existing tool session
can use the renewed file. The qualification reads were completed through the fresh
Google SDK client at the same read-only scope.

Private evidence is retained in the ignored local qualification directory:
`ga4-reauthorization-result.json`, `ga4-real-source-qualification.json`,
`ga4-adapter-verification.json`, `measurable-ga4-metadata-discovery.json` and
their bounded query scripts, all mode 0600.

The testing-client warning is also relevant to durability: Google documents seven-day
refresh-token expiry for external apps in Testing when more than basic identity scopes
are requested. That is a possible contributor to recurring renewal needs, not proof of
the specific revocation cause here. See [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
Publishing/verifying a client or replacing it with a property-scoped service identity is
an owner/admin decision, not an automatic change made during this renewal.

Production remains on v1. This record supersedes the earlier implication that a new
Cloudflare Logs Read credential was necessarily required for bounded source validation;
the Google security handoff and bounded GA4 reads have now completed. Measurable.ai
has no declared matching web stream in the connected account; its traffic remains
unqualified. The existing Analytics tool session's cached credential remains unresolved.
Real-site v2 tracker/conversion acceptance remains a separate replacement gate.
