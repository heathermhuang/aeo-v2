import { DurableObject } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';
import PostalMime from 'postal-mime';
import { keyPattern, mailboxAddress, proofFromLink, proofLifetimeMs, purposes } from './contract.mjs';

const sender = 'notifications@aeo.io';
const maxMailBytes = 64 * 1024;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function configured(env) {
  return mailboxAddress.test(env.CANARY_EMAIL) && keyPattern.test(env.CANARY_MAILBOX_KEY);
}

export default {
  async email(message, env) {
    if (!configured(env) || message.to.toLowerCase() !== env.CANARY_EMAIL ||
        !Number.isInteger(message.rawSize) || message.rawSize < 1 || message.rawSize > maxMailBytes) {
      message.setReject('Canary mail rejected');
      return;
    }

    const parsed = await PostalMime.parse(message.raw);
    const links = parsed.text?.match(/https:\/\/[^\s<>"]+/g) || [];
    const proofs = links.map(proofFromLink).filter(Boolean);
    if (parsed.from?.address?.toLowerCase() !== sender || proofs.length !== 1) {
      message.setReject('Canary mail rejected');
      return;
    }
    const { purpose } = proofs[0];
    const expectedSubject = purpose === 'recover' ? 'Reset your AEO password' : 'Verify your AEO email';
    if (parsed.subject !== expectedSubject) {
      message.setReject('Canary mail rejected');
      return;
    }
    await env.INBOX.getByName('production').store(purpose, links.find(link => proofFromLink(link)));
  },

  async fetch(request, env) {
    const { pathname, searchParams } = new URL(request.url);
    const provided = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!configured(env) || !provided ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(env.CANARY_MAILBOX_KEY)))
      return new Response(null, { status: 404, headers });
    if (pathname === '/health' && request.method === 'GET')
      return new Response(null, { status: 204, headers });
    if (pathname !== '/claim' || request.method !== 'POST')
      return new Response(null, { status: 404, headers });
    const after = Number(searchParams.get('after'));
    const purpose = searchParams.get('purpose');
    const now = Date.now();
    if (!purposes.includes(purpose) || !Number.isSafeInteger(after) || after > now ||
        after < now - proofLifetimeMs)
      return new Response(null, { status: 400, headers });
    const link = await env.INBOX.getByName('production').claim(purpose, after);
    return link
      ? Response.json({ link }, { headers })
      : new Response(null, { status: 404, headers });
  },
};

export class CanaryInbox extends DurableObject {
  async store(purpose, link) {
    const receivedAt = Date.now();
    const storage = this.ctx.storage;
    await storage.transaction(async tx => {
      await tx.put(purpose, { link, receivedAt });
      const nextExpiration = receivedAt + proofLifetimeMs;
      const alarm = await tx.getAlarm();
      if (alarm === null || nextExpiration < alarm) await tx.setAlarm(nextExpiration);
    });
  }

  claim(purpose, after) {
    return this.ctx.storage.transaction(async tx => {
      const record = await tx.get(purpose);
      if (!record || record.receivedAt < after || Date.now() - record.receivedAt >= proofLifetimeMs)
        return null;
      await tx.delete(purpose);
      return record.link;
    });
  }

  async alarm() {
    const storage = this.ctx.storage;
    await storage.transaction(async tx => {
      const now = Date.now();
      const records = await tx.list();
      let nextExpiration = Infinity;
      for (const [purpose, { receivedAt }] of records) {
        const expiresAt = receivedAt + proofLifetimeMs;
        if (expiresAt <= now) await tx.delete(purpose);
        else nextExpiration = Math.min(nextExpiration, expiresAt);
      }
      if (Number.isFinite(nextExpiration)) await tx.setAlarm(nextExpiration);
    });
  }
}
