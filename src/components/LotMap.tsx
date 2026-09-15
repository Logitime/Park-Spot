"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { haversineMeters, formatDistance } from "@/lib/utils";

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const lotIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white text-sm font-bold shadow-lg ring-4 ring-teal-200">P</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg ring-4 ring-blue-200">●</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function LotMap({
  name,
  address,
  latitude,
  longitude,
}: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ lot: L.Marker; user: L.Marker | null; route: L.Polyline | null }>({
    lot: null as unknown as L.Marker,
    user: null,
    route: null,
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 14,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer(OSM_TILES, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    markersRef.current.lot = L.marker([latitude, longitude], {
      icon: lotIcon,
    })
      .addTo(map)
      .bindPopup(`<b>${name}</b><br/>${address}`)
      .openPopup();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, name, address]);

  useEffect(() => {
    if (!coords || !mapRef.current) return;
    const m = markersRef.current.user;
    if (m) m.remove();

    markersRef.current.user = L.marker([coords.lat, coords.lng], {
      icon: userIcon,
    }).addTo(mapRef.current).bindPopup("<b>You are here</b>");

    const route = markersRef.current.route;
    if (route) route.remove();
    markersRef.current.route = L.polyline(
      [
        [coords.lat, coords.lng],
        [latitude, longitude],
      ],
      { color: "#0d9488", weight: 4, dashArray: "6 8" }
    ).addTo(mapRef.current);

    const d = haversineMeters(coords.lat, coords.lng, latitude, longitude);
    setDistance(d);

    mapRef.current.fitBounds(
      L.latLngBounds([
        [coords.lat, coords.lng],
        [latitude, longitude],
      ]).pad(0.3)
    );
  }, [coords, latitude, longitude]);

  const locate = () => {
    setLocating(true);
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError("Geolocation is not supported by this browser.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError("Could not get your location. Check browser permissions.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const resetView = () => {
    if (!mapRef.current) return;
    mapRef.current.setView([latitude, longitude], 14);
    markersRef.current.lot.openPopup();
  };

  return (
    <div>
      <div
        ref={containerRef}
        className="h-[340px] w-full rounded-2xl border border-slate-200 sm:h-[420px]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={locate}
          disabled={locating}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {locating ? "Locating…" : "Show my location"}
        </button>
        <button
          onClick={resetView}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Focus lot
        </button>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100"
        >
          Open in Google Maps
        </a>
      </div>

      {distance !== null && (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Straight-line distance: <b>{formatDistance(distance)}</b> from your
          current location.
        </div>
      )}
      {locError && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {locError}
        </div>
      )}
    </div>
  );
}