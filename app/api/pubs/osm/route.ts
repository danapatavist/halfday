import { NextResponse } from 'next/server';

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// In-memory cache for local dev
let memCache: { data: unknown; expires: number } | null = null;

// GET: return cached pubs (empty array if not yet cached — client will seed it)
export async function GET() {
  const isVercel = !!process.env.UPSTASH_REDIS_REST_URL;

  if (isVercel) {
    const { Redis } = await import('@upstash/redis');
    const redis = Redis.fromEnv();
    const cached = await redis.get('osm_pubs');
    return NextResponse.json(cached ?? [], {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }

  if (memCache && memCache.expires > Date.now()) {
    return NextResponse.json(memCache.data);
  }
  return NextResponse.json([]);
}

// POST: client seeds the cache after fetching from Overpass directly
export async function POST(req: Request) {
  const isVercel = !!process.env.UPSTASH_REDIS_REST_URL;
  const pubs = await req.json();
  if (!Array.isArray(pubs) || pubs.length === 0) {
    return NextResponse.json({ ok: false });
  }

  if (isVercel) {
    const { Redis } = await import('@upstash/redis');
    const redis = Redis.fromEnv();
    await redis.set('osm_pubs', pubs, { ex: CACHE_TTL_SECONDS });
  } else {
    memCache = { data: pubs, expires: Date.now() + CACHE_TTL_SECONDS * 1000 };
  }

  return NextResponse.json({ ok: true });
}
