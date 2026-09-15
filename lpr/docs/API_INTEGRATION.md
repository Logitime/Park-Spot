# ParkSpot API integration (plate matching + gate events)

The LPR service matches a recognized plate against **active ParkSpot
bookings**, then drives the gate. All matching happens server-side because the
bookings database lives there (SQLite → Prisma).

## Multi-gate configuration

The web **Gate settings** page (`/admin/gates`) stores gate records in the DB
(name, ENTRY/EXIT, lot+zone, camera, LOGO! PLC, operators). The LPR service
mirrors that with a `gates:` list in `config.yaml` — each entry inherits the
global `capture`/`gate`/`match` defaults and overrides per lane:

```yaml
gates:
  - id: entry-1
    name: Main Entry
    direction: ENTRY
    capture: { url: "rtsp://…/101" }          # default host/registers apply
  - id: exit-1
    name: Main Exit
    direction: EXIT
    gate: { host: "192.168.0.11" }
    match: { autoCheckout: true, filters: { lot: "LOT-1" } }
```

Each lane gets its **own capture thread, PLC object and state machine**.
See `lpr/config.yaml` and `lpr/docs/WIRING.md`.

## Endpoints used

| Call | Method | Purpose |
| ---- | ------ | ------- |
| `/api/admin/gate/lookup?plate=<p>` | GET | vehicles with PENDING/CONFIRMED/ACTIVE reservations (end in future); returns plate, spot, timings, paid-state |
| `/api/reservations/{id}/checkin` | POST | auto check-in when the gate opens for a paid, in-window CONFIRMED booking |

Auth: `Authorization: Bearer <jwt>` from `POST /api/auth/login`. Use a
**dedicated OPERATOR or ADMIN account** for the gate token in `PARKSPOT_TOKEN`.
On a managed/cloud deployment use an API key / operator service account with a
separate client cert or VPN — the token grants gate control.

## Matching flow (`lpr/matcher.py`)

Entry and exit lanes share the same lookup, but make different decisions:

| Lane | Decision |
| ---- | -------- |
| ENTRY (`decide()`) | ACTIVE → OPEN · paid+in-window CONFIRMED → OPEN (+check-in) · else DENY |
| EXIT (`exit_decide()`) | ACTIVE → OPEN (+check-out when `autoCheckout`) · else DENY |

1. OCR returns a validated `PlateResult`, e.g. `سصد1234`.
2. Query 1 (raw): `lookup(سصد1234)` — matches bookings whose stored plate was
   entered in Arabic (the web/mobile flow stores plates verbatim, upper-cased,
   spaces removed — Arabic characters survive `toUpperCase().replace(/\s+/g,'')`).
3. Query 2 (if no match): `lookup(SSD1234)` using `PlateResult.latin` — matches
   bookings typed with Latin transliteration.
4. Optional per-gate **lot/zone filter** (`match.filters: {lot, zone}`) discards
   candidates outside the gate's zone — set from the web Gate settings page.
5. Candidate scoring: ACTIVE > CONFIRMED-in-window > late CONFIRMED > PENDING.
6. Entry decision:
   - **OPEN** — ACTIVE session, or paid + within the entry window (start − 1 h).
     For CONFIRMED, the service also calls `checkin` when `autoCheckin` is on.
   - **DENY** — unpaid, too early, not confirmed, or no booking.
7. Exit decision: **OPEN** when an ACTIVE session exists (auto **`checkout`**
   when `autoCheckout`/`autoCheckin` is on), **DENY** otherwise.
8. Only the *first* decision matters per loop event; the gate DNs down on
   subsequent frames (state machine in `lpr/gate/controller.py`).

## Event log

Every gate event is emitted as a structured line:

```
GATE DECISION | state=CAR_PRESENT plate=سصد1234 conf=0.93 | confirmed booking — welcome
GATE OPEN     | state=DECIDING plate=سصد1234 conf=0.93 | confirmed booking — welcome
GATE BARRIER_CLOSE | ...
```

Fields: `event` (VEHICLE_ENTER, DECISION, OPEN, DENY, BARRIER_CLOSE,
GATE_RESET, FAULT), `state`, `plate`, `confidence`, `reason`, optional
`decision` blob (action, reservation id, status, paid, checkin_done).

Future: POST these to `/api/admin/audit` or a webhook sink via
`app.events` for an operator timeline of gate opens + denies
(recommended for PCI/audit hygiene around who entered when).