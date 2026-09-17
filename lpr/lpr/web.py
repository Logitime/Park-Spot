"""Lightweight web service: live lane snapshots / MJPEG streams + status.

Serves the newest grabbed frame per lane straight from the capture threads
so the ParkSpot operator dashboard can watch the gate cameras in a browser.
Endpoints:

    GET /status                        -> JSON overview of the lanes
    GET /snapshot/<lane>               -> single JPEG (latest frame)
    GET /stream/<lane>                 -> MJPEG (multipart/x-mixed-replace)

An optional ``web.token`` (defaults to ``match.token``) must be passed as
``?t=`` when set.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import cv2
import numpy as np

log = logging.getLogger("lpr.web")

BOUNDARY = "lprframe"
POLL_SEC = 0.05


def make_jpeg(frame: np.ndarray, quality: int = 80) -> bytes | None:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else None


class _Handler(BaseHTTPRequestHandler):
    server_version = "ParkSpotLPR/1.0"

    def log_message(self, fmt, *args) -> None:  # quiet access log
        log.debug(fmt, *args)

    # ------------------------------------------------------------------ #
    def _split(self):
        path = urlparse(self.path).path.rstrip("/")
        parts = [unquote(p) for p in path.split("/") if p]
        token = parse_qs(urlparse(self.path).query).get("t", [""])[0]
        return parts, token

    def _authorized(self, token: str) -> bool:
        expected = getattr(self.server, "token", "") or ""
        return not expected or token == expected

    def _unauthorized(self) -> None:
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "unauthorized"}).encode())

    def _lanes(self) -> dict:
        return getattr(self.server, "lanes", {})

    def _lane(self, lane_id: str) -> dict | None:
        return self._lanes().get(lane_id)

    # ------------------------------------------------------------------ #
    def do_GET(self):  # noqa: N802
        parts, token = self._split()
        if not parts:
            self._not_found()
            return
        if not self._authorized(token):
            self._unauthorized()
            return
        if parts[0] == "status":
            self._status()
        elif parts[0] == "snapshot" and len(parts) == 2:
            self._snapshot(self._lane(parts[1]))
        elif parts[0] == "stream" and len(parts) == 2:
            self._stream(self._lane(parts[1]))
        else:
            self._not_found()

    def _status(self) -> None:
        lanes = []
        for lane_id, view in self._lanes().items():
            frame = view.get("latest")()
            ok = frame is not None
            lanes.append({
                "id": lane_id,
                "name": view.get("name", lane_id),
                "direction": view.get("direction", "ENTRY"),
                "fps": float(view.get("fps", 15.0)),
                "camera": ok,
            })
        body = json.dumps({"ok": True, "lanes": lanes}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _snapshot(self, view: dict | None) -> None:
        jpg = None
        if view is not None:
            frame = view.get("latest")()
            if frame is not None:
                jpg = make_jpeg(frame)
        if jpg is None:
            self._not_found()
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(jpg)))
        self.end_headers()
        self.wfile.write(jpg)

    def _stream(self, view: dict | None) -> None:
        if view is None or view.get("latest")() is None:
            self._not_found()
            return
        self.send_response(200)
        self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        period = 1.0 / max(1.0, float(view.get("fps", 15.0)))
        last = 0.0
        while True:
            frame = view.get("latest")()
            now = time.monotonic()
            if frame is not None and now - last >= period:
                last = now
                jpg = make_jpeg(frame)
                if jpg is None:
                    time.sleep(POLL_SEC)
                    continue
                try:
                    self.wfile.write(b"--" + BOUNDARY.encode() + b"\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(jpg)}\r\n\r\n".encode())
                    self.wfile.write(jpg)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, OSError):
                    break
            time.sleep(POLL_SEC)

    def _not_found(self) -> None:
        self.send_response(404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "not found"}).encode())


class CamServer:
    """Thin wrapper over a threaded HTTP server exposing lane camera views."""

    def __init__(
        self,
        host: str,
        port: int,
        lanes: dict[str, dict],
        token: str = "",
    ):
        self.host = host
        self.port = int(port)
        self.lanes = lanes
        self.token = token
        self._httpd: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self) -> None:
        self._httpd = ThreadingHTTPServer((self.host, self.port), _Handler)
        self._httpd.lanes = self.lanes
        self._httpd.token = self.token
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, name="lpr-web", daemon=True
        )
        self._thread.start()
        log.info("web: camera server on %s (%d lane(s))", self.base_url, len(self.lanes))

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None