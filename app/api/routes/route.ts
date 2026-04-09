import { NextResponse } from 'next/server';
import { getRoutes, setRoutes } from '@/lib/db';

export async function GET() {
  return NextResponse.json(await getRoutes());
}

export async function POST(req: Request) {
  const body = await req.json();
  const routes = await getRoutes();
  const newRoute = { ...body, id: Date.now().toString(), createdAt: new Date().toISOString() };
  await setRoutes([...routes, newRoute]);
  return NextResponse.json(newRoute, { status: 201 });
}
