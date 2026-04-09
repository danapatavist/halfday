import { getPubs, getRoutes } from '@/lib/db';
import { notFound } from 'next/navigation';
import RouteView from './RouteView';

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let routes: Awaited<ReturnType<typeof getRoutes>> = [];
  let pubs: Awaited<ReturnType<typeof getPubs>> = [];
  try {
    [routes, pubs] = await Promise.all([getRoutes(), getPubs()]);
  } catch {
    // DB unavailable — fall through to notFound
  }
  const route = routes.find((r) => r.id === id);
  if (!route) notFound();
  return <RouteView route={route} customPubs={pubs} />;
}
