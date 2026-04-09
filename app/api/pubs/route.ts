import { NextResponse } from 'next/server';
import { getPubs, setPubs, type Pub } from '@/lib/db';

export async function GET() {
  return NextResponse.json(await getPubs());
}

export async function POST(req: Request) {
  const body = await req.json();
  const toAdd: Pub[] = Array.isArray(body) ? body : [body];
  const pubs = await getPubs();
  const existingIds = new Set(pubs.map((p) => p.id));
  const newPubs = toAdd.filter((p) => !existingIds.has(p.id));
  if (newPubs.length > 0) await setPubs([...pubs, ...newPubs]);
  return NextResponse.json({ added: newPubs.length }, { status: 201 });
}
