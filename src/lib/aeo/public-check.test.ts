// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { checkPublicWebsite, publicCheckUrl } from './public-check';
import { LiekanError } from '../liekan/upstream/errors';

it('accepts a full public HTTPS page URL and excludes query and fragment secrets', () => {
  expect(publicCheckUrl({ url: 'https://aeo.io/docs?token=private#proof' })).toEqual({
    hostname: 'aeo.io',
    path: '/docs',
    url: 'https://aeo.io/docs',
  });
  expect(publicCheckUrl({ url: 'aeo.io' }).url).toBe('https://aeo.io/');
});
it.each([
  'https://127.0.0.1',
  'https://[::1]',
  'https://169.254.169.254',
  'https://service.internal',
  'https://localhost',
  'https://aeo.io:8443',
  'https://owner:secret@aeo.io',
  'file:///etc/passwd',
  'http://aeo.io',
])('rejects unsafe or unsupported target %s before network access', async url => {
  const probe = vi.fn();
  await expect(checkPublicWebsite({ url }, probe)).rejects.toBeDefined();
  expect(probe).not.toHaveBeenCalled();
});
it('returns evidence and action without private account data, raw page contents or invented AI results', async () => {
  const probe = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body>private-looking content</body></html>',
    })
    .mockResolvedValueOnce({ status: 404, headers: {}, body: '' });
  const result = await checkPublicWebsite({ url: 'aeo.io/about?secret=value' }, probe);
  expect(probe.mock.calls.map(c => c.slice(0, 2))).toEqual([
    ['aeo.io', '/about'],
    ['aeo.io', '/robots.txt'],
  ]);
  expect(result.findings.find(f => f.label === 'Page title')?.state).toBe('action');
  expect(result.findings.find(f => f.label === 'Crawl instructions')?.state).toBe('unknown');
  expect(JSON.stringify(result)).not.toMatch(
    /private-looking|secret=value|workspace|score|password/,
  );
});
it('keeps failed fetches and non-HTML responses unknown instead of reporting missing titles', async () => {
  const failed = vi.fn().mockRejectedValue(new Error('private diagnostic'));
  const result = await checkPublicWebsite({ url: 'aeo.io' }, failed);
  expect(result.findings.every(f => f.state === 'unknown')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('private diagnostic');
  expect(result.findings[1].action).not.toMatch(/Give the page|descriptive title/);
  const binary = vi.fn().mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'application/pdf' },
    body: '<title>not HTML</title>',
  });
  expect((await checkPublicWebsite({ url: 'aeo.io' }, binary)).findings[1].state).toBe('unknown');
});
it('reports an observed HTML title without returning untrusted markup', async () => {
  const probe = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<title><img src=x onerror=alert(1)>A title</title>',
    })
    .mockResolvedValueOnce({ status: 200, headers: {}, body: 'User-agent: *\nAllow: /' });
  const result = await checkPublicWebsite({ url: 'aeo.io' }, probe);
  expect(result.findings.map(f => f.state)).toEqual(['found', 'found', 'found']);
  expect(JSON.stringify(result)).not.toContain('<img');
  expect(probe.mock.calls[0][3]).toBe('html');
  expect(probe.mock.calls[1][3]).toBe(true);
});
it('explains the checker body limit without blaming the website or suggesting a title change', async () => {
  const probe = vi
    .fn()
    .mockRejectedValue(new LiekanError('private diagnostic', 413, 'public-probe-body-limit'));
  const result = await checkPublicWebsite({ url: 'example.com' }, probe);
  expect(result.findings[0]).toMatchObject({ state: 'unknown' });
  expect(result.findings[0].detail).toContain('2 MiB');
  expect(result.findings[0].action).toContain('smaller page');
  expect(result.findings[1].action).not.toContain('Give the page');
  expect(JSON.stringify(result)).not.toContain('private diagnostic');
});
