// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isAeoSurface } from './surface';
import { domain, sameOrigin, body, accountInput, proofInput, safeAnswer } from './contracts';
describe('AEO input and browser boundaries', () => {
  it('blocks inherited management paths that bypass SaaS quotas', () => {
    for (const p of [
      '/api/auth/login',
      '/api/teams',
      '/api/users',
      '/api/liekan/collect',
      '/websites',
    ])
      expect(isAeoSurface(p)).toBe(false);
    for (const p of ['/', '/api/aeo/session', '/api/send', '/script.js', '/_next/static/app.js'])
      expect(isAeoSurface(p)).toBe(true);
  });

  it('normalizes a public domain while rejecting private and ambiguous targets', () => {
    expect(domain('Example.COM')).toBe('example.com');
    for (const value of [
      'http://example.com',
      '127.0.0.1',
      '[::1]',
      'localhost',
      'app.local',
      'https://example.com/a',
      'https://user:pass@example.com',
      'example.com:4000',
      'example.com?secret=x',
    ])
      expect(() => domain(value)).toThrow();
  });
  it('requires exact origin for every state-changing browser request', () => {
    process.env.AEO_PUBLIC_URL = 'https://candidate.aeo.io';
    expect(() =>
      sameOrigin(
        new Request('http://internal/api', { headers: { origin: 'https://candidate.aeo.io' } }),
      ),
    ).not.toThrow();
    for (const origin of ['https://evil.example', 'null', 'https://candidate.aeo.io.evil.example'])
      expect(() =>
        sameOrigin(new Request('http://internal/api', { headers: { origin } })),
      ).toThrow();
    expect(() => sameOrigin(new Request('http://internal/api'))).toThrow();
    delete process.env.AEO_PUBLIC_URL;
  });
  it('bounds streamed bodies before parsing them', async () => {
    await expect(
      body(
        new Request('https://candidate.aeo.io/api', {
          method: 'POST',
          body: JSON.stringify({ x: 'a'.repeat(1048576) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      body(new Request('https://candidate.aeo.io/api', { method: 'POST', body: 'no json' })),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects account privilege injection and bcrypt truncation', () => {
    expect(
      accountInput.safeParse({
        email: 'person@example.com',
        password: 'a'.repeat(12),
        role: 'admin',
      }).success,
    ).toBe(false);
    expect(
      proofInput.safeParse({ token: 'a'.repeat(43), purpose: 'verify', password: '界'.repeat(25) })
        .success,
    ).toBe(false);
  });
  it('accepts raw captured text but never caller-supplied provenance', () => {
    expect(
      safeAnswer({
        question: 'Which tools?',
        method: 'Manual capture',
        answer: '<script>untrusted</script>',
      }).answer,
    ).toContain('<script>');
    expect(() =>
      safeAnswer({
        question: 'Which tools?',
        method: 'Manual capture',
        answer: 'text',
        sourceKind: 'provider_api',
      }),
    ).toThrow();
  });
});
