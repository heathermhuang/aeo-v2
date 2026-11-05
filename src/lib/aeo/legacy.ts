import { db } from './db';
import { AeoError } from './contracts';
export async function legacyReports(userId: string) {
  return (
    await db.query(
      `SELECT r.source_id AS "sourceId",r.legacy_id AS id,r.source_created_at AS "createdAt",
    s.release_id AS "releaseId",s.snapshot_sha256 AS "snapshotSha256",r.sha256,
    r.brand_id AS "brandId" FROM aeo_legacy_record r JOIN aeo_legacy_account a ON a.source_id=r.source_id AND a.legacy_id=r.owner_id
    JOIN aeo_legacy_source s ON s.id=r.source_id WHERE a.claimed_by=$1 AND a.eligible AND r.kind='checks'
    ORDER BY r.source_created_at DESC NULLS LAST,r.legacy_id LIMIT 100`,
      [userId],
    )
  ).rows;
}
// Keep original evidence immutable in the archive, but never export credentials,
// session material, raw network identity or access-bearing links from old payloads.
export function redactLegacy(value: unknown, depth = 0): unknown {
  if (depth > 30) return '[omitted: depth limit]';
  if (Array.isArray(value)) return value.map(v => redactLegacy(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).flatMap(([k, v]) =>
        /token|password|secret|authorization|cookie|api.?key|user.?agent|(?:^|_)ip(?:$|_)|share.?url|rawip|hashedip|ipaddress|clientip|remoteaddress|session/i.test(
          k,
        )
          ? []
          : [[k, redactLegacy(v, depth + 1)]],
      ),
    );
  if (typeof value === 'string')
    return value.replace(/https?:\/\/[^\s<>"']+/g, url => {
      try {
        const u = new URL(url);
        if (u.username || u.password || /\/s\/|\/share\//.test(u.pathname))
          return '[private link removed]';
        for (const key of [...u.searchParams.keys()])
          if (/token|key|secret|auth|signature|credential|code/i.test(key))
            u.searchParams.delete(key);
        u.hash = '';
        return u.toString();
      } catch {
        return '[invalid URL]';
      }
    });
  return value;
}
export async function legacyReport(userId: string, sourceId: string, id: string) {
  const record = (
    await db.query(
      `SELECT r.raw,r.sha256,s.snapshot_sha256,s.release_id,s.exported_at
    FROM aeo_legacy_record r JOIN aeo_legacy_account a ON a.source_id=r.source_id AND a.legacy_id=r.owner_id
    JOIN aeo_legacy_source s ON s.id=r.source_id
    WHERE a.claimed_by=$1 AND a.eligible AND r.source_id=$2 AND r.kind='checks' AND r.legacy_id=$3`,
      [userId, sourceId, id],
    )
  ).rows[0];
  if (!record) throw new AeoError(404, 'Historical report not found.');
  const row = JSON.parse(record.raw);
  let report: unknown;
  try {
    report = JSON.parse(row.report_json);
  } catch {
    throw new AeoError(409, 'This historical report needs operator review.');
  }
  return {
    sourceKind: 'v1_historical_archive',
    qualification: 'Historical evidence; not revalidated as a v2 observation',
    redacted: true,
    provenance: {
      releaseId: record.release_id,
      snapshotSha256: record.snapshot_sha256,
      recordSha256: record.sha256,
      exportedAt: record.exported_at,
    },
    report: redactLegacy(report),
  };
}
