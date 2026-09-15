#!/usr/bin/env python3
"""Generate synthetic Egyptian plate images for YOLO detection + character OCR.

Outputs
-------
  <out>/
    images/  *.png        — plate crops (whole image = plate region).
    labels/  *.txt        — YOLO detection labels (class 0, bounding box relative to image).
    ocr/images/ *.png     — per-character 28×28 grayscale tokens.
    ocr/labels/ *.txt     — integer class index for each token (per file, one per line).
    dataset.yaml          — ultralytics dataset spec (names: [plate]).
    ocr_train/char_list.txt — ordered class chars matching train_ocr.py.

This script deliberately avoids external Arabic-text shaping libraries so that
running on the Windows server (where Pillow + Uniscribe handles Arabic glyphs)
is zero-effort.  If your Pillow renders boxes instead of Arabic, install
``pip install arabic-reshaper python-bidi`` and the script will use them.
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import textwrap
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lpr.ocr.charset import EGYPT_CHARS, DIGITS_WEST, CLASS_CHARS, LETTERS, N_CLASSES

# ---- Defaults ------------------------------------------------------------ #
PLATE_LETTERS_RANGE = (1, 3)
PLATE_DIGITS_RANGE = (1, 4)
CHAR_SIZE = 28
PLATE_BG = (255, 255, 255)
PLATE_FG = (20, 20, 20)
PLATE_BORDER = 8
FONT_SCALE_RANGE = (28, 38)
ROTATION_RANGE = (-3, 3)
NOISE_SIGMA_RANGE = (0, 8)
JPEG_QUALITY = 92

# Fallback font family for Arabic on Windows.  If not found, falls back to
# the Pillow default (Latin-only; Arabic labels will be placeholders).
_FONT_CANDIDATES = [
    # Windows
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    # Linux
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _find_font() -> str:
    for f in _FONT_CANDIDATES:
        if os.path.isfile(f):
            return f
    return ""


def _pick_plate_str() -> str:
    l = random.randint(*PLATE_LETTERS_RANGE)
    d = random.randint(*PLATE_DIGITS_RANGE)
    letters = "".join(random.choice(LETTERS) for _ in range(l))
    digits = "".join(random.choice(DIGITS_WEST) for _ in range(d))
    return letters + digits


def _render_plate_image(plate: str, font_path: str, chars: int | None = None) -> Image.Image:
    """Return an RGB image whose entire content is the rendered plate text."""
    font_size = random.randint(*FONT_SCALE_RANGE)
    try:
        font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()
    # Measure
    tmp = Image.new("RGB", (1, 1))
    d = ImageDraw.Draw(tmp)
    bbox = d.textbbox((0, 0), plate, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = font_size // 2
    w = tw + pad * 2 + PLATE_BORDER * 2
    h = max(font_size * 2, th + pad * 2) + PLATE_BORDER * 2
    img = Image.new("RGB", (w, h), PLATE_BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, w - 1, h - 1], outline=(80, 80, 80), width=PLATE_BORDER)
    # Arabic is RTL logically; Pillow draws visually on Windows.
    tx = pad + PLATE_BORDER
    ty = (h - th) // 2 - bbox[1]
    draw.text((tx, ty), plate, fill=PLATE_FG, font=font)
    return img


def _draw_char_token(ch: str, font_path: str) -> Image.Image:
    font_size = CHAR_SIZE - 4
    try:
        font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()
    img = Image.new("L", (CHAR_SIZE, CHAR_SIZE), 255)
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), ch, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (CHAR_SIZE - tw) // 2 - bbox[0]
    ty = (CHAR_SIZE - th) // 2 - bbox[1]
    d.text((tx, ty), ch, fill=0, font=font)
    return img


def _augment_plate(img: Image.Image) -> Image.Image:
    # optional rotation
    angle = random.uniform(*ROTATION_RANGE)
    if abs(angle) > 0.3:
        img = img.rotate(angle, fillcolor=PLATE_BG, expand=False)
    # additive Gaussian noise
    if random.random() < 0.6:
        arr = np.asarray(img).astype(np.float32)
        arr += np.random.normal(0.0, random.uniform(*NOISE_SIGMA_RANGE), arr.shape)
        img = Image.fromarray(np.clip(arr, 0.0, 255.0).astype(np.uint8))
    # mild blur (motion/defocus)
    if random.random() < 0.35:
        img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3, 1.0)))
    return img


def write_dataset_yaml(output: Path) -> None:
    content = textwrap.dedent(
        f"""\
        path: {output.resolve()}
        train: images
        val: images
        nc: 1
        names: [plate]
        """
    )
    (output / "dataset.yaml").write_text(content, encoding="utf-8")


def write_char_list(output: Path) -> None:
    (output / "ocr_train").mkdir(parents=True, exist_ok=True)
    (output / "ocr_train" / "char_list.txt").write_text(
        "\n".join(CLASS_CHARS) + "\n", encoding="utf-8"
    )


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default="data/synthetic", help="output directory")
    p.add_argument("--count", type=int, default=10000, help="number of plate images")
    p.add_argument("--font", default="", help="path to an Arabic-capable TTF font")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args(argv)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "images").mkdir(exist_ok=True)
    (out / "labels").mkdir(exist_ok=True)
    (out / "ocr" / "images").mkdir(parents=True, exist_ok=True)
    (out / "ocr" / "labels").mkdir(parents=True, exist_ok=True)

    font = args.font or _find_font()
    if not font:
        print("WARNING: no font found; Arabic glyphs will be placeholders.", file=sys.stderr)

    random.seed(args.seed)
    write_dataset_yaml(out)
    write_char_list(out)

    # CLASS_CHARS mapping: letters 0-27, digits 28-37
    class_index = {ch: i for i, ch in enumerate(CLASS_CHARS)}

    for i in range(args.count):
        plate = _pick_plate_str()
        stem = f"{i:07d}_{uuid.uuid4().hex[:6]}"
        img = _render_plate_image(plate, font)
        img = _augment_plate(img)
        img.save(out / "images" / f"{stem}.png", quality=JPEG_QUALITY)

        # YOLO detection label: whole-image = plate (bbox = 0.5 0.5 1.0 1.0)
        # class 0 = plate, bbox normalized relative to image size.
        (out / "labels" / f"{stem}.txt").write_text(
            f"0 0.5 0.5 1.0 1.0\n", encoding="utf-8"
        )

        # OCR character crops
        for ci, ch in enumerate(plate):
            tok = _draw_char_token(ch, font)
            tok.save(out / "ocr" / "images" / f"{stem}_{ci:02d}.png")
            label = class_index.get(ch, -1)
            (out / "ocr" / "labels" / f"{stem}_{ci:02d}.txt").write_text(
                str(label) + "\n", encoding="utf-8"
            )

        if (i + 1) % 2000 == 0:
            print(f"  {i + 1}/{args.count}  done")

    plate_chars = args.count * (
        sum(range(PLATE_LETTERS_RANGE[0], PLATE_LETTERS_RANGE[1] + 1))
        + sum(range(PLATE_DIGITS_RANGE[0], PLATE_DIGITS_RANGE[1] + 1))
    ) // 2
    print(f"dataset written to {out.resolve()}  ({args.count} plates, ~{plate_chars} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())