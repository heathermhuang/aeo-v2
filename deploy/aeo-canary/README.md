# Production sign-in canary

The scheduled workflow in `aeo-v2` exercises the public mobile-width browser journey on
`https://aeo.io`. It checks v2 health, signs in, receives an actual recovery email,
completes the recovery form, verifies that the old session and used link are rejected,
and signs out. It reports only the stage and the public release identifier. It uses
one dedicated owner account and its empty workspace. It blocks analytics requests.

Cloudflare Email Routing sends one exact `v2-canary-<20 lowercase hex digits>@aeo.io`
address to the `aeo-v2-canary-mail` Worker. The mailbox accepts only AEO account mail
for that recipient. It exposes only the matching recent proof, once, to an authenticated
caller. Unclaimed proofs expire after five minutes. The Worker has no app credentials
or customer database binding. Keep invocation logs and traces off.

## Provisioning and recovery

- Deploy `wrangler.jsonc` with `CANARY_EMAIL` and `CANARY_MAILBOX_KEY` as Worker secrets.
  Use a random address matching the pattern above and a 32-byte random hex key. Create
  an exact-recipient routing rule for that address. Leave other routes and MX records in place.
- Populate `AEO_CANARY_EMAIL`, `AEO_CANARY_PASSWORD`, and `AEO_CANARY_MAILBOX_KEY` in the
  `production-signin-canary` GitHub environment restricted to `main`. Put the Worker origin
  in its `AEO_CANARY_MAILBOX_URL` variable. Use a random URL-safe password of 24 to 72 characters.
- For first-time enrollment on a new address, install the locked dependencies and Chromium,
  provide those four values privately, then run `node signin.mjs --enroll` from this directory.
  Enrollment verifies actual email receipt, creates the empty account, and signs out.
  Run `node signin.mjs` next, then manually dispatch the workflow on `main` for verification
  from GitHub Actions. Keep the scheduled run on `main`.
- A failure stage identifies the affected part of the journey. Check provider delivery for
  a delivery failure. Wait for the app's identity rate limit window before repeated sends.
  If rotating an account password, use the real recovery flow for this mailbox and update
  the environment secret to match. Never include addresses, credentials, proofs, cookies,
  traces or recorded browser sessions in incident reports.
