import { getPubs, getRoutes } from '@/lib/db';
import { notFound } from 'next/navigation';
import RouteView from './RouteView';

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [routes, pubs] = await Promise.all([getRoutes(), getPubs()]);
  const route = routes.find((r) => r.id === id);
  if (!route) notFound();
  return <RouteView route={route} customPubs={pubs} />;
}
