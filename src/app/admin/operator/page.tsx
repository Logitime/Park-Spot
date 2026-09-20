"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPut } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type LaneStatus = {
  id: string;
  name: string;
  direction: string;
  fps?: number;
  camera: boolean;
  source?: string;
};

type Status = {
  up: boolean;
  camUrlSet: boolean;
  detail?: string;
  lanes: LaneStatus[];
};

type EventPayload = {
  reservation?: string | null;
  status?: string;
  paid?: boolean;
  lot?: string;
  spot?: string;
  zone?: string;
  plate?: string;
  confidence?: number;
  checkin_done?: boolean;
} | null;

type LprEvent = {
  id: string;
  lane: string;
  direction: string;
  kind: string;
  state: string;
  plate: string;
  confidence: number;
  reason: string;
  action: string;
  payload: EventPayload;
  createdAt: string;
};

const POLL_EVENTS_MS = 3000;
const POLL_STATUS_MS = 5000;

let cachedOpStatus: Status | null = null;
let cachedOpEvents: LprEvent[] = [];
let cachedOpMe: { role: string } | null = null;

export default function OperatorPage() {
  const [status, setStatus] = useState<Status | null>(cachedOpStatus);
  const [events, setEvents] = useState<LprEvent[]>(cachedOpEvents);
  const [me, setMe] = useState<{ role: string } | null>(cachedOpMe);
  const [error, setError] = useState<string | null>(null);

  // camera server config (admin only)
  const [camUrl, setCamUrl] = useState("");
  const [camToken, setCamToken] = useState("");
  const [camTokenSet, setCamTokenSet] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const initialized = useRef(false);

  const loadEvents = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const data = await apiGet<{ events: LprEvent[] }>(
        "/api/admin/lpr/events?limit=60"
      );
      cachedOpEvents = data.events;
      setEvents(data.events);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPR events");
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const data = await apiGet<Status>("/api/admin/lpr/status");
      cachedOpStatus = data;
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPR status");
    }
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void loadEvents();
      void loadStatus();
      void apiGet<{ user: { role: string } | null }>("/api/auth/me").then((d) =>
        setMe(d.user)
      );
    }
    const ev = setInterval(() => void loadEvents(), POLL_EVENTS_MS);
    const st = setInterval(() => void loadStatus(), POLL_STATUS_MS);
    return () => {
      clearInterval(ev);
      clearInterval(st);
    };
  }, [loadEvents, loadStatus]);

  useEffect(() => {
    if (me?.role !== "ADMIN") return;
    void apiGet<{ camUrl: string; camTokenSet: boolean }>(
      "/api/admin/lpr/config"
    )
      .then((c) => {
        setCamUrl(c.camUrl);
        setCamTokenSet(c.camTokenSet);
      })
      .catch(() => undefined);
  }, [me]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigMsg(null);
    try {
      await apiPut("/api/admin/lpr/config", {
        camUrl: camUrl.trim(),
        camToken: camToken,
      });
      setCamTokenSet(Boolean(camToken));
      setCamToken("");
      setConfigMsg("Saved. The camera feeds will reload shortly.");
      await loadStatus();
    } catch (err) {
      setConfigMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingConfig(false);
    }
  };

  const clearFeed = async () => {
    if (!window.confirm("Clear all recorded LPR events?")) return;
    try {
      await apiDelete("/api/admin/lpr/events");
      setEvents([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    }
  };

  const isAdmin = me?.role === "ADMIN";
  const showFeed = status?.camUrlSet ?? true;
  const offline = status ? !status.up : true;
  const updatedAt = events[0]?.createdAt;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-3 sm:px-6 py-6 sm:py-8 min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Operator view</h1>
        <p className="mt-1 text-sm text-slate-500">
          Watch the LPR cameras and plate-matching decisions per lane.
          Events auto-refresh every {POLL_EVENTS_MS / 1000}s.
        </p>
      </div>

      {/* ── LPR connectivity banner ───────────────────────────────────── */}
      <div
        className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
          !showFeed
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : offline
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              !showFeed
                ? "bg-amber-500"
                : offline
                  ? "bg-rose-500"
                  : "bg-emerald-500"
            }`}
          />
          <span className="font-medium">
            {!showFeed
              ? "Camera server not configured"
              : offline
                ? "LPR camera server unreachable"
                : "Live — connected to LPR camera server"}
          </span>
          {status?.detail && (
            <span className="text-xs opacity-70">{status.detail}</span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {updatedAt ? `last event ${formatDate(updatedAt)}` : "no events yet"}
        </span>
      </div>

      {/* ── error │ clear ─────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => {
            void loadEvents();
            void loadStatus();
          }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Refresh now
        </button>
        {isAdmin && (
          <button
            onClick={() => void clearFeed()}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-100"
          >
            Clear feed
          </button>
        )}
      </div>

      {/* ── Camera wall ───────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-slate-800">Cameras</h2>
        {!showFeed || !status ? (
          <EmptyBlock
            text={
              !showFeed
                ? "Configure the LPR camera server URL below to start watching live feeds."
                : "Waiting for the LPR service to report lanes…"
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {status.lanes.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
                <EmptyBlock text="No active lanes reported by the LPR service." />
              </div>
            )}
            {status.lanes.map((lane) => (
              <LaneCam key={`${lane.id}-${status.up}`} lane={lane} up={status.up} camUrlSet={showFeed} />
            ))}
          </div>
        )}
      </section>

      {/* ── Matching feed ─────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Matching results</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            live
          </span>
        </div>
        {events.length === 0 ? (
          <EmptyBlock text="No gate events yet — vehicles read by the LPR service will appear here." />
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </ul>
        )}
      </section>

      {/* ── Camera server config (admin) ──────────────────────────────── */}
      {isAdmin && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 font-semibold text-slate-800">LPR camera server</h2>
          <p className="mb-4 text-sm text-slate-500">
            URL of the LPR service&apos;s live-view server (config.yaml →
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
              {"web: { host, port }"}
            </code>
            ), e.g. <code className="font-mono text-xs">http://192.168.1.20:8601</code>.
            The optional token is sent server-side and never exposed to the page.
          </p>
          {configMsg && (
            <div
              className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
                configMsg.startsWith("Saved")
                  ? "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {configMsg}
            </div>
          )}
          <form onSubmit={(e) => void saveConfig(e)} className="grid items-end gap-4 sm:grid-cols-2">
            <div>
              <Field label="Camera server URL">
                <input
                  value={camUrl}
                  onChange={(e) => setCamUrl(e.target.value)}
                  className="input"
                  placeholder="http://192.168.1.20:8601"
                />
              </Field>
            </div>
            <div>
              <Field
                label={
                  camTokenSet
                    ? "Token (leave empty to keep current)"
                    : "Token (optional)"
                }
              >
                <input
                  value={camToken}
                  onChange={(e) => setCamToken(e.target.value)}
                  className="input font-mono"
                  placeholder={camTokenSet ? "•••••••• (kept)" : "optional access token"}
                />
              </Field>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {savingConfig ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

/* ── Cameras ─────────────────────────────────────────────────────────── */

function LaneCam({
  lane,
  up,
  camUrlSet,
}: {
  lane: LaneStatus;
  up: boolean;
  camUrlSet: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const canStream = camUrlSet && up && lane.camera;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              canStream && !broken ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
          <p className="font-medium text-slate-800">{lane.name || lane.id}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              lane.direction === "EXIT"
                ? "bg-indigo-50 text-indigo-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {lane.direction}
          </span>
        </div>
        <span className="text-[11px] text-slate-400">{lane.fps ? `${lane.fps} fps` : ""}</span>
      </div>
      <div className="relative aspect-video bg-slate-900">
        {canStream && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- MJPEG streams require a plain <img>
          <img
            src={`/api/admin/lpr/cam/stream/${encodeURIComponent(lane.id)}`}
            alt={`Live camera ${lane.name}`}
            className="h-full w-full object-contain"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-center text-slate-400">
            <p className="text-sm">
              {!camUrlSet
                ? "Camera server not configured"
                : broken || !lane.camera
                  ? "No live frame"
                  : "Waiting for frames…"}
            </p>
            <p className="mt-1 text-xs opacity-70">
              {lane.source === "gate-config"
                ? "from gate config (LPR offline)"
                : broken
                  ? "feed interrupted — it will retry automatically"
                  : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Event feed ──────────────────────────────────────────────────────── */

function actionStyle(action: string): string {
  switch (action) {
    case "OPEN":
      return "bg-emerald-50 text-emerald-700";
    case "DENY":
      return "bg-rose-50 text-rose-700";
    case "HOLD":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function EventRow({ ev }: { ev: LprEvent }) {
  const badge = ev.action || ev.kind;
  const p = ev.payload;
  const hasPlate = Boolean(ev.plate);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:px-4 sm:py-3 min-w-0 max-w-full break-words">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${actionStyle(badge)}`}
          >
            {badge}
          </span>
          {hasPlate ? (
            <span className="font-mono text-lg font-bold text-slate-800">
              {ev.plate}
            </span>
          ) : (
            <span className="text-sm text-slate-400">no plate read</span>
          )}
          {ev.confidence > 0 && (
            <span className="text-xs text-slate-400">
              {Math.round(ev.confidence * 100)}%
            </span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
            {ev.lane || "?"}
          </span>
          <span className="text-[11px] text-slate-400">
            {formatDate(ev.createdAt)}
          </span>
        </div>
        {ev.reason && <p className="mt-1 text-sm text-slate-500">{ev.reason}</p>}
        {p && (p.reservation || p.status || p.lot) && (
          <p className="mt-1 font-mono text-xs text-slate-400">
            {p.reservation ? `res ${p.reservation.slice(0, 8)}` : ""}
            {p.status ? ` · ${p.status}` : ""}
            {p.paid !== undefined ? ` · ${p.paid ? "paid" : "unpaid"}` : ""}
            {p.lot ? ` · ${p.lot}` : ""}
            {p.spot ? ` · #${p.spot}` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}