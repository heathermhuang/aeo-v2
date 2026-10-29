# AEO v2 qualification — 2026-10-29

Production aeo.io remains v1. The candidate is deployed privately at
https://staging.aeo.io. This record distinguishes implementation/operator evidence
from independent customer acceptance and production replacement.

## Review and implementation

The ordered review found missing email ownership/recovery, unqualified v1 migration,
upstream lag and incomplete real-data/user acceptance. The code now integrates the
reviewed GEOInflow application changes through `5d66c239` with original checksums;
retains AEO's route boundary, UTC connections, four main views and upstream notices;
and leaves retention inactive. Upstream publication/push policy was excluded.

Signup allocates no account/session before email proof. The owner chooses a password
after receiving the link. Single-use proof expires after 30 minutes; recovery revokes
old passwords/sessions. Administrator/second-factor accounts cannot be downgraded.
The AEO-only mail relay has a dedicated host-generated secret, fixed sender/template/
AEO link origin, body/rate limits and no automatic retry or invocation-body logging.

The user approved repairing the missing support@aeo.io forwarding rule to an existing
verified owner inbox. Initial delivery failed with SMTP 550 unknown address; the
approved exact-address route was added, other routes and MX records were preserved,
and live verification/recovery subsequently passed through the actual inbox. The old
password and session were rejected. No test tokens or credentials are in this record.

## Observed qualification

- 220 focused upstream tests passed, including real PostgreSQL retention/queue tests.
- 32 synthetic identity checks and 10 archive access/claim checks passed, plus input,
  container-boundary, mail-relay and archive-export regressions, typecheck and build.
- The accepted final application image passed 88 API/database assertions. Hosted HTTPS
  passed 52 checks after the identity changes, including tenant isolation, immediate
  revocation, private headers, blocked inherited APIs, provenance and UTC receipts.
- Measured hosted Chrome contexts at 390×844 (DPR 3) and 1280×900 passed the synthetic
  finding/identity-caveat/recheck/archive journey and the actual inbox-verified account's
  three-site/connection/recheck/live-answer journey, with zero page errors and no page
  overflow. These are operator browser tests, not physical-phone or independent
  customer acceptance. Synthetic proof preparation never sends mail to fake addresses.

## Authorized actual sites and provider collection

The user authorized aeo.io, measurable.ai and plate.hk. Their verified workspace has
5, 1 and 835 eligible inventory URLs respectively. Plate's declared sitemap has 841
entries; the imported set excludes query-bearing/out-of-scope entries. Measurable's
robots-declared sitemap endpoint returned HTML, so only the verified homepage was
used. These are declared/selected inventories, not proof every page was crawled.

A bounded Cloudflare live tail captured one real aeo.io `/terms` request, HTTP 200,
with the explicit AEO operator-probe User-Agent. Private headers and query strings
were discarded. This verifies the receipt/import path; it is not organic traffic,
a verified AI crawler or a conversion. Cloudflare Logpull/Logpush access returned
403 under the available grant, Measurable's zone is not available under that grant,
and the connected GA4 grant is expired/revoked. No source-access failure became an
empty-dataset or traffic-growth claim.

After explicit approval, a dedicated OpenRouter key enforced US$0.10 total, no reset
and one-hour expiry. Exactly three `openai/gpt-4.1-mini` attempts completed, one per
authorized site, with no search or automatic retries. Usage was US$0.0017248. Raw
answer text, source kind, acquisition method and hashes were retained. An idempotent
replay reused existing work; a fourth attempt was rejected before provider work.
Collection was then disabled, the key was disabled, and temporary copies removed.
No top-up, subscription, extra droplet or paid add-on was purchased.

Textual URLs in API answers are not verified citations or consumer-interface evidence.
The v2 workspace still shows browser traffic unconnected and conversions unavailable.
Historical first-party v1 product events are preserved separately; they include operator/
QA activity and do not establish AI-attributed conversions or independent adoption.

## Migration, backup and rollback

V1 remains Worker version `39ad6c27-19ee-4e77-88e8-5512a183bfcd`. The explicitly
approved private local D1 snapshot has SHA-256
`d03928e4872988a7e129b0fd5c6704c60c419249a2cf36e97d007d50bc898832`.
It restored into SQLite with integrity/foreign-key checks. The archive preserves
18 accounts (9 eligible for fresh ownership proof) and 1,515 evidence records,
including citations, confirmed profiles and source-ledger relationships. All raw
records/hashes matched after import. No real v1 identity was claimed or mailed.

The final export explicitly marks SQLite UTC timestamp metadata with an offset so
Singapore browsers do not shift historical times. Raw source timestamp text and hashes
remain unchanged. Its fresh UTC rehearsal database retained all 1,515 records with
UTC metadata. Exact replay/corruption/rollback were tested without overwriting earlier
rehearsals. A second logical restore retained 72 upstream migrations, five AEO migrations,
all 1,515 archived records, zero claimed real accounts and zero live observations.

On staging, the pre-update backup restored to a separate database. The previous
staging image was started against that restored baseline with no public port or paid
allowance. The live database was not replaced. A post-qualification backup also restored
separately with 72 upstream migrations, five AEO migrations, seven sites, four verified
identities and three paid job/answer receipts. These are same-host staging rehearsals,
not offsite disaster recovery or a rehearsal of the production Worker/DNS route change.
Never use `compose down -v` against the retained volume.

## Image provenance

Application payload: `ef2fb7447d597b2b50004cc69faf577413a3e206`. Through the packaging
revision `c38e95a52d1b9660d3807135f14ea22a0796d022`, application/schema/startup/config/
dependency sources are identical; only migration tooling, notices, CI/tests and docs
changed. The tested amd64 payload was reused with the revised migration tools and
license files; no second compilation is claimed for those unchanged application files.

Qualified local image: `sha256:4691cc47859fa89561b6dae32dcb629f593f643c1a64a446e94245dd63847a1e`.
Host-loaded image: `sha256:4dfc66672a7d8342fbe1a52578563377f902fb45fb65a53a5a2280ea08868728`.
All 23 filesystem layers matched. Canonical Architecture/OS/RootFS/Config SHA-256:
`d68cb59058249c5bb8df0173e15a30e7c138e898f1e082c99a9037f234917b42`.
The last off-host UTC export-tool correction is qualified separately and does not
change the app runtime, database schema, hosted UI or the above accepted payload.

Native/container acceptance and secret scan passed on `6f52e67`; final branch checks
are attached to [PR #1](https://github.com/heathermhuang/aeo-v2/pull/1).
The legacy dirty checkout, production Worker/D1, current routes and historical records
were preserved. Only the explicitly approved support-mail forwarding configuration
changed in the v1 domain's operational setup.

## Remaining replacement gates

1. Install/qualify real-site browser/conversion collection and obtain usable ongoing
   logs/analytics access. The one controlled receipt and imported historical events
   do not qualify real visits or conversions. Staging's Basic gate intentionally
   continues to block external tracker delivery without the gate credential.
2. Independent customer/physical-phone acceptance remains unproven. The user assigned
   the agent to testing; the resulting evidence is labelled operator emulation.
3. Decide any ongoing dedicated provider allowance. The three-call pilot is complete;
   it does not authorize recurring provider spend or a production entitlement.
4. Reconcile the final v1 delta, preserve old links/read-only access, approve the target
   handling of private migration data as needed, and rehearse the exact production
   routing/rollback with old/new release identities. Then replace aeo.io only when all
   required gates pass. No routine approval gate is added to the already-authorized
   cutover; these are outstanding evidence, access and financial boundaries.
