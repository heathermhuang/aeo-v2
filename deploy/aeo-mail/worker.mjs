import { timingSafeEqual } from 'node:crypto';
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return json({ status: 'ok', product: 'AEO identity mail' });
    if (path !== '/identity-mail' || request.method !== 'POST')
      return json({ error: 'Not found' }, 404);
    const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    if (
      !/^[a-f0-9]{64}$/.test(provided) ||
      !/^[a-f0-9]{64}$/.test(env.AEO_MAIL_RELAY_KEY || '') ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(env.AEO_MAIL_RELAY_KEY))
    )
      return json({ error: 'Unauthorized' }, 401);
    if (!(await env.AEO_MAIL_LIMIT.limit({ key: 'aeo-identity-mail' })).success)
      return json({ error: 'Rate limited' }, 429);
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Invalid request' }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          return json({ error: 'Invalid request' }, 413);
        }
        chunks.push(part.value);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        !data ||
        Object.keys(data).sort().join(',') !== 'email,purpose,token' ||
        typeof data.email !== 'string' ||
        data.email.length > 254 ||
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(data.email) ||
        !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
        !['verify', 'recover'].includes(data.purpose)
      )
        return json({ error: 'Invalid request' }, 400);
      const origin = new URL(env.AEO_MAIL_LINK_ORIGIN);
      if (origin.origin !== 'https://staging.aeo.io' && origin.origin !== 'https://aeo.io')
        return json({ error: 'Unavailable' }, 503);
      origin.pathname = '/';
      origin.search = '';
      origin.hash = new URLSearchParams({ account: data.token, purpose: data.purpose }).toString();
      const url = origin.toString(),
        htmlUrl = url.replaceAll('&', '&amp;');
      const subject =
        data.purpose === 'recover' ? 'Reset your AEO password' : 'Verify your AEO email';
      await env.EMAIL.send({
        to: data.email,
        from: { email: 'notifications@aeo.io', name: 'AEO.io' },
        replyTo: 'support@aeo.io',
        subject,
        text: `${subject}\n\n${url}\n\nChoose your own password. This link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`,
        html: `<h1>${subject}</h1><p><a href="${htmlUrl}">Continue to AEO</a> and choose your own password.</p><p>This link expires in 30 minutes and can be used once. If you did not request it, ignore this email.</p>`,
      });
      return json({ accepted: true });
    } catch {
      console.info(JSON.stringify({ event: 'aeo-identity-mail', status: 'unavailable' }));
      return json({ error: 'Unavailable' }, 503);
    }
  },
};
