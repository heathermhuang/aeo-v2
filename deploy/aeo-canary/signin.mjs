import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { keyPattern, mailboxAddress, origin, proofFromLink } from './contract.mjs';

const api = origin + '/api/aeo/';
const sameOrigin = { origin };
const cookieName = 'aeo_v2_session';
const contexts = [];
const { AEO_CANARY_EMAIL: email, AEO_CANARY_PASSWORD: password,
  AEO_CANARY_MAILBOX_KEY: key, AEO_CANARY_MAILBOX_URL: mailbox } = process.env;
const enroll = process.argv[2] === '--enroll';
let stage = 'configuration';
let browser;
let release;
let failure;

function requireCheck(ok) {
  if (!ok) throw new Error('Canary expectation failed');
}

async function inbox(path, method = 'GET') {
  return fetch(mailbox + path, {
    method,
    headers: { authorization: 'Bearer ' + key },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
}

async function deliveredLink(purpose, after) {
  const query = new URLSearchParams({ purpose, after });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await inbox('/claim?' + query, 'POST');
    if (response.status === 200) {
      const { link } = await response.json();
      requireCheck(proofFromLink(link)?.purpose === purpose);
      return link;
    }
    requireCheck(response.status === 404);
    await sleep(3_000);
  }
  throw new Error('Canary mail was not received');
}

async function readRelease() {
  const response = await fetch(api + 'health', { redirect: 'error', signal: AbortSignal.timeout(12_000) });
  requireCheck(response.status === 200);
  const health = await response.json();
  const current = response.headers.get('x-aeo-release');
  requireCheck(health.product === 'AEO v2' && health.status === 'ok' && /^[a-z0-9._-]{1,80}$/i.test(current || ''));
  return current;
}

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  contexts.push(context);
  context.setDefaultTimeout(15_000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    // Keep synthetic activity out of production analytics.
    return url.origin === origin && url.pathname !== '/api/send' ? route.continue() : route.abort();
  });
  return context.newPage();
}

async function openSignIn(page) {
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
}

async function submit(page, label, endpoint, status, scope = page.locator('form')) {
  const [response] = await Promise.all([
    page.waitForResponse(result => result.url() === api + endpoint && result.request().method() === 'POST'),
    scope.getByRole('button', { name: label, exact: true }).click(),
  ]);
  requireCheck(response.status() === status);
}

async function session(page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  const response = await page.request.get(api + 'session', { maxRedirects: 0 });
  requireCheck(response.status() === 200);
  const account = await response.json();
  requireCheck(account.user?.email === email && typeof account.user.id === 'string' &&
    account.workspaces?.length === 1 && account.workspaces[0].role === 'team-owner');
  const cookie = (await page.context().cookies(origin)).find(candidate => candidate.name === cookieName);
  requireCheck(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax');
  return { user: account.user.id, cookie: cookie.name + '=' + cookie.value };
}

async function verifyRevoked(cookie) {
  const response = await fetch(api + 'session', {
    headers: { cookie },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  requireCheck(response.status === 401);
}

async function completeProof(link) {
  stage = 'email-link-open';
  // Open a new document, just as an email client would, so the app processes the fragment.
  const page = await newPage();
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Choose your password.' }).waitFor();
  requireCheck(page.url() === origin + '/');
  stage = 'email-link-before-confirmation';
  requireCheck((await page.request.get(api + 'session', { maxRedirects: 0 })).status() === 401);
  stage = 'email-link-confirmation';
  await page.getByLabel('New password').fill(password);
  await submit(page, 'Confirm and continue', 'identity/complete', 200);
  stage = 'authenticated-session';
  return { page, ...await session(page) };
}

async function run() {
  requireCheck(process.argv.length === (enroll ? 3 : 2) && mailboxAddress.test(email || '') &&
    keyPattern.test(key || '') && /^[-_a-zA-Z0-9]{24,72}$/.test(password || '') &&
    /^https:\/\/aeo-v2-canary-mail\.[a-z0-9-]+\.workers\.dev$/.test(mailbox || ''));
  stage = 'production-health';
  release = await readRelease();
  stage = 'mailbox-health';
  requireCheck((await inbox('/health')).status === 204);

  stage = 'browser-start';
  browser = await chromium.launch(process.env.AEO_CANARY_CHROME ? { executablePath: process.env.AEO_CANARY_CHROME } : {});
  const initial = await newPage();

  if (enroll) {
    stage = 'enrollment-request';
    await openSignIn(initial);
    await initial.getByRole('button', { name: 'Create account', exact: true }).click();
    await initial.getByLabel('Email', { exact: true }).fill(email);
    const after = Date.now() - 2_000;
    await submit(initial, 'Send email link', 'signup', 202);
    stage = 'enrollment-delivery';
    const link = await deliveredLink('verify', after);
    await completeProof(link);
    return;
  }

  stage = 'password-signin';
  await openSignIn(initial);
  await initial.getByLabel('Email', { exact: true }).fill(email);
  await initial.getByLabel('Password', { exact: true }).fill(password);
  await submit(initial, 'Sign in', 'login', 200);
  const previous = await session(initial);

  stage = 'recovery-request';
  const requestPage = await newPage();
  await openSignIn(requestPage);
  await requestPage.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await requestPage.getByRole('heading', { name: 'Restore your access.' }).waitFor();
  await requestPage.getByLabel('Email', { exact: true }).fill(email);
  const after = Date.now() - 2_000;
  await submit(requestPage, 'Send email link', 'recover', 202);

  stage = 'recovery-delivery';
  const link = await deliveredLink('recover', after);
  const recovered = await completeProof(link);
  requireCheck(recovered.user === previous.user && recovered.cookie !== previous.cookie);

  stage = 'session-revocation';
  await verifyRevoked(previous.cookie);
  stage = 'single-use-proof';
  const replay = await recovered.page.request.post(api + 'identity/complete', {
    headers: sameOrigin,
    data: { ...proofFromLink(link), password },
    maxRedirects: 0,
  });
  requireCheck(replay.status() === 401);
  stage = 'signout';
  await submit(recovered.page, 'Sign out', 'logout', 200, recovered.page);
  await verifyRevoked(recovered.cookie);
  stage = 'release-readback';
  requireCheck(await readRelease() === release);
}

try {
  await run();
} catch {
  failure = stage;
} finally {
  for (const context of contexts) {
    try {
      if (!(await context.cookies(origin)).some(cookie => cookie.name === cookieName)) continue;
      const response = await context.request.post(api + 'logout', {
        headers: sameOrigin, data: {}, maxRedirects: 0, timeout: 10_000,
      });
      requireCheck([200, 401].includes(response.status()));
    } catch {
      failure = failure ? failure + ', cleanup' : 'cleanup';
    }
  }
  try {
    await browser?.close();
  } catch {
    failure = failure || 'cleanup';
  }
}
if (failure) {
  console.error(JSON.stringify({ ok: false, stage: failure, release }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, journey: enroll ? 'enrollment' : 'signin-and-recovery', release }));
}
