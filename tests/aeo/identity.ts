import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { db } from '../../src/lib/aeo/db';
import {
  signup,
  recover,
  completeIdentity,
  login,
  principal,
  cookie,
  digest,
} from '../../src/lib/aeo/auth';
import { sendIdentityMail, type IdentityMessage } from '../../src/lib/aeo/mail';
const url = new URL(process.env.DATABASE_URL || '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/aeo_v2_candidate')
  throw new Error('Owned local candidate database required');
let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks++;
  console.log('PASS ' + message);
};
const password = randomBytes(20).toString('hex');
const address = (label: string) => `${label}-${randomUUID()}@example.com`;
async function messageFor(email: string, recovery = false) {
  let message: IdentityMessage | undefined;
  const capture = async (mail: IdentityMessage) => {
    message = mail;
  };
  const result = recovery
    ? await recover({ email }, capture)
    : await signup({ email, workspace: 'Identity synthetic' }, capture);
  check(result.accepted, 'request accepted without credentials or session');
  return message;
}
const request = (token: string) =>
  new Request('http://127.0.0.1/api', { headers: { cookie: cookie(token) } });
try {
  await db.query('DELETE FROM aeo_rate_limit WHERE key=$1', [digest('identity:installation')]);
  const email = address('proof');
  const proof = (await messageFor(email))!;
  check(
    !(await db.query('SELECT 1 FROM "user" WHERE username=$1', [email])).rowCount,
    'enrollment has no user or workspace before proof',
  );
  await assert.rejects(login({ email, password }), { status: 401 });
  checks++;
  await assert.rejects(completeIdentity({ token: proof.token, purpose: 'recover', password }), {
    status: 401,
  });
  checks++;
  const token = await completeIdentity({ token: proof.token, purpose: 'verify', password });
  const user = await principal(request(token));
  check(user.email === email, 'fresh email proof grants ordinary account access');
  const role = (await db.query('SELECT role FROM "user" WHERE user_id=$1', [user.id])).rows[0].role;
  check(role === 'user', 'email enrollment never creates an administrator');
  await assert.rejects(completeIdentity({ token: proof.token, purpose: 'verify', password }), {
    status: 401,
  });
  checks++;
  const recovery = (await messageFor(email, true))!;
  check(recovery.purpose === 'recover', 'existing account receives recovery proof');
  const newPassword = randomBytes(20).toString('hex');
  const recovered = await completeIdentity({
    token: recovery.token,
    purpose: recovery.purpose,
    password: newPassword,
  });
  check(
    (await principal(request(recovered))).id === user.id,
    'recovery preserves user and workspace identity',
  );
  await assert.rejects(principal(request(token)), { status: 401 });
  checks++;
  await assert.rejects(login({ email, password }), { status: 401 });
  checks++;
  check(
    Boolean(await login({ email, password: newPassword })),
    'only owner-chosen new password works',
  );
  const expired = (await messageFor(address('expired')))!;
  await db.query(
    "UPDATE aeo_identity_token SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [digest(expired.token)],
  );
  await assert.rejects(
    completeIdentity({ token: expired.token, purpose: expired.purpose, password }),
    { status: 401 },
  );
  checks++;
  const racing = (await messageFor(address('race')))!;
  const race = await Promise.allSettled(
    [1, 2].map(() => completeIdentity({ token: racing.token, purpose: racing.purpose, password })),
  );
  check(
    race.filter(x => x.status === 'fulfilled').length === 1,
    'concurrent proof replay creates exactly one session',
  );
  const unknown = await messageFor(address('missing'), true);
  check(!unknown, 'unknown recovery reveals no account and sends no mail');
  const pending = address('unverified');
  const pendingId = randomUUID();
  await db.query(
    `INSERT INTO "user"(user_id,username,password,role) VALUES($1,$2,'untrusted old password','user')`,
    [pendingId, pending],
  );
  await assert.rejects(login({ email: pending, password: 'untrusted old password' }), {
    status: 401,
  });
  checks++;
  const claim = (await messageFor(pending))!;
  check(claim.purpose === 'recover', 'pre-verification candidate account requires fresh recovery');
  const claimed = await completeIdentity({ token: claim.token, purpose: claim.purpose, password });
  check(
    (await principal(request(claimed))).id === pendingId,
    'proof preserves pre-existing candidate ownership',
  );
  const stale = (await messageFor(pending, true))!;
  await db.query('UPDATE "user" SET password=$2 WHERE user_id=$1', [
    pendingId,
    randomBytes(30).toString('hex'),
  ]);
  await assert.rejects(completeIdentity({ token: stale.token, purpose: stale.purpose, password }), {
    status: 409,
  });
  checks++;
  for (const protectedRole of ['admin', 'user']) {
    const id = randomUUID(),
      email = address('protected');
    await db.query('INSERT INTO "user"(user_id,username,password,role) VALUES($1,$2,$3,$4)', [
      id,
      email,
      'inert',
      protectedRole,
    ]);
    if (protectedRole === 'user')
      await db.query(
        "INSERT INTO two_factor_auth(id,user_id,secret,is_enabled,updated_at) VALUES('synthetic-'||$1::text,$1::uuid,$2,true,now())",
        [id, 'synthetic'],
      );
    check(!(await messageFor(email, true)), 'email recovery cannot downgrade protected account');
  }
  const oldEnv = { ...process.env };
  process.env.AEO_EMAIL_RELAY_URL =
    'https://aeo-v2-identity-mail.synthetic.workers.dev/identity-mail';
  process.env.AEO_EMAIL_RELAY_KEY = 'a'.repeat(64);
  let outbound: any;
  await sendIdentityMail(proof, (async (url, options) => {
    outbound = { url, ...options, payload: JSON.parse(String(options?.body)) };
    return Response.json({ accepted: true });
  }) as typeof fetch);
  check(
    outbound.url === process.env.AEO_EMAIL_RELAY_URL,
    'mail credential goes only to dedicated AEO relay',
  );
  check(
    outbound.redirect === 'error' && outbound.payload.token === proof.token,
    'relay transport rejects redirects and preserves proof',
  );
  await assert.rejects(
    sendIdentityMail(proof, (async () => Response.json({ accepted: false })) as typeof fetch),
    { status: 503 },
  );
  checks++;
  process.env = oldEnv;
  console.log(
    JSON.stringify({
      status: 'passed',
      checks,
      evidence: 'synthetic, no live mail or provider calls',
    }),
  );
} finally {
  await db.end();
}
