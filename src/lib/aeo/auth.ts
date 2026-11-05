import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendIdentityMail, mailReady, type IdentityMessage } from './mail';
import { db, transaction } from './db';
import { AeoError, accountInput, loginInput, proofInput, email } from './contracts';
export const COOKIE = 'aeo_v2_session';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const TTL = 7 * 86400;
export async function rateLimit(key: string, limit: number, seconds = 900) {
  const bucket = Math.floor(Date.now() / 1000 / seconds);
  const { rows } = await db.query(
    'INSERT INTO aeo_rate_limit(key,bucket,attempts) VALUES($1,$2,1) ON CONFLICT(key,bucket) DO UPDATE SET attempts=aeo_rate_limit.attempts+1 RETURNING attempts',
    [digest(key), bucket],
  );
  if (rows[0].attempts > limit)
    throw new AeoError(429, 'Too many attempts. Please try again later.');
}
export async function signup(input: unknown, deliver = sendIdentityMail) {
  if (process.env.AEO_SIGNUP_ENABLED !== 'true')
    throw new AeoError(403, 'New workspaces are not open yet.');
  const data = accountInput.parse(input);
  return requestProof(data.email, data.workspace || 'My workspace', false, deliver);
}
export async function recover(input: unknown, deliver = sendIdentityMail) {
  const data = z.object({ email }).strict().parse(input);
  return requestProof(data.email, 'My workspace', true, deliver);
}
async function requestProof(
  address: string,
  workspaceName: string,
  recovery: boolean,
  deliver: (message: IdentityMessage) => Promise<void>,
) {
  if (deliver === sendIdentityMail && !mailReady())
    throw new AeoError(503, 'Email access is not configured yet. Please try again later.');
  await rateLimit('identity:' + address, 3, 3600);
  await rateLimit('identity:installation', 30, 3600);
  const user = (
    await db.query(
      `SELECT u.user_id,u.password,u.role,
    EXISTS(SELECT 1 FROM two_factor_auth f WHERE f.user_id=u.user_id AND f.is_enabled) OR u.two_factor_required AS protected
    FROM "user" u WHERE u.username=$1 AND u.deleted_at IS NULL`,
      [address],
    )
  ).rows[0];
  // Match the response for unknown, administrator and protected accounts. These flows
  // cannot downgrade an operator or an account with an existing second factor.
  if (user && (user.role === 'admin' || user.protected)) return { accepted: true };
  if (
    recovery &&
    !user &&
    !(
      await db.query(
        'SELECT 1 FROM aeo_legacy_account WHERE email=$1 AND eligible AND claimed_by IS NULL LIMIT 1',
        [address],
      )
    ).rowCount
  )
    return { accepted: true };
  const token = randomBytes(32).toString('base64url');
  const purpose = user ? 'recover' : 'verify';
  await db.query(
    `INSERT INTO aeo_identity_token
    (token_hash,email,purpose,workspace,expected_user_id,expected_password_hash)
    VALUES($1,$2,$3,$4,$5,$6)`,
    [
      digest(token),
      address,
      purpose,
      workspaceName,
      user?.user_id || null,
      user ? digest(user.password) : null,
    ],
  );
  try {
    await deliver({ email: address, token, purpose });
  } catch (error) {
    await db.query('DELETE FROM aeo_identity_token WHERE token_hash=$1', [digest(token)]);
    // Keep the same public result for missing accounts and provider failures.
    console.info('AEO identity email delivery unavailable');
  }
  return { accepted: true };
}
export async function completeIdentity(input: unknown) {
  const data = proofInput.parse(input);
  await rateLimit('identity:complete', 100, 3600);
  const password = await bcrypt.hash(data.password, 12);
  return transaction(async tx => {
    // Read the immutable address before taking locks, then lock address -> proof -> user.
    // This serializes competing enrollment/recovery links without deadlocks.
    const candidate = (
      await tx.query('SELECT email FROM aeo_identity_token WHERE token_hash=$1', [
        digest(data.token),
      ])
    ).rows[0];
    if (!candidate) throw new AeoError(401, 'This link is invalid or expired. Request a new link.');
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,12800005))', [
      candidate.email,
    ]);
    const proof = (
      await tx.query(
        `SELECT * FROM aeo_identity_token WHERE token_hash=$1
      AND purpose=$2 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE`,
        [digest(data.token), data.purpose],
      )
    ).rows[0];
    if (!proof) throw new AeoError(401, 'This link is invalid or expired. Request a new link.');
    let user = (
      await tx.query(
        `SELECT user_id,password,role,two_factor_required FROM "user" WHERE username=$1 AND deleted_at IS NULL FOR UPDATE`,
        [proof.email],
      )
    ).rows[0];
    if (
      (user?.user_id || null) !== proof.expected_user_id ||
      (user && digest(user.password) !== proof.expected_password_hash)
    )
      throw new AeoError(409, 'Account access changed. Request a new link.');
    if (user) {
      const factor = (
        await tx.query('SELECT is_enabled FROM two_factor_auth WHERE user_id=$1', [user.user_id])
      ).rows[0];
      if (user.role === 'admin' || user.two_factor_required || factor?.is_enabled)
        throw new AeoError(403, 'Use the protected sign-in flow for this account.');
      await tx.query('UPDATE "user" SET password=$2,updated_at=now() WHERE user_id=$1', [
        user.user_id,
        password,
      ]);
    } else {
      user = { user_id: randomUUID() };
      const teamId = randomUUID();
      await tx.query(
        `INSERT INTO "user"(user_id,username,password,role,created_at) VALUES($1,$2,$3,'user',now())`,
        [user.user_id, proof.email, password],
      );
      await tx.query('INSERT INTO team(team_id,name,created_at) VALUES($1,$2,now())', [
        teamId,
        proof.workspace,
      ]);
      await tx.query(
        `INSERT INTO team_user(team_user_id,team_id,user_id,role,created_at) VALUES($1,$2,$3,'team-owner',now())`,
        [randomUUID(), teamId, user.user_id],
      );
    }
    await tx.query(
      `INSERT INTO aeo_identity(user_id,email) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=now()`,
      [user.user_id, proof.email],
    );
    await tx.query(
      'UPDATE aeo_identity_token SET consumed_at=now() WHERE email=$1 AND consumed_at IS NULL',
      [proof.email],
    );
    await tx.query(
      `UPDATE aeo_legacy_account SET claimed_by=$1,claimed_at=now() WHERE email=$2 AND eligible AND claimed_by IS NULL`,
      [user.user_id, proof.email],
    );
    await tx.query('DELETE FROM aeo_session WHERE user_id=$1', [user.user_id]);
    return newSession(user.user_id, password, tx);
  });
}
export async function login(input: unknown) {
  const data = loginInput.parse(input);
  await rateLimit('login:' + data.email, 10);
  await rateLimit('login:installation', 300);
  const { rows } = await db.query(
    'SELECT u.user_id,u.password,u.two_factor_required FROM "user" u JOIN aeo_identity i ON i.user_id=u.user_id AND i.email=u.username WHERE u.username=$1 AND u.deleted_at IS NULL',
    [data.email],
  );
  const user = rows[0];
  const valid = await bcrypt.compare(
    data.password,
    user?.password || '$2b$12$vsRMVhb92r68HRyLtP8U3uXEMc.9iCoxh1EQB6gfBB1xkXNZqXdby',
  );
  if (!user || !valid) throw new AeoError(401, 'Email or password is incorrect.');
  const factors = await db.query('SELECT is_enabled FROM two_factor_auth WHERE user_id=$1', [
    user.user_id,
  ]);
  if (user.two_factor_required || factors.rows[0]?.is_enabled)
    throw new AeoError(403, 'Use the existing sign-in flow for this protected account.');
  return newSession(user.user_id, user.password);
}
async function newSession(userId: string, password: string, client: any = db) {
  const token = randomBytes(32).toString('base64url');
  await client.query(
    'INSERT INTO aeo_session(token_hash,user_id,password_hash,expires_at) VALUES($1,$2,$3,now()+$4::interval)',
    [digest(token), userId, digest(password), `${TTL} seconds`],
  );
  return token;
}
export function cookie(token: string, expired = false) {
  const secure =
    process.env.NODE_ENV === 'production' || process.env.AEO_PUBLIC_URL?.startsWith('https:');
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expired ? 0 : TTL}${secure ? '; Secure' : ''}`;
}
export function tokenFrom(request: Request) {
  const value = (request.headers.get('cookie') || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
export async function principal(request: Request) {
  const token = tokenFrom(request);
  if (!token) throw new AeoError(401, 'Sign in to your workspace.');
  const active = (
    await db.query(
      'SELECT u.user_id AS id,u.username AS email,u.password,s.password_hash FROM aeo_session s JOIN "user" u ON u.user_id=s.user_id JOIN aeo_identity i ON i.user_id=u.user_id AND i.email=u.username WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL',
      [digest(token)],
    )
  ).rows[0];
  if (!active || active.password_hash !== digest(active.password))
    throw new AeoError(401, 'Your session expired. Sign in again.');
  return { id: active.id as string, email: active.email as string };
}
export async function workspace(userId: string, teamId: string, write = false, client: any = db) {
  const { rows } = await client.query(
    'SELECT t.team_id AS id,t.name,m.role FROM team t JOIN team_user m ON m.team_id=t.team_id JOIN "user" u ON u.user_id=m.user_id AND u.deleted_at IS NULL WHERE t.team_id=$1 AND m.user_id=$2 AND t.deleted_at IS NULL',
    [teamId, userId],
  );
  if (!rows.length) throw new AeoError(404, 'Workspace not found.');
  if (write && !['team-owner', 'team-manager'].includes(rows[0].role))
    throw new AeoError(403, 'Your role has read-only access.');
  return rows[0];
}
export async function site(userId: string, siteId: string, write = false, client: any = db) {
  const { rows } = await client.query(
    'SELECT w.website_id AS id,w.name,w.domain,w.team_id AS "workspaceId",m.role FROM website w JOIN team t ON t.team_id=w.team_id JOIN team_user m ON m.team_id=t.team_id JOIN "user" u ON u.user_id=m.user_id AND u.deleted_at IS NULL WHERE w.website_id=$1 AND m.user_id=$2 AND w.deleted_at IS NULL AND t.deleted_at IS NULL',
    [siteId, userId],
  );
  if (!rows.length) throw new AeoError(404, 'Website not found.');
  if (write && !['team-owner', 'team-manager'].includes(rows[0].role))
    throw new AeoError(403, 'Your role has read-only access.');
  return rows[0];
}
