"""Service runtime: wires capture threads -> pipelines -> controllers -> gates.

Supports multiple entry/exit lanes.  Each lane runs its own capture thread,
PLC connection and state machine; a shared ParkingApi instance talks to the
ParkSpot server.  The main loop ticks all controllers at the configured Hz.

The service also pushes every gate event to the ParkSpot server (for the
operator dashboard) and can expose a tiny camera web server (snapshots +
MJPEG) per lane — see the ``web`` config section.
"""

from __future__ import annotations

import logging
import time

import numpy as np

from .capture import PurchaseThread, make_source, ImageSource
from .config import Cfg, GateSpec, iter_gates, setup_logging
from .events import EventPusher
from .gate import GateController, make_plc
from .matcher import ApiError, ParkingApi
from .pipeline import PlatePipeline
from .web import CamServer

log = logging.getLogger("lpr.app")


def build_api(cfg: Cfg) -> ParkingApi | None:
    try:
        return ParkingApi(cfg)
    except ApiError as exc:
        log.warning("matcher disabled: %s", exc)
        return None


def event_print(event) -> None:
    """Default event sink: one structured log line per gate event."""
    log.info("GATE %s [%s] | state=%s plate=%s conf=%.2f | %s",
             event.kind, getattr(event, "lane", "?"), event.state,
             event.plate or "-", event.confidence, event.reason or "-")


def make_sink(cfg: Cfg):
    """Combine console logging with async push to the ParkSpot dashboard."""
    pusher: EventPusher | None = None
    if cfg.match.get("apiUrl"):
        pusher = EventPusher(cfg.match["apiUrl"], cfg.match.get("token", ""))
        pusher.start()

    def sink(event) -> None:
        event_print(event)
        if pusher is not None:
            pusher.push(event.as_dict())

    return sink, pusher


def _lane_cfg(global_cfg: Cfg, spec: GateSpec) -> Cfg:
    """Build a per-lane Cfg: global detection/ocr/tracking + lane capture/gate/match/app."""
    d = dict(global_cfg.as_dict())
    d["capture"] = spec.capture
    d["gate"] = spec.gate
    d["match"] = spec.match
    d["app"] = dict(spec.app)
    d["laneId"] = spec.id
    d["laneDirection"] = spec.direction
    return Cfg(d)


def _start_web(cfg: Cfg, views: dict[str, dict]) -> CamServer | None:
    if not cfg.web.get("enabled") or not views:
        return None
    cam = CamServer(
        cfg.web.get("host", "0.0.0.0"),
        int(cfg.web.get("port", 8601)),
        views,
        token=cfg.web.get("token", ""),
    )
    cam.start()
    return cam


def _lane_view(spec: GateSpec, latest) -> dict:
    return {
        "name": spec.name,
        "direction": spec.direction,
        "fps": float(spec.capture.get("fps", 15.0)),
        "latest": latest,
    }


def run(cfg: Cfg, runtime_seconds: float | None = None) -> None:
    setup_logging()
    specs = [s for s in iter_gates(cfg) if s.enabled]
    log.info("starting lpr service (%d lane(s), demo=%s)",
             len(specs), cfg.ocr.get("demo"))

    sink, pusher = make_sink(cfg)

    # replay mode (--image / --video) — single lane only
    if len(specs) == 1:
        replay = specs[0].capture.get("replay")
        if replay:
            lane = _lane_cfg(cfg, specs[0])
            plc = make_plc(lane)
            if not plc.connected and lane.gate.get("enabled"):
                plc.connect()
            pipeline = PlatePipeline(cfg)
            api = build_api(cfg)
            views: dict[str, dict] = {}
            holder = {"latest": None}
            views[specs[0].id] = _lane_view(specs[0], lambda: holder["latest"])
            cam = _start_web(cfg, views)
            controller = GateController(lane, plc, pipeline, api, events=sink)
            source = ImageSource(replay, loop=bool(specs[0].capture.get("replayLoop", False)))
            try:
                _run_replay(source, controller, runtime_seconds,
                            on_frame=lambda f: holder.update(latest=f))
            finally:
                if cam is not None:
                    cam.stop()
            if pusher is not None:
                pusher.stop()
            return

    api = build_api(cfg)
    detection_cfg = cfg  # shared detection/ocr (GPU)

    lanes: list[tuple[PurchaseThread, GateController]] = []
    views: dict[str, dict] = {}

    for spec in specs:
        lane = _lane_cfg(cfg, spec)
        plc = make_plc(lane)
        if not plc.connected and lane.gate.get("enabled"):
            plc.connect()
        pipeline = PlatePipeline(detection_cfg)
        controller = GateController(lane, plc, pipeline, api, events=sink)
        source = make_source(lane)
        purchase = PurchaseThread(source)
        purchase.start()
        lanes.append((purchase, controller))
        views[spec.id] = _lane_view(spec, purchase.latest)
        log.info("lane %s (%s) started: camera=%s plc=%s",
                 spec.id, spec.direction, spec.capture.get("url", spec.capture.get("device")),
                 lane.gate.get("host"))

    if not lanes:
        log.warning("no enabled lanes — nothing to do")
        return

    cam = _start_web(cfg, views)

    loop_hz = float(cfg.app.get("loopHz", 10.0))
    period = 1.0 / max(1.0, loop_hz)
    start = time.monotonic()
    last = start

    try:
        while True:
            now = time.monotonic()
            elapsed = now - last
            if elapsed >= period:
                last = now
                for purchase, controller in lanes:
                    frame = purchase.latest()
                    controller.loop(frame)
            if runtime_seconds is not None and now - start > runtime_seconds:
                break
            time.sleep(0.005)
    except KeyboardInterrupt:
        log.info("shutdown requested")
    finally:
        if cam is not None:
            cam.stop()
        for purchase, controller in lanes:
            purchase.stop()
            controller._close_barrier()
        if pusher is not None:
            pusher.stop()
        log.info("service stopped (%d lane(s))", len(lanes))


def _run_replay(
    source: ImageSource,
    controller: GateController,
    seconds: float | None,
    on_frame=None,
) -> None:
    """Drive the gate state machine over an image/video file for bench tests."""
    loop_hz = float(controller.cfg.app.get("loopHz", 10.0))
    period = 1.0 / loop_hz
    start = time.monotonic()
    try:
        for frame in source:
            if on_frame is not None:
                on_frame(frame)
            controller.loop(frame if frame is not None else None)
            time.sleep(period)
            if seconds is not None and time.monotonic() - start > seconds:
                break
    except StopIteration:
        pass
    controller._close_barrier()


__all__ = ["build_api", "event_print", "make_sink", "run"]