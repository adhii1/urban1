import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const authCookie = request.cookies.get('accessToken');

  if (!authCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/drivers/:path*',
    '/customers/:path*',
    '/trips/:path*',
    '/rides/:path*',
    '/routes/:path*',
    '/subscriptions/:path*',
    '/plans/:path*',
    '/analytics/:path*',
    '/settings/:path*',
    '/profile/:path*',
  ],
};
