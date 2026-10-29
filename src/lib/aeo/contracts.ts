import { isIP } from 'node:net';
import { z } from 'zod';
export const LIMITS = Object.freeze({
  sites: 3,
  members: 5,
  answerImportsPerDay: 30,
  bodyBytes: 1024 * 1024,
});
export class AeoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const uuid = z.uuid();
export const email = z
  .email()
  .max(254)
  .transform(v => v.toLowerCase().trim());
export const passwordInput = z
  .string()
  .min(12)
  .max(72)
  .refine(v => Buffer.byteLength(v) <= 72, 'Use at most 72 UTF-8 bytes.');
export const accountInput = z
  .object({
    email,
    workspace: z.string().trim().min(2).max(50).optional(),
  })
  .strict();
export const proofInput = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    purpose: z.enum(['verify', 'recover']),
    password: passwordInput,
  })
  .strict();
export const loginInput = z.object({ email, password: z.string().min(1).max(72) }).strict();
export function domain(value: string) {
  let url: URL;
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new AeoError(400, 'Enter a public website domain.');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    isIP(host) ||
    !host.includes('.') ||
    host.length > 253 ||
    /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
    !/^[a-z0-9.-]+$/.test(host)
  )
    throw new AeoError(400, 'Use a public HTTPS domain without a path or port.');
  return host;
}
export function sameOrigin(request: Request) {
  const origin = process.env.AEO_PUBLIC_URL || new URL(request.url).origin;
  if (
    request.headers.get('origin') !== new URL(origin).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new AeoError(403, 'Reload this page and try again.');
}
export async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AeoError(400, 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > LIMITS.bodyBytes) {
      await reader.cancel();
      throw new AeoError(413, 'Keep this upload below 1 MiB.');
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AeoError(400, 'Upload valid JSON.');
  }
}
export function safeAnswer(value: unknown) {
  return z
    .object({
      question: z.string().trim().min(5).max(500),
      method: z.string().trim().min(1).max(160),
      answer: z.string().trim().min(1).max(24000),
      observedAt: z.iso.datetime().optional(),
    })
    .strict()
    .parse(value);
}
