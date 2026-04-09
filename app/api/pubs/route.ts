import { NextResponse } from 'next/server';
import { getPubs, setPubs, type Pub } from '@/lib/db';

export async function GET() {
  try {
    return NextResponse.json(await getPubs());
  } catch (e) {
    console.error('GET /api/pubs failed:', e);
    return NextResponse.json([], { status: 200 }); // return empty rather than 500
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const toAdd: Pub[] = Array.isArray(body) ? body : [body];
    const pubs = await getPubs();
    const existingIds = new Set(pubs.map((p) => p.id));
    const newPubs = toAdd.filter((p) => !existingIds.has(p.id));
    if (newPubs.length > 0) await setPubs([...pubs, ...newPubs]);
    return NextResponse.json({ added: newPubs.length }, { status: 201 });
  } catch (e) {
    console.error('POST /api/pubs failed:', e);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
