"""Service runtime: wires capture thread -> pipeline -> matcher -> gate loop."""

from __future__ import annotations

import logging
import time

import numpy as np

from .capture import PurchaseThread, make_source, ImageSource
from .config import Cfg, setup_logging
from .gate import GateController, make_plc
from .matcher import ApiError, ParkingApi
from .pipeline import PlatePipeline

log = logging.getLogger("lpr.app")


def build_api(cfg: Cfg) -> ParkingApi | None:
    try:
        return ParkingApi(cfg)
    except ApiError as exc:
        log.warning("matcher disabled: %s", exc)
        return None


def event_print(event) -> None:
    """Default event sink: one structured log line per gate event."""
    log.info("GATE %s | state=%s plate=%s conf=%.2f | %s",
             event.kind, event.state, event.plate or "-", event.confidence,
             event.reason or "-")


def run(cfg: Cfg, runtime_seconds: float | None = None) -> None:
    setup_logging()
    log.info("starting lpr service (demo=%s, gate.enabled=%s)",
             cfg.ocr.get("demo"), cfg.gate.get("enabled"))

    plc = make_plc(cfg)
    if not plc.connected and cfg.gate.get("enabled"):
        log.info("connecting to PLC…")
        plc.connect()

    pipeline = PlatePipeline(cfg)
    api = build_api(cfg)
    controller = GateController(cfg, plc, pipeline, api, events=event_print)

    # replay mode (--image/-video) vs live capture
    replay = cfg.capture.get("replay")
    if replay:
        source = ImageSource(replay, loop=bool(cfg.capture.get("replayLoop", False)))
        _run_replay(source, controller, runtime_seconds)
        return

    source = make_source(cfg)
    purchase = PurchaseThread(source)
    purchase.start()
    log.info("capture thread started")

    loop_hz = float(cfg.app.get("loopHz", 10.0))
    period = 1.0 / max(1.0, loop_hz)
    start = time.monotonic()
    last = start
    intervals: list[float] = []
    try:
        while True:
            now = time.monotonic()
            elapsed = now - last
            if elapsed >= period:
                last = now
                frame = purchase.latest()
                controller.loop(frame)
                intervals.append(elapsed)
                if len(intervals) > 100:
                    intervals.pop(0)
            if runtime_seconds is not None and now - start > runtime_seconds:
                break
            time.sleep(0.005)
    except KeyboardInterrupt:
        log.info("shutdown requested")
    finally:
        purchase.stop()
        controller._close_barrier()
        log.info("service stopped")


def _run_replay(source: ImageSource, controller: GateController, seconds: float | None) -> None:
    """Drive the gate state machine over an image/video file for bench tests."""
    loop_hz = float(controller.cfg.app.get("loopHz", 10.0))
    period = 1.0 / loop_hz
    start = time.monotonic()
    try:
        for frame in source:
            controller.loop(frame if frame is not None else None)
            time.sleep(period)
            if seconds is not None and time.monotonic() - start > seconds:
                break
    except StopIteration:
        pass
    controller._close_barrier()


__all__ = ["build_api", "event_print", "run"]