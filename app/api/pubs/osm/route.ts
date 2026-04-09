import { NextResponse } from 'next/server';

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const OSM_QUERY = `[out:json][timeout:25];node["amenity"="pub"](52.58,1.22,52.68,1.36);out body;`;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

interface Pub { id: number; name: string; lat: number; lon: number; }

let memCache: { data: Pub[]; expires: number } | null = null;

function isVercel() {
  return !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
}

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!,
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!,
  });
}

async function tryEndpoint(endpoint: string): Promise<Pub[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${endpoint}?data=${encodeURIComponent(OSM_QUERY)}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'halfday-app/1.0' },
    });
    const text = await res.text();
    if (text.trimStart().startsWith('<')) throw new Error('xml');
    const json = JSON.parse(text);
    const pubs: Pub[] = (json.elements ?? [])
      .filter((el: { tags?: { name?: string } }) => el.tags?.name)
      .map((el: { id: number; tags: { name: string }; lat: number; lon: number }) => ({
        id: el.id, name: el.tags.name, lat: el.lat, lon: el.lon,
      }));
    if (pubs.length < 5) throw new Error('too few results');
    return pubs;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromOverpass(): Promise<Pub[]> {
  try {
    return await Promise.any(OVERPASS_ENDPOINTS.map(tryEndpoint));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    if (isVercel()) {
      const redis = await getRedis();
      const cached = await redis.get<Pub[]>('osm_pubs');
      return NextResponse.json(cached ?? [], {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }
    if (memCache && memCache.expires > Date.now()) {
      return NextResponse.json(memCache.data);
    }
    return NextResponse.json([]);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  let pubs: Pub[] = [];
  try { pubs = await req.json(); } catch { /* empty body */ }
  if (!Array.isArray(pubs) || pubs.length === 0) {
    pubs = await fetchFromOverpass();
  }
  if (pubs.length === 0) return NextResponse.json([]);

  try {
    if (isVercel()) {
      const redis = await getRedis();
      await redis.set('osm_pubs', pubs, { ex: CACHE_TTL_SECONDS });
    } else {
      memCache = { data: pubs, expires: Date.now() + CACHE_TTL_SECONDS * 1000 };
    }
  } catch { /* cache write failed, still return data */ }

  return NextResponse.json(pubs);
}
