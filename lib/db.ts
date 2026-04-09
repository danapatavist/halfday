import fs from 'fs';
import path from 'path';

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

const isVercel = !!process.env.UPSTASH_REDIS_REST_URL;

// ── File-based (local dev) ────────────────────────────────────────────────────

function filePath(key: string) {
  return path.join(process.cwd(), 'data', `${key}.json`);
}

function readFile<T>(key: string): T {
  const file = filePath(key);
  if (!fs.existsSync(file)) return [] as unknown as T;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeFile<T>(key: string, data: T): void {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath(key), JSON.stringify(data, null, 2));
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
  return isVercel ? readRedis<Pub[]>('pubs') : readFile<Pub[]>('pubs');
}

export async function setPubs(pubs: Pub[]): Promise<void> {
  if (isVercel) await writeRedis('pubs', pubs);
  else writeFile('pubs', pubs);
}

export async function getRoutes(): Promise<SavedRoute[]> {
  return isVercel ? readRedis<SavedRoute[]>('routes') : readFile<SavedRoute[]>('routes');
}

export async function setRoutes(routes: SavedRoute[]): Promise<void> {
  if (isVercel) await writeRedis('routes', routes);
  else writeFile('routes', routes);
}
