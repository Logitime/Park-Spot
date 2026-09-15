"""Small shared helpers: timing, retry, plate normalization."""

import re
import time
from dataclasses import dataclass, field
from typing import Callable

from .config import Cfg


@dataclass
class Timer:
    _t: float = field(default=0.0, init=False)

    def reset(self) -> None:
        self._t = time.monotonic()

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self._t


class SettledEnvelope:
    """Time-windowed majority vote.

    Used to turn jittery per-frame OCR reads into a stable plate value:
    keeps results from the last ``window_sec`` and only reports the most
    frequent candidate once it appears >= ``min_votes`` times.
    """

    def __init__(self, window_sec: float = 1.2, min_votes: int = 2):
        self.window_sec = window_sec
        self.min_votes = min_votes
        self._samples: list[tuple[float, str, float]] = []

    def add(self, plate: str, conf: float, now: float | None = None) -> str | None:
        now = now or time.monotonic()
        self._samples = [
            (t, p, c) for (t, p, c) in self._samples if now - t <= self.window_sec
        ]
        self._samples.append((now, plate, conf))
        votes: dict[str, list[float]] = {}
        for _t, p, c in self._samples:
            votes.setdefault(p, []).append(c)
        best = max(votes.items(), key=lambda kv: (len(kv[1]), max(kv[1])), default=None)
        if best is None or len(best[1]) < self.min_votes:
            return None
        return best[0]

    def clear(self) -> None:
        self._samples = []


_ARABIC_RE = re.compile(r"[ا-ي]+")
_DEFAULT_ARABIC = re.compile(r"[^ا-ي0-9]")
_LATIN = re.compile(r"[^A-Z0-9]")


def normalize_arabic(text: str) -> str:
    """Keep Arabic letters + Western digits, collapse to bare form e.g. 'سصد123'."""
    return _DEFAULT_ARABIC.sub("", text.upper())


def looks_latin(text: str) -> bool:
    return bool(re.fullmatch(r"[A-Z0-9]{1,12}", text.replace(" ", "").upper()))


def looks_arabic(text: str) -> bool:
    return bool(_ARABIC_RE.search(text))


def coerce_plate(text: str) -> str:
    """Normalize into the canonical stored form (letters+digits, no spaces)."""
    return "".join(text.split()).upper()


def retry(fn: Callable[[], bool], tries: int, delay: float) -> bool:
    for i in range(max(1, tries)):
        try:
            if fn():
                return True
        except Exception:
            pass
        if i + 1 < tries:
            time.sleep(delay)
    return False


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def cfg_of(path: str, cfg: Cfg, default=None):
    """Dot-path access into the config (e.g. 'gate.registers.loop1')."""
    node: dict = cfg.as_dict()
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return node