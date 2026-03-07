import { NextResponse } from 'next/server';

/**
 * Return a JSON response with CDN cache headers.
 * Uses s-maxage (CDN/edge cache) NOT max-age (browser cache)
 * so users always get fresh data when CDN revalidates.
 *
 * @param data - Response payload
 * @param sMaxAge - CDN cache duration in seconds
 * @param swr - stale-while-revalidate window (defaults to 2× sMaxAge)
 */
export function jsonWithCache(data: unknown, sMaxAge: number, swr?: number) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr ?? sMaxAge * 2}`,
    },
  });
}
