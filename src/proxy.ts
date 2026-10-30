import { NextResponse, type NextRequest } from 'next/server';
import { isAeoSurface } from '@/lib/aeo/surface';
export function proxy(request: NextRequest) {
  if (isAeoSurface(request.nextUrl.pathname)) return NextResponse.next();
  return NextResponse.json(
    { error: 'This page could not be found.' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export const config = { matcher: '/:path*' };
