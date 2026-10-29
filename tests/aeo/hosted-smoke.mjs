import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Explicitly invoked synthetic staging exercise. Never targets customer production.
const origin = 'https://staging.aeo.io';
if (process.env.AEO_HOSTED_SYNTHETIC_TEST !== '1')
  throw new Error('Set AEO_HOSTED_SYNTHETIC_TEST=1 to create synthetic staging fixtures.');
const access = JSON.parse(await readFile('.local/hosted-staging-access.json', 'utf8'));
assert.equal(access.origin, origin, 'credentials belong to this exact staging origin');
const authorization =
  'Basic ' + Buffer.from(`${access.username}:${access.password}`).toString('base64');
const stamp = randomUUID().slice(0, 8);
const password = randomBytes(24).toString('hex');
let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  console.log('PASS ' + label);
  checks++;
}
async function raw(path, options = {}, authenticated = true) {
  return fetch(origin + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(authenticated ? { authorization } : {}),
      ...options.headers,
    },
  });
}
async function request(actor, path, method = 'GET', data, status = 200, extra = {}) {
  const response = await raw('/api/aeo/' + path, {
    method,
    headers: {
      origin,
      'content-type': 'application/json',
      ...(actor ? { cookie: actor.cookie } : {}),
      ...extra,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  check(response.headers.get('cache-control')?.includes('no-store'), 'private cache policy');
  return { response, data: await response.json() };
}
async function signup(label) {
  const email = `hosted-${label}-${stamp}@example.test`;
  const { response } = await request(null, 'signup', 'POST', {
    email,
    password,
    workspace: `Synthetic hosted ${label} ${stamp}`,
  });
  const setCookie = response.headers.get('set-cookie');
  check(
    setCookie.includes('Secure') &&
      setCookie.includes('HttpOnly') &&
      setCookie.includes('SameSite=Lax'),
    'secure session cookie',
  );
  const actor = { email, cookie: setCookie.split(';')[0] };
  const session = (await request(actor, 'session')).data;
  return { ...actor, id: session.user.id, workspace: session.workspaces[0].id };
}

check(
  (await raw('/api/aeo/health', {}, false)).status === 401,
  'HTTPS staging gate denies anonymous access',
);
await request(null, 'health');
await request(null, 'session', 'GET', undefined, 401);
const a = await signup('alpha'),
  b = await signup('beta'),
  reader = await signup('reader');
for (const actor of [a, b]) {
  actor.domain = `hosted-${actor === a ? 'alpha' : 'beta'}-${stamp}.example.com`;
  actor.site = (
    await request(
      actor,
      'sites',
      'POST',
      { workspaceId: actor.workspace, domain: actor.domain },
      201,
    )
  ).data.id;
}
for (const suffix of ['summary', 'export', 'connection', 'answer-jobs'])
  await request(b, `sites/${a.site}/${suffix}`, 'GET', undefined, 404);
await request(b, `sites/${a.site}/logs`, 'POST', { format: 'json', records: [] }, 404);
await request(a, 'sites', 'POST', { workspaceId: a.workspace, domain: 'csrf.example.com' }, 403, {
  origin: 'https://external.example',
});
for (const path of ['/api/auth/login', '/api/users', '/api/teams', '/api/websites'])
  check(
    (await raw(path, { method: 'POST', headers: { cookie: a.cookie, origin } })).status === 404,
    'inherited management route remains blocked',
  );
const empty = (await request(a, `sites/${a.site}/summary`)).data;
check(
  empty.traffic.pageviews === null &&
    empty.traffic.conversions === null &&
    empty.crawl.coverage === null,
  'missing data remains distinct from zero',
);
await request(
  a,
  `workspaces/${a.workspace}/members`,
  'POST',
  { email: reader.email, role: 'team-view-only' },
  201,
);
await request(reader, `sites/${a.site}/summary`);
await request(reader, `sites/${a.site}/goal`, 'PUT', { goalEvent: 'synthetic_conversion' }, 403);
await request(a, `workspaces/${a.workspace}/members/${reader.id}`, 'DELETE', {});
await request(reader, `sites/${a.site}/summary`, 'GET', undefined, 404);
await request(
  a,
  `sites/${a.site}/catalog`,
  'POST',
  {
    format: 'json',
    content: JSON.stringify([
      { url: `https://${a.domain}/synthetic-page`, title: 'Synthetic hosted fixture only' },
    ]),
  },
  201,
);
const logs = {
  format: 'json',
  records: [
    {
      time: new Date().toISOString(),
      ip: '203.0.113.22',
      path: '/synthetic-page',
      method: 'GET',
      status: 403,
      bytes: 100,
      userAgent: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
    },
  ],
};
await request(a, `sites/${a.site}/logs`, 'POST', logs, 201);
check(
  (await request(a, `sites/${a.site}/logs`, 'POST', logs, 201)).data.duplicate,
  'log import is idempotent',
);
await request(
  a,
  `sites/${a.site}/answers`,
  'POST',
  {
    question: 'Which service is used in this synthetic test?',
    method: 'Synthetic hosted fixture',
    answer: 'Synthetic manual response only. <script>untrusted</script>',
  },
  201,
);
const summary = (await request(a, `sites/${a.site}/summary`)).data;
check(
  summary.crawl.errors >= 1 && summary.crawl.inventory === 1,
  'hosted imports produce a specific crawl finding',
);
check(
  summary.crawl.verified === 0 && summary.answers[0].sourceKind === 'user_import',
  'unverified evidence keeps its provenance',
);
const exported = (await request(a, `sites/${a.site}/export`)).data;
check(
  !JSON.stringify(exported).includes('203.0.113.22') &&
    !JSON.stringify(exported).includes('ip_hash'),
  'private export omits visitor IP material',
);
await request(
  a,
  `sites/${a.site}/run-answer`,
  'POST',
  { requestId: randomUUID(), question: 'Synthetic provider-disabled verification?' },
  503,
);
check(
  (await request(a, `sites/${a.site}/answer-jobs`)).data.jobs.length === 0,
  'disabled provider creates no paid job',
);
const receipt = await raw('/api/send', {
  method: 'POST',
  headers: {
    origin: `https://${a.domain}`,
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 Synthetic staging acceptance',
    'x-real-ip': '203.0.113.22',
    'cf-ipcountry': 'CN',
  },
  body: JSON.stringify({
    type: 'event',
    payload: {
      website: a.site,
      hostname: a.domain,
      url: `https://${a.domain}/synthetic-page`,
      title: 'Synthetic staging fixture',
      language: 'en',
      screen: '1280x720',
      webdriver: true,
    },
  }),
});
check(receipt.status === 200, 'authenticated staging intake receives a synthetic event');
const received = (await request(a, `sites/${a.site}/summary`)).data;
check(
  Math.abs(Date.now() - Date.parse(received.traffic.lastReceivedAt)) < 60000,
  'hosted receipt timestamp matches UTC',
);
check(received.traffic.pageviews === null, 'automated receipt does not become qualified traffic');
const isolated = (await request(b, `sites/${b.site}/summary`)).data;
check(
  isolated.answers.length === 0 && isolated.crawl.inventory === 0,
  'second tenant remains isolated',
);
await request(a, 'logout', 'POST', {});
await request(a, 'session', 'GET', undefined, 401);
await writeFile(
  '.local/hosted-browser-fixture.json',
  JSON.stringify({ email: a.email, password, domain: a.domain, site: a.site }, null, 2),
  { mode: 0o600 },
);
await writeFile(
  '.local/hosted-smoke-result.json',
  JSON.stringify(
    { origin, checkedAt: new Date().toISOString(), checks, synthetic: true, paidProviderCalls: 0 },
    null,
    2,
  ),
);
console.log(`HOSTED SMOKE PASSED: ${checks} checks; synthetic data only; no paid provider calls.`);
