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
  pubs: Pub[];
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

export default function RouteView({ route, pubs }: Props) {
  const [polyline, setPolyline] = useState<[number, number][]>([]);
  const [mounted, setMounted] = useState(false);

  const stops = route.stops
    .map((s) => pubs.find((p) => p.id === s.pubId))
    .filter(Boolean) as (Pub & { openTime?: string; closeTime?: string })[];

  const stopsWithTimes = route.stops
    .map((s) => ({ ...pubs.find((p) => p.id === s.pubId), openTime: s.openTime, closeTime: s.closeTime }))
    .filter((s) => s.id != null) as (Pub & { openTime: string; closeTime: string })[];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (stops.length < 2) return;
    const coords = stops.map((p) => `${p.lon},${p.lat}`).join(';');
    fetch(`https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((data) => {
        const coords = data.routes?.[0]?.geometry?.coordinates ?? [];
        setPolyline(coords.map(([lng, lat]: [number, number]) => [lat, lng]));
      })
      .catch(() => {});
  }, [route.id]);

  const center: [number, number] = stops.length > 0
    ? [stops.reduce((s, p) => s + p.lat, 0) / stops.length, stops.reduce((s, p) => s + p.lon, 0) / stops.length]
    : [52.63, 1.3];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-3">
        <span className="text-2xl">🍺</span>
        <div>
          <h1 className="text-lg font-bold">{route.name || 'Unnamed Route'}</h1>
          <p className="text-xs text-gray-400">{stops.length} stops · shared route</p>
        </div>
      </div>

      {/* Map */}
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
                <Popup>
                  <strong>{pub.name}</strong>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Stop list */}
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
      </div>
    </div>
  );
}
