"use client";

import React, { useEffect, useState, useRef } from "react";
import { Clock, Trash2, Plus, Save, X, Share2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";

interface Pub {
  id: number;
  name: string;
  lat: number;
  lon: number;
  custom?: boolean;
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
  updatedAt?: string;
}

interface PendingPin {
  lat: number;
  lon: number;
}

type Tab = "routes" | "pubs";

const dotIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;background:#d97706;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.45);font-size:13px;line-height:1;">🍺</div>`,
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

async function fetchOSMPubs(): Promise<Pub[]> {
  try {
    // Try cache first (instant)
    const cached = await fetch('/api/pubs/osm').then(r => r.json()) as Pub[];
    if (cached.length > 0) return cached.sort((a, b) => a.name.localeCompare(b.name));
    // Cache miss: ask server to fetch from Overpass (may be slow on first load)
    const fresh = await fetch('/api/pubs/osm', { method: 'POST' }).then(r => r.json()) as Pub[];
    return fresh.sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

async function fetchRoute(waypoints: [number, number][]): Promise<[number, number][]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`);
  const data = await res.json();
  if (!data.routes?.[0]) return [];
  return data.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]);
}

function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map]);
  return null;
}

function FitToStops({ pubs }: { pubs: Pub[] }) {
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
  useMapEvents({ click(e) { if (addMode) onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function LegMapFit({ from, to }: { from: Pub; to: Pub }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLngBounds([[from.lat, from.lon], [to.lat, to.lon]]), { padding: [28, 28] });
  }, []);
  return null;
}

function PrintLegMap({ from, to, fromOrder, toOrder, fromColor, toColor, routePath }: {
  from: Pub; to: Pub; fromOrder: number; toOrder: number;
  fromColor: string; toColor: string; routePath: [number, number][];
}) {
  return (
    <MapContainer
      center={[(from.lat + to.lat) / 2, (from.lon + to.lon) / 2]} zoom={15}
      zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false}
      touchZoom={false} keyboard={false} attributionControl={false}
      style={{ height: "108mm", width: "93.5mm" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <LegMapFit from={from} to={to} />
      <Marker position={[from.lat, from.lon]} icon={routeIcon(fromOrder, fromColor)} />
      <Marker position={[to.lat, to.lon]} icon={routeIcon(toOrder, toColor)} />
      {routePath.length > 1 && <Polyline positions={routePath} color="#2563eb" weight={4} opacity={0.8} />}
    </MapContainer>
  );
}

export default function PubMap() {
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [routeName, setRouteName] = useState("");
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("routes");
  const [pubSearch, setPubSearch] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [newPubName, setNewPubName] = useState("");
  const [showRoute, setShowRoute] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [legRoutes, setLegRoutes] = useState<[number, number][][]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [saving, setSaving] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // "new" = unsaved new route is active; null = no route selected
  const [isNewRoute, setIsNewRoute] = useState(false);
  const [isNamingRoute, setIsNamingRoute] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const enrichedStops = stops
    .map((s) => ({ ...s, pub: pubs.find((p) => p.id === s.pubId) }))
    .filter((s): s is RouteStop & { pub: Pub } => !!s.pub);

  const stopIds = new Set(stops.map((s) => s.pubId));
  const stopOrderMap = new Map(enrichedStops.map((s, i) => [s.pubId, i + 1]));

  const isEditing = isNewRoute || activeRouteId !== null || isNamingRoute;

  // Persist unsaved route draft to localStorage
  useEffect(() => {
    if (!isEditing) return;
    localStorage.setItem('halfday_draft', JSON.stringify({ routeName, stops, activeRouteId }));
  }, [routeName, stops, activeRouteId, isEditing]);

  // Restore draft on mount (runs after initial data load)
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    try {
      const raw = localStorage.getItem('halfday_draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.stops?.length > 0) {
        setStops(draft.stops);
        setRouteName(draft.routeName ?? '');
        setActiveRouteId(draft.activeRouteId ?? null);
        setIsNewRoute(!draft.activeRouteId);
      }
    } catch { /* ignore */ }
  }, [loading]);

  useEffect(() => {
    Promise.all([
      fetch("/api/pubs").then((r) => r.json()),
      fetch("/api/routes").then((r) => r.json()),
    ])
      .then(([pubsData, routesData]) => { setPubs(pubsData); setSavedRoutes(routesData); setLoading(false); })
      .catch(() => setLoading(false));

    fetchOSMPubs().then((osmPubs) => {
      fetch("/api/pubs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(osmPubs) });
      setPubs((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        return [...prev, ...osmPubs.filter((p) => !existingIds.has(p.id))];
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (enrichedStops.length < 2) { setRoutePath([]); return; }
    fetchRoute(enrichedStops.map((s) => [s.pub.lat, s.pub.lon] as [number, number])).then(setRoutePath);
  }, [stops]);

  useEffect(() => {
    if (pendingPin) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [pendingPin]);

  function startNewRoute() {
    setRouteName("");
    setStops([]);
    setActiveRouteId(null);
    setIsNewRoute(false);
    setIsNamingRoute(true);
  }

  function confirmRouteName() {
    if (!routeName.trim()) return;
    setIsNamingRoute(false);
    setIsNewRoute(true);
  }

  function loadRoute(route: SavedRoute) {
    setRouteName(route.name);
    setStops(route.stops);
    setActiveRouteId(route.id);
    setIsNewRoute(false);
    setMobileOpen(false);
  }

  function addToRoute(pubId: number) {
    if (stopIds.has(pubId)) return;
    setStops((prev) => [...prev, { pubId, openTime: "11:00", closeTime: "23:00" }]);
    if (!isEditing) setIsNewRoute(true);
  }

  function removeFromRoute(pubId: number) {
    setStops((prev) => prev.filter((s) => s.pubId !== pubId));
  }

  function updateStopTime(pubId: number, field: "openTime" | "closeTime", value: string) {
    setStops((prev) => prev.map((s) => (s.pubId === pubId ? { ...s, [field]: value } : s)));
  }

  function onDragStart(id: number) { setDraggingId(id); }
  function onDragOver(e: React.DragEvent, id: number) { e.preventDefault(); setDragOverId(id); }
  function onDrop(targetId: number) {
    if (draggingId === null || draggingId === targetId) return;
    setStops((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((s) => s.pubId === draggingId);
      const toIdx = next.findIndex((s) => s.pubId === targetId);
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
    setDraggingId(null);
    setDragOverId(null);
  }

  async function saveRoute() {
    if (!routeName.trim()) return;
    setSaving(true);
    try {
      const routeData = { name: routeName.trim(), stops };
      if (activeRouteId) {
        const updated = await fetch(`/api/routes/${activeRouteId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(routeData),
        }).then((r) => r.json());
        setSavedRoutes((prev) => prev.map((r) => (r.id === activeRouteId ? updated : r)));
      } else {
        const created = await fetch("/api/routes", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(routeData),
        }).then((r) => r.json());
        setSavedRoutes((prev) => [...prev, created]);
        setActiveRouteId(created.id);
        setIsNewRoute(false);
      }
      localStorage.removeItem('halfday_draft');
      setActiveRouteId(null);
      setIsNewRoute(false);
      setStops([]);
      setRouteName("");
    } finally { setSaving(false); }
  }

  async function deleteRoute(id: string) {
    await fetch(`/api/routes/${id}`, { method: "DELETE" });
    setSavedRoutes((prev) => prev.filter((r) => r.id !== id));
    if (activeRouteId === id) {
      setActiveRouteId(null); setIsNewRoute(false); setStops([]); setRouteName("");
      localStorage.removeItem('halfday_draft');
    }
  }

  function shareRoute(routeId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/route/${routeId}`);
    setCopied(routeId);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleMapClick(lat: number, lon: number) { setPendingPin({ lat, lon }); setNewPubName(""); }

  async function confirmNewPub() {
    if (!pendingPin || !newPubName.trim()) return;
    const newPub: Pub = { id: Date.now(), name: newPubName.trim(), lat: pendingPin.lat, lon: pendingPin.lon, custom: true };
    await fetch("/api/pubs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([newPub]) });
    setPubs((prev) => [...prev, newPub]);
    setPendingPin(null); setNewPubName(""); setAddMode(false);
  }

  async function deleteCustomPub(id: number) {
    await fetch(`/api/pubs/${id}`, { method: "DELETE" });
    setPubs((prev) => prev.filter((p) => p.id !== id));
    setStops((prev) => prev.filter((s) => s.pubId !== id));
  }

  function cancelNewPub() { setPendingPin(null); setNewPubName(""); }

  async function handlePrint() {
    const routes = await Promise.all(
      enrichedStops.slice(0, -1).map((stop, i) => {
        const next = enrichedStops[i + 1];
        return fetchRoute([[stop.pub.lat, stop.pub.lon], [next.pub.lat, next.pub.lon]]);
      })
    );
    setLegRoutes(routes);
    setIsPrinting(true);
    setTimeout(() => { window.print(); setIsPrinting(false); setLegRoutes([]); }, 2500);
  }

  const totalDistance = routePath.length > 1 ? (() => {
    let d = 0;
    for (let i = 1; i < routePath.length; i++) {
      const [lat1, lon1] = routePath[i - 1];
      const [lat2, lon2] = routePath[i];
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return d;
  })() : 0;

  const filteredPubs = pubs
    .filter((p) => p.name.toLowerCase().includes(pubSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const tabBtnClass = (tab: Tab) =>
    `flex-1 py-2.5 text-xs font-medium transition-colors ${activeTab === tab ? "text-amber-700 border-b-2 border-amber-600" : "text-gray-400 hover:text-gray-600"}`;

  // ── Route editor ─────────────────────────────────────────────────────────────

  function renderRouteEditor() {
    const nonStopPubs = pubs
      .filter((p) => !stopIds.has(p.id) && p.name.toLowerCase().includes(pubSearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header: name + save */}
        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 truncate flex-1">{routeName}</span>
          <button
            onClick={saveRoute}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors"
          >
            <Save size={12} />
            {saving ? "Saving…" : activeRouteId ? "Update" : "Save"}
          </button>
          <button
            onClick={() => { setActiveRouteId(null); setIsNewRoute(false); setStops([]); setRouteName(""); localStorage.removeItem("halfday_draft"); }}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Current stops */}
          {enrichedStops.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Your stops · {enrichedStops.length}{totalDistance > 0 ? ` · ${totalDistance < 1000 ? `${Math.round(totalDistance)}m` : `${(totalDistance / 1000).toFixed(1)}km`}` : ""}
              </div>
              <ul className="border-b border-gray-100">
                {enrichedStops.map((stop, i) => {
                  const color = gradientColor(i, enrichedStops.length);
                  const isDragOver = dragOverId === stop.pubId;
                  return (
                    <li
                      key={stop.pubId} draggable
                      onDragStart={() => onDragStart(stop.pubId)}
                      onDragOver={(e) => onDragOver(e, stop.pubId)}
                      onDrop={() => onDrop(stop.pubId)}
                      onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                      className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 ${isDragOver ? "bg-amber-50" : "bg-white"} ${draggingId === stop.pubId ? "opacity-40" : ""}`}
                    >
                      <span className="text-gray-300 text-xs cursor-grab select-none">⠿</span>
                      <span style={{ background: color }} className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-gray-700">{stop.pub.name}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={11} className="text-gray-300 flex-shrink-0" />
                          <input type="time" value={stop.openTime} onChange={(e) => updateStopTime(stop.pubId, "openTime", e.target.value)} className="text-xs text-gray-400 bg-transparent border-none outline-none w-[3.5rem] cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden" />
                          <span className="text-xs text-gray-300">–</span>
                          <input type="time" value={stop.closeTime} onChange={(e) => updateStopTime(stop.pubId, "closeTime", e.target.value)} className="text-xs text-gray-400 bg-transparent border-none outline-none w-[3.5rem] cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden" />
                        </div>
                      </div>
                      <button onClick={() => removeFromRoute(stop.pubId)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={14} /></button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* All pubs to add from */}
          <div className="px-3 pt-2 pb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-1">Add pubs</span>
          </div>
          <div className="px-3 pb-2">
            <input
              type="text"
              placeholder="Search…"
              value={pubSearch}
              onChange={(e) => setPubSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400"
            />
          </div>
          <ul>
            {nonStopPubs.map((pub) => (
              <li key={pub.id}>
                <button onClick={() => addToRoute(pub.id)} className="w-full flex items-center gap-3 px-3 py-3 border-b border-gray-50 hover:bg-amber-50 transition-colors text-left">
                  <span className="flex-1 truncate text-sm text-gray-700">{pub.name}</span>
                  <Plus size={15} className="text-amber-500 flex-shrink-0" />
                </button>
              </li>
            ))}
            {nonStopPubs.length === 0 && (
              <li className="px-3 py-3 text-sm text-gray-400 text-center">
                {pubs.length === 0 ? "Loading pubs…" : "No pubs found"}
              </li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  // ── Tab panels ───────────────────────────────────────────────────────────────

  function renderRoutesTab() {
    // Step 1: naming a new route
    if (isNamingRoute) {
      return (
        <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
          <p className="text-sm font-medium text-gray-700">Name your route</p>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Saturday Crawl"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmRouteName(); if (e.key === "Escape") { setIsNamingRoute(false); setRouteName(""); } }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400"
          />
          <div className="flex gap-2">
            <button
              onClick={confirmRouteName}
              disabled={!routeName.trim()}
              className="flex-1 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setIsNamingRoute(false); setRouteName(""); }}
              className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // Step 2: editing a route (full pub list)
    if (isEditing) {
      return renderRouteEditor();
    }

    // Default: saved routes list
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-3 border-b border-gray-100">
          <button onClick={startNewRoute} className="w-full text-sm py-2 rounded-lg font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
            + New Route
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {savedRoutes.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              <div className="text-2xl mb-2">🍺</div>
              Create your first route
            </div>
          )}
          {savedRoutes.map((route) => (
            <div key={route.id} className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadRoute(route)}>
                <p className="text-sm font-medium text-gray-700 truncate">{route.name}</p>
                <p className="text-xs text-gray-400">{route.stops.length} stop{route.stops.length !== 1 ? "s" : ""} · {new Date(route.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => shareRoute(route.id)} title="Copy share link" className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                {copied === route.id ? <span className="text-xs text-blue-500">✓</span> : <Share2 size={14} />}
              </button>
              <button onClick={handlePrint} disabled={route.stops.length < 2} title="Print" className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                <Save size={14} />
              </button>
              <button onClick={() => deleteRoute(route.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderPubsTab() {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {addMode && !pendingPin && (
          <div className="bg-violet-50 border-b border-violet-200 px-4 py-2 text-xs text-violet-700">
            Click anywhere on the map to place a pub
          </div>
        )}
        {pendingPin && (
          <div className="bg-violet-50 border-b border-violet-200 p-3 space-y-2">
            <p className="text-xs text-violet-700 font-medium">Name this pub</p>
            <input
              ref={nameInputRef} type="text" placeholder="e.g. The Gardeners Arms" value={newPubName}
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
        <div className="p-3 border-b border-gray-200 flex gap-2">
          <input
            type="text" placeholder="Search pubs..." value={pubSearch}
            onChange={(e) => setPubSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400"
          />
          <button
            onClick={() => { setAddMode((v) => !v); setPendingPin(null); setNewPubName(""); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${addMode ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            + Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">Loading pubs...</div>
          ) : (
            <ul>
              {filteredPubs.map((pub) => {
                const order = stopOrderMap.get(pub.id);
                const color = order !== undefined ? gradientColor(order - 1, enrichedStops.length) : undefined;
                return (
                  <li key={pub.id} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-50">
                    <span className="flex-1 truncate text-gray-700">
                      {pub.name}
                      {pub.custom && <span className="ml-1 text-xs text-violet-500">(custom)</span>}
                    </span>
                    {order !== undefined ? (
                      <span style={{ background: color }} className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">{order}</span>
                    ) : (
                      <button onClick={() => addToRoute(pub.id)} title="Add to route" className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <Plus size={14} />
                      </button>
                    )}
                    {/* Only custom pubs can be deleted */}
                    {pub.custom && (
                      <button onClick={() => deleteCustomPub(pub.id)} title="Delete custom pub" className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-3 border-t border-gray-200 text-xs text-gray-400 text-center">
          {pubs.length} pubs · data from OpenStreetMap
        </div>
      </div>
    );
  }

  function renderTabContent() {
    return activeTab === "routes" ? renderRoutesTab() : renderPubsTab();
  }

  function renderTabBar() {
    return (
      <div className="flex border-b border-gray-200">
        <button className={tabBtnClass("routes")} onClick={() => setActiveTab("routes")}>
          Routes {savedRoutes.length > 0 && `(${savedRoutes.length})`}
        </button>
        <button className={tabBtnClass("pubs")} onClick={() => setActiveTab("pubs")}>
          Pubs {!loading && `(${pubs.length})`}
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-screen w-screen overflow-hidden" style={{ display: isPrinting ? "none" : "flex" }}>

        {/* Desktop sidebar */}
        <div className="print:hidden hidden md:flex md:w-80 md:flex-shrink-0 flex-col bg-white border-r border-gray-200 z-10">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h1 className="text-xl font-bold text-amber-700">🍺 Halfday</h1>
            <button
              onClick={() => setShowRoute((v) => !v)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${showRoute ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}
            >
              {showRoute ? "Route on" : "Route off"}
            </button>
          </div>
          {renderTabBar()}
          {renderTabContent()}
        </div>

        {/* Map */}
        <div className={`flex-1 print:hidden ${addMode ? "cursor-crosshair" : ""}`}>
          <MapContainer center={[52.6309, 1.2974]} zoom={14} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapRefCapture mapRef={mapRef} />
            <MapClickHandler addMode={addMode} onMapClick={handleMapClick} />
            <FitToStops pubs={enrichedStops.map((s) => s.pub)} />
            {pubs.map((pub) => {
              const order = stopOrderMap.get(pub.id);
              const color = order !== undefined ? gradientColor(order - 1, enrichedStops.length) : undefined;
              return (
                <Marker
                  key={pub.id} position={[pub.lat, pub.lon]}
                  icon={order !== undefined ? routeIcon(order, color!) : dotIcon}
                  eventHandlers={{ click: () => { if (!stopIds.has(pub.id)) addToRoute(pub.id); } }}
                >
                  <Popup>
                    <div className="text-sm space-y-1">
                      <strong>{pub.name}</strong>
                      {pub.custom && <span className="ml-1 text-xs text-violet-600">(custom)</span>}
                      {stopIds.has(pub.id) ? (
                        <button onClick={() => removeFromRoute(pub.id)} className="block text-xs text-red-500 underline">Remove from route</button>
                      ) : (
                        <button onClick={() => addToRoute(pub.id)} className="block text-xs text-amber-600 underline">Add to route</button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {pendingPin && <Marker position={[pendingPin.lat, pendingPin.lon]} icon={pendingIcon} />}
            {showRoute && routePath.length > 1 && <Polyline positions={routePath} color="#2563eb" weight={4} opacity={0.7} />}
          </MapContainer>
        </div>

        {/* Mobile: bottom tab bar */}
        <div className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex">
          {(["routes", "pubs"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setMobileOpen(true); }}
              className={`flex-1 py-3 text-xs font-medium capitalize transition-colors ${activeTab === tab && mobileOpen ? "text-amber-700" : "text-gray-500"}`}
            >
              {tab === "routes"
                ? `Routes${savedRoutes.length > 0 ? ` (${savedRoutes.length})` : ""}`
                : `Pubs${!loading ? ` (${pubs.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* Mobile: bottom sheet */}
        {mobileOpen && (
          <div className="md:hidden print:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
            <div
              className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col"
              style={{ height: "72vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <div className="flex gap-1">
                  {(["routes", "pubs"] as Tab[]).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${activeTab === tab ? "bg-amber-100 text-amber-700" : "text-gray-500 hover:bg-gray-100"}`}>
                      {tab}
                    </button>
                  ))}
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-1 rounded text-gray-400 hover:bg-gray-100">
                  <X size={18} />
                </button>
              </div>
              {renderTabContent()}
            </div>
          </div>
        )}

      </div>

      {/* Print layout */}
      {isPrinting && (() => {
        const legs = enrichedStops.slice(0, -1);
        const pages: typeof legs[] = [];
        for (let i = 0; i < legs.length; i += 4) pages.push(legs.slice(i, i + 4));
        const CARD_H = "130mm", MAP_H = "108mm", LABEL_H = "22mm";
        return (
          <div style={{ background: "white" }}>
            {pages.map((pagelegs, pageIdx) => (
              <div key={pageIdx} style={{ width: "210mm", padding: "10mm", boxSizing: "border-box", pageBreakAfter: "always", breakAfter: "page" }}>
                {pageIdx === 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #1f2937", paddingBottom: "2mm", marginBottom: "4mm", height: "10mm" }}>
                    <span style={{ fontWeight: "bold", fontSize: "14pt" }}>🍺 {routeName || "Halfday Pub Crawl"}</span>
                    <span style={{ fontSize: "9pt", color: "#6b7280" }}>{enrichedStops.length} stops{totalDistance > 0 ? ` · ${totalDistance < 1000 ? `${Math.round(totalDistance)}m` : `${(totalDistance / 1000).toFixed(1)}km`}` : ""}</span>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "93.5mm 93.5mm", gridTemplateRows: `${CARD_H} ${CARD_H}`, gap: "3mm" }}>
                  {pagelegs.map((stop, j) => {
                    const absIdx = pageIdx * 4 + j;
                    const next = enrichedStops[absIdx + 1];
                    const fromColor = gradientColor(absIdx, enrichedStops.length);
                    const toColor = gradientColor(absIdx + 1, enrichedStops.length);
                    return (
                      <div key={stop.pubId} style={{ width: "93.5mm", height: CARD_H, border: "1px solid #d1d5db", borderRadius: "2mm", overflow: "hidden" }}>
                        <div style={{ width: "93.5mm", height: MAP_H }}>
                          <PrintLegMap from={stop.pub} to={next.pub} fromOrder={absIdx + 1} toOrder={absIdx + 2} fromColor={fromColor} toColor={toColor} routePath={legRoutes[absIdx] ?? []} />
                        </div>
                        <div style={{ height: LABEL_H, padding: "2mm 3mm", borderTop: "1px solid #e5e7eb", background: "#f9fafb", boxSizing: "border-box" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "1.5mm" }}>
                            <span style={{ width: "15px", height: "15px", borderRadius: "50%", background: fromColor, color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: "bold", flexShrink: 0 }}>{absIdx + 1}</span>
                            <span style={{ fontSize: "8.5pt", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.pub.name}</span>
                            <span style={{ fontSize: "7pt", color: "#6b7280" }}>{stop.openTime}–{stop.closeTime}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: "15px", height: "15px", borderRadius: "50%", background: toColor, color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: "bold", flexShrink: 0 }}>{absIdx + 2}</span>
                            <span style={{ fontSize: "8.5pt", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{next.pub.name}</span>
                            <span style={{ fontSize: "7pt", color: "#6b7280" }}>{next.openTime}–{next.closeTime}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </>
  );
}
