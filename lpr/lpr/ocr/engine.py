"""OCR recognition engines: ONNX character-classifier + deterministic demo.

Real engine: `EgyptPlateOcr` runs an ONNX CNN (28x28 → 38 classes:
28 Arabic letters + 10 digits) via onnxruntime (CUDA EP when available).

Demo engine: `DemoOcr` returns the configured `ocr.demoPlate` with high
confidence so the full capture → matcher → gate loop can be exercised on a
bench without trained models.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import numpy as np

from ..config import Cfg
from . import charset
from .egypt import PlateResult, parse_result
from .preprocess import segment_plate

log = logging.getLogger("lpr.ocr")

_safe_class_name = re.compile(r"[^\w\-.]")


class OcrError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# ONNX character classifier
# --------------------------------------------------------------------------- #
class EgyptPlateOcr:
    def __init__(self, cfg: Cfg):
        o = cfg.ocr
        self.model_path = Path(o["model"]) if o.get("model") else None
        self.min_conf = float(o["confidence"])
        self.padding = int(o.get("padding", 4))
        self._session = None

    def _ensure(self) -> "object":
        if self._session is not None:
            return self._session
        if not self.model_path or not self.model_path.exists():
            raise OcrError(
                f"OCR model not found: {self.model_path}. See lpr/models/README.md "
                "and tools/train_ocr.py; set ocr.demo: true to run without it."
            )
        try:
            import onnxruntime as ort  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover
            raise OcrError(
                "onnxruntime not installed; run: pip install -r requirements.txt"
            ) from exc
        cuda = "CUDAExecutionProvider" in (ort.get_available_providers() or [])
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if cuda else ["CPUExecutionProvider"]
        try:
            self._session = ort.InferenceSession(str(self.model_path), providers=providers)
        except Exception:
            self._session = ort.InferenceSession(
                str(self.model_path), providers=["CPUExecutionProvider"]
            )
        log.info("OCR loaded %s (%s)", self.model_path, providers[0])
        return self._session

    def predict_tokens(self, tokens: list[np.ndarray]) -> list[tuple[str, float]]:
        if not tokens:
            return []
        sess = self._ensure()
        in_name = sess.get_inputs()[0].name
        out_name = sess.get_outputs()[0].name
        batch = np.stack(
            [t.astype(np.float32) / 255.0 for t in tokens], axis=0
        )[:, None, :, :]  # (N,1,28,28) — assumes CHW input
        logits = sess.run([out_name], {in_name: batch})[0]
        ex = np.exp(logits - logits.max(axis=1, keepdims=True))
        probs = ex / ex.sum(axis=1, keepdims=True)
        out: list[tuple[str, float]] = []
        for p in probs:
            idx = int(np.argmax(p))
            out.append((charset.INDEX_TO_LABEL[idx], float(p[idx])))
        return out

    def recognize(self, crop: np.ndarray) -> PlateResult:
        tokens, _bin = segment_plate(crop, pad=self.padding)
        if not tokens:
            return PlateResult("", "", 0.0, False, "no tokens segmented")
        preds = self.predict_tokens(tokens)
        result = parse_result(preds)
        if result.valid and result.confidence >= self.min_conf:
            return result
        return PlateResult(
            result.text, result.letters, result.digits,
            result.confidence, False,
            "below confidence threshold or invalid grammar",
        )


# --------------------------------------------------------------------------- #
# Demo engine (no models installed)
# --------------------------------------------------------------------------- #
class DemoOcr:
    def __init__(self, cfg: Cfg):
        self.demo_plate = str(cfg.ocr.get("demoPlate", "سصد1234"))

    def recognize(self, _crop: np.ndarray) -> PlateResult:
        from .egypt import validate  # noqa: PLC0415

        ok, letters, digits = validate(self.demo_plate)
        return PlateResult(
            letters + digits, letters, digits, 0.99, ok,
            "demo mode" if ok else "invalid demo plate",
        )


def make_ocr(cfg: Cfg) -> EgyptPlateOcr | DemoOcr:
    if cfg.ocr.get("demo"):
        log.info("OCR demo mode ON (trains not used); demoPlate=%s", cfg.ocr.get("demoPlate"))
        return DemoOcr(cfg)
    if not cfg.ocr.get("model"):
        raise OcrError(
            "ocr.model not configured (run with ocr.demo: true to bypass, or "
            "produce a model via tools/train_ocr.py)"
        )
    return EgyptPlateOcr(cfg)