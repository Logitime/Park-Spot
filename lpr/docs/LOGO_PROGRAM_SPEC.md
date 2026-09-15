# Siemens LOGO! 8 — program + Modbus/TCP spec for the entry gate

Target hardware: **LOGO! 8** with Ethernet (LOGO! CM ETHERNET 6GK7271-0AA00-0AA0
add-on module, LOGO! TDE display, or an Ethernet-capable "CE/RCE" base; 8.FS4
or newer recommended). The PLC is a Modbus **slave**; the LPR box is the
Modbus **master** (see `lpr/gate/modbus_plc.py`).

## Pin / I/O plan

| Terminal | Function                | Source                                        | Default value |
| -------- | ----------------------- | --------------------------------------------- | ------------- |
| I1       | Entry loop (loop-in)    | Inductive loop detector relay output (dry or 24V) | 0 |
| I2       | Exit loop (loop-out)    | Second loop detector (post-entry, past barrier)   | 0 |
| I3       | Barrier open-limit      | Limit switch dry contact at barrier "fully up"    | 0 |
| I4       | Manual open push (opt.) | Panel pushbutton                                  | 0 |
| Q1       | Barrier "raise"         | Relay/contactor to barrier motor (up)             | 0 |
| Q2       | Barrier "lower" (opt.)  | Relay/contactor to barrier motor (down)           | 0 |
| Q3       | Alarm / traffic light   | Optional (fault indication)                       | 0 |

Loop detectors are powered separately and typically output a relay/NPN
"vehicle present" signal — feed it into the matching LOGO! DI reference
(common) or via the LOGO! input configuration (PNP/NPN setting).

## Modbus TCP (Ethernet) map

Configure in **LOGO! Soft Comfort V8.3+**:  Tools → Interfaces → Ethernet →
enable Modbus-TCP (slave).  Set the IP you use in `lpr/config.yaml`
(`gate.host`), and map VM addresses like this (0-based):

| Name          | Kind (function code) | Modbus address | LOGO! object |
| ------------- | -------------------- | -------------- | ------------ |
| `loop1`       | Read Discrete Inputs (02) | 0   | I1  |
| `loop2`       | Read Discrete Inputs (02) | 1   | I2  |
| `gateOpenSensor` | Read Discrete Inputs (02) | 2 | I3  |
| `open`        | Read/Write Coils (01/05)  | 0   | Q1  |
| (reserved)    | Read/Write Coils (01/05)  | 1   | Q2  |
| (alarm)       | Read/Write Coils (01/05)  | 2   | Q3  |

`lpr` reads these through `gate.registers` in `config.yaml` — change both
sides together.  Drives use `Q1 = 1 → raise barrier held`, `Q1 = 0 → release`.

> If you favour S7-compatible addressing in LOGO!, function code 02 still
> reads refs 0..7 for I1..I8 and coils 0..7 for Q1..Q8 — the table above stays
> valid; verify once with `python -m lpr.cli selfcheck` before going live.

## Suggested LOGO! program (ladder-equivalent)

Described behaviorally — build it as a small FBD/ladder circuit:

```
// Modbus coil "open" (Q1 via client) -> pulse M1 "OPEN_COMMAND"
M1 = open OR I4                       (manual push also opens)
M2 = NOT (I1 AND I2)                  (safety: both loops = blocked, no command)

// Drive up: Q1 = M1 AND M2 AND NOT I3(open-limit)
Q1 = M1 AND M2 AND NOT I3

// Auto-close:
//  - timer T1: off-delay 20 s from M1 falling edge (or from loop-out pass)
//  - reset M1 when: car cleared loop2 after being on it, OR T1 elapsed
M1.R = (I2 once-true-falls AND now loop2 clear) OR T1.Q
M1.S = open OR I4          (priority: keep S and R as above)

// Alarm: both loops occupied > 5 s
Q3 = I1 AND I2 → T2 (5 s) → Q3
```

Place the **open-limit (I3)** interlock on the up-drive coil so a stuck/mechanical
arm never keeps the motor energised, and keep the auto-close timeout
(`openSeconds` in `lpr/config.yaml`, default 20 s) as the ultimate
safety net — the LPR service also turns the coil off after that timeout.

## Commissioning checklist

1. Load the program into LOGO! (upload via Soft Comfort over Ethernet).
2. Set the LOGO! IP (`gate.host`), porter 502, unit 1.
3. `python run_lpr.py selfcheck` from the LPR box (expect `plc: connected`).
4. Loop test: stand a car on each loop and confirm `LOGO!` DI LEDs and
   `snapshot()` values toggle (`loop1/loop2` true).
5. Drive test: flip `open` coil from the LPR box (`SimulatedPlc` first), then
   live, confirm Q1 energize → barrier raises → I3 asserts → auto-close.