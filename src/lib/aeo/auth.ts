import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, transaction } from './db';
import { AeoError, accountInput, loginInput, LIMITS } from './contracts';
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
export async function signup(input: unknown) {
  if (process.env.AEO_SIGNUP_ENABLED !== 'true')
    throw new AeoError(403, 'New workspaces are not open yet.');
  const data = accountInput.parse(input);
  await rateLimit('signup:' + data.email, 3, 3600);
  await rateLimit('signup:installation', 30, 3600);
  const password = await bcrypt.hash(data.password, 12);
  const id = randomUUID(),
    teamId = randomUUID();
  try {
    await transaction(async tx => {
      await tx.query(
        `INSERT INTO "user"(user_id,username,password,role,created_at) VALUES($1,$2,$3,'user',now())`,
        [id, data.email, password],
      );
      await tx.query('INSERT INTO team(team_id,name,created_at) VALUES($1,$2,now())', [
        teamId,
        data.workspace || 'My workspace',
      ]);
      await tx.query(
        `INSERT INTO team_user(team_user_id,team_id,user_id,role,created_at) VALUES($1,$2,$3,'team-owner',now())`,
        [randomUUID(), teamId, id],
      );
    });
  } catch (error: any) {
    if (error.code === '23505')
      throw new AeoError(409, 'Unable to create this account. Try signing in.');
    throw error;
  }
  return newSession(id, password);
}
export async function login(input: unknown) {
  const data = loginInput.parse(input);
  await rateLimit('login:' + data.email, 10);
  await rateLimit('login:installation', 300);
  const { rows } = await db.query(
    'SELECT user_id,password FROM "user" WHERE username=$1 AND deleted_at IS NULL',
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
  if (factors.rows[0]?.is_enabled)
    throw new AeoError(403, 'Use the existing sign-in flow for this protected account.');
  return newSession(user.user_id, user.password);
}
async function newSession(userId: string, password: string) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
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
      'SELECT u.user_id AS id,u.username AS email,u.password,s.password_hash FROM aeo_session s JOIN "user" u ON u.user_id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL',
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
