import { AeoError } from './contracts';
export type IdentityMessage = { email: string; token: string; purpose: 'verify' | 'recover' };
export function mailReady() {
  return Boolean(
    /^https:\/\/aeo-v2-identity-mail\.[a-z0-9-]+\.workers\.dev\/identity-mail$/.test(
      process.env.AEO_EMAIL_RELAY_URL || '',
    ) && /^[a-f0-9]{64}$/.test(process.env.AEO_EMAIL_RELAY_KEY || ''),
  );
}
export async function sendIdentityMail(message: IdentityMessage, fetcher: typeof fetch = fetch) {
  if (!mailReady())
    throw new AeoError(503, 'Email access is not configured yet. Please try again later.');
  try {
    const response = await fetcher(process.env.AEO_EMAIL_RELAY_URL!, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AEO_EMAIL_RELAY_KEY}`,
      },
      body: JSON.stringify(message),
    });
    if (!response.ok || (await response.json()).accepted !== true)
      throw new Error('delivery unavailable');
  } catch {
    throw new AeoError(503, 'The email could not be sent. Please request a new link later.');
  }
}
