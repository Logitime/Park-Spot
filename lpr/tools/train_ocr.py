#!/usr/bin/env python3
"""Train the per-character CNN (28×28 grayscale → 38 Egypt-plate classes) and export to ONNX.

Usage
-----
  python tools/train_ocr.py --data data/synthetic/ocr \
      --epochs 30 --device cuda --out models/egypt_char_cnn.onnx

Expected ``--data`` layout (produced by ``generate_synthetic.py``):

  <data>/
    images/  *.png     — 28×28 grayscale character crops
    labels/  *.txt     — one integer class index per file (0..37)
    char_list.txt      — one char per line, length 38
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import numpy as np


# --------------------------------------------------------------------------- #
# Model
# --------------------------------------------------------------------------- #
def _build_model(n_classes: int):
    import torch  # noqa: PLC0415
    import torch.nn as nn  # noqa: PLC0415

    class CharNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.features = nn.Sequential(
                nn.Conv2d(1, 32, 3, padding=1),
                nn.BatchNorm2d(32),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
                nn.Conv2d(32, 64, 3, padding=1),
                nn.BatchNorm2d(64),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
                nn.Conv2d(64, 128, 3, padding=1),
                nn.BatchNorm2d(128),
                nn.ReLU(inplace=True),
                nn.AdaptiveAvgPool2d((3, 3)),
            )
            self.head = nn.Sequential(
                nn.Linear(128 * 3 * 3, 256),
                nn.ReLU(inplace=True),
                nn.Dropout(0.3),
                nn.Linear(256, n_classes),
            )

        def forward(self, x):
            x = self.features(x)
            x = x.view(x.size(0), -1)
            return self.head(x)

    return CharNet()


# --------------------------------------------------------------------------- #
# Dataset
# --------------------------------------------------------------------------- #
def _load_dataset(data_dir: Path, class_chars: list[str]):
    import torch  # noqa: PLC0415
    from torchvision import transforms  # noqa: PLC0415

    img_dir = data_dir / "images"
    lbl_dir = data_dir / "labels"
    to_tensor = transforms.ToTensor()
    images, labels = [], []
    for p in sorted(img_dir.glob("*.png")):
        try:
            from PIL import Image  # noqa: PLC0415

            img = Image.open(p).convert("L")
            label_path = lbl_dir / f"{p.stem}.txt"
            label = int(label_path.read_text().strip().split()[0])
            if label < 0 or label >= len(class_chars):
                continue
            images.append(to_tensor(img))  # (1,28,28)
            labels.append(label)
        except Exception:  # noqa: BLE001
            continue
    if not images:
        raise SystemExit(f"no training samples found in {data_dir}")
    X = torch.stack(images, dim=0)
    y = torch.tensor(labels, dtype=torch.long)
    return X, y


# --------------------------------------------------------------------------- #
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", required=True, help="ocr dataset dir (contains images/ labels/)")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=128)
    p.add_argument("--lr", type=float, default=2e-3)
    p.add_argument("--device", default="cuda" if _cuda_available() else "cpu")
    p.add_argument("--out", default="models/egypt_char_cnn.onnx")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args(argv)

    import torch  # noqa: PLC0415
    import torch.nn as nn  # noqa: PLC0415
    from torch.utils.data import TensorDataset, DataLoader  # noqa: PLC0415

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    data_dir = Path(args.data)
    char_list = (data_dir / "char_list.txt").read_text(encoding="utf-8").strip().split("\n")
    n_classes = len(char_list)
    print(f"classes: {n_classes}  chars: {''.join(char_list)}")

    X, y = _load_dataset(data_dir, char_list)
    n = len(X)
    n_val = min(n // 10, 5000)
    perm = torch.randperm(n)
    X_train, y_train = X[perm[n_val:]], y[perm[n_val:]]
    X_val, y_val = X[perm[:n_val]], y[perm[:n_val]]
    print(f"train={len(X_train)}  val={n_val}")

    device = torch.device(args.device)
    model = _build_model(n_classes).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    crit = nn.CrossEntropyLoss()
    ds_train = TensorDataset(X_train, y_train)
    dl = DataLoader(ds_train, batch_size=args.batch, shuffle=True, num_workers=0)

    best_acc = 0.0
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        model.train()
        for xb, yb in dl:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            loss = crit(model(xb), yb)
            loss.backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            val_acc = (model(X_val.to(device)).argmax(1) == y_val.to(device)).float().mean().item()
        print(f"epoch {epoch:03d}  val_acc={val_acc:.4f}")
        if val_acc >= best_acc:
            best_acc = val_acc
            _export_onnx(model, out_path, n_classes)

    print(f"done — best val_acc={best_acc:.4f}  saved to {out_path}")
    return 0


def _export_onnx(model, out: Path, n_classes: int) -> None:
    import torch  # noqa: PLC0415

    model.eval()
    dummy = torch.randn(1, 1, 28, 28)
    torch.onnx.export(
        model,
        dummy,
        str(out),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=14,
    )


def _cuda_available() -> bool:  # noqa: PLC0415
    try:
        import torch  # noqa: PLC0415

        return torch.cuda.is_available()
    except Exception:
        return False


if __name__ == "__main__":
    raise SystemExit(main())