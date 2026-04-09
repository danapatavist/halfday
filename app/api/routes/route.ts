import { NextResponse } from 'next/server';
import { getRoutes, setRoutes } from '@/lib/db';

export async function GET() {
  try {
    return NextResponse.json(await getRoutes());
  } catch (e) {
    console.error('GET /api/routes failed:', e);
    return NextResponse.json([], { status: 200 });
  }
}

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const routes = await getRoutes();
    const base = toSlug(body.name || 'route');
    const slug = base ? `${base}-${shortId()}` : `route-${shortId()}`;
    const newRoute = { ...body, id: slug, createdAt: new Date().toISOString() };
    await setRoutes([...routes, newRoute]);
    return NextResponse.json(newRoute, { status: 201 });
  } catch (e) {
    console.error('POST /api/routes failed:', e);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
