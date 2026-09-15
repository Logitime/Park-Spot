# Physical wiring reference

## Multiple gates

Repeat the lane below per gate. Each gate gets its **own** LOGO! 8 or CM
Ethernet module (or use the TDE network) and its own RTSP camera. Give every
LOGO! a different IP (`gate.host` per lane in `config.yaml`) and keep `unit`
per Modbus-TCP client. One LPR PC can drive all lanes (multi-threaded;
see `lpr/config.yaml` `gates:`). Entry and exit lanes use the same I/O wiring;
only the matching policy differs.

## Block layout

```
                        ┌──────────────────────────┐
   entry lane           │        GATE ROOM         │
   ┌───────────┐        │  ┌───────┐   ┌────────┐  │
   │ RTSP cam  ├────────┼──┤ LPR PC│───┤ LOGO! 8│  │      ┌──────────┐
   │ (mast, ───┤        │  │ (this │   │  + ETH │──┼──────┤  Barrier │
   │  lane mouth)│      │  │ service)  └────────┘  │      │ arm/motor│
   └───────────┘        │  └───────┘               │      └────┬─────┘
                        └──────────────────────────┘           │
   Loop detector A ──► I1 (entry)                               └─ Q1 relay → contactor
   Loop detector B ──► I2 (exit, past barrier)
   Limit switch   ──► I3 (barrier fully open)
   Manual push    ──► I4 (optional)
```

## Wiring notes (observe local codes; use an electrician for mains side)

1. **Inductive loop detectors** are powered rails (e.g. 24 VDC, terminal
   blocks live at the detector). Their relay contacts are what you wire to
   LOGO!: one side to the loop-detector "common", the other to LOGO! DI
   terminal (I1/I2). Configure the LOGO! DI input type to match the detector
   output (dry relay vs NPN open-collector with enable).
2. **Camera(s)**: one RTSP IP camera per lane, mounted to view the plate
   plane at 20–40°, plate height 0.5–1.5 m. Use a PoE injector/switch in the
   gate room. Point the ROI (`capture.roi`) at the loop-1 zone so detection
   only looks at cars actually at the gate.
3. **Ethernet**: shielded Cat6 between LPR PC, LOGO! (CM ETHERNET), and the
   camera switch; ground one end. Isolate the PLC network from the internet
   when possible; at minimum keep the LPR service token scoped (see
   API_INTEGRATION.md).
4. **Barrier drive**: Q1 → interface relay (24 VDC coil) → contactor (230 VAC
   motor) with a motor-protection breaker + fuse; the barrier's own open-limit
   switch feeds I3. Never power the motor through the PLC directly.
5. **Testing**: with `LPR_GATE_ENABLED=false` the service drives the
   `SimulatedPlc` — safe to develop in the office wiring up only a 24 V LED on
   test rig Q1.

## Power budget (typical)

| Device                | Supply | Notes                          |
| --------------------- | ------ | ------------------------------ |
| LOGO! 8 12/24RCE      | 24 VDC | own PSU, do not share loop det.|
| Loop detectors        | 24 VDC | 2 × ~5 W                       |
| LPR PC / NUC          | 24 VDC / 230 V | GPU server in room       |
| Camera (PoE)          | PoE    | injector in switch             |
| Barrier motor         | 230 VAC| via contactor                  |