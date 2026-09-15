# LPR (License Plate Recognition) + Automatic Gate Service

Edge service for the ParkSpot parking system. Detects Egyptian license plates
(Arabic letters + digits) with a YOLO detector, OCRs the plate region, matches
the plate against active ParkSpot bookings, then auto-opens/closes the entry
gate barrier through a **Siemens LOGO! 8** PLC over Modbus TCP, using
inductive-loop detectors for vehicle presence and safety.

```
                ┌──────────────────────────────────────────────┐
   RTSP cameras │  lpr service (Python, Windows server + GPU)  │
  ─────────────►│  capture → YOLO det → OCR → matcher          │
                │         └───────────┬───────────────────┐    │
                │                     │ match (bookings)  │gate │
                │                     ▼                   ▼    │
                │             ParkSpot web API      pymodbus   │
                └──────────────────────────────────────────────┘
                          /api/admin/gate/lookup       Modbus TCP
                                                       LOGO! 8 PLC
                                                I1 loop-in │ I2 loop-out
                                                Q1 barrier-open │ gate sensor
```

## Layout

- `lpr/` — the service package (capture, detection, OCR, matcher, gate).
- `tools/` — data generation and model training/export scripts.
- `data/` — character maps, plate grammar, dataset notes.
- `models/` — YOLO `.pt`/`.onnx` and OCR `.onnx` files (see its README).
- `docs/` — electromagnetic wiring, LOGO! program + Modbus spec, API contract.
- `config.yaml`, `.env.example` — runtime configuration.

## Quick start (Windows server, NVIDIA GPU)

```bash
cd lpr
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt          # PyTorch CUDA wheels optional
copy .env.example .env                    # set ParkSpot API url/token + LOGO! IP
python run_lpr.py selfcheck               # validates config, models, PLC reachable
python run_lpr.py run                     # production loop (default config.yaml)
# (or: pip install -e .  →  lpr-cli run / selfcheck / demo / once)
```

Without any trained models the service runs in **demo mode**: `plate_ocr.demo:
true` returns synthetic plates so you can exercise the full
capture → matcher → PLC → barrier loop against a simulated PLC
(`gate.modbus.enabled: false`). Training instructions for the real
high-accuracy models are in `models/README.md`, `tools/`, and `data/README.md`.

## Docs

- [docs/EGYPT_PLATE_FORMAT.md](docs/EGYPT_PLATE_FORMAT.md) — Egyptian plate
  grammar the OCR validates against.
- [docs/LOGO_PROGRAM_SPEC.md](docs/LOGO_PROGRAM_SPEC.md) — LOGO! Soft Comfort
  program, Modbus slave address map, and the gate state machine rationale.
- [docs/WIRING.md](docs/WIRING.md) — LPR box ↔ loop detectors ↔ LOGO! ↔ barrier.
- [docs/API_INTEGRATION.md](docs/API_INTEGRATION.md) — how matching works
  against the ParkSpot API (Arabic + transliterated plates, auto check-in).

## Multi-gate (entry + exit lanes)

The service runs **any number of lanes**. Each lane has its own camera,
LOGO! PLC, zone/lot filter and direction:

- **ENTRY** (`decide()`) — verified paid booking in window → open + check-in.
- **EXIT** (`exit_decide()`) — active session on record → open + auto check-out.

```yaml
gates:
  - id: entry-1
    name: Main Entry
    direction: ENTRY
    match: { filters: { lot: "LOT-1" } }
  - id: exit-1
    name: Main Exit
    direction: EXIT
    gate: { host: "192.168.0.11" }
    match: { autoCheckout: true }
```

Configure gates in the **web admin** (Settings → Gate config `/admin/gates`):
name, direction, camera (RTSP/USB), LOGO! PLC host/port/registers, lot+zone,
assigned operators, plus live PLC diagnostics and a manual barrier Open/Close.

## Gate decision rules (summary)

- Plate confidence >= `match.minConfidence` and active/PENDING booking found
  and entry-time window valid → **open barrier** (LOG! `Q1` coil via Modbus),
  auto close on loop-out pulse or timeout.
- Loop-in occupied with no readable plate → keep tracking up to
  `tracking.maxWindowSec`; then deny + log.
- Any safety fault (both loops active, gate sensor stuck)
  → hold closed, alert via log/webhook.