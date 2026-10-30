import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction } from './db';
import { AeoError } from './contracts';
import { digest, site } from './auth';
const input = z
  .object({ requestId: z.uuid(), question: z.string().trim().min(5).max(500) })
  .strict();
export const providerReady = () =>
  Boolean(
    process.env.AEO_ANSWER_API_KEY &&
      process.env.AEO_ANSWER_MODEL &&
      Number(process.env.AEO_ANSWER_DAILY_LIMIT) > 0 &&
      Number(process.env.AEO_ANSWER_INSTALLATION_DAILY_LIMIT) > 0,
  );
export async function runAnswer(
  userId: string,
  siteId: string,
  raw: unknown,
  fetcher: typeof fetch = fetch,
) {
  const data = input.parse(raw),
    method = process.env.AEO_ANSWER_MODEL || '',
    hash = digest(JSON.stringify([data.question, method, 'OpenRouter API; search not requested']));
  const job = await transaction(async tx => {
    const website = await site(userId, siteId, true, tx);
    await tx.query('SELECT team_id FROM team WHERE team_id=$1 FOR UPDATE', [website.workspaceId]);
    await site(userId, siteId, true, tx);
    const old = (
      await tx.query(
        'SELECT id,request_hash,state,answer_id AS "answerId" FROM aeo_answer_job WHERE website_id=$1 AND request_id=$2',
        [siteId, data.requestId],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== hash)
        throw new AeoError(409, 'This check ID already belongs to a different question or method.');
      return { ...old, reused: true };
    }
    if (!providerReady())
      throw new AeoError(
        503,
        'Answer collection is not configured yet. You can still save a captured response.',
      );
    const cap = Math.min(30, Math.floor(Number(process.env.AEO_ANSWER_DAILY_LIMIT)));
    const usage = (
      await tx.query(
        `SELECT count(*)::int AS n FROM aeo_answer_job j JOIN website w ON w.website_id=j.website_id WHERE w.team_id=$1 AND j.created_at>=date_trunc('day',now())`,
        [website.workspaceId],
      )
    ).rows[0].n;
    if (usage >= cap)
      throw new AeoError(429, 'This workspace has reached its daily answer-check allowance.');
    // The installation lock bounds total provider work across customer workspaces.
    await tx.query('SELECT pg_advisory_xact_lock(12800004)');
    const total = (
      await tx.query(
        `SELECT count(*)::int AS n FROM aeo_answer_job WHERE created_at>=date_trunc('day',now())`,
      )
    ).rows[0].n;
    if (
      total >=
      Math.min(100, Math.floor(Number(process.env.AEO_ANSWER_INSTALLATION_DAILY_LIMIT) || 0))
    )
      throw new AeoError(429, 'Answer collection has reached its installation allowance.');
    const id = randomUUID();
    await tx.query(
      `INSERT INTO aeo_answer_job(id,website_id,request_id,created_by,question,method,request_hash,state) VALUES($1,$2,$3,$4,$5,$6,$7,'running')`,
      [id, siteId, data.requestId, userId, data.question, method, hash],
    );
    return { id, reused: false };
  });
  if (job.reused) return job;
  try {
    const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(40000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AEO_ANSWER_API_KEY}`,
      },
      body: JSON.stringify({
        model: method,
        messages: [{ role: 'user', content: data.question }],
        max_tokens: 1200,
        stream: false,
        provider: { allow_fallbacks: false },
      }),
    });
    if (!response.ok) throw new AeoError(502, 'The answer provider could not complete this check.');
    const reader = response.body?.getReader();
    if (!reader) throw new AeoError(502, 'The answer provider returned no response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new AeoError(502, 'The answer provider response exceeded its limit.');
      }
      chunks.push(part.value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')),
      answer = payload.choices?.[0]?.message?.content;
    if (
      typeof answer !== 'string' ||
      !answer.trim() ||
      answer.length > 24000 ||
      payload.choices?.[0]?.finish_reason !== 'stop'
    )
      throw new AeoError(502, 'The provider response was empty, incomplete, or too large.');
    const reportedModel =
      typeof payload.model === 'string' && payload.model.length <= 90
        ? payload.model
        : 'model not reported';
    const answerId = await transaction(async tx => {
      const website = await site(userId, siteId, true, tx);
      await tx.query('SELECT team_id FROM team WHERE team_id=$1 FOR SHARE', [website.workspaceId]);
      await site(userId, siteId, true, tx);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO aeo_answer_run(id,website_id,created_by,question,source_kind,method,answer,content_hash) VALUES($1,$2,$3,$4,'provider_api',$5,$6,$7)`,
        [
          id,
          siteId,
          userId,
          data.question,
          `OpenRouter API · ${reportedModel} · search not requested`,
          answer,
          digest(answer),
        ],
      );
      await tx.query(
        `UPDATE aeo_answer_job SET state='complete',completed_at=now(),answer_id=$2 WHERE id=$1 AND state='running'`,
        [job.id, id],
      );
      return id;
    });
    return { id: job.id, state: 'complete', answerId, reused: false };
  } catch (error: any) {
    await db.query(
      `UPDATE aeo_answer_job SET state='failed',error_code=$2,completed_at=now() WHERE id=$1 AND state='running'`,
      [job.id, error instanceof AeoError ? 'provider_failed' : 'collection_interrupted'],
    );
    if (error instanceof AeoError) throw error;
    throw new AeoError(502, 'The answer check could not finish. No automatic retry was made.');
  }
}
export async function answerJobs(userId: string, siteId: string) {
  await site(userId, siteId);
  return (
    await db.query(
      `SELECT id,question,method,CASE WHEN state='running' AND created_at<now()-interval '2 minutes' THEN 'interrupted' ELSE state END AS state,error_code AS "errorCode",answer_id AS "answerId",created_at AS "createdAt" FROM aeo_answer_job WHERE website_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [siteId],
    )
  ).rows;
}
