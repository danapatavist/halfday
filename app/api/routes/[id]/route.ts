import { NextResponse } from 'next/server';
import { getRoutes, setRoutes } from '@/lib/db';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const routes = await getRoutes();
  const idx = routes.findIndex((r) => r.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  routes[idx] = { ...routes[idx], ...body, updatedAt: new Date().toISOString() };
  await setRoutes(routes);
  return NextResponse.json(routes[idx]);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const routes = await getRoutes();
  await setRoutes(routes.filter((r) => r.id !== id));
  return NextResponse.json({ ok: true });
}
