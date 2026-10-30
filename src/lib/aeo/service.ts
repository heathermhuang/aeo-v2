import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction } from './db';
import { AeoError, LIMITS, domain, safeAnswer } from './contracts';
import { digest, site, workspace } from './auth';
import { providerReady } from './answers';
export async function account(user: { id: string; email: string }) {
  const { rows: workspaces } = await db.query(
    'SELECT t.team_id AS id,t.name,m.role FROM team t JOIN team_user m ON t.team_id=m.team_id WHERE m.user_id=$1 AND t.deleted_at IS NULL ORDER BY t.created_at,t.team_id',
    [user.id],
  );
  return {
    user,
    workspaces,
    limits: LIMITS,
    providerReady: providerReady(),
    answerModel: process.env.AEO_ANSWER_MODEL || null,
    billingEnabled: false,
  };
}
export async function listSites(userId: string, teamId: string) {
  await workspace(userId, teamId);
  return (
    await db.query(
      'SELECT website_id AS id,name,domain,team_id AS "workspaceId" FROM website WHERE team_id=$1 AND deleted_at IS NULL ORDER BY created_at,website_id',
      [teamId],
    )
  ).rows;
}
export async function createSite(userId: string, input: unknown) {
  const data = z
    .object({
      workspaceId: z.uuid(),
      domain: z.string().trim().min(3).max(300),
      name: z.string().trim().min(1).max(100).optional(),
    })
    .strict()
    .parse(input);
  const host = domain(data.domain);
  return transaction(async tx => {
    await tx.query('SELECT team_id FROM team WHERE team_id=$1 FOR UPDATE', [data.workspaceId]);
    await workspace(userId, data.workspaceId, true, tx);
    const { rows } = await tx.query(
      'SELECT domain FROM website WHERE team_id=$1 AND deleted_at IS NULL',
      [data.workspaceId],
    );
    if (rows.some(r => r.domain === host))
      throw new AeoError(409, 'This website is already in your workspace.');
    if (rows.length >= LIMITS.sites)
      throw new AeoError(429, `This workspace supports ${LIMITS.sites} websites.`);
    const id = randomUUID();
    await tx.query(
      'INSERT INTO website(website_id,name,domain,team_id,created_by,created_at) VALUES($1,$2,$3,$4,$5,now())',
      [id, data.name || host, host, data.workspaceId, userId],
    );
    await tx.query('INSERT INTO aeo_site_settings(website_id) VALUES($1)', [id]);
    return { id, name: data.name || host, domain: host, workspaceId: data.workspaceId };
  });
}
export async function members(userId: string, teamId: string) {
  await workspace(userId, teamId);
  return (
    await db.query(
      'SELECT u.user_id AS id,u.username AS email,m.role FROM team_user m JOIN "user" u ON u.user_id=m.user_id WHERE m.team_id=$1 AND u.deleted_at IS NULL ORDER BY u.username',
      [teamId],
    )
  ).rows;
}
export async function addMember(userId: string, teamId: string, input: unknown) {
  const data = z
    .object({ email: z.email().max(254), role: z.enum(['team-manager', 'team-view-only']) })
    .strict()
    .parse(input);
  return transaction(async tx => {
    await tx.query('SELECT team_id FROM team WHERE team_id=$1 FOR UPDATE', [teamId]);
    const owner = await workspace(userId, teamId, true, tx);
    if (owner.role !== 'team-owner')
      throw new AeoError(403, 'Only the workspace owner can manage members.');
    const count = (
      await tx.query('SELECT count(*)::int AS n FROM team_user WHERE team_id=$1', [teamId])
    ).rows[0].n;
    if (count >= LIMITS.members)
      throw new AeoError(429, 'This workspace has reached its member limit.');
    const member = (
      await tx.query(
        'SELECT u.user_id FROM "user" u JOIN aeo_identity i ON i.user_id=u.user_id AND i.email=u.username WHERE u.username=$1 AND u.deleted_at IS NULL',
        [data.email.toLowerCase()],
      )
    ).rows[0];
    if (!member) throw new AeoError(400, 'Ask this person to create an AEO account first.');
    if (member.user_id === userId) throw new AeoError(400, 'Your owner access is already active.');
    const existing = await tx.query('SELECT 1 FROM team_user WHERE team_id=$1 AND user_id=$2', [
      teamId,
      member.user_id,
    ]);
    if (existing.rows.length) throw new AeoError(409, 'This person is already a member.');
    await tx.query(
      'INSERT INTO team_user(team_user_id,team_id,user_id,role,created_at) VALUES($1,$2,$3,$4,now())',
      [randomUUID(), teamId, member.user_id, data.role],
    );
    return { added: true };
  });
}
export async function removeMember(userId: string, teamId: string, memberId: string) {
  return transaction(async tx => {
    await tx.query('SELECT team_id FROM team WHERE team_id=$1 FOR UPDATE', [teamId]);
    const owner = await workspace(userId, teamId, true, tx);
    if (owner.role !== 'team-owner' || userId === memberId)
      throw new AeoError(403, 'The workspace owner must retain access.');
    await tx.query(`DELETE FROM team_user WHERE team_id=$1 AND user_id=$2 AND role<>'team-owner'`, [
      teamId,
      memberId,
    ]);
    return { removed: true };
  });
}
const AI_REFERRERS = [
  'chatgpt.com',
  'chat.openai.com',
  'perplexity.ai',
  'www.perplexity.ai',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'www.bing.com',
];
export async function summary(userId: string, siteId: string) {
  const website = await site(userId, siteId);
  // The upstream qualified view preserves traffic exclusions and identity evidence.
  const [
    {
      rows: [traffic],
    },
    {
      rows: [receipt],
    },
    {
      rows: [crawl],
    },
    { rows: pages },
    { rows: referrals },
    { rows: answers },
    {
      rows: [settings],
    },
    { rows: accessErrors },
    { rows: jobs },
  ] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS "qualifiedEvents",count(*) FILTER(WHERE event_type=1)::int AS pageviews,count(distinct visit_id) FILTER(WHERE event_type=1 AND referrer_domain=ANY($2::text[]))::int AS "aiReferralVisits",count(*) FILTER(WHERE event_name=(SELECT goal_event FROM aeo_site_settings WHERE website_id=$1))::int AS conversions FROM liekan_effective_browser_event WHERE website_id=$1 AND created_at>=now()-interval '30 days'`,
      [siteId, AI_REFERRERS.filter(v => v !== 'www.bing.com')],
    ),
    db.query(
      `SELECT count(*)::int AS events,max(created_at) AS "lastReceivedAt" FROM website_event WHERE website_id=$1 AND created_at>=now()-interval '30 days'`,
      [siteId],
    ),
    db.query(
      `SELECT count(*) FILTER(WHERE ai_eligible IS TRUE)::int AS requests,count(distinct path) FILTER(WHERE ai_eligible IS TRUE)::int AS pages,count(*) FILTER(WHERE ai_eligible IS TRUE AND status>=400)::int AS errors,count(*) FILTER(WHERE ai_eligible IS TRUE AND verification='verified_range')::int AS verified,(SELECT count(*)::int FROM liekan_catalog WHERE website_id=$1) AS inventory,(SELECT max(imported_at) FROM liekan_import WHERE website_id=$1) AS "lastImportAt",(SELECT count(*)::int FROM liekan_catalog c WHERE c.website_id=$1 AND EXISTS(SELECT 1 FROM liekan_reporting_log l WHERE l.website_id=c.website_id AND l.path=c.path AND l.ai_eligible IS TRUE AND l.created_at>=now()-interval '30 days')) AS "observedInventoryPages" FROM liekan_reporting_log WHERE website_id=$1 AND created_at>=now()-interval '30 days'`,
      [siteId],
    ),
    db.query(
      `SELECT c.path,c.title,count(l.id) FILTER(WHERE l.ai_eligible IS TRUE)::int AS requests,max(l.created_at) FILTER(WHERE l.ai_eligible IS TRUE) AS "lastCrawledAt" FROM liekan_catalog c LEFT JOIN liekan_reporting_log l ON l.website_id=c.website_id AND l.path=c.path AND l.created_at>=now()-interval '30 days' WHERE c.website_id=$1 GROUP BY c.path,c.title ORDER BY requests,c.path LIMIT 50`,
      [siteId],
    ),
    db.query(
      `SELECT referrer_domain AS source,count(distinct visit_id)::int AS visits FROM liekan_effective_browser_event WHERE website_id=$1 AND created_at>=now()-interval '30 days' AND event_type=1 AND referrer_domain=ANY($2::text[]) GROUP BY referrer_domain ORDER BY visits DESC`,
      [siteId, AI_REFERRERS.filter(v => v !== 'www.bing.com')],
    ),
    db.query(
      'SELECT id,question,method,answer,source_kind AS "sourceKind",created_at AS "createdAt",claimed_observed_at AS "observedAt" FROM aeo_answer_run WHERE website_id=$1 ORDER BY created_at DESC LIMIT 30',
      [siteId],
    ),
    db.query('SELECT goal_event AS "goalEvent" FROM aeo_site_settings WHERE website_id=$1', [
      siteId,
    ]),
    db.query(
      `SELECT path,status,bot,verification,count(*)::int AS requests FROM liekan_reporting_log WHERE website_id=$1 AND created_at>=now()-interval '30 days' AND ai_eligible IS TRUE AND status>=400 GROUP BY path,status,bot,verification ORDER BY requests DESC,path LIMIT 50`,
      [siteId],
    ),
    db.query(
      `SELECT id,question,method,CASE WHEN state='running' AND created_at<now()-interval '2 minutes' THEN 'interrupted' ELSE state END AS state,created_at AS "createdAt" FROM aeo_answer_job WHERE website_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [siteId],
    ),
  ]);
  const hasTraffic = receipt.events > 0,
    qualified = traffic.qualifiedEvents > 0,
    hasLogs = Boolean(crawl.lastImportAt),
    hasInventory = crawl.inventory > 0;
  const findings: { title: string; detail: string; action: string; view: string }[] = [];
  if (!hasTraffic)
    findings.push({
      title: 'Connect your website',
      detail: 'Install the tracker, then open a page to confirm the first event.',
      action: 'Get tracking code',
      view: 'connect',
    });
  else if (!qualified)
    findings.push({
      title: 'Tracking is connected. Check your traffic setup.',
      detail:
        'Events have arrived, but this connection cannot yet produce reliable traffic totals.',
      action: 'Review connection',
      view: 'connect',
    });
  if (!hasLogs)
    findings.push({
      title: 'Connect crawler logs',
      detail:
        'Browser tracking cannot observe AI crawler requests. Import a server or CDN log to start.',
      action: 'Import logs',
      view: 'crawl',
    });
  else if (crawl.errors > 0)
    findings.push({
      title: `${crawl.errors} AI-identified request${crawl.errors === 1 ? '' : 's'} returned an error`,
      detail: 'Inspect the affected paths and HTTP statuses before changing access rules.',
      action: 'Inspect crawl access',
      view: 'crawl',
    });
  if (!hasInventory)
    findings.push({
      title: 'Add your important pages',
      detail: 'A content inventory lets you see which pages have no observed AI crawl activity.',
      action: 'Add page inventory',
      view: 'crawl',
    });
  else if (pages.some(p => p.requests === 0) && hasLogs)
    findings.push({
      title: 'Some important pages have no observed AI requests',
      detail:
        'Review crawl coverage and internal links. Missing observations do not prove that a page is absent from an index.',
      action: 'Review pages',
      view: 'crawl',
    });
  return {
    website,
    traffic: {
      ...traffic,
      pageviews: qualified ? traffic.pageviews : null,
      aiReferralVisits: qualified ? traffic.aiReferralVisits : null,
      conversions: qualified && settings?.goalEvent ? traffic.conversions : null,
      receivedEvents: receipt.events,
      lastReceivedAt: receipt.lastReceivedAt,
      state: !hasTraffic ? 'not_connected' : qualified ? 'observed' : 'identity_unavailable',
    },
    crawl: {
      ...crawl,
      state: hasLogs ? 'observed' : 'not_connected',
      coverage: hasLogs && hasInventory ? crawl.observedInventoryPages : null,
    },
    pages,
    referrals,
    answers,
    accessErrors,
    jobs,
    settings: settings || { goalEvent: null },
    findings,
    window: 'Last 30 days',
    generatedAt: new Date().toISOString(),
  };
}
export async function saveAnswer(
  userId: string,
  siteId: string,
  input: unknown,
  source = 'user_import',
) {
  const data = safeAnswer(input);
  return transaction(async tx => {
    const website = await site(userId, siteId, true, tx);
    await tx.query('SELECT team_id FROM team WHERE team_id=$1 FOR UPDATE', [website.workspaceId]);
    await site(userId, siteId, true, tx);
    const {
      rows: [count],
    } = await tx.query(
      `SELECT count(*)::int AS n FROM aeo_answer_run a JOIN website w ON w.website_id=a.website_id WHERE w.team_id=$1 AND a.created_at>=date_trunc('day',now())`,
      [website.workspaceId],
    );
    if (count.n >= LIMITS.answerImportsPerDay)
      throw new AeoError(429, 'This workspace has reached its daily answer limit.');
    const id = randomUUID();
    await tx.query(
      'INSERT INTO aeo_answer_run(id,website_id,created_by,question,source_kind,method,answer,claimed_observed_at,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        siteId,
        userId,
        data.question,
        source,
        data.method,
        data.answer,
        data.observedAt || null,
        digest(JSON.stringify(data)),
      ],
    );
    return { id };
  });
}
export async function saveGoal(userId: string, siteId: string, input: unknown) {
  const { goalEvent } = z
    .object({ goalEvent: z.string().trim().min(1).max(50).nullable() })
    .strict()
    .parse(input);
  return transaction(async tx => {
    await site(userId, siteId, true, tx);
    await tx.query(
      'INSERT INTO aeo_site_settings(website_id,goal_event) VALUES($1,$2) ON CONFLICT(website_id) DO UPDATE SET goal_event=excluded.goal_event',
      [siteId, goalEvent],
    );
    return { goalEvent };
  });
}
export async function importEvidence(userId: string, siteId: string, kind: string, input: unknown) {
  const website = await site(userId, siteId, true);
  const { importLogs, importCatalog } = await import('@/lib/liekan/store');
  try {
    return kind === 'logs'
      ? await importLogs(siteId, website.domain, input, { userId })
      : await importCatalog(siteId, website.domain, input, { userId });
  } catch (error: any) {
    if (error.status) {
      const message =
        error.status === 429
          ? 'This website has reached its import allowance. Try again later.'
          : error.status === 403
            ? 'Your workspace access changed. Reload and try again.'
            : error.status === 409
              ? 'This import conflicts with current processing. Refresh before trying again.'
              : kind === 'logs'
                ? 'No valid logs could be imported. Check the format, timestamps, paths and HTTP responses.'
                : 'The page inventory could not be imported. Check the format and website domain.';
      throw new AeoError(error.status, message);
    }
    throw error;
  }
}
