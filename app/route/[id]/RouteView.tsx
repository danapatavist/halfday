"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
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
    const [stored, osm] = await Promise.all([
      fetch('/api/pubs').then(r => r.json() as Promise<Pub[]>).catch(() => [] as Pub[]),
      fetch('/api/pubs/osm').then(r => r.json() as Promise<Pub[]>).catch(() => [] as Pub[]),
    ]);
    const seen = new Set<number>();
    const merged: Pub[] = [];
    for (const p of [...stored, ...osm]) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
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

async function fetchLegPolyline(from: Pub, to: Pub): Promise<[number, number][]> {
  try {
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`);
    const data = await res.json();
    const c = data.routes?.[0]?.geometry?.coordinates ?? [];
    return c.map(([lng, lat]: [number, number]) => [lat, lng]);
  } catch { return []; }
}

function FitToStops({ stops }: { stops: Pub[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 0) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (stops.length === 1) {
        map.setView([stops[0].lat, stops[0].lon], 16);
      } else {
        map.fitBounds(
          L.latLngBounds(stops.map((p) => [p.lat, p.lon])),
          { padding: [32, 32], maxZoom: 17 }
        );
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [stops.length]);
  return null;
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

export default function RouteView({ route, customPubs }: Props) {
  const [allPubs, setAllPubs] = useState<Pub[]>(customPubs);
  const [polyline, setPolyline] = useState<[number, number][]>([]);
  const [legs, setLegs] = useState<{ distance: number; duration: number }[]>([]);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Walking mode
  const [walkingMode, setWalkingMode] = useState(false);
  const [currentLeg, setCurrentLeg] = useState(0);
  const [legPolylines, setLegPolylines] = useState<[number, number][][]>([]);
  const [legPolyLoading, setLegPolyLoading] = useState(false);

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
    fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((data) => {
        const r = data.routes?.[0];
        if (!r) return;
        const c = r.geometry?.coordinates ?? [];
        setPolyline(c.map(([lng, lat]: [number, number]) => [lat, lng]));
        setLegs(r.legs ?? []);
      })
      .catch(() => {});
  }, [allPubs, route.id]);

  async function enterWalkingMode() {
    setCurrentLeg(0);
    setWalkingMode(true);
    if (stops.length < 2) return;
    setLegPolyLoading(true);
    const polys = await Promise.all(
      stops.slice(0, -1).map((from, i) => fetchLegPolyline(from, stops[i + 1]))
    );
    setLegPolylines(polys);
    setLegPolyLoading(false);
  }

  const center: [number, number] = stops.length > 0
    ? [stops.reduce((s, p) => s + p.lat, 0) / stops.length, stops.reduce((s, p) => s + p.lon, 0) / stops.length]
    : [52.63, 1.3];

  // ── Walking mode view ─────────────────────────────────────────────────────
  if (walkingMode && stops.length >= 2) {
    const from = stops[currentLeg];
    const to = stops[currentLeg + 1];
    const fromStop = stopsWithTimes[currentLeg];
    const toStop = stopsWithTimes[currentLeg + 1];
    const leg = legs[currentLeg];
    const poly = legPolylines[currentLeg] ?? [];
    const total = stops.length - 1;

    return (
      <div className="fixed inset-0 bg-white text-gray-900 flex flex-col z-50">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setWalkingMode(false)}
            className="text-gray-400 hover:text-gray-700 transition-colors text-sm"
          >
            ← Overview
          </button>
          <span className="flex-1 text-center text-sm text-gray-400">
            Leg {currentLeg + 1} of {total}
          </span>
          <span className="text-sm font-medium text-amber-600">
            {route.name}
          </span>
        </div>

        {/* Map */}
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

        {/* Footer card */}
        <div className="shrink-0 bg-white border-t border-gray-200 px-4 pt-4 pb-6">
          {/* Pub names stacked */}
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
                {fromStop?.closeTime && (
                  <p className="text-xs text-gray-400">until {fromStop.closeTime}</p>
                )}
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
                {toStop?.openTime && (
                  <p className="text-xs text-gray-400">opens {toStop.openTime}</p>
                )}
              </div>
            </div>
          </div>

          {/* Walk info + nav */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentLeg((l) => Math.max(0, l - 1))}
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
              onClick={() => setCurrentLeg((l) => Math.min(total - 1, l + 1))}
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

  // ── Overview ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="px-4 py-4 border-b border-gray-200 flex items-center gap-3">
        <span className="text-2xl">🍺</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">{route.name || 'Unnamed Route'}</h1>
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : `${stops.length} stops · shared route`}
          </p>
        </div>
        {!loading && stops.length >= 2 && (
          <button
            onClick={enterWalkingMode}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors shrink-0"
          >
            Start →
          </button>
        )}
      </div>

      {mounted && (
        <div style={{ height: '50vh' }}>
          <MapContainer
            center={center}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org/">OpenStreetMap</a>'
            />
            <FitToStops stops={stops} />
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

      <div className="p-4 max-w-lg mx-auto w-full">
        {stopsWithTimes.map((stop, i) => (
          <div key={stop.id}>
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: gradientColor(i, stopsWithTimes.length) }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate text-gray-900">{stop.name}</div>
                {(stop.openTime || stop.closeTime) && (
                  <div className="text-xs text-gray-400">
                    {stop.openTime && `from ${stop.openTime}`}
                    {stop.openTime && stop.closeTime && ' · '}
                    {stop.closeTime && `until ${stop.closeTime}`}
                  </div>
                )}
              </div>
            </div>
            {i < stopsWithTimes.length - 1 && (
              <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-400">
                <span>👣</span>
                {legs[i] ? (
                  <span>
                    {Math.round(legs[i].duration / 60)} min · {legs[i].distance < 1000
                      ? `${Math.round(legs[i].distance)}m`
                      : `${(legs[i].distance / 1000).toFixed(1)}km`}
                  </span>
                ) : (
                  <span className="opacity-40">···</span>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && stops.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No stops found.</p>
        )}
      </div>
    </div>
  );
}
