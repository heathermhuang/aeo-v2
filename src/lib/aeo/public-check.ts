import { z } from 'zod';
import { AeoError, domain } from './contracts';
import { publicCrawlerProbe, type PublicProbeResult } from '../liekan/crawler-control/public-probe';

export function publicCheckUrl(input: unknown) {
  const { url: value } = z
    .object({ url: z.string().trim().min(1).max(2048) })
    .strict()
    .parse(input);
  let url: URL;
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new AeoError(400, 'Enter a website URL, such as https://yourcompany.com.');
  }
  // Domain validation rejects credentials, ports, IP literals and private/local names.
  const hostname = domain(
    `${url.protocol}//${url.host}${url.username || url.password ? '/invalid' : '/'}`,
  );
  url.search = '';
  url.hash = '';
  return { hostname, path: url.pathname, url: `https://${hostname}${url.pathname}` };
}
export type PublicFinding = {
  label: string;
  state: 'found' | 'action' | 'unknown';
  detail: string;
  action: string;
};
export type PublicCheck = {
  url: string;
  hostname: string;
  checkedAt: string;
  findings: PublicFinding[];
};
export async function checkPublicWebsite(
  input: unknown,
  probe = publicCrawlerProbe,
): Promise<PublicCheck> {
  const target = publicCheckUrl(input);
  const results = await Promise.allSettled([
    probe(target.hostname, target.path, 'AEO-public-page', true),
    probe(target.hostname, '/robots.txt', 'AEO-public-robots', true),
  ]);
  const page: PublicProbeResult | undefined =
    results[0].status === 'fulfilled' ? results[0].value : undefined;
  const robots: PublicProbeResult | undefined =
    results[1].status === 'fulfilled' ? results[1].value : undefined;
  const html =
    page?.status === 200 &&
    /text\/html|application\/xhtml\+xml/i.test(page.headers['content-type'] || '')
      ? page.body
      : null;
  const findings: PublicFinding[] = [];
  findings.push(
    page
      ? {
          label: 'Page response',
          state: page.status >= 200 && page.status < 300 ? 'found' : 'action',
          detail: `The public HTTPS request returned HTTP ${page.status}.`,
          action:
            page.status >= 200 && page.status < 300
              ? 'The page responded to this check. Review its content below.'
              : 'Check the page URL, redirects and access rules. A public check can be treated differently from a browser.',
        }
      : {
          label: 'Page response',
          state: 'unknown',
          detail: 'We could not complete a safe public HTTPS request.',
          action:
            'Check that this exact hostname is reachable over HTTPS. Cross-host redirects and responses over 256 KiB are outside this quick check.',
        },
  );
  const title = html
    ?.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]
    ?.replace(/<[^>]*>/g, '')
    .trim();
  findings.push({
    label: 'Page title',
    state: html === null ? 'unknown' : title ? 'found' : 'action',
    detail:
      html === null
        ? 'The page HTML was unavailable.'
        : title
          ? 'A non-empty title is present in the HTML response.'
          : 'No non-empty page title was found in the HTML response.',
    action: title
      ? 'Make sure the title names what this page offers in plain language.'
      : 'Give the page a clear, descriptive title in its initial HTML. JavaScript-rendered changes are not inspected here.',
  });
  findings.push({
    label: 'Crawl instructions',
    state:
      robots?.status === 200 && robots.body !== null && !/^\s*</.test(robots.body)
        ? 'found'
        : 'unknown',
    detail:
      robots?.status === 200 && robots.body !== null && !/^\s*</.test(robots.body)
        ? 'A robots.txt response is available. Its rules need a crawler-specific review.'
        : robots
          ? `robots.txt returned HTTP ${robots.status}; we have not established its crawl policy.`
          : 'robots.txt could not be checked.',
    action:
      'Review which crawlers and paths your rules allow. A robots.txt file alone does not prove access, citations or AI recommendations.',
  });
  return {
    url: target.url,
    hostname: target.hostname,
    checkedAt: new Date().toISOString(),
    findings,
  };
}
