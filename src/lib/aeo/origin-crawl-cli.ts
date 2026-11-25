import { isIP } from 'node:net';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { importLogs } from '@/lib/liekan/store';
import { withPublishedRegistry } from '@/lib/liekan/upstream/crawler-registry-context';
import { db } from './db';

const sites = z.tuple([z.uuid(), z.uuid()]);
const batch = z
  .array(
    z.strictObject({
      time: z.iso.datetime(),
      ip: z
        .string()
        .max(45)
        .refine(value => isIP(value) !== 0),
      path: z.enum(['/', '/robots.txt']),
      method: z.enum(['GET', 'HEAD']),
      status: z.number().int().min(100).max(599),
      bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      userAgent: z
        .string()
        .min(1)
        .max(500)
        .regex(/^[ -~]+$/),
    }),
  )
  .min(1)
  .max(200);

async function main() {
  if (process.env.AEO_PUBLIC_URL !== 'https://aeo.io')
    throw new Error('Origin import requires the canonical AEO installation');
  const [siteId, userId] = sites.parse(process.argv.slice(2));
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const value of process.stdin) {
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > 256 * 1024) throw new Error('Origin batch is too large');
    chunks.push(chunk);
  }
  const records = batch.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const { rows } = await db.query(
    `SELECT 1 FROM website w JOIN aeo_site_settings a USING (website_id)
      JOIN team t ON t.team_id=w.team_id AND t.deleted_at IS NULL
      JOIN team_user m ON m.team_id=t.team_id AND m.user_id=$2 AND m.role='team-owner'
      JOIN aeo_identity i ON i.user_id=m.user_id
      JOIN "user" u ON u.user_id=i.user_id AND u.username=i.email AND u.deleted_at IS NULL
      WHERE w.website_id=$1 AND w.domain='aeo.io' AND w.deleted_at IS NULL`,
    [siteId, userId],
  );
  if (rows.length !== 1) throw new Error('Origin site and verified owner binding failed');
  await withPublishedRegistry(async catalog => {
    if (catalog.state !== 'published') throw new Error('Crawler catalog is unavailable');
    const result = await importLogs(siteId, 'aeo.io', { format: 'json', records }, { userId });
    console.log(
      JSON.stringify({
        id: result.id,
        accepted: result.accepted,
        inserted: result.inserted,
        rejected: result.rejected,
        duplicate: result.duplicate,
      }),
    );
  });
}

try {
  await main();
} catch (error) {
  const code =
    typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
      ? error.status
      : null;
  console.error(JSON.stringify({ event: 'aeo_origin_import_failed', status: code }));
  process.exitCode = 1;
} finally {
  await Promise.all([db.end(), prisma.client.$disconnect()]);
}
