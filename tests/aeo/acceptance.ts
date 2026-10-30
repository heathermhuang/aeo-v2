import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { db } from '../../src/lib/aeo/db';
import { signup as beginSignup } from '../../src/lib/aeo/auth';
import type { IdentityMessage } from '../../src/lib/aeo/mail';
import { runAnswer } from '../../src/lib/aeo/answers';
const origin = process.env.AEO_PUBLIC_URL!;
if (
  !origin?.startsWith('http://127.0.0.1:') ||
  !process.env.DATABASE_URL?.includes('/aeo_v2_candidate')
)
  throw new Error('Acceptance requires the explicitly isolated candidate environment.');
const stamp = randomUUID().slice(0, 8),
  password = randomBytes(20).toString('hex');
let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks++;
  console.log('PASS ' + label);
}
type Actor = { email: string; cookie: string; id?: string; workspace?: string; site?: string };
async function request(
  actor: Actor | null,
  path: string,
  method = 'GET',
  data?: unknown,
  expected = 200,
  headerOverrides: Record<string, string> = {},
) {
  const response = await fetch(origin + '/api/aeo/' + path, {
    method,
    headers: {
      origin,
      'Content-Type': 'application/json',
      ...(actor ? { cookie: actor.cookie } : {}),
      ...headerOverrides,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON ${response.status} on ${path}: ${text.slice(0, 100)}`);
  }
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(body)}`);
  check(
    response.headers.get('cache-control')?.includes('no-store'),
    'private response is not cacheable: ' + path,
  );
  return { response, body };
}
async function signup(label: string): Promise<Actor> {
  const actor = { email: `aeo-${label}-${stamp}@example.com`, cookie: '' };
  let message: IdentityMessage | undefined;
  await beginSignup(
    { email: actor.email, workspace: `Acceptance ${label} ${stamp}` },
    async mail => {
      message = mail;
    },
  );
  check(Boolean(message), 'synthetic email proof captured without sending mail');
  await request(null, 'login', 'POST', { email: actor.email, password }, 401);
  const { response } = await request(null, 'identity/complete', 'POST', {
    token: message!.token,
    purpose: message!.purpose,
    password,
  });
  actor.cookie = response.headers.get('set-cookie')!.split(';')[0];
  check(response.headers.get('set-cookie')!.includes('HttpOnly'), 'session is HttpOnly');
  const session = (await request(actor, 'session')).body;
  check(!JSON.stringify(session).includes(password), 'session never returns credentials');
  return { ...actor, id: session.user.id, workspace: session.workspaces[0].id };
}
async function main() {
  await request(null, 'health');
  const a = await signup('alpha'),
    b = await signup('beta'),
    reader = await signup('reader');
  await request(null, 'session', 'GET', undefined, 401);
  await request(
    null,
    'login',
    'POST',
    { email: a.email, password: 'incorrect-test-password' },
    401,
  );
  await request(
    null,
    'signup',
    'POST',
    { email: `injection-${stamp}@example.com`, password, workspace: 'Injected', role: 'admin' },
    400,
  );
  const factory = (
    await db.query(
      `SELECT deleted_at FROM "user" WHERE user_id='41e2b680-648e-4b09-bcd7-3e2b10c06264'`,
    )
  ).rows[0];
  check(Boolean(factory.deleted_at), 'unchanged factory administrator is disabled');
  for (const path of ['/api/auth/login', '/api/users', '/api/teams', '/api/websites']) {
    const response = await fetch(origin + path, {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json', cookie: a.cookie },
      body: JSON.stringify({ username: a.email, password }),
    });
    check(response.status === 404, 'legacy management surface cannot bypass SaaS policy: ' + path);
  }
  await request(
    a,
    'sites',
    'POST',
    { workspaceId: a.workspace, domain: 'alpha-aeo.com', role: 'admin' },
    400,
  );
  a.site = (
    await request(a, 'sites', 'POST', { workspaceId: a.workspace, domain: 'alpha-aeo.com' }, 201)
  ).body.id;
  b.site = (
    await request(b, 'sites', 'POST', { workspaceId: b.workspace, domain: 'beta-aeo.com' }, 201)
  ).body.id;
  const foreign = await fetch(origin + `/api/websites/${b.site}`, {
    headers: { cookie: a.cookie },
  });
  check(foreign.status === 404, 'legacy private reads are not exposed by the hosted AEO app');
  for (const suffix of ['summary', 'export', 'connection', 'answer-jobs'])
    await request(b, `sites/${a.site}/${suffix}`, 'GET', undefined, 404);
  await request(b, `workspaces/${a.workspace}/sites`, 'GET', undefined, 404);
  await request(b, `workspaces/${a.workspace}/members`, 'GET', undefined, 404);
  await request(b, `sites/${a.site}/logs`, 'POST', { format: 'json', records: [] }, 404);
  await request(
    b,
    `sites/${a.site}/answers`,
    'POST',
    { question: 'A question?', method: 'manual', answer: 'secret' },
    404,
  );
  await request(a, `sites/${a.site}/summary`, 'GET', undefined, 200, {
    origin: 'https://external.example',
  });
  await request(a, 'sites', 'POST', { workspaceId: a.workspace, domain: 'forged-aeo.com' }, 403, {
    origin: 'https://external.example',
  });
  await request(a, 'sites', 'POST', { workspaceId: a.workspace, domain: '127.0.0.1' }, 400);
  const empty = (await request(a, `sites/${a.site}/summary`)).body;
  check(
    empty.traffic.pageviews === null &&
      empty.crawl.coverage === null &&
      empty.traffic.conversions === null,
    'missing inputs stay null, never observed zero',
  );
  await request(
    a,
    `workspaces/${a.workspace}/members`,
    'POST',
    { email: reader.email, role: 'team-view-only' },
    201,
  );
  await request(reader, `sites/${a.site}/summary`);
  await request(reader, `sites/${a.site}/goal`, 'PUT', { goalEvent: 'signup_completed' }, 403);
  await request(reader, `sites/${a.site}/catalog`, 'POST', { format: 'json', content: '[]' }, 403);
  await request(
    reader,
    `workspaces/${a.workspace}/members`,
    'POST',
    { email: b.email, role: 'team-manager' },
    403,
  );
  await request(a, `workspaces/${a.workspace}/members/${a.id}`, 'DELETE', {}, 403);
  await request(a, `workspaces/${a.workspace}/members/${reader.id}`, 'DELETE', {});
  await request(reader, `sites/${a.site}/summary`, 'GET', undefined, 404);
  check(true, 'membership removal revokes access immediately');
  const inventory = JSON.stringify(
    Array.from({ length: 55 }, (_, i) => ({
      url: `https://alpha-aeo.com/page-${i}`,
      title: `Important page ${i}`,
    })),
  );
  await request(a, `sites/${a.site}/catalog`, 'POST', { format: 'json', content: inventory }, 201);
  const logs = {
    format: 'json',
    records: [
      {
        time: new Date().toISOString(),
        ip: '203.0.113.22',
        path: '/page-0',
        method: 'GET',
        status: 403,
        bytes: 100,
        userAgent: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
      },
    ],
  };
  const imported = await request(a, `sites/${a.site}/logs`, 'POST', logs, 201);
  const duplicate = await request(a, `sites/${a.site}/logs`, 'POST', logs, 201);
  check(duplicate.body.duplicate === true, 'log import retries deduplicate');
  await request(
    a,
    `sites/${a.site}/answers`,
    'POST',
    {
      question: 'Which service handles our buyer workflow?',
      method: 'Acceptance test fixture',
      answer: 'Synthetic response for acceptance only. <script>alert(1)</script>',
    },
    201,
  );
  await request(a, `sites/${a.site}/goal`, 'PUT', { goalEvent: 'signup_completed' });
  const summary = (await request(a, `sites/${a.site}/summary`)).body;
  check(
    summary.crawl.inventory === 55 && summary.pages.length === 50,
    'inventory denominator is complete while the displayed page list is bounded',
  );
  check(
    summary.answers.length === 1 && summary.answers[0].sourceKind === 'user_import',
    'imported answers cannot claim provider provenance',
  );
  check(summary.crawl.verified === 0, 'a user-agent claim cannot manufacture IP verification');
  check(summary.crawl.errors >= 1, 'imported AI access failures produce actionable findings');
  const exported = (await request(a, `sites/${a.site}/export`)).body;
  check(
    !JSON.stringify(exported).includes('203.0.113.22') &&
      !JSON.stringify(exported).includes('ip_hash'),
    'export omits raw and hashed visitor IPs',
  );
  const receipt = await fetch(origin + '/api/send', {
    method: 'POST',
    headers: {
      origin: 'https://alpha-aeo.com',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 Synthetic AEO acceptance',
    },
    body: JSON.stringify({
      type: 'event',
      payload: {
        website: a.site,
        hostname: 'alpha-aeo.com',
        url: 'https://alpha-aeo.com/acceptance',
        title: 'Synthetic acceptance only',
        language: 'en',
        screen: '1280x720',
        webdriver: true,
      },
    }),
  });
  check(receipt.status === 200, 'public tracker intake records a synthetic browser event');
  const received = (await request(a, `sites/${a.site}/summary`)).body;
  check(
    Math.abs(Date.now() - Date.parse(received.traffic.lastReceivedAt)) < 60000,
    'received event time has no host-timezone drift',
  );
  check(
    received.traffic.pageviews === null,
    'an automated receipt cannot manufacture qualified traffic',
  );
  const beta = (await request(b, `sites/${b.site}/summary`)).body;
  check(
    beta.answers.length === 0 && beta.crawl.inventory === 0,
    'independent tenant remains empty',
  );
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      fetch(origin + '/api/aeo/sites', {
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json', cookie: a.cookie },
        body: JSON.stringify({ workspaceId: a.workspace, domain: `limit-${stamp}-${i}.com` }),
      }),
    ),
  );
  check(
    concurrent.filter(r => r.status === 201).length === 2 &&
      concurrent.filter(r => r.status === 429).length === 3,
    'concurrent requests cannot overshoot the workspace site allowance',
  );
  // Provider collection uses an injected transport: no paid external call occurs in this test.
  process.env.AEO_ANSWER_API_KEY = 'acceptance-only';
  process.env.AEO_ANSWER_MODEL = 'acceptance/fake-model';
  process.env.AEO_ANSWER_DAILY_LIMIT = '10';
  process.env.AEO_ANSWER_INSTALLATION_DAILY_LIMIT = '100';
  let providerCalls = 0;
  const fake = (async () => {
    providerCalls++;
    return Response.json({
      choices: [
        {
          message: { content: 'Synthetic provider response for acceptance.' },
          finish_reason: 'stop',
        },
      ],
    });
  }) as typeof fetch;
  const requestId = randomUUID(),
    first = await runAnswer(
      a.id!,
      a.site!,
      { requestId, question: 'Which tool should a small team consider?' },
      fake,
    ),
    again = await runAnswer(
      a.id!,
      a.site!,
      { requestId, question: 'Which tool should a small team consider?' },
      fake,
    );
  check(
    providerCalls === 1 && first.answerId === again.answerId && again.reused,
    'replayed check IDs never repeat provider work',
  );
  await assert.rejects(
    runAnswer(
      a.id!,
      a.site!,
      { requestId, question: 'A changed question must not reuse this ID' },
      fake,
    ),
    { status: 409 },
  );
  const failedId = randomUUID();
  await assert.rejects(
    runAnswer(
      a.id!,
      a.site!,
      { requestId: failedId, question: 'Test a provider outage without retries' },
      (async () => new Response('', { status: 503 })) as typeof fetch,
    ),
    { status: 502 },
  );
  const failure = await runAnswer(
    a.id!,
    a.site!,
    { requestId: failedId, question: 'Test a provider outage without retries' },
    fake,
  );
  check(
    failure.state === 'failed' && providerCalls === 1,
    'a failed check is durable and does not silently retry',
  );
  await assert.rejects(
    runAnswer(
      b.id!,
      a.site!,
      { requestId: randomUUID(), question: 'Cross tenant provider work must be rejected' },
      fake,
    ),
    { status: 404 },
  );
  const revoke = await signup('revoke');
  await request(
    a,
    `workspaces/${a.workspace}/members`,
    'POST',
    { email: revoke.email, role: 'team-manager' },
    201,
  );
  await assert.rejects(
    runAnswer(
      revoke.id!,
      a.site!,
      { requestId: randomUUID(), question: 'Membership removed while the provider is working' },
      (async () => {
        await request(a, `workspaces/${a.workspace}/members/${revoke.id}`, 'DELETE', {});
        return Response.json({
          choices: [
            { message: { content: 'This result must not publish.' }, finish_reason: 'stop' },
          ],
        });
      }) as typeof fetch,
    ),
    { status: 404 },
  );
  check(
    !(await request(a, `sites/${a.site}/summary`)).body.answers.some(
      (r: any) => r.answer === 'This result must not publish.',
    ),
    'revoked worker authority cannot publish an answer',
  );
  await db.query(`UPDATE "user" SET password=$2 WHERE user_id=$1`, [
    reader.id,
    '$2b$12$vsRMVhb92r68HRyLtP8U3uXEMc.9iCoxh1EQB6gfBB1xkXNZqXdby',
  ]);
  await request(reader, 'session', 'GET', undefined, 401);
  // Recreate an authenticated session for the logout check using the unaffected beta account.
  await request(b, 'logout', 'POST', {});
  await request(b, 'session', 'GET', undefined, 401);
  await writeFile(
    '.local/browser-fixture.json',
    JSON.stringify({
      email: a.email,
      password,
      workspace: a.workspace,
      site: a.site,
      synthetic: true,
    }),
    { mode: 0o600 },
  );
  await writeFile(
    '.local/acceptance.json',
    JSON.stringify(
      {
        passed: true,
        checks,
        fixture: 'synthetic-only isolated database',
        paidProviderCalls: 0,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`ACCEPTANCE PASSED: ${checks} checks; no paid provider calls.`);
}
try {
  await main();
} finally {
  await db.end();
}
