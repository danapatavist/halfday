import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const envStatus = {
    hasUrl: !!url,
    hasToken: !!token,
    urlPrefix: url ? url.slice(0, 30) : null,
  };

  if (!url || !token) {
    return NextResponse.json({ env: envStatus, redis: 'skipped - missing env vars' });
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = Redis.fromEnv();
    await redis.set('debug_test', 'ok');
    const val = await redis.get('debug_test');
    const pubs = await redis.get('pubs');
    const routes = await redis.get('routes');
    return NextResponse.json({
      env: envStatus,
      redis: 'connected',
      testWrite: val,
      pubsType: Array.isArray(pubs) ? `array[${(pubs as []).length}]` : typeof pubs,
      routesType: Array.isArray(routes) ? `array[${(routes as []).length}]` : typeof routes,
    });
  } catch (e) {
    return NextResponse.json({ env: envStatus, redis: 'error', error: String(e) });
  }
}
