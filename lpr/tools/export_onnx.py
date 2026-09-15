#!/usr/bin/env python3
"""Export a YOLO checkpoint to ONNX (with FP16 option).

Usage:
  python tools/export_onnx.py --weights models/egypt_plate_yolov8n.pt --imgsz 640
  # -> models/egypt_plate_yolov8n.onnx (dynamic batch)
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--weights", required=True)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--half", action="store_true", help="FP16 (TensorRT/GPU only)")
    p.add_argument("--simplify", action="store_true", help="apply onnx-simplifier")
    args = p.parse_args(argv)

    try:
        from ultralytics import YOLO  # noqa: PLC0415
    except ImportError as exc:
        raise SystemExit(f"ultralytics not installed: {exc}") from exc

    model = YOLO(args.weights)
    out = model.export(
        format="onnx",
        imgsz=args.imgsz,
        half=args.half,
        dynamic=True,
        simplify=args.simplify,
    )
    print("exported:", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())