// The hosted AEO app exposes only its own private API and the original public tracker intake.
export function isAeoSurface(path: string) {
  return (
    path === '/' ||
    path === '/api/send' ||
    path.startsWith('/api/aeo/') ||
    path.startsWith('/_next/') ||
    ['/script.js', '/site.webmanifest', '/favicon.ico', '/aeo-icon.svg'].includes(path)
  );
}
