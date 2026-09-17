import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

try:  # pragma: no cover - optional dev convenience
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #
class _Utf8Writer:
    """Stream wrapper so Arabic plate logs survive Windows cp1252 consoles."""

    def __init__(self, stream=None):
        self.stream = stream or sys.stdout

    def write(self, s: str) -> int:
        data = s.encode("utf-8", "replace")
        self.stream.buffer.write(data)
        self.stream.buffer.flush()
        return len(data)

    def flush(self) -> None:
        self.stream.flush()

    @property
    def encoding(self) -> str:
        return "utf-8"


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """Shared, Windows-safe console logging (UTF-8 even for Arabic)."""
    root = logging.getLogger("lpr")
    if root.handlers:
        return root
    root.setLevel(level)
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S"
    )
    sh = logging.StreamHandler(_Utf8Writer())
    sh.setFormatter(fmt)
    root.addHandler(sh)
    return root


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
class Cfg:
    """Thin dict-like wrapper so the rest of the code can use attr access."""

    def __init__(self, data: dict):
        object.__setattr__(self, "_d", data)

    def __getattr__(self, key: str):
        try:
            return self._d[key]
        except KeyError as exc:  # pragma: no cover
            raise AttributeError(key) from exc

    def get(self, key: str, default=None):
        return self._d.get(key, default)

    def as_dict(self) -> dict:
        return self._d


def env_or(prefix: str, key: str, default=None):
    """Prefer `<PREFIX>_<KEY>` env var, then plain `<KEY>` env var."""
    return os.environ.get(f"{prefix}_{key}".upper(), os.environ.get(key, default))


def deep_get(d: dict, keys: list, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


def shorthand_bool(d: dict, keys: list, default: bool) -> bool:
    v = deep_get(d, keys, default)
    return bool(v) if isinstance(v, bool) else default


def load_config(path: Path | str, env_prefix: str = "LPR") -> Cfg:
    """Load YAML config, overlay env vars (LPR_* / <SECTION>_* when set)."""
    path = Path(path)
    if not path.is_absolute():
        path = ROOT / path
    raw: dict = {}
    if yaml is None:
        raise RuntimeError("PyYAML is required (pip install -r requirements.txt)")
    if path.exists():
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"config root must be a mapping: {path}")

    if load_dotenv:
        dot = ROOT / ".env"
        if dot.exists():
            load_dotenv(dot)

    # --- flatten known sections for env override --------------------------- #
    def sec(name: str) -> dict:
        return raw.get(name, {}) if isinstance(raw.get(name), dict) else {}

    capture = sec("capture")
    capture["source"] = env_or(env_prefix, "SOURCE", capture.get("source", "rtsp"))
    capture["url"] = env_or(env_prefix, "CAMS_RTSP", capture.get("url"))
    capture["device"] = int(
        env_or(env_prefix, "CAM_DEVICE", str(capture.get("device", 0)))
    )
    capture["fps"] = float(env_or(env_prefix, "CAM_FPS", str(capture.get("fps", 15))))
    capture["width"] = int(
        env_or(env_prefix, "CAM_WIDTH", str(capture.get("width", 1920)))
    )
    capture["height"] = int(
        env_or(env_prefix, "CAM_HEIGHT", str(capture.get("height", 1080)))
    )
    capture["roi"] = capture.get("roi", [0, 0, 1, 1])  # x1,y1,x2,y2 (0..1)

    detection = sec("detection")
    detection["model"] = env_or(env_prefix, "DET_MODEL", detection.get("model"))
    detection["conf"] = float(
        env_or(env_prefix, "DET_CONF", str(detection.get("conf", 0.35)))
    )
    detection["device"] = env_or(env_prefix, "DET_DEVICE", detection.get("device", "0"))
    detection["imgsz"] = int(
        env_or(env_prefix, "DET_IMGSZ", str(detection.get("imgsz", 640)))
    )
    detection["batch"] = int(
        env_or(env_prefix, "DET_BATCH", str(detection.get("batch", 1)))
    )
    detection["maxDet"] = int(
        env_or(env_prefix, "DET_MAX", str(detection.get("maxDet", 4)))
    )
    detection.setdefault("threshold", 0.2)

    ocr = sec("ocr")
    ocr["demo"] = bool(env_or(env_prefix, "OCR_DEMO", "true") not in ("0", "false", ""))
    ocr["model"] = env_or(env_prefix, "OCR_MODEL", ocr.get("model"))
    ocr["confidence"] = float(
        env_or(env_prefix, "OCR_CONF", str(ocr.get("confidence", 0.6)))
    )
    ocr["preprocess"] = ocr.get("preprocess", "threshold")
    ocr["padding"] = int(ocr.get("padding", 4))

    match = sec("match")
    match["apiUrl"] = env_or("PARKSPOT", "API_URL", match.get("apiUrl"))
    match["token"] = os.environ.get("PARKSPOT_TOKEN", match.get("token", ""))
    match["minConfidence"] = float(
        env_or(env_prefix, "MATCH_CONF", str(match.get("minConfidence", 0.55)))
    )
    match["autoCheckin"] = shorthand_bool(match, ["autoCheckin"], True)
    match.setdefault("timeoutSec", 5.0)

    tracking = sec("tracking")
    tracking["maxWindowSec"] = int(
        env_or(env_prefix, "TRACK_WINDOW", str(tracking.get("maxWindowSec", 30)))
    )
    tracking["stableFrames"] = int(
        env_or(env_prefix, "TRACK_STABLE", str(tracking.get("stableFrames", 2)))
    )
    tracking.setdefault("iouThreshold", 0.45)

    gate = sec("gate")
    gate["enabled"] = shorthand_bool(gate, ["enabled"], True)
    gate["enabled"] = env_or(env_prefix, "GATE_ENABLED", gate["enabled"])
    gate["host"] = env_or("LOGO", "IP", gate.get("host", "192.168.0.10"))
    gate["port"] = int(env_or("LOGO", "PORT", str(gate.get("port", 502))))
    gate["unit"] = int(gate.get("unit", 1))
    gate["timeout"] = float(gate.get("timeout", 2.0))
    gate["reconnectEvery"] = float(gate.get("reconnectEvery", 2.0))
    gate["openSeconds"] = float(gate.get("openSeconds", 20.0))
    gate["postCarGrace"] = float(gate.get("postCarGrace", 1.5))
    gate.setdefault("denyBlockSeconds", 8.0)
    gate["registers"] = gate.get(
        "registers",
        {
            "loop1": {"kind": "discrete", "address": 0},
            "loop2": {"kind": "discrete", "address": 1},
            "gateOpenSensor": {"kind": "discrete", "address": 2},
            "open": {"kind": "coil", "address": 0},
        },
    )

    app_raw = sec("app")
    app_raw.setdefault("loopHz", 10.0)
    app_raw.setdefault("events", None)  # optional http/webhook sink (future)

    web = sec("web")
    web["enabled"] = shorthand_bool(web, ["enabled"], False)
    web["enabled"] = str(env_or(env_prefix, "WEB_ENABLED", web["enabled"])).lower() not in ("0", "false", "")
    web["host"] = env_or(env_prefix, "WEB_HOST", web.get("host", "0.0.0.0"))
    web["port"] = int(env_or(env_prefix, "WEB_PORT", str(web.get("port", 8601))))
    web["token"] = web.get("token") or match.get("token", "")

    return Cfg(
        {
            "capture": capture,
            "detection": detection,
            "ocr": ocr,
            "match": match,
            "tracking": tracking,
            "gate": gate,
            "app": app_raw,
            "web": web,
            "gates": raw.get("gates", []),
        }
    )


# --------------------------------------------------------------------------- #
# Multi-gate spec
# --------------------------------------------------------------------------- #
@dataclass
class GateSpec:
    """Per-lane configuration built by merging a gate entry with global defaults."""

    id: str
    name: str
    direction: str  # "ENTRY" | "EXIT"
    enabled: bool
    capture: dict  # capture section (url, device, roi…)
    gate: dict  # plc + timing section
    match: dict  # match section (autoCheckin, zone/lot filter…)
    app: dict  # loopHz etc.


def _deep_merge(base: dict, override: dict) -> dict:
    """Shallow recursive merge: override wins; list replaces entirely."""
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def iter_gates(cfg: Cfg) -> list[GateSpec]:
    """Yield one :class:`GateSpec` per configured lane.

    If the YAML has a top-level ``gates:`` list, each entry is merged with
    the global ``capture``/``gate``/``match``/``app`` sections as defaults.
    If there is no ``gates:`` list (backward-compatible), a single gate
    is synthesised from the top-level sections.
    """
    raw_gates = cfg.get("gates")
    if not isinstance(raw_gates, list) or len(raw_gates) == 0:
        # legacy single-lane: synthesise from top-level
        return [
            GateSpec(
                id="default",
                name="default",
                direction="ENTRY",
                enabled=bool(cfg.gate.get("enabled", True)),
                capture=dict(cfg.capture),
                gate=dict(cfg.gate),
                match=dict(cfg.match),
                app=dict(cfg.app),
            )
        ]

    gate_specs: list[GateSpec] = []
    for i, entry in enumerate(raw_gates):
        if not isinstance(entry, dict):
            continue
        gid = str(entry.get("id", f"gate-{i}"))
        gname = str(entry.get("name", gid))
        direction = "EXIT" if str(entry.get("direction", "ENTRY")).upper() == "EXIT" else "ENTRY"
        enabled = bool(entry.get("enabled", True))

        gate_section = _deep_merge(cfg.gate, entry.get("gate", {}))
        capture_section = _deep_merge(cfg.capture, entry.get("capture", {}))
        match_section = _deep_merge(cfg.match, entry.get("match", {}))
        app_section = _deep_merge(cfg.app, entry.get("app", {}))

        gate_specs.append(
            GateSpec(
                id=gid,
                name=gname,
                direction=direction,
                enabled=enabled,
                capture=capture_section,
                gate=gate_section,
                match=match_section,
                app=app_section,
            )
        )

    return gate_specs