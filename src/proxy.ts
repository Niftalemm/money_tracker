import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV === 'development';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origin = url ? new URL(url).origin : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${origin}${development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!development ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|pdf-import.worker.mjs).*)',
  ],
};
