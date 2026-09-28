import { NextResponse } from 'next/server';

/**
 * Same-origin proxy to the API.
 *
 * Implemented as a route handler rather than a Next `rewrites()` entry
 * because **rewrites are evaluated during `next build`** and written into
 * the routes manifest — a runtime environment variable can never reach
 * them. A route handler runs per request, so the target stays a runtime
 * setting and one image still serves every environment.
 *
 * Why proxy at all: whenever the POS is opened on a host the browser did
 * not start from — a tunnel, a LAN address, a reverse proxy — an absolute
 * "http://localhost:4000" points at the *visitor's* machine. Routing the
 * API under this origin also makes the session cookie first-party, which
 * removes CORS and third-party-cookie handling entirely.
 */

/** Hop-by-hop headers, which must not be forwarded. */
const STRIPPED = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'content-length',
]);

export function proxyTarget(): string | null {
  const target = process.env.API_PROXY_TARGET;
  return target ? target.replace(/\/$/, '') : null;
}

export async function proxyToApi(request: Request, path: string): Promise<Response> {
  const target = proxyTarget();

  if (!target) {
    // Not in proxy mode: the browser was given an absolute API URL and
    // should be calling it directly, so reaching here is a misconfiguration.
    return NextResponse.json(
      { message: 'The API proxy is not configured on this server.' },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const url = `${target}${path}${incoming.search}`;

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  }

  // The API is behind a hop now; tell it who the client really is so
  // Secure cookies and audit-log IP addresses stay correct.
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp = request.headers.get('x-real-ip');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  else if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));
  headers.set('x-forwarded-host', request.headers.get('host') ?? incoming.host);

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // Redirects are the browser's business, not ours.
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      { message: 'The server is not reachable. Please try again.' },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers) {
    if (STRIPPED.has(key.toLowerCase()) || key.toLowerCase() === 'set-cookie') continue;
    responseHeaders.set(key, value);
  }

  // Set-Cookie can appear several times and must survive as separate
  // headers, or the session cookie is silently lost.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
