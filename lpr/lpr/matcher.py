"""Matching a recognized plate against ParkSpot bookings + gate decision.

Flow: recognized plate (Arabic or Latin) → GET /api/admin/gate/lookup →
best reservation → gate decision (OPEN/DENY/HOLD) → optional auto check-in.

The lookup endpoint already filters PENDING/CONFIRMED/ACTIVE reservations
whose end time is in the future and returns the payment state per reservation
(``paid``), which is exactly what a barrier needs.  We also retry with the
Latin transliteration so a booking typed with Latin letters (e.g. "SPD1234")
can be matched by a plate read in Arabic ("س صد 1234").
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import requests

from .config import Cfg
from .ocr import PlateResult
from .util import coerce_plate, looks_arabic, normalize_arabic

log = logging.getLogger("lpr.matcher")

ENTRY_GRACE = timedelta(hours=1)  # mirror of checkin[EARLY_GRACE_MS]


class ApiError(RuntimeError):
    pass


@dataclass
class BookingCandidate:
    reservation_id: str
    status: str
    start_time: datetime
    end_time: datetime
    paid: bool
    plate_number: str
    spot: str = ""
    zone: str = ""
    lot: str = ""
    user_name: str = ""

    @staticmethod
    def from_json(r: dict) -> "BookingCandidate":
        try:
            start = datetime.fromisoformat(r["startTime"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(r["endTime"].replace("Z", "+00:00"))
        except (KeyError, ValueError):  # noqa: PERF203
            start = end = datetime.now(timezone.utc)
        return BookingCandidate(
            reservation_id=r["id"],
            status=r["status"],
            start_time=start,
            end_time=end,
            paid=bool(r.get("paid")),
            plate_number=str(r.get("plateNumber", "")),
            spot=str(r.get("spot", {}).get("number", "")),
            zone=str(r.get("spot", {}).get("zone", "")),
            lot=str(r.get("spot", {}).get("lot", "")),
            user_name=str(r.get("user", {}).get("name", "")),
        )


@dataclass
class GateDecision:
    action: str  # "OPEN" | "DENY" | "HOLD"
    reason: str
    plate: str = ""
    confidence: float = 0.0
    candidate: BookingCandidate | None = None
    checkin_done: bool = False

    def as_flat(self) -> dict:
        return {
            "action": self.action,
            "reason": self.reason,
            "plate": self.plate,
            "confidence": round(self.confidence, 3),
            "reservation": self.candidate.reservation_id if self.candidate else None,
            "status": self.candidate.status if self.candidate else None,
            "paid": self.candidate.paid if self.candidate else False,
            "lot": self.candidate.lot if self.candidate else "",
            "checkin_done": self.checkin_done,
        }


class ParkingApi:
    def __init__(self, cfg: Cfg):
        m = cfg.match
        self.base = (m["apiUrl"] or "").rstrip("/")
        self.token = m.get("token", "")
        self.timeout = float(m.get("timeoutSec", 5.0))
        if not self.base:
            raise ApiError("match.apiUrl is not set (PARKSPOT_API_URL)")
        if not self.token:
            log.warning("match.token not set — lookups will 401!")

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def lookup(self, plate: str) -> list[BookingCandidate]:
        """Call /api/admin/gate/lookup and flatten vehicles→reservations."""
        url = f"{self.base}/api/admin/gate/lookup?plate={quote(plate)}"
        r = requests.get(url, headers=self._headers(), timeout=self.timeout)
        if r.status_code == 401:
            raise ApiError("gate lookup unauthorized — check match.token")
        if r.status_code != 200:
            raise ApiError(f"lookup {plate}: HTTP {r.status_code} {r.text[:120]}")
        data = r.json()
        out: list[BookingCandidate] = []
        for vehicle in data.get("vehicles", []):
            for res in vehicle.get("reservations", []):
                cand = BookingCandidate.from_json(res)
                cand.plate_number = vehicle.get("plateNumber", "")
                out.append(cand)
        return out

    def checkin(self, reservation_id: str) -> bool:
        url = f"{self.base}/api/reservations/{quote(reservation_id)}/checkin"
        r = requests.post(url, headers=self._headers(), timeout=self.timeout)
        if r.status_code == 200:
            return True
        log.warning("auto check-in %s -> HTTP %s %s", reservation_id, r.status_code, r.text[:120])
        return False


def _score(c: BookingCandidate, now: datetime) -> int:
    """Higher = better. ACTIVE first, then on-time CONFIRMED, then late."""
    if c.status == "ACTIVE":
        return 100
    if c.status == "CONFIRMED":
        if now >= c.start_time - ENTRY_GRACE:
            return 80
        return 40
    return 10  # PENDING


def decide(
    api: ParkingApi,
    result: PlateResult,
    now: datetime | None = None,
    auto_checkin: bool = True,
) -> GateDecision:
    now = now or datetime.now(timezone.utc)
    raw = normalize_arabic(result.text)
    search_terms = [raw]
    if looks_arabic(raw):
        latin = result.latin
        if latin:
            search_terms.append(latin)
    else:
        search_terms.append(coerce_plate(raw))

    candidates: list[BookingCandidate] = []
    seen: set[str] = set()
    for term in search_terms:
        if not term:
            continue
        try:
            for cand in api.lookup(term):
                if cand.reservation_id in seen:
                    continue
                seen.add(cand.reservation_id)
                candidates.append(cand)
        except ApiError as exc:
            log.error("lookup error for %r: %s", term, exc)

    if not candidates:
        return GateDecision("DENY", "no booking for this plate", raw, result.confidence)

    best = max(candidates, key=lambda c: (_score(c, now), c.end_time.timestamp()))

    if best.status == "ACTIVE":
        return GateDecision(
            "OPEN", "active session — allow", raw, result.confidence, best
        )
    if best.status == "CONFIRMED":
        if not best.paid:
            return GateDecision("DENY", "booking not paid", raw, result.confidence, best)
        if now < best.start_time - ENTRY_GRACE:
            return GateDecision(
                "DENY", "arriving before the entry window", raw, result.confidence, best
            )
        checkin_done = False
        if auto_checkin:
            checkin_done = api.checkin(best.reservation_id)
        return GateDecision(
            "OPEN", "confirmed booking — welcome", raw, result.confidence, best, checkin_done
        )
    return GateDecision(
        "DENY", "booking not confirmed", raw, result.confidence, best
    )