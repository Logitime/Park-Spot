/**
 * Minimal raw Modbus TCP client (no external deps).
 *
 * Used by the admin gate-settings page to diagnose PLC connectivity
 * and manually toggle the barrier — no pymodbus required in the Next.js
 * server process.
 */

import net from "net";

let _txId = 0;
function nextTxId(): number {
  _txId = (_txId + 1) & 0xffff;
  return _txId;
}

function sendRecv(
  host: string,
  port: number,
  unit: number,
  payload: Buffer,
  timeoutMs = 3000,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    const chunks: Buffer[] = [];
    let destroyed = false;

    sock.setTimeout(timeoutMs);
    sock.connect(port, host, () => {
      // Modbus TCP MBAP header + payload
      const txId = nextTxId();
      const header = Buffer.alloc(6);
      header.writeUInt16BE(txId, 0);
      header.writeUInt16BE(0, 2); // protocol id
      header.writeUInt16BE(payload.length + 1, 4); // length (unit + payload)
      const frame = Buffer.concat([header, Buffer.from([unit]), payload]);
      sock.write(frame);
    });

    sock.on("data", (chunk) => chunks.push(chunk));

    sock.on("end", () => {
      if (destroyed) return;
      clearTimeout(timer);
      const resp = Buffer.concat(chunks);
      if (resp.length < 9) {
        return reject(new Error("modbus: short response"));
      }
      const errCode = resp[7];
      if (errCode & 0x80) {
        return reject(new Error(`modbus: exception 0x${errCode.toString(16)}`));
      }
      // strip MBAP header (6 bytes) + unit (1 byte)
      resolve(resp.slice(7));
    });

    sock.on("timeout", () => {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      sock.destroy();
      reject(new Error("modbus: timeout"));
    });

    sock.on("error", (err) => {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      reject(new Error(`modbus: ${err.message}`));
    });

    const timer = setTimeout(() => {
      if (destroyed) return;
      destroyed = true;
      sock.destroy();
      reject(new Error("modbus: timeout"));
    }, timeoutMs);
  });
}

/**
 * FC 0x02 — Read Discrete Inputs (bit-level, read-only inputs I1…In).
 * Returns a boolean array of length `count`.
 */
export async function readDiscreteInputs(
  host: string,
  port: number,
  unit: number,
  address: number,
  count: number,
  timeoutMs = 3000,
): Promise<boolean[]> {
  const req = Buffer.alloc(5);
  req[0] = 0x02;
  req.writeUInt16BE(address, 1);
  req.writeUInt16BE(count, 3);

  const resp = await sendRecv(host, port, unit, req, timeoutMs);
  const bits: boolean[] = [];
  for (let i = 0; i < count; i++) {
    bits.push(!!(resp[3 + Math.floor(i / 8)] & (1 << (i % 8))));
  }
  return bits;
}

/**
 * FC 0x01 — Read Coils (bit-level, read/write outputs Q1…Qn).
 * Returns a boolean array of length `count`.
 */
export async function readCoils(
  host: string,
  port: number,
  unit: number,
  address: number,
  count: number,
  timeoutMs = 3000,
): Promise<boolean[]> {
  const req = Buffer.alloc(5);
  req[0] = 0x01;
  req.writeUInt16BE(address, 1);
  req.writeUInt16BE(count, 3);

  const resp = await sendRecv(host, port, unit, req, timeoutMs);
  const bits: boolean[] = [];
  for (let i = 0; i < count; i++) {
    bits.push(!!(resp[3 + Math.floor(i / 8)] & (1 << (i % 8))));
  }
  return bits;
}

/**
 * FC 0x05 — Write Single Coil.
 * `value=true` → 0xFF00, `value=false` → 0x0000.
 */
export async function writeSingleCoil(
  host: string,
  port: number,
  unit: number,
  address: number,
  value: boolean,
  timeoutMs = 3000,
): Promise<void> {
  const req = Buffer.alloc(5);
  req[0] = 0x05;
  req.writeUInt16BE(address, 1);
  req.writeUInt16BE(value ? 0xff00 : 0x0000, 3);
  await sendRecv(host, port, unit, req, timeoutMs);
}

/**
 * Helper: read all three gate discrete inputs (loop1, loop2, gateOpenSensor)
 * from a PLC register map like {"loop1":{"kind":"discrete","address":0},...}.
 */
export async function readGateInputs(
  host: string,
  port: number,
  unit: number,
  registers: Record<string, { kind: string; address: number }>,
  timeoutMs = 3000,
): Promise<Record<string, boolean>> {
  const discreteAddrs = Object.entries(registers)
    .filter(([, r]) => r.kind === "discrete")
    .map(([, r]) => r.address);

  const coilAddrs = Object.entries(registers)
    .filter(([, r]) => r.kind === "coil")
    .map(([, r]) => r.address);

  const maxDiscrete = discreteAddrs.length > 0 ? Math.max(...discreteAddrs) : -1;
  const maxCoil = coilAddrs.length > 0 ? Math.max(...coilAddrs) : -1;

  const [discretes, coils] = await Promise.all([
    maxDiscrete >= 0
      ? readDiscreteInputs(host, port, unit, 0, maxDiscrete + 1, timeoutMs)
      : Promise.resolve([] as boolean[]),
    maxCoil >= 0
      ? readCoils(host, port, unit, 0, maxCoil + 1, timeoutMs)
      : Promise.resolve([] as boolean[]),
  ]);

  const result: Record<string, boolean> = {};
  for (const [name, reg] of Object.entries(registers)) {
    if (reg.kind === "discrete") {
      result[name] = discretes[reg.address] ?? false;
    } else {
      result[name] = coils[reg.address] ?? false;
    }
  }
  return result;
}
