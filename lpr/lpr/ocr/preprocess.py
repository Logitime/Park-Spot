"""Plate-crop preprocessing and character segmentation.

Strategy for printed Egyptian plates (separate glyphs, no cursive joining):

1. Grayscale → CLAHE → resize to a canonical width (~260 px).
2. Adaptive-threshold to a binary image (text = white).
3. Morphology open to suppress noise/dots MRI.
4. Character segmentation by vertical projection with adaptive gap merging —
   Arabic letter dot-groups (e.g. س، ج) merge into their base glyph via the
   small-gap rule, and column slices become normalized 28x28 tokens.

These steps are camera-tuned for a fixed gate camera; perspective skew is
handled by ``tools/generate_synthetic.py`` during training augmentation.
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

log = logging.getLogger("lpr.ocr.preprocess")

TOKEN_SIZE = 28


def to_gray(crop: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)


def normalize_crop(crop: np.ndarray, pad: int = 4) -> np.ndarray:
    """Letter-box a crop to TOKEN_SIZE with symmetric padding."""
    if crop.size == 0:
        raise ValueError("empty crop")
    h, w = crop.shape[:2]
    scale = (TOKEN_SIZE - 2 * pad) / max(h, w, 1)
    nh, nw = max(1, round(h * scale)), max(1, round(w * scale))
    resized = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((TOKEN_SIZE, TOKEN_SIZE), np.uint8)
    x0 = (TOKEN_SIZE - nw) // 2
    y0 = (TOKEN_SIZE - nh) // 2
    canvas[y0 : y0 + nh, x0 : x0 + nw] = resized
    return canvas


def binarize(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    eq = clahe.apply(gray)
    blur = cv2.GaussianBlur(eq, (5, 5), 0)
    if np.mean(blur) > 127:  # assume dark text on light background
        _, bin_img = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    else:  # light text on dark (colour scheme plates)
        _, bin_img = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bin_img = cv2.morphologyEx(bin_img, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return bin_img


def _column_slices(bin_img: np.ndarray) -> list[tuple[int, int]]:
    col_sum = bin_img.sum(axis=0)  # text=white → high values
    active = col_sum > 0
    slices: list[tuple[int, int]] = []
    start: int | None = None
    for x, on in enumerate(active):
        if on and start is None:
            start = x
        elif not on and start is not None:
            slices.append((start, x))
            start = None
    if start is not None:
        slices.append((start, len(active)))
    return slices


def segment_chars(bin_img: np.ndarray, max_chars: int = 10) -> list[np.ndarray]:
    """Vertical-projection segmentation with gap merging.

    Returns a list of normalized 28x28 tokens, ordered left→right.
    Returns [] if segmentation fails (e.g. empty plate crop).
    """
    h, w = bin_img.shape
    if bin_img.sum() <= 100:
        return []
    slices = _column_slices(bin_img)
    if not slices:
        return []

    heights: list[int] = []
    for x1, x2 in slices:
        sub = bin_img[:, x1:x2]
        rows = sub.sum(axis=1) > 0
        if rows.any():
            heights.append(int(rows.sum()))

    med_h = int(np.median(heights)) if heights else h // 2
    gap_merge = max(2, med_h // 8)  # dots belong to their glyph

    merged: list[tuple[int, int]] = []
    for x1, x2 in slices:
        if merged and x1 - merged[-1][1] <= gap_merge:
            lx = merged[-1][0]
            merged[-1] = (lx, max(x2, merged[-1][1]))
        else:
            merged.append((x1, x2))

    # per-slice height/area filters
    tokens: list[np.ndarray] = []
    for x1, x2 in merged:
        if x2 - x1 < max(2, w // 48):
            continue
        sub = bin_img[:, x1:x2]
        rows = sub.sum(axis=1)
        r_on = np.where(rows > 0)[0]
        if not len(r_on):
            continue
        y1, y2 = int(r_on.min()), int(r_on.max()) + 1
        if y2 - y1 < max(3, h // 12):
            continue
        token = normalize_crop(sub[y1:y2, :])
        tokens.append(token)
    if len(tokens) > max_chars:
        return tokens[:max_chars]
    return tokens


def segment_plate(
    crop: np.ndarray, pad: int = 4
) -> tuple[list[np.ndarray], np.ndarray]:
    gray = to_gray(crop)
    h, w = gray.shape
    target_w = 260
    scale = target_w / max(w, 1)
    if scale != 1 and w > target_w:
        gray = cv2.resize(gray, (target_w, max(1, round(h * scale))),
                          interpolation=cv2.INTER_LINEAR)
    bin_img = binarize(gray)
    return segment_chars(bin_img), bin_img