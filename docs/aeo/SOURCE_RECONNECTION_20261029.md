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

## GA4: exact-scope renewal prepared; user security step required

The owning Analytics MCP configuration uses an authorized-user credential with the
single scope `https://www.googleapis.com/auth/analytics.readonly`. Its refresh grant
returns `invalid_grant`. A new loopback/PKCE authorization was prepared with the same
existing OAuth client and scope. The credential is replaced atomically only after a
successful Analytics metadata check; the existing quota-project/account settings and
private file permissions are retained. No Google credential is uploaded to AEO staging.

Google displays “Google hasn’t verified this app” for the existing Codex Analytics
testing client. The browser-tool security policy requires the human user to handle
that warning. The agent has not clicked through it, broadened scopes, switched clients,
published the OAuth app or claimed reconnection success. The current browser handoff
uses a refreshed, one-hour local callback window; the earlier short window expired
without changing the credential.

After the user completes the trusted-client warning and read-only consent, verify the
callback result, reload only the affected Analytics client if its credential cache is
stale, validate each property's web-stream hostname against the three authorized sites,
and obtain the real traffic/key-event evidence. Do not backfill GA4 aggregates into v2
raw browser receipts or label them as observed AI-attributed conversions.

The testing-client warning is also relevant to durability: Google documents seven-day
refresh-token expiry for external apps in Testing when more than basic identity scopes
are requested. That is a possible contributor to recurring renewal needs, not proof of
the specific revocation cause here. See [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
Publishing/verifying a client or replacing it with a property-scoped service identity is
an owner/admin decision, not an automatic change made during this renewal.

Production remains on v1. This record supersedes the earlier implication that a new
Cloudflare Logs Read credential was necessarily required for bounded source validation;
the remaining immediate source-authentication blocker is the Google security handoff.
