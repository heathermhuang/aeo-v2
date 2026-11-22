export const origin = 'https://aeo.io';
export const mailboxAddress = /^v2-canary-[a-f0-9]{20}@aeo\.io$/;
export const keyPattern = /^[a-f0-9]{64}$/;
export const proofLifetimeMs = 5 * 60 * 1000;
export const purposes = ['verify', 'recover'];

export function proofFromLink(value) {
  if (typeof value !== 'string' || value.length > 256) return null;
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.pathname !== '/' || url.search || url.username || url.password)
      return null;
    const fields = new URLSearchParams(url.hash.slice(1));
    if ([...fields.keys()].sort().join(',') !== 'account,purpose') return null;
    const token = fields.get('account');
    const purpose = fields.get('purpose');
    return /^[A-Za-z0-9_-]{43}$/.test(token) && purposes.includes(purpose)
      ? { token, purpose }
      : null;
  } catch {
    return null;
  }
}
