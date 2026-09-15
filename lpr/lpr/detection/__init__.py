"""Plate/vehicle detection with Ultralytics YOLO.

Model: any `YOLOv8n/s/m` checkpoint trained/fine-tuned on Egyptian plates
(class 0 = `plate`, optionally class 1 = `vehicle`). See `models/README.md`
and `tools/` for training and ONNX/TensorRT export notes. The inference
backend is whatever Ultralytics supports on the host (CUDA on the Windows
server by default, CPU/MPS fallback).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Cfg

log = logging.getLogger("lpr.detection")

CLS_PLATE = 0
CLS_VEHICLE = 1


@dataclass
class Detection:
    x1: int
    y1: int
    x2: int
    y2: int
    conf: float
    cls: int  # 0 = plate, 1 = vehicle

    @property
    def is_plate(self) -> bool:
        return self.cls == CLS_PLATE

    @property
    def area(self) -> int:
        return max(0, self.x2 - self.x1) * max(0, self.y2 - self.y1)

    def crop(self, frame: np.ndarray) -> np.ndarray:
        return frame[self.y1 : self.y2, self.x1 : self.x2]


class DetectionError(RuntimeError):
    pass


class UnavailableDetector:
    """Raised-as-dependency placeholder when ultralytics is absent."""

    def __init__(self, reason: str):
        self.reason = reason

    def detect(self, frame: np.ndarray) -> list[Detection]:
        raise DetectionError(self.reason)


class YoloDetector:
    def __init__(self, cfg: Cfg):
        d = cfg.detection
        self.conf = float(d["conf"])
        self.imgsz = int(d["imgsz"])
        self.max_det = int(d["maxDet"])
        self.device = str(d["device"])
        self.model_path = Path(d["model"]) if d.get("model") else None
        self._model = None
        self._names: dict[int, str] = {0: "plate", 1: "vehicle"}

    def _ensure(self):
        if self._model is not None:
            return self._model
        if not self.model_path or not self.model_path.exists():
            raise DetectionError(
                f"detection model not found: {self.model_path}. See "
                "lpr/models/README.md"
            )
        try:
            from ultralytics import YOLO  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover
            raise DetectionError(
                "ultralytics not installed; run: pip install -r requirements.txt"
            ) from exc
        log.info("loading detector %s (device=%s)", self.model_path, self.device)
        model = YOLO(str(self.model_path))
        if hasattr(model, "names"):
            self._names = dict(model.names or self._names)
        self._model = model
        return self._model

    def detect(self, frame: np.ndarray) -> list[Detection]:
        model = self._ensure()
        h, w = frame.shape[:2]
        res = model.predict(
            frame,
            imgsz=self.imgsz,
            conf=self.conf,
            max_det=self.max_det,
            device=self.device,
            verbose=False,
        )
        out: list[Detection] = []
        if not res:
            return out
        boxes = res[0].boxes
        if boxes is None or boxes.xyxy is None:
            return out
        for bxyxy, bconf, bcls in zip(
            boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist()
        ):
            x1, y1, x2, y2 = (int(v) for v in bxyxy)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            if x2 - x1 < 8 or y2 - y1 < 8:
                continue
            out.append(
                Detection(x1, y1, x2, y2, float(bconf), int(bcls))
            )
        out.sort(key=lambda d_: (d_.cls != CLS_PLATE, -d_.conf))
        return out