import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Container health probe for the frontend (§37). */
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'lorma-beauty-pos-frontend' });
}
