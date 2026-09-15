"""Camera sources: an abstraction over RTSP IP cameras and USB webcams."""

from __future__ import annotations

import logging
import threading
import time
from abc import ABC, abstractmethod
from typing import Iterator

import cv2
import numpy as np

from ..config import Cfg

log = logging.getLogger("lpr.capture")


class CaptureError(RuntimeError):
    pass


class Source(ABC):
    """A camera that yields BGR frames. Thread-safe: read() grabs the newest."""

    fps: float
    width: int
    height: int

    def __init__(self, cfg: Cfg):
        self.cfg = cfg.capture
        self.fps = float(self.cfg["fps"])
        roi = self.cfg.get("roi", [0, 0, 1, 1])
        self.roi = np.clip(roi, 0.0, 1.0)

    def _apply_roi(self, frame: np.ndarray) -> np.ndarray:
        x1, y1, x2, y2 = self.roi
        h, w = frame.shape[:2]
        if (x1, y1, x2, y2) == (0, 0, 1, 1):
            return frame
        box = (
            int(x1 * w),
            int(y1 * h),
            int(x2 * w),
            int(y2 * h),
        )
        return frame[box[1] : box[3], box[0] : box[2]]

    @abstractmethod
    def open(self) -> None: ...

    @abstractmethod
    def grab(self) -> np.ndarray | None: ...

    @abstractmethod
    def close(self) -> None: ...

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *exc):
        self.close()
        return False


class RtspSource(Source):
    """RTSP IP camera (Hikvision/Dahua/…) with auto-reconnect + RSTP override."""

    def __init__(self, cfg: Cfg, url: str | None = None):
        super().__init__(cfg)
        self.url = url or self.cfg.get("url")
        if not self.url:
            raise CaptureError("capture.url not set")
        self._cap: cv2.VideoCapture | None = None
        self._lock = threading.Lock()
        self._last_ok = 0.0
        self._reconnect_every = 3.0

    def open(self) -> None:
        with self._lock:
            url = self.url.replace("rtsps://", "rtsp://")
            if url.startswith("rtsp://"):
                url += "?tcp"
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_FPS, self.fps)
            if not cap.isOpened():
                cap.release()
                raise CaptureError(f"cannot open RTSP stream: {self.url}")
            self._cap = cap
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or self.width
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or self.height
            self.width, self.height = w, h
            log.info("RTSP opened %s (%dx%d)", self.url.split("?")[0], w, h)

    def grab(self) -> np.ndarray | None:
        with self._lock:
            if self._cap is None:
                return None
            ok, frame = self._cap.read()
        if ok:
            self._last_ok = time.monotonic()
            return self._apply_roi(frame)
        # stream hiccup → try to reconnect outside the lock
        if time.monotonic() - self._last_ok > self._reconnect_every:
            log.warning("RTSP read failed, reconnecting…")
            try:
                self.close()
                self.open()
            except Exception as exc:  # noqa: BLE001
                log.error("reconnect failed: %s", exc)
        return None

    def close(self) -> None:
        with self._lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None


class UsbSource(Source):
    """Local USB/webcam via V4L2/DirectShow. Useful for bench testing."""

    def __init__(self, cfg: Cfg, device: int | None = None):
        super().__init__(cfg)
        self.device = self.cfg.get("device", 0) if device is None else device
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> None:
        cap = cv2.VideoCapture(self.device)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.cfg.get("width", 1920))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.cfg.get("height", 1080))
        cap.set(cv2.CAP_PROP_FPS, self.fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            cap.release()
            raise CaptureError(f"cannot open camera device {self.device}")
        self._cap = cap
        log.info("usb camera %s opened", self.device)

    def grab(self) -> np.ndarray | None:
        if self._cap is None:
            return None
        ok, frame = self._cap.read()
        return self._apply_roi(frame) if ok else None

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None


def make_source(cfg: Cfg) -> Source:
    kind = (cfg.capture.get("source") or "rtsp").lower().split(":")[0]
    if kind in ("usb", "v4l", "cam"):
        return UsbSource(cfg)
    return RtspSource(cfg)


class PurchaseThread:
    """Background thread that keeps grabbing the newest frame into a slot so a
    slow OCR/pipeline never starves the camera buffer."""

    def __init__(self, source: Source):
        self.source = source
        self._stop = threading.Event()
        self._frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self.source.open()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="capture"
        )
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            frame = self.source.grab()
            if frame is not None:
                with self._lock:
                    self._frame = frame
            else:
                time.sleep(0.05)

    def latest(self) -> np.ndarray | None:
        with self._lock:
            return self._frame

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
        self.source.close()


class ImageSource(Iterator[np.ndarray]):
    """Offline source for tests / replay: iterates image or video files."""

    def __init__(self, path: str, loop: bool = False):
        self.path = path
        self.loop = loop
        self._cap = cv2.VideoCapture(path)
        if not self._cap.isOpened():
            raise CaptureError(f"cannot open: {path}")
        log.info("replay source %s", path)

    def __next__(self) -> np.ndarray:
        ok, frame = self._cap.read()
        if not ok:
            if self.loop:
                self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self._cap.read()
            if not ok:
                raise StopIteration
        return frame

    def __iter__(self):
        return self