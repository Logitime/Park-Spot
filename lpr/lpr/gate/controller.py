"""Gate state machine: loop detector -> plate read -> match -> barrier open.

State model (per lane; extend to a dict of lanes for multi-camera entry):

    IDLE ──loop1──▶ CAR_PRESENT
    CAR_PRESENT ──stable plate──▶ DECIDING ──OPEN──▶ OPENING
                                            ──DENY ─▶ DENIED ──(cooldown)──▶ IDLE
    OPENING ──loop2 pulse | timeout──▶ CLOSING ──loop1 clear──▶ IDLE
    (loop1+loop2 simultaneously) ─────────────────────▶ FAULT ──clear──▶ IDLE

Safety invariants enforced here:
  * never raise the barrier while the exit loop is occupied (defers);
  * auto-close on timeout (`openSeconds`) or once the car clears the exit loop;
  * a stuck-open gate sensor (limit switch) or unreachable PLC holds the lane
    in FAULT and keeps the barrier closed.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from ..config import Cfg
from ..matcher import GateDecision, ParkingApi, decide, exit_decide
from ..ocr import PlateResult
from ..pipeline import PlatePipeline
from ..util import Timer
from .modbus_plc import PlcBase

log = logging.getLogger("lpr.gate")

IDLE, CAR_PRESENT, DECIDING, OPENING, CLOSING, DENIED, FAULT = range(7)
STATE_NAME = ["IDLE", "CAR_PRESENT", "DECIDING", "OPENING", "CLOSING", "DENIED", "FAULT"]


@dataclass
class Config:
    lane_id: str = "default"
    direction: str = "ENTRY"  # ENTRY | EXIT
    loop_hz: float = 10.0
    open_seconds: float = 20.0
    post_car_grace: float = 1.5
    max_window_sec: float = 30.0
    stable_frames: int = 2
    deny_block_seconds: float = 8.0
    min_confidence: float = 0.55
    auto_checkin: bool = True
    auto_checkout: bool | None = None  # None → fall back to auto_checkin (EXIT lanes)
    filters: dict | None = None  # lot/zone filter from gate spec


@dataclass
class GateEvent:
    kind: str
    ts: float = field(default_factory=time.time)
    lane: str = ""
    state: str = ""
    plate: str = ""
    confidence: float = 0.0
    reason: str = ""
    decision: dict | None = None

    def as_dict(self) -> dict:
        return {
            "event": self.kind,
            "ts": round(self.ts, 3),
            "lane": self.lane,
            "state": self.state,
            "plate": self.plate,
            "confidence": round(self.confidence, 3),
            "reason": self.reason,
            **({"decision": self.decision} if self.decision else {}),
        }


class GateController:
    def __init__(
        self,
        cfg: Cfg,
        plc: PlcBase,
        pipeline: PlatePipeline,
        api: ParkingApi | None = None,
        events: Callable[[GateEvent], None] | None = None,
        gcfg: Config | None = None,
    ):
        self.cfg = cfg
        self.plc = plc
        self.pipeline = pipeline
        self.api = api
        self.emit_hook = events or (lambda e: None)
        g = cfg.gate
        c = gcfg or Config(
            lane_id=str(cfg.get("laneId", "default")),
            direction=str(cfg.get("laneDirection", "ENTRY")),
            loop_hz=float(cfg.app.get("loopHz", 10.0)),
            open_seconds=float(g.get("openSeconds", 20.0)),
            post_car_grace=float(g.get("postCarGrace", 1.5)),
            max_window_sec=float(cfg.tracking.get("maxWindowSec", 30)),
            stable_frames=int(cfg.tracking.get("stableFrames", 2)),
            deny_block_seconds=float(g.get("denyBlockSeconds", 8.0)),
            min_confidence=float(cfg.match.get("minConfidence", 0.55)),
            auto_checkin=bool(cfg.match.get("autoCheckin", True)),
            auto_checkout=cfg.match.get("autoCheckout"),
            filters=cfg.match.get("filters"),
        )
        self.c = c

        self.state = IDLE
        self._timer = Timer()
        self._read_counter = 0
        self._votes: dict[str, list[float]] = defaultdict(list)
        self._best_read: PlateResult | None = None
        self._deny_timer = Timer()
        self._deferred = False
        self._loop2_seen = False
        self.frame = 0

    # ------------------------------------------------------------------ #
    def emit(self, kind, plate="", conf=0.0, reason="", decision=None) -> None:
        ev = GateEvent(kind, lane=self.c.lane_id, state=STATE_NAME[self.state], plate=plate,
                       confidence=conf, reason=reason, decision=decision)
        self.emit_hook(ev)
        log.info(
            "EVENT %s [%s] (state=%s plate=%r conf=%.2f %s)",
            kind, self.c.lane_id, ev.state, plate, conf, reason,
        )

    def _snapshot(self) -> dict[str, bool]:
        try:
            return self.plc.snapshot()
        except Exception as exc:  # noqa: BLE001
            self._fault(f"PLC read failed: {exc}")
            return {}

    def _fault(self, reason: str) -> None:
        if self.state != FAULT:
            self.state = FAULT
            self._close_barrier()
            self.emit("FAULT", reason=reason)

    def _close_barrier(self) -> None:
        try:
            self.plc.set_open(False)
        except Exception:  # noqa: BLE001
            pass

    def _open_barrier(self) -> None:
        try:
            self.plc.set_open(True)
        except Exception as exc:  # noqa: BLE001
            self._fault(f"cannot open barrier: {exc}")

    # ------------------------------------------------------------------ #
    def loop(self, frame: np.ndarray | None = None) -> None:
        """One tick of the state machine. Call at cfg.app.loopHz."""
        self.frame += 1
        bits = self._snapshot()
        loop1 = bits.get("loop1", False)
        loop2 = bits.get("loop2", False)

        if self.state == IDLE:
            if loop1 and loop2:
                self._fault("both loops occupied")
            elif loop1:
                self.state = CAR_PRESENT
                self._timer.reset()
                self._votes.clear()
                self._best_read = None
                self.emit("VEHICLE_ENTER", reason="loop1 on")
            return

        if self.state == FAULT:
            if not loop1 and not loop2:
                log.info("FAULT cleared -> IDLE")
                self.state = IDLE
            return

        if self.state == CAR_PRESENT:
            if not loop1:
                self.state = IDLE
                self.emit("VEHICLE_GONE", reason="loop1 cleared before decision")
                self._votes.clear()
                return
            if loop2:
                # car straddling both loops — hold, don't decide yet
                return
            stable = self._read_plate(frame)
            if stable is not None:
                self.state = DECIDING
                self._best_read = stable
                self._decide()
            elif self._timer.elapsed > self.c.max_window_sec:
                self.state = DENIED
                self._deny_timer.reset()
                self.emit("DENY", reason="no readable plate within window")
            return

        if self.state == DECIDING:
            self._decide()
            return

        if self.state == DENIED:
            if self._deny_timer.elapsed >= self.c.deny_block_seconds:
                self.state = IDLE if not loop1 else CAR_PRESENT
            return

        if self.state == OPENING:
            keep_open_time = self._timer.elapsed
            passed = self._loop2_pulse(loop2)
            if passed or keep_open_time > self.c.open_seconds:
                self._close_barrier()
                self.state = CLOSING
                self._timer.reset()
                self.emit("BARRIER_CLOSE", reason="car passed or timeout")
            else:
                self._open_barrier()  # keep the coil asserted
            return

        if self.state == CLOSING:
            if (not loop1) and self._timer.elapsed > self.c.post_car_grace:
                log.info("gate closed -> IDLE")
                self.state = IDLE
                self.emit("GATE_RESET")
            return

    # ------------------------------------------------------------------ #
    def _read_plate(self, frame: np.ndarray | None) -> PlateResult | None:
        """Throttled pipeline reads; accumulate votes per plate text."""
        throttle = max(1, round(self.c.loop_hz / 5.0))
        self._read_counter += 1
        if frame is None or self._read_counter % throttle != 0:
            return None
        try:
            rr = self.pipeline.read(frame, self.frame)
        except Exception as exc:  # noqa: BLE001
            log.error("pipeline.read error: %s", exc)
            return None
        if not rr.ok or rr.plate is None:
            return None
        p = rr.plate
        self._votes[p.text].append(p.confidence)
        # prune old window
        if self._votes[p.text] and len(self._votes[p.text]) > self.c.stable_frames * 8:
            self._votes[p.text] = self._votes[p.text][-self.c.stable_frames * 8:]
        votes = len(self._votes[p.text])
        if votes >= self.c.stable_frames and p.confidence >= self.c.min_confidence:
            return p
        return None

    def _loop2_pulse(self, loop2_now: bool) -> bool:
        if loop2_now:
            self._loop2_seen = True
        elif self._loop2_seen:
            self._loop2_seen = False
            return True
        return False

    # ------------------------------------------------------------------ #
    def _decide(self) -> None:
        read = self._best_read
        if read is None:
            return
        if self.api is None:
            self.state = OPENING
            self._timer.reset()
            self._open_barrier()
            self.emit("OPEN", plate=read.text, conf=read.confidence,
                      reason="no matcher configured (offline mode)")
            return
        try:
            if self.c.direction == "EXIT":
                decision: GateDecision = exit_decide(
                    self.api, read,
                    auto_checkout=(
                        self.c.auto_checkout
                        if self.c.auto_checkout is not None
                        else self.c.auto_checkin
                    ),
                    filters=self.c.filters,
                )
            else:
                decision = decide(
                    self.api, read,
                    auto_checkin=self.c.auto_checkin,
                    filters=self.c.filters,
                )
        except Exception as exc:  # noqa: BLE001
            self._fault(f"matcher failure: {exc}")
            return

        self.emit(
            "DECISION", plate=read.text, conf=read.confidence,
            reason=decision.reason, decision=decision.as_flat(),
        )
        if decision.action == "OPEN":
            self.state = OPENING
            self._timer.reset()
            self._loop2_seen = False
            self._open_barrier()
            self.emit("OPEN", plate=read.text, conf=read.confidence,
                      reason=decision.reason)
        else:
            self.state = DENIED
            self._deny_timer.reset()
            self.emit("DENY", plate=read.text, conf=read.confidence,
                      reason=decision.reason)