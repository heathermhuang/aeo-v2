// @vitest-environment node
import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ dns4: vi.fn(), dns6: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => {
  class Resolver {
    resolve4(...args: any[]) {
      return mocks.dns4(...args);
    }
    resolve6(...args: any[]) {
      return mocks.dns6(...args);
    }
  }
  return { Resolver, default: { Resolver } };
});
vi.mock('node:https', () => ({ request: mocks.request, default: { request: mocks.request } }));
import { publicCrawlerProbe } from './public-probe';
function response(status: number, headers: Record<string, string> = {}, chunks?: Buffer[]) {
  mocks.request.mockImplementationOnce((_url, options, callback) => {
    const req = new EventEmitter() as any;
    req.destroy = () => req.emit('error', new Error('timeout'));
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter() as any;
        res.statusCode = status;
        res.headers = headers;
        res.destroy = () => req.emit('close');
        callback(res);
        for (const chunk of chunks || []) res.emit('data', chunk);
        res.emit('end');
        req.emit('close');
      });
    return req;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.dns4.mockResolvedValue(['93.184.216.34']);
  mocks.dns6.mockResolvedValue([]);
});
it('pins the checked public IP with original TLS hostname and a self-check UA', async () => {
  response(200, { 'x-robots-tag': 'noindex', 'set-cookie': 'secret' });
  expect(await publicCrawlerProbe('example.com', '/docs', 'test')).toMatchObject({
    path: '/docs',
    status: 200,
    headers: { 'x-robots-tag': 'noindex' },
    body: null,
  });
  const options = mocks.request.mock.calls[0][1],
    lookup = vi.fn();
  options.lookup('example.com', {}, lookup);
  expect(lookup).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  const lookupAll = vi.fn();
  options.lookup('example.com', { all: true }, lookupAll);
  expect(lookupAll).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  expect(options.family).toBe(4);
  expect(options).toMatchObject({
    agent: false,
    servername: 'example.com',
    method: 'GET',
    maxHeaderSize: 65536,
    headers: { 'user-agent': 'Liekan-Crawler-Check/test' },
  });
  expect(options.headers.cookie).toBeUndefined();
});
it('rejects a mixed public/private DNS set before making a connection', async () => {
  mocks.dns6.mockResolvedValue(['::1']);
  await expect(publicCrawlerProbe('example.com', '/', 'test')).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.request).not.toHaveBeenCalled();
});
it('rejects a cross-domain redirect without following it', async () => {
  response(302, { location: 'https://other.example/private' });
  await expect(publicCrawlerProbe('example.com', '/', 'test')).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('revalidates DNS after a same-host redirect and rejects rebinding', async () => {
  mocks.dns4.mockResolvedValueOnce(['93.184.216.34']).mockResolvedValueOnce(['127.0.0.1']);
  response(302, { location: '/next' });
  await expect(publicCrawlerProbe('example.com', '/', 'test')).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.dns4).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('bounds redirects and does not persist their Location header', async () => {
  for (let i = 0; i < 4; i++) response(302, { location: '/again' });
  await expect(publicCrawlerProbe('example.com', '/', 'test')).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.request).toHaveBeenCalledTimes(4);
});
it('caps the fetched robots body and aborts oversized responses', async () => {
  response(200, {}, [Buffer.alloc(262145)]);
  await expect(
    publicCrawlerProbe('example.com', '/robots.txt', 'test', true),
  ).rejects.toMatchObject({ status: 413 });
});
it('reads a 284 KB HTML page using a separate bounded HTML mode', async () => {
  const html = '<title>Measurable AI</title>' + ' '.repeat(283851);
  response(200, { 'content-type': 'text/html' }, [Buffer.from(html)]);
  expect(await publicCrawlerProbe('example.com', '/', 'test', 'html')).toMatchObject({
    status: 200,
    body: html,
  });
  expect(mocks.request.mock.calls[0][1].headers.accept).toBe('text/html,application/xhtml+xml');
});
it('accepts the HTML byte limit and rejects one byte beyond it', async () => {
  response(200, {}, [Buffer.alloc(2 * 1024 * 1024)]);
  expect((await publicCrawlerProbe('example.com', '/', 'test', 'html')).body?.length).toBe(
    2 * 1024 * 1024,
  );
  response(200, {}, [Buffer.alloc(2 * 1024 * 1024 + 1)]);
  await expect(publicCrawlerProbe('example.com', '/', 'test', 'html')).rejects.toMatchObject({
    status: 413,
    code: 'public-probe-body-limit',
  });
});
