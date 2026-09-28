import { proxyToApi } from '@/lib/proxy';

// Per request, never cached: this is a live API.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handler(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return proxyToApi(request, `/api/${path.join('/')}`);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
