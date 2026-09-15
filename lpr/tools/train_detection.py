#!/usr/bin/env python3
"""Fine-tune a YOLOv8n/s/m detector on an Egypt plate dataset.

Usage
-----
  python tools/train_detection.py --data data/synthetic/dataset.yaml \
      --weights yolov8n.pt --epochs 50 --device 0

Produces a best checkpoint in ``models/train/detect/``.
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", required=True, help="dataset.yaml (ultralytics format)")
    p.add_argument("--weights", default="yolov8n.pt", help="pretrained base weight (default yolov8n.pt)")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--device", default="0", help="cuda device index, 'cpu', or 'mps'")
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--project", default="models/train")
    p.add_argument("--name", default="detect")
    args = p.parse_args(argv)

    try:
        from ultralytics import YOLO  # noqa: PLC0415
    except ImportError as exc:
        raise SystemExit(f"ultralytics not installed: {exc}") from exc

    model = YOLO(args.weights)
    results = model.train(
        data=str(Path(args.data).resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        device=args.device,
        batch=args.batch,
        project=args.project,
        name=args.name,
        patience=20,
        workers=4,
        exist_ok=True,
    )
    print("training complete — best model at:", results.save_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())