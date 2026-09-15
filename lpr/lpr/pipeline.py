"""End-to-end plate reading: detect → crop → OCR → validate.

One-shot `read()` call; temporal smoothing (best-of-N while the vehicle sits
on the entry loop) lives in `lpr.gate.controller` so the gate decides with
stable reads.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np

from .config import Cfg
from .detection import Detection, UnavailableDetector, YoloDetector
from .ocr import DemoOcr, EgyptPlateOcr, PlateResult, make_ocr

log = logging.getLogger("lpr.pipeline")


@dataclass
class ReadResult:
    plate: PlateResult | None
    detections: list[Detection] = field(default_factory=list)
    latency_ms: float = 0.0
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.plate is not None and self.plate.valid


class PlatePipeline:
    def __init__(self, cfg: Cfg, ocr=None, detector=None):
        self.cfg = cfg
        self.demo = bool(cfg.ocr.get("demo"))
        self.ocr: DemoOcr | EgyptPlateOcr = ocr or make_ocr(cfg)
        if detector is not None:
            self.detector = detector
        elif self.demo:
            self.detector = None
        else:
            try:
                self.detector = YoloDetector(cfg)
            except Exception as exc:  # noqa: BLE001 - degrade gracefully
                log.error("detector init failed: %s", exc)
                self.detector = UnavailableDetector(str(exc))

    def read(self, frame: np.ndarray, frame_id: int = 0) -> ReadResult:
        t0 = time.perf_counter()
        error = ""
        crop: np.ndarray | None = None
        detections: list[Detection] = []

        if self.demo:
            result = self.ocr.recognize(frame)  # type: ignore[attr-defined]
        else:
            try:
                detections = (
                    self.detector.detect(frame) if self.detector else []
                )
            except Exception as exc:  # noqa: BLE001
                error = f"detection failed: {exc}"
                detections = []
            plates = [d for d in detections if d.is_plate]
            if plates:
                best = max(plates, key=lambda d: d.conf)
                crop = best.crop(frame)
                try:
                    result = self.ocr.recognize(crop)
                except Exception as exc:  # noqa: BLE001
                    error = f"ocr failed: {exc}"
                    result = PlateResult("", "", 0.0, False, error)
            else:
                result = PlateResult("", "", 0.0, False, "no plate detected")

        latency = (time.perf_counter() - t0) * 1000.0
        ret = ReadResult(result, detections, latency, error)
        if ret.ok and frame_id % max(1, int(10 * self.cfg.app.get("loopHz", 10))) == 0:
            log.info(
                "read %s conf=%.2f lat=%.0fms dets=%d",
                result.text, result.confidence, latency, len(detections),
            )
        return ret