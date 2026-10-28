import { z } from 'zod';
import { db } from '@/lib/aeo/db';
import { runAnswer, answerJobs } from '@/lib/aeo/answers';
import { AeoError, body, sameOrigin, uuid } from '@/lib/aeo/contracts';
import {
  signup,
  login,
  cookie,
  principal,
  tokenFrom,
  digest,
  site,
  rateLimit,
} from '@/lib/aeo/auth';
import {
  account,
  listSites,
  createSite,
  summary,
  members,
  addMember,
  removeMember,
  saveAnswer,
  saveGoal,
  importEvidence,
} from '@/lib/aeo/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...headers, ...extra } });
async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const method = request.method;
    if (method !== 'GET') sameOrigin(request);
    if (path.join('/') === 'health' && method === 'GET') {
      await db.query('SELECT token_hash FROM aeo_session LIMIT 0');
      return json({ status: 'ok', product: 'AEO v2', billingEnabled: false });
    }
    if (['signup', 'login'].includes(path[0]) && path.length === 1 && method === 'POST') {
      const token = await (path[0] === 'signup' ? signup : login)(await body(request));
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(token) });
    }
    const user = await principal(request);
    if (path.join('/') === 'session' && method === 'GET') return json(await account(user));
    if (path.join('/') === 'logout' && method === 'POST') {
      await db.query('DELETE FROM aeo_session WHERE token_hash=$1', [digest(tokenFrom(request))]);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', true) });
    }
    if (method !== 'GET') await rateLimit('mutation:' + user.id, 100, 60);
    if (path[0] === 'workspaces' && path.length >= 2) {
      const id = uuid.parse(path[1]);
      if (path.length === 3 && path[2] === 'sites' && method === 'GET')
        return json({ sites: await listSites(user.id, id) });
      if (path[2] === 'members' && path.length === 3) {
        if (method === 'GET') return json({ members: await members(user.id, id) });
        if (method === 'POST') return json(await addMember(user.id, id, await body(request)), 201);
      }
      if (path[2] === 'members' && path.length === 4 && method === 'DELETE')
        return json(await removeMember(user.id, id, uuid.parse(path[3])));
    }
    if (path.join('/') === 'sites' && method === 'POST')
      return json(await createSite(user.id, await body(request)), 201);
    if (path[0] === 'sites' && path.length === 3) {
      const id = uuid.parse(path[1]),
        action = path[2];
      if (action === 'run-answer' && method === 'POST')
        return json(await runAnswer(user.id, id, await body(request)));
      if (action === 'answer-jobs' && method === 'GET')
        return json({ jobs: await answerJobs(user.id, id) });
      if (action === 'summary' && method === 'GET') return json(await summary(user.id, id));
      if (action === 'export' && method === 'GET')
        return json(await summary(user.id, id), 200, {
          'Content-Disposition': 'attachment; filename="aeo-evidence.json"',
        });
      if (action === 'connection' && method === 'GET') {
        const website = await site(user.id, id);
        const origin = process.env.AEO_PUBLIC_URL || new URL(request.url).origin;
        return json({
          domain: website.domain,
          websiteId: id,
          script: `<script defer src="${origin}/script.js" data-website-id="${id}"></script>`,
          collectionEndpoint: origin + '/api/send',
          note: 'Only install on a website you control. Browser events and crawler logs are separate inputs.',
        });
      }
      if (action === 'answers' && method === 'POST')
        return json(await saveAnswer(user.id, id, await body(request)), 201);
      if (action === 'goal' && method === 'PUT')
        return json(await saveGoal(user.id, id, await body(request)));
      if (['logs', 'catalog'].includes(action) && method === 'POST')
        return json(await importEvidence(user.id, id, action, await body(request)), 201);
    }
    throw new AeoError(404, 'This page could not be found.');
  } catch (error: any) {
    if (error instanceof z.ZodError)
      return json({ error: 'Check the form fields and try again.' }, 400);
    if (error instanceof AeoError)
      return json(
        { error: error.message },
        error.status,
        error.status === 429 ? { 'Retry-After': '900' } : {},
      );
    console.error('AEO request failed', {
      code: typeof error.code === 'string' ? error.code : 'internal',
    });
    return json({ error: 'This request could not be completed. Please try again.' }, 503);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
