"""Push gate events to the ParkSpot server for the operator dashboard.

A background worker drains a bounded queue and POSTs batches to
``/api/admin/lpr/events`` using the same bearer token as plate matching, so
the web UI can show live camera matches without blocking the gate loop.
"""

from __future__ import annotations

import logging
import queue
import threading
import time

import requests

log = logging.getLogger("lpr.events")

MAX_QUEUE = 500
BATCH_SIZE = 20
RATE_LIMIT_WARN_SEC = 30.0


class EventPusher:
    def __init__(self, api_url: str, token: str, timeout: float = 5.0):
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._q: queue.Queue[dict] = queue.Queue(maxsize=MAX_QUEUE)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="lpr-events", daemon=True
        )
        self._thread.start()
        log.info("events: pushing to %s/api/admin/lpr/events", self.api_url)

    def _run(self) -> None:
        last_warn = 0.0
        while not self._stop.is_set():
            try:
                batch = [self._q.get(timeout=0.5)]
            except queue.Empty:
                continue
            for _ in range(BATCH_SIZE - 1):
                try:
                    batch.append(self._q.get_nowait())
                except queue.Empty:
                    break
            try:
                res = requests.post(
                    f"{self.api_url}/api/admin/lpr/events",
                    json={"events": batch},
                    headers={"Authorization": f"Bearer {self.token}"},
                    timeout=self.timeout,
                )
                if res.status_code not in (200, 201):
                    now = time.monotonic()
                    if now - last_warn > RATE_LIMIT_WARN_SEC:
                        log.warning("events push -> HTTP %s %s", res.status_code, res.text[:120])
                        last_warn = now
            except Exception as exc:  # noqa: BLE001 - never break the gate loop
                now = time.monotonic()
                if now - last_warn > RATE_LIMIT_WARN_SEC:
                    log.warning("events push failed: %s", exc)
                    last_warn = now

    def push(self, event: dict) -> None:
        if self._q.full():
            try:
                self._q.get_nowait()
            except queue.Empty:
                pass
        try:
            self._q.put_nowait(event)
        except queue.Full:
            pass

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)