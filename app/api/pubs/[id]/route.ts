import { NextResponse } from 'next/server';
import { getPubs, setPubs } from '@/lib/db';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pubs = await getPubs();
  await setPubs(pubs.filter((p) => p.id !== Number(id)));
  return NextResponse.json({ ok: true });
}
