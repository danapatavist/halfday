"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";

interface Pub {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

interface RouteStop {
  pubId: number;
  openTime: string;
  closeTime: string;
}

interface SavedRoute {
  id: string;
  name: string;
  stops: RouteStop[];
  createdAt: string;
}

interface Props {
  route: SavedRoute;
  customPubs: Pub[];
}

function gradientColor(index: number, total: number): string {
  const hue = total <= 1 ? 120 : 120 - (index / (total - 1)) * 120;
  return `hsl(${hue}, 75%, 38%)`;
}

const routeIcon = (order: number, color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.35);color:white;font-size:12px;font-weight:bold;">${order}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

async function fetchAllPubs(): Promise<Pub[]> {
  try {
    // Get all stored pubs (OSM + custom saved in DB)
    const [stored, osm] = await Promise.all([
      fetch('/api/pubs').then(r => r.json() as Promise<Pub[]>).catch(() => [] as Pub[]),
      fetch('/api/pubs/osm').then(r => r.json() as Promise<Pub[]>).catch(() => [] as Pub[]),
    ]);
    const seen = new Set<number>();
    const merged: Pub[] = [];
    for (const p of [...stored, ...osm]) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
    // If still no osm pubs, try warming the cache
    if (osm.length === 0) {
      fetch('/api/pubs/osm', { method: 'POST' })
        .then(r => r.json() as Promise<Pub[]>)
        .then(fresh => {
          if (fresh.length > 0) {
            const ids = new Set(merged.map(p => p.id));
            merged.push(...fresh.filter(p => !ids.has(p.id)));
          }
        }).catch(() => {});
    }
    return merged;
  } catch { return []; }
}

export default function RouteView({ route, customPubs }: Props) {
  const [allPubs, setAllPubs] = useState<Pub[]>(customPubs);
  const [polyline, setPolyline] = useState<[number, number][]>([]);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetchAllPubs().then((pubs) => {
      setAllPubs(pubs);
      setLoading(false);
    });
  }, []);

  const stops = route.stops
    .map((s) => allPubs.find((p) => p.id === s.pubId))
    .filter(Boolean) as Pub[];

  const stopsWithTimes = route.stops
    .map((s) => ({ ...allPubs.find((p) => p.id === s.pubId), openTime: s.openTime, closeTime: s.closeTime }))
    .filter((s) => s.id != null) as (Pub & { openTime: string; closeTime: string })[];

  useEffect(() => {
    if (stops.length < 2) return;
    const coords = stops.map((p) => `${p.lon},${p.lat}`).join(';');
    fetch(`https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.routes?.[0]?.geometry?.coordinates ?? [];
        setPolyline(c.map(([lng, lat]: [number, number]) => [lat, lng]));
      })
      .catch(() => {});
  }, [allPubs, route.id]);

  const center: [number, number] = stops.length > 0
    ? [stops.reduce((s, p) => s + p.lat, 0) / stops.length, stops.reduce((s, p) => s + p.lon, 0) / stops.length]
    : [52.63, 1.3];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-3">
        <span className="text-2xl">🍺</span>
        <div>
          <h1 className="text-lg font-bold">{route.name || 'Unnamed Route'}</h1>
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `${stops.length} stops · shared route`}
          </p>
        </div>
      </div>

      {mounted && (
        <div className="flex-1 min-h-[50vh]">
          <MapContainer
            center={center}
            zoom={14}
            style={{ height: '100%', minHeight: '50vh', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {polyline.length > 1 && (
              <Polyline positions={polyline} color="#6366f1" weight={3} opacity={0.8} />
            )}
            {stops.map((pub, i) => (
              <Marker
                key={pub.id}
                position={[pub.lat, pub.lon]}
                icon={routeIcon(i + 1, gradientColor(i, stops.length))}
              >
                <Popup><strong>{pub.name}</strong></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      <div className="p-4 space-y-2 max-w-lg mx-auto w-full">
        {stopsWithTimes.map((stop, i) => (
          <div key={stop.id} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: gradientColor(i, stopsWithTimes.length) }}
            >
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{stop.name}</div>
              {(stop.openTime || stop.closeTime) && (
                <div className="text-xs text-gray-400">
                  {stop.openTime && `from ${stop.openTime}`}
                  {stop.openTime && stop.closeTime && ' · '}
                  {stop.closeTime && `until ${stop.closeTime}`}
                </div>
              )}
            </div>
          </div>
        ))}
        {!loading && stops.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">No stops found.</p>
        )}
      </div>
    </div>
  );
}
