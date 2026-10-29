# Account ownership and recovery

Signup requests an email proof without allocating a user, team or session. The link
opens a password form; the email owner chooses the password after receiving proof.
An attacker cannot preselect a password and wait for the owner to click a link.
Existing candidate accounts must use recovery before their previous email claim
becomes verified. No old staging password is proof of customer ownership.

Tokens contain 32 random bytes, are stored only as SHA-256 hashes, expire after
30 minutes and are single-use. Enrollment/recovery serialize per email; tokens
bind to the current account/password state. Confirmation consumes all outstanding
proofs for the address, changes the password and revokes every previous session.
Administrator and second-factor accounts cannot use this email recovery path.
Private operations require an identity whose verified email matches the account.
Members must complete proof before being added to another workspace.

Links use a URL fragment. The client removes it immediately and submits proof only
in a same-origin POST after the user chooses a password. GET and email link previews
do not consume a token or reset an account. Never log or screenshot the fragment.

## Delivery configuration

The user authorized an AEO-only Cloudflare Worker relay with the existing sender
`notifications@aeo.io`. It has a restricted Email Sending binding, a dedicated random
secret, fixed identity templates, a fixed AEO link origin, a bounded body and a global
5-per-minute edge limit. The app additionally limits requests per email and installation.
No arbitrary message, sender, link origin, attachment or other project is accepted.
Invocation logs and traces are disabled to keep recipients and links out of logs.
See `deploy/aeo-mail/`. The relay performs one binding send and makes no automatic retry.

Generate its dedicated secret directly on the AEO host in a root-only file, provision
that same secret to this AEO Worker, then let the host read its own file into
`AEO_EMAIL_RELAY_KEY`. Set `AEO_EMAIL_RELAY_URL` to the exact deployed relay endpoint.
Compose passes only these values to the app. No general Cloudflare token enters the
Docker host. Missing configuration returns an unavailable message and grants no access.
The v1 Worker and binding are unchanged. Request acceptance is not inbox delivery.

The implementation follows [Cloudflare's binding contract](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).
The app rejects redirects and accepts only the dedicated `aeo-v2-identity-mail` Worker
URL pattern. Recovery cannot bypass required or enabled second-factor protection.

Synthetic verification injects a mail capture directly in the isolated test process;
there is no HTTP verification bypass or deployed test mailbox. Live mail delivery and
an independent inbox recovery remain acceptance gates until actually observed.
