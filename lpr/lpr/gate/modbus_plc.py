"""Siemens LOGO! 8 (Modbus TCP slave) client + bench simulator.

LOGO! 8 with a CM ETHERNET / LOGO! TDE acts as a Modbus TCP *slave*.  We are
the master (pymodbus client).  With the LOGO! program from
``docs/LOGO_PROGRAM_SPEC.md`` the register map is (all offsets 0-based):

    Discrete inputs (read):
        loop1            = I1 -> register 0
        loop2            = I2 -> register 1
        gateOpenSensor   = I3 -> register 2   (limit switch: barrier fully open)
    Coils (read/write):
        open             = Q1 -> coil 0      (driver: raise barrier)
        (reserved)       = Q2 -> coil 1      (traffic light / alarm)

The drive output convention: Q1=0 → barrier arm lowered (closed), Q1=1 →
direction "raise" held until the open-limit sensor asserts.
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Any

from ..config import Cfg

log = logging.getLogger("lpr.gate.plc")

READ_BITS = 5
WRITE_BITS = 2


class PlcError(RuntimeError):
    pass


class PlcBase(ABC):
    @abstractmethod
    def connect(self) -> bool: ...

    @abstractmethod
    def read_bit(self, kind: str, address: int) -> bool: ...

    @abstractmethod
    def write_coil(self, address: int, value: bool, **extra: bool) -> Any: ...

    @property
    @abstractmethod
    def connected(self) -> bool: ...

    def snapshot(self) -> dict[str, bool]:
        return {}


class ModbusPlc(PlcBase):
    """Production LOGO! client via pymodbus (Modbus TCP)."""

    def __init__(self, cfg: Cfg):
        g = cfg.gate
        self.host = g["host"]
        self.port = int(g["port"])
        self.unit = int(g.get("unit", 1))
        self.timeout = float(g["timeout"])
        self.registers: dict[str, dict] = g["registers"]
        self._client = None
        self._last_connect = 0.0
        self._reconnect_every = float(g.get("reconnectEvery", 2.0))

    def _ensure_client(self):
        if self._client is not None:
            return self._client
        from pymodbus.client import ModbusTcpClient  # noqa: PLC0415

        self._client = ModbusTcpClient(
            self.host, port=self.port, timeout=self.timeout
        )
        return self._client

    def connect(self) -> bool:
        now = time.monotonic()
        if self.connected:
            return True
        if now - self._last_connect < self._reconnect_every:
            return False
        self._last_connect = now
        try:
            client = self._ensure_client()
            ok = client.connect()
            if ok:
                log.info("Modbus connected to LOGO! %s:%s", self.host, self.port)
            else:
                log.warning("Modbus connect failed to %s", self.host)
            return ok
        except Exception as exc:  # noqa: BLE001
            log.error("Modbus connect error: %s", exc)
            return False

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.connected

    def _reg(self, name: str) -> dict:
        try:
            return self.registers[name]
        except KeyError as exc:  # pragma: no cover
            raise PlcError(f"register '{name}' not in gate.registers config") from exc

    def read_bit(self, kind: str, address: int) -> bool:
        if not self.connect():
            raise PlcError("LOGO! unreachable")
        client = self._ensure_client()
        if kind == "discrete":
            rr = client.read_discrete_inputs(address=address, count=1, slave=self.unit)
        else:  # coil
            rr = client.read_coils(address=address, count=1, slave=self.unit)
        if rr is None or rr.isError() or not getattr(rr, "bits", None):
            raise PlcError(f"read {kind}@{address} failed: {rr}")
        return bool(rr.bits[0])

    def read_reg(self, name: str) -> bool:
        r = self._reg(name)
        return self.read_bit(str(r.get("kind", "coil")), int(r["address"]))

    def write_coil(self, address: int, value: bool, **extra: bool) -> Any:
        if not self.connect():
            raise PlcError("LOGO! unreachable")
        client = self._ensure_client()
        wr = client.write_coil(address=address, value=value, slave=self.unit)
        if wr is None or wr.isError():
            raise PlcError(f"write coil@{address}={value} failed: {wr}")
        return wr

    def set_open(self, value: bool) -> None:
        r = self._reg("open")
        try:
            self.write_coil(int(r["address"]), bool(value))
            log.debug("set open coil -> %s", value)
        except PlcError as exc:
            log.error("cannot set gate coil: %s", exc)

    def snapshot(self) -> dict[str, bool]:
        out: dict[str, bool] = {}
        for name in ("loop1", "loop2", "gateOpenSensor"):
            try:
                out[name] = self.read_reg(name)
            except PlcError:
                out[name] = False
        return out


class SimulatedPlc(PlcBase):
    """Software LOGO! for the bench/demo — same register semantics.

    Exposes ``simulate_*`` so tests and `cli.py demo` can drive loop detectors
    and watch the barrier state (``simulated_open``) react.
    """

    def __init__(self, cfg: Cfg):
        self.registers: dict[str, dict] = cfg.gate["registers"]
        self.sim = {"loop1": False, "loop2": False, "gateOpenSensor": False}
        self.open = False  # Q1 coil state
        self.connected_flag = True

    def connect(self) -> bool:
        self.connected_flag = True
        return True

    @property
    def connected(self) -> bool:
        return self.connected_flag

    def read_bit(self, kind: str, address: int) -> bool:
        reverse = {r["address"]: name for name, r in self.registers.items()}
        if address == self._addr("open"):
            return self.open
        for name, val in self.sim.items():
            r = self.registers.get(name, {})
            if r.get("kind") == kind and r.get("address") == address:
                return val
        _ = reverse  # keep reference
        return False

    def _addr(self, name: str) -> int:
        return int(self.registers[name]["address"])

    def read_reg(self, name: str) -> bool:
        if name == "open":
            return self.open
        return self.sim.get(name, False)

    def write_coil(self, address: int, value: bool, **extra: bool) -> Any:
        if address == self._addr("open"):
            self.open = bool(value)
            # demo auto-close: when barrier lowers, clear the open-limit sensor
            if not self.open:
                self.sim["gateOpenSensor"] = False
        return True

    def set_open(self, value: bool) -> None:
        self.write_coil(self._addr("open"), bool(value))

    # ---- bench controls -------------------------------------------------- #
    def simulate_loop1(self, on: bool) -> None:
        self.sim["loop1"] = on

    def simulate_loop2(self, on: bool) -> None:
        self.sim["loop2"] = on

    def simulate_gate_sensor(self, on: bool) -> None:
        self.sim["gateOpenSensor"] = on

    def snapshot(self) -> dict[str, bool]:
        return {**self.sim, "open": self.open}


def make_plc(cfg: Cfg, enabled: bool | None = None) -> PlcBase:
    use = cfg.gate.get("enabled") if enabled is None else enabled
    if not use:
        plc = SimulatedPlc(cfg)
        log.info("gate.plc -> SimulatedPlc (gate.enabled=false)")
        return plc
    try:
        return ModbusPlc(cfg)
    except Exception as exc:  # noqa: BLE001
        log.error("failed to build Modbus client: %s", exc)
        return SimulatedPlc(cfg)