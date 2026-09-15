"""Command-line interface: run / selfcheck / once(photo) / demo."""

from __future__ import annotations

import argparse
import logging
import threading
import time
from pathlib import Path

import numpy as np

from . import __version__
from .app import build_api, event_print, run
from .config import Cfg, load_config, setup_logging, iter_gates
from .gate.controller import GateController
from .matcher import ApiError, ParkingApi
from .ocr import OcrError
from .pipeline import PlatePipeline

log = logging.getLogger("lpr.cli")


def _cfg(args) -> Cfg:
    return load_config(args.config)


# --------------------------------------------------------------------------- #
def cmd_selfcheck(args) -> int:
    setup_logging(logging.INFO)
    cfg = _cfg(args)
    problems: list[str] = []
    ok = True

    det = cfg.detection
    if cfg.ocr.get("demo"):
        log.info("ocr: demo mode (no models required)")
    else:
        if not det.get("model"):
            problems.append("detection.model not set")
        elif not Path(det["model"]).exists():
            problems.append(f"detection.model missing: {det['model']}")
        if not cfg.ocr.get("model"):
            problems.append("ocr.model not set")
        elif not Path(cfg.ocr["model"]).exists():
            problems.append(f"ocr.model missing: {cfg.ocr['model']}")

    api = build_api(cfg)
    if api is None and cfg.match.get("apiUrl"):
        pass
    elif cfg.match.get("apiUrl"):
        try:
            r = api.lookup("SELFCHECK")
            log.info("matcher: API reachable (%d results on probe)", len(r))
        except ApiError as exc:
            ok = False
            problems.append(f"matcher: {exc}")
    else:
        problems.append("match.apiUrl not set — matching disabled")

    specs = [s for s in iter_gates(cfg) if s.enabled]
    if not specs:
        log.warning("no enabled lanes in config")

    for spec in specs:
        lane = Cfg({
            **cfg.as_dict(),
            "gate": spec.gate,
            "match": spec.match,
            "app": dict(spec.app),
            "laneId": spec.id,
            "laneDirection": spec.direction,
        })
        plc = _make_plc(lane)
        if spec.gate.get("enabled"):
            if plc.connected:
                log.info("[%s] plc: connected to %s:%s", spec.id, spec.gate.get("host"), spec.gate.get("port"))
            else:
                ok = False
                problems.append(f"[{spec.id}] plc: not connected (check LOGO! IP / program)")
        log.info("[%s] lane: direction=%s camera=%s", spec.id, spec.direction,
                 spec.capture.get("url", spec.capture.get("device")))

    if problems:
        for p in problems:
            log.error("  - %s", p)
        log.error("SELFCHECK FAILED (%d)", len(problems))
        return 1
    log.info("SELFCHECK OK")
    return 0


def _print_line(s: str) -> None:
    """UTF-8 console print (Arabic plates survive cp1252 consoles)."""
    import sys  # noqa: PLC0415

    sys.stdout.buffer.write((s + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def _make_plc(cfg: Cfg):
    from .gate import make_plc  # noqa: PLC0415

    return make_plc(cfg)


# --------------------------------------------------------------------------- #
def cmd_once(args) -> int:
    setup_logging(logging.INFO)
    cfg = _cfg(args)
    if not args.image:
        log.error("--image required")
        return 2
    pipeline = PlatePipeline(cfg)
    frame = cv2_imread(args.image)
    rr = pipeline.read(frame, 0)
    if rr.ok:
        _print_line(
            f"plate={rr.plate.text}  latin={rr.plate.latin}  "
            f"conf={rr.plate.confidence:.2f}  lat={rr.latency_ms:.0f}ms"
        )
    else:
        _print_line(f"no valid read: {rr.error or 'invalid grammar'}")
        return 1
    if args.out:
        _annotate(frame, rr, args.out)
        _print_line(f"annotated -> {args.out}")
    return 0


def _annotate(frame, rr, out: str) -> None:
    import cv2  # noqa: PLC0415

    for d in rr.detections:
        cv2.rectangle(frame, (d.x1, d.y1), (d.x2, d.y2), (0, 255, 0), 2)
        cv2.putText(frame, f"{d.conf:.2f}", (d.x1, d.y1 - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    cv2.imwrite(out, frame)


def cv2_imread(path: str) -> np.ndarray:
    import cv2  # noqa: PLC0415

    img = cv2.imread(str(path))
    if img is None:
        raise SystemExit(f"cannot read image: {path}")
    return img


# --------------------------------------------------------------------------- #
def cmd_demo(args) -> int:
    """Simulated car cycle against a SimulatedPlc (no camera/PLC needed)."""
    setup_logging(logging.INFO)
    cfg = _cfg(args)
    if not cfg.ocr.get("demo"):
        log.warning("ocr.demo is false — demo mode still uses DemoOcr for the cycle")
        cfg = load_config(args.config)

    from .gate import SimulatedPlc, make_plc
    from .ocr import DemoOcr
    from .pipeline import PlatePipeline

    plc = make_plc(cfg, enabled=False)  # force simulated
    assert isinstance(plc, SimulatedPlc)
    pipeline = PlatePipeline(cfg)
    api = build_api(cfg)
    controller = GateController(cfg, plc, pipeline, api, events=event_print)

    seconds = float(args.seconds or 8.0)
    lo = threading.Thread(target=_drive_cycle, args=(plc, seconds), daemon=True)
    lo.start()
    start = time.monotonic()
    frame = np.zeros((720, 1280, 3), np.uint8)
    loop_hz = float(cfg.app.get("loopHz", 10.0))
    period = 1.0 / loop_hz
    while time.monotonic() - start < seconds + 4:
        controller.loop(frame)
        time.sleep(period)
    log.info("demo finished. final barrier=%s", plc.open)
    return 0


def _drive_cycle(plc, on_seconds: float) -> None:
    time.sleep(1.5)
    log.info("[sim] car approaching…")
    plc.simulate_loop1(True)
    time.sleep(min(6.0, max(2.0, on_seconds * 0.6)))
    plc.simulate_loop1(False)
    plc.simulate_loop2(True)
    time.sleep(1.2)
    plc.simulate_loop2(False)
    time.sleep(1.0)
    plc.simulate_gate_sensor(False)


# --------------------------------------------------------------------------- #
def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="lpr", description="ParkSpot LPR + gate service")
    p.add_argument("--config", default="config.yaml", help="config YAML path")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("run", help="production loop")
    sub.add_parser("selfcheck", help="validate config, models, PLC, API")
    once = sub.add_parser("once", help="recognize a single plate image")
    once.add_argument("--image", required=True)
    once.add_argument("--out", help="save annotated image")
    demo = sub.add_parser("demo", help="simulated gate cycle (no hardware)")
    demo.add_argument("--seconds", type=float, default=8.0)
    p.add_argument("--version", action="version", version=f"lpr {__version__}")

    args = p.parse_args(argv)
    if args.cmd == "run":
        return run(load_config(args.config))
    if args.cmd == "selfcheck":
        return cmd_selfcheck(args)
    if args.cmd == "once":
        return cmd_once(args)
    if args.cmd == "demo":
        return cmd_demo(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())