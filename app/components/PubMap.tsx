"use client";

import React, { useEffect, useState, useRef } from "react";
import { Eye, EyeOff, Clock, Trash2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";

export interface Pub {
  id: number;
  name: string;
  lat: number;
  lon: number;
  custom?: boolean;
}

interface PubEntry {
  pub: Pub;
  included: boolean;
  openTime: string;
  closeTime: string;
}

interface PendingPin {
  lat: number;
  lon: number;
}

const skippedIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;background:#1f2937;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);color:white;font-size:12px;">–</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const pendingIcon = L.divIcon({
  className: "",
  html: `<div style="width:32px;height:32px;background:#6b7280;border:2px dashed white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);font-size:14px;">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

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

async function fetchPubs(): Promise<Pub[]> {
  const query = `
    [out:json][timeout:25];
    node["amenity"="pub"](52.58,1.22,52.68,1.36);
    out body;
  `;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });
  const data = await res.json();
  return (data.elements ?? [])
    .filter((el: any) => el.tags?.name)
    .map((el: any) => ({
      id: el.id,
      name: el.tags.name,
      lat: el.lat,
      lon: el.lon,
    }))
    .sort((a: Pub, b: Pub) => a.name.localeCompare(b.name));
}

async function fetchRoute(waypoints: [number, number][]): Promise<[number, number][]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const res = await fetch(
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`
  );
  const data = await res.json();
  if (!data.routes?.[0]) return [];
  return data.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]);
}

function FitToIncluded({ pubs }: { pubs: Pub[] }) {
  const map = useMap();
  const hasFit = useRef(false);
  useEffect(() => {
    if (pubs.length === 0 || hasFit.current) return;
    const bounds = L.latLngBounds(pubs.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [60, 60] });
    hasFit.current = true;
  }, [pubs.length > 0]);
  return null;
}

function MapClickHandler({ addMode, onMapClick }: { addMode: boolean; onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      if (addMode) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function PubMap() {
  const [entries, setEntries] = useState<PubEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [search, setSearch] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [newPubName, setNewPubName] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPubs().then((osmPubs) => {
      const saved = localStorage.getItem("halfday-entries");
      if (saved) {
        const parsed: PubEntry[] = JSON.parse(saved);
        const savedIds = new Set(parsed.map((e) => e.pub.id));
        // Migrate old entries missing time fields
        const migrated = parsed.map((e) => ({
          ...e,
          openTime: e.openTime ?? "11:00",
          closeTime: e.closeTime ?? "23:00",
        }));
        // Keep saved order/state, append any new OSM pubs not yet in saved list
        const newOsmEntries = osmPubs
          .filter((p) => !savedIds.has(p.id))
          .map((pub) => ({ pub, included: true, openTime: "11:00", closeTime: "23:00" }));
        setEntries([...migrated, ...newOsmEntries]);
      } else {
        setEntries(osmPubs.map((pub) => ({ pub, included: true, openTime: "11:00", closeTime: "23:00" })));
      }
      setLoading(false);
    });
  }, []);

  // Persist entries to localStorage on every change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem("halfday-entries", JSON.stringify(entries));
    }
  }, [entries, loading]);

  const includedEntries = entries.filter((e) => e.included);

  useEffect(() => {
    if (includedEntries.length < 2) {
      setRoutePath([]);
      return;
    }
    const waypoints = includedEntries.map((e) => [e.pub.lat, e.pub.lon] as [number, number]);
    fetchRoute(waypoints).then(setRoutePath);
  }, [entries]);

  useEffect(() => {
    if (pendingPin) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [pendingPin]);

  function toggleIncluded(id: number) {
    setEntries((prev) => {
      const entry = prev.find((e) => e.pub.id === id);
      if (!entry) return prev;
      const rest = prev.filter((e) => e.pub.id !== id);
      const updated = { ...entry, included: !entry.included };
      if (!updated.included) {
        // Move to bottom when hiding
        return [...rest, updated];
      } else {
        // Move back above the hidden ones when showing
        const firstHiddenIdx = rest.findIndex((e) => !e.included);
        if (firstHiddenIdx === -1) return [...rest, updated];
        return [...rest.slice(0, firstHiddenIdx), updated, ...rest.slice(firstHiddenIdx)];
      }
    });
  }

  function moveEntry(index: number, dir: -1 | 1) {
    setEntries((prev) => {
      const next = [...prev];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  function updateTime(id: number, field: "openTime" | "closeTime", value: string) {
    setEntries((prev) => prev.map((e) => (e.pub.id === id ? { ...e, [field]: value } : e)));
  }

  function onDragStart(id: number) { setDraggingId(id); }
  function onDragOver(e: React.DragEvent, id: number) { e.preventDefault(); setDragOverId(id); }
  function onDrop(targetId: number) {
    if (draggingId === null || draggingId === targetId) return;
    setEntries((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((e) => e.pub.id === draggingId);
      const toIdx = next.findIndex((e) => e.pub.id === targetId);
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleMapClick(lat: number, lon: number) {
    setPendingPin({ lat, lon });
    setNewPubName("");
  }

  function confirmNewPub() {
    if (!pendingPin || !newPubName.trim()) return;
    const newPub: Pub = {
      id: Date.now(),
      name: newPubName.trim(),
      lat: pendingPin.lat,
      lon: pendingPin.lon,
      custom: true,
    };
    setEntries((prev) => [...prev, { pub: newPub, included: true, openTime: "11:00", closeTime: "23:00" }]);
    setPendingPin(null);
    setNewPubName("");
    setAddMode(false);
  }

  function cancelNewPub() {
    setPendingPin(null);
    setNewPubName("");
  }

  const filtered = entries
    .filter((e) => e.pub.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.included === b.included ? 0 : a.included ? -1 : 1));

  const routeOrderMap = new Map<number, number>();
  includedEntries.forEach((e, i) => routeOrderMap.set(e.pub.id, i + 1));

  const totalDistance =
    routePath.length > 1
      ? (() => {
          let d = 0;
          for (let i = 1; i < routePath.length; i++) {
            const [lat1, lon1] = routePath[i - 1];
            const [lat2, lon2] = routePath[i];
            const R = 6371000;
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLon = ((lon2 - lon1) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          }
          return d;
        })()
      : 0;

  return (
    <div className="flex h-screen w-screen">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 z-10">

        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-amber-700">🍺 Halfday</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading ? "Loading pubs..." : `${includedEntries.length} stops${totalDistance > 0 ? ` · ${totalDistance < 1000 ? `${Math.round(totalDistance)}m` : `${(totalDistance / 1000).toFixed(1)}km`}` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRoute((v) => !v)}
              title={showRoute ? "Hide route" : "Show route"}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                showRoute ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {showRoute ? "Show route" : "Route off"}
            </button>
            <button
              onClick={() => { setAddMode((v) => !v); setPendingPin(null); setNewPubName(""); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                addMode ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {addMode ? "Cancel" : "+ Add pub"}
            </button>
          </div>
        </div>

        {/* Add mode */}
        {addMode && !pendingPin && (
          <div className="bg-violet-50 border-b border-violet-200 px-4 py-2 text-xs text-violet-700">
            Click anywhere on the map to place a pub
          </div>
        )}
        {pendingPin && (
          <div className="bg-violet-50 border-b border-violet-200 p-3 space-y-2">
            <p className="text-xs text-violet-700 font-medium">Name this pub</p>
            <input
              ref={nameInputRef}
              type="text"
              placeholder="e.g. The Gardeners Arms"
              value={newPubName}
              onChange={(e) => setNewPubName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmNewPub(); if (e.key === "Escape") cancelNewPub(); }}
              className="w-full px-3 py-2 text-sm border border-violet-300 rounded-lg focus:outline-none focus:border-violet-500 bg-white"
            />
            <div className="flex gap-2">
              <button onClick={confirmNewPub} disabled={!newPubName.trim()} className="flex-1 text-xs bg-violet-600 text-white py-1.5 rounded-lg disabled:opacity-40 hover:bg-violet-700 transition-colors">Add pub</button>
              <button onClick={cancelNewPub} className="flex-1 text-xs bg-gray-100 text-gray-600 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search pubs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Pub list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading pubs...</div>
          ) : (
            <ul>
              {filtered.map((entry, i) => {
                const realIndex = entries.indexOf(entry);
                const isFirstHidden = i > 0 && !entry.included && (filtered[i-1]?.included ?? true);
                const order = routeOrderMap.get(entry.pub.id);
                const isDragOver = dragOverId === entry.pub.id;
                return (
                  <React.Fragment key={entry.pub.id}>
                  {isFirstHidden && (
                    <li className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-y border-gray-200">
                      Hidden
                    </li>
                  )}
                  <li
                    draggable
                    onDragStart={() => onDragStart(entry.pub.id)}
                    onDragOver={(e) => onDragOver(e, entry.pub.id)}
                    onDrop={() => onDrop(entry.pub.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                    className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-50 transition-colors ${
                      isDragOver ? "bg-blue-50" : ""
                    } ${draggingId === entry.pub.id ? "opacity-40" : ""}`}
                  >
                    <span className="text-gray-500 text-xs select-none cursor-grab">⠿</span>
                    {order !== undefined ? (
                      <span
                        style={{ background: gradientColor(order - 1, includedEntries.length) }}
                        className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0"
                      >
                        {order}
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={`block truncate text-sm ${entry.included ? "text-gray-700" : "text-gray-400 line-through"}`}>
                        {entry.pub.name}
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={11} className="text-gray-300 flex-shrink-0" />
                        <input
                          type="time"
                          value={entry.openTime}
                          onChange={(e) => updateTime(entry.pub.id, "openTime", e.target.value)}
                          className="text-xs text-gray-400 bg-transparent border-none outline-none w-[3.5rem] cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                        <span className="text-xs text-gray-300">–</span>
                        <input
                          type="time"
                          value={entry.closeTime}
                          onChange={(e) => updateTime(entry.pub.id, "closeTime", e.target.value)}
                          className="text-xs text-gray-400 bg-transparent border-none outline-none w-[3.5rem] cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
<button
                        onClick={() => toggleIncluded(entry.pub.id)}
                        title={entry.included ? "Hide" : "Show"}
                        className={`p-1 rounded transition-colors ${
                          entry.included ? "text-gray-500 hover:bg-gray-100" : "text-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {entry.included ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        onClick={() => setEntries((prev) => prev.filter((e) => e.pub.id !== entry.pub.id))}
                        title="Delete"
                        className="p-1 rounded transition-colors text-gray-300 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                  </React.Fragment>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 text-xs text-gray-400 text-center">
          {entries.length} pubs · data from OpenStreetMap
        </div>
      </div>

      {/* Map */}
      <div className={`flex-1 ${addMode ? "cursor-crosshair" : ""}`}>
        <MapContainer center={[52.6309, 1.2974]} zoom={15} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler addMode={addMode} onMapClick={handleMapClick} />
          <FitToIncluded pubs={includedEntries.map((e) => e.pub)} />

          {entries.map(({ pub, included }) => {
            const order = routeOrderMap.get(pub.id);
            const color = order !== undefined ? gradientColor(order - 1, includedEntries.length) : "#d1d5db";
            const icon = order !== undefined
              ? routeIcon(order, color)
              : skippedIcon;

            return (
              <Marker
                key={pub.id}
                position={[pub.lat, pub.lon]}
                icon={icon}
                eventHandlers={{click: () => {}}}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{pub.name}</strong>
                    {pub.custom && <span className="ml-1 text-xs text-violet-600">(custom)</span>}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {pendingPin && <Marker position={[pendingPin.lat, pendingPin.lon]} icon={pendingIcon} />}

          {showRoute && routePath.length > 1 && (
            <Polyline positions={routePath} color="#2563eb" weight={4} opacity={0.7} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
