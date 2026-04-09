export interface Pub {
  id: number;
  name: string;
  lat: number;
  lon: number;
  custom?: boolean;
}

export interface RouteStop {
  pubId: number;
  openTime: string;
  closeTime: string;
}

export interface SavedRoute {
  id: string;
  name: string;
  stops: RouteStop[];
  createdAt: string;
  updatedAt?: string;
}

function isVercel() {
  return !!process.env.UPSTASH_REDIS_REST_URL;
}

// ── File-based (local dev) ────────────────────────────────────────────────────

async function readFile<T>(key: string): Promise<T> {
  const fs = await import('fs');
  const path = await import('path');
  const file = path.join(process.cwd(), 'data', `${key}.json`);
  if (!fs.existsSync(file)) return [] as unknown as T;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function writeFile<T>(key: string, data: T): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data, null, 2));
}

// ── Redis (Vercel / production) ───────────────────────────────────────────────

async function readRedis<T>(key: string): Promise<T> {
  const { Redis } = await import('@upstash/redis');
  const redis = Redis.fromEnv();
  return (await redis.get<T>(key)) ?? ([] as unknown as T);
}

async function writeRedis<T>(key: string, data: T): Promise<void> {
  const { Redis } = await import('@upstash/redis');
  const redis = Redis.fromEnv();
  await redis.set(key, data);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getPubs(): Promise<Pub[]> {
  return isVercel() ? readRedis<Pub[]>('pubs') : readFile<Pub[]>('pubs');
}

export async function setPubs(pubs: Pub[]): Promise<void> {
  if (isVercel()) await writeRedis('pubs', pubs);
  else await writeFile('pubs', pubs);
}

export async function getRoutes(): Promise<SavedRoute[]> {
  return isVercel() ? readRedis<SavedRoute[]>('routes') : readFile<SavedRoute[]>('routes');
}

export async function setRoutes(routes: SavedRoute[]): Promise<void> {
  if (isVercel()) await writeRedis('routes', routes);
  else await writeFile('routes', routes);
}
