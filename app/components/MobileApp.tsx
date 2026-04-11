"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

interface Pub { id: number; name: string; lat: number; lon: number; }
interface RouteStop { pubId: number; openTime: string; closeTime: string; }
interface SavedRoute { id: string; name: string; stops: RouteStop[]; createdAt: string; }

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

async function fetchLegPolyline(from: Pub, to: Pub): Promise<[number, number][]> {
  try {
    const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`);
    const data = await res.json();
    const c = data.routes?.[0]?.geometry?.coordinates ?? [];
    return c.map(([lng, lat]: [number, number]) => [lat, lng]);
  } catch { return []; }
}

function FitToLeg({ from, to }: { from: Pub; to: Pub }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(
        L.latLngBounds([[from.lat, from.lon], [to.lat, to.lon]]),
        { padding: [32, 32], maxZoom: 17 }
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [from.id, to.id]);
  return null;
}

export default function MobileApp() {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [currentLeg, setCurrentLeg] = useState(0);
  const [legs, setLegs] = useState<{ distance: number; duration: number }[]>([]);
  const [legPolylines, setLegPolylines] = useState<[number, number][][]>([]);
  const [legPolyLoading, setLegPolyLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    Promise.all([
      fetch('/api/routes').then(r => r.json()).catch(() => []),
      fetch('/api/pubs').then(r => r.json()).catch(() => []),
      fetch('/api/pubs/osm').then(r => r.json()).catch(() => []),
    ]).then(([routesData, pubsData, osmData]) => {
      setRoutes(routesData);
      const seen = new Set<number>();
      const merged: Pub[] = [];
      for (const p of [...pubsData, ...osmData]) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
      }
      setPubs(merged);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function selectRoute(route: SavedRoute) {
    const stops = route.stops.map(s => pubs.find(p => p.id === s.pubId)).filter(Boolean) as Pub[];
    if (stops.length < 2) return;

    setSelectedRoute(route);
    setCurrentLeg(0);
    setLegs([]);
    setLegPolylines([]);

    // Fetch leg durations/distances
    const coords = stops.map(p => `${p.lon},${p.lat}`).join(';');
    fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => setLegs(data.routes?.[0]?.legs ?? []))
      .catch(() => {});

    // Fetch per-leg polylines
    setLegPolyLoading(true);
    Promise.all(stops.slice(0, -1).map((from, i) => fetchLegPolyline(from, stops[i + 1])))
      .then(polys => { setLegPolylines(polys); setLegPolyLoading(false); });
  }

  // ── Route list ────────────────────────────────────────────────────────────
  if (!selectedRoute) {
    return (
      <div className="min-h-screen bg-white text-gray-900">
        <div className="px-4 py-5 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-amber-700">🍺 Halfday</h1>
          <p className="text-sm text-gray-400 mt-0.5">Choose a route to walk</p>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
          ) : routes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🍺</p>
              <p className="text-gray-500 text-sm">No routes yet.</p>
              <p className="text-gray-400 text-xs mt-1">Create one on desktop first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map(route => (
                <button
                  key={route.id}
                  onClick={() => selectRoute(route)}
                  className="w-full text-left p-4 bg-gray-50 rounded-2xl border border-gray-100 active:bg-amber-50 active:border-amber-200 transition-colors"
                >
                  <p className="font-semibold text-gray-900 text-base">{route.name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {route.stops.length} stop{route.stops.length !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Walking step view ─────────────────────────────────────────────────────
  const stops = selectedRoute.stops
    .map(s => pubs.find(p => p.id === s.pubId))
    .filter(Boolean) as Pub[];

  const stopsWithTimes = selectedRoute.stops
    .map(s => ({ ...pubs.find(p => p.id === s.pubId), openTime: s.openTime, closeTime: s.closeTime }))
    .filter(s => s.id != null) as (Pub & { openTime: string; closeTime: string })[];

  const from = stops[currentLeg];
  const to = stops[currentLeg + 1];
  const fromStop = stopsWithTimes[currentLeg];
  const toStop = stopsWithTimes[currentLeg + 1];
  const leg = legs[currentLeg];
  const poly = legPolylines[currentLeg] ?? [];
  const total = stops.length - 1;

  return (
    <div className="fixed inset-0 bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setSelectedRoute(null)}
          className="text-gray-400 hover:text-gray-700 transition-colors text-sm"
        >
          ← Routes
        </button>
        <span className="flex-1 text-center text-sm text-gray-400">
          Leg {currentLeg + 1} of {total}
        </span>
        <span className="text-sm font-medium text-amber-600 truncate max-w-[120px]">
          {selectedRoute.name}
        </span>
      </div>

      {/* Map */}
      {mounted && (
        <div className="flex-1 min-h-0">
          <MapContainer
            center={[(from.lat + to.lat) / 2, (from.lon + to.lon) / 2]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org/">OpenStreetMap</a>'
            />
            <FitToLeg from={from} to={to} />
            <Marker position={[from.lat, from.lon]} icon={routeIcon(currentLeg + 1, gradientColor(currentLeg, stops.length))} />
            <Marker position={[to.lat, to.lon]} icon={routeIcon(currentLeg + 2, gradientColor(currentLeg + 1, stops.length))} />
            {poly.length > 1 && <Polyline positions={poly} color="#6366f1" weight={4} opacity={0.9} />}
          </MapContainer>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 pt-4 pb-6">
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center shrink-0 font-bold"
              style={{ background: gradientColor(currentLeg, stops.length) }}
            >
              {currentLeg + 1}
            </span>
            <div>
              <p className="font-semibold text-sm leading-tight">{from.name}</p>
              {fromStop?.closeTime && <p className="text-xs text-gray-400">until {fromStop.closeTime}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center shrink-0 font-bold"
              style={{ background: gradientColor(currentLeg + 1, stops.length) }}
            >
              {currentLeg + 2}
            </span>
            <div>
              <p className="font-semibold text-sm leading-tight">{to.name}</p>
              {toStop?.openTime && <p className="text-xs text-gray-400">opens {toStop.openTime}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentLeg(l => Math.max(0, l - 1))}
            disabled={currentLeg === 0}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg disabled:opacity-30 hover:bg-gray-200 transition-colors shrink-0"
          >
            ←
          </button>
          <div className="flex-1 text-center">
            {legPolyLoading ? (
              <span className="text-xs text-gray-400">Loading route…</span>
            ) : leg ? (
              <span className="text-sm text-gray-600">
                👣 {Math.round(leg.duration / 60)} min · {leg.distance < 1000
                  ? `${Math.round(leg.distance)}m`
                  : `${(leg.distance / 1000).toFixed(1)}km`}
              </span>
            ) : (
              <span className="text-xs text-gray-300">···</span>
            )}
          </div>
          <button
            onClick={() => setCurrentLeg(l => Math.min(total - 1, l + 1))}
            disabled={currentLeg === total - 1}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg disabled:opacity-30 hover:bg-gray-200 transition-colors shrink-0"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
