import assert from 'node:assert/strict';
import { test } from 'node:test';
import relay from '../../deploy/aeo-mail/worker.mjs';
const key = 'a'.repeat(64),
  token = 'b'.repeat(43);
const request = (payload, authorization = `Bearer ${key}`) =>
  new Request('https://aeo-v2-identity-mail.synthetic.workers.dev/identity-mail', {
    method: 'POST',
    headers: { authorization },
    body: JSON.stringify(payload),
  });
const message = { email: 'synthetic@example.com', token, purpose: 'verify' };
function fixture() {
  const sent = [];
  return {
    sent,
    env: {
      AEO_MAIL_RELAY_KEY: key,
      AEO_MAIL_LINK_ORIGIN: 'https://staging.aeo.io',
      AEO_MAIL_LIMIT: { limit: async () => ({ success: true }) },
      EMAIL: {
        send: async m => {
          sent.push(m);
        },
      },
    },
  };
}
test('rejects missing/wrong relay credentials without sending', async () => {
  const { sent, env } = fixture();
  for (const auth of ['', 'Bearer ' + 'b'.repeat(64)])
    assert.equal((await relay.fetch(request(message, auth), env)).status, 401);
  assert.equal(sent.length, 0);
});
test('sends only an identity template with fixed sender and fragment proof', async () => {
  const { sent, env } = fixture();
  assert.equal((await relay.fetch(request(message), env)).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from.email, 'notifications@aeo.io');
  assert.ok(sent[0].text.includes('https://staging.aeo.io/#account=' + token));
  assert.ok(!sent[0].text.includes('?account='));
});
test('rejects arbitrary body, link origins, invalid proof and oversized input', async () => {
  const { sent, env } = fixture();
  for (const payload of [
    { ...message, html: 'injected' },
    { ...message, token: 'bad' },
    { ...message, purpose: 'marketing' },
    { ...message, email: 'x\r\nBcc:x@example.com' },
  ])
    assert.equal((await relay.fetch(request(payload), env)).status, 400);
  assert.equal(
    (await relay.fetch(request({ ...message, extra: 'a'.repeat(1024) }), env)).status,
    413,
  );
  env.AEO_MAIL_LINK_ORIGIN = 'https://other.example';
  assert.equal((await relay.fetch(request(message), env)).status, 503);
  assert.equal(sent.length, 0);
});
test('provider failures and rate limits make no automatic retry', async () => {
  const { env } = fixture();
  let attempts = 0;
  env.EMAIL.send = async () => {
    attempts++;
    throw new Error('private provider error');
  };
  assert.equal((await relay.fetch(request(message), env)).status, 503);
  assert.equal(attempts, 1);
  env.AEO_MAIL_LIMIT.limit = async () => ({ success: false });
  assert.equal((await relay.fetch(request(message), env)).status, 429);
  assert.equal(attempts, 1);
});
