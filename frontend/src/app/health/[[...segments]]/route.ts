import { proxyToApi } from '@/lib/proxy';

/**
 * Proxies the API's health endpoints, which the POS connectivity
 * indicator polls. Note this is the *API's* health — the frontend's own
 * probe is /healthz, kept separate so a container check cannot be
 * satisfied by a healthy proxy in front of a dead API.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ segments?: string[] }> },
): Promise<Response> {
  const { segments } = await context.params;
  const suffix = segments?.length ? `/${segments.join('/')}` : '';
  return proxyToApi(request, `/health${suffix}`);
}
