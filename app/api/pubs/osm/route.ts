import { NextResponse } from 'next/server';

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const OSM_QUERY = `[out:json][timeout:25];node["amenity"="pub"](52.58,1.22,52.68,1.36);out body;`;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// In-memory cache for local dev
let memCache: { data: unknown; expires: number } | null = null;

async function fetchFromOverpass() {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(OSM_QUERY)}`, {
        signal: AbortSignal.timeout(28000),
      });
      const text = await res.text();
      if (text.trimStart().startsWith('<')) continue;
      const json = JSON.parse(text);
      return (json.elements ?? [])
        .filter((el: { tags?: { name?: string } }) => el.tags?.name)
        .map((el: { id: number; tags: { name: string }; lat: number; lon: number }) => ({
          id: el.id,
          name: el.tags.name,
          lat: el.lat,
          lon: el.lon,
        }));
    } catch {
      continue;
    }
  }
  return [];
}

export async function GET() {
  const isVercel = !!process.env.UPSTASH_REDIS_REST_URL;

  if (isVercel) {
    const { Redis } = await import('@upstash/redis');
    const redis = Redis.fromEnv();
    const cached = await redis.get('osm_pubs');
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }
    const pubs = await fetchFromOverpass();
    if (pubs.length > 0) await redis.set('osm_pubs', pubs, { ex: CACHE_TTL_SECONDS });
    return NextResponse.json(pubs, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }

  // Local dev: use in-memory cache
  if (memCache && memCache.expires > Date.now()) {
    return NextResponse.json(memCache.data);
  }
  const pubs = await fetchFromOverpass();
  memCache = { data: pubs, expires: Date.now() + CACHE_TTL_SECONDS * 1000 };
  return NextResponse.json(pubs);
}
