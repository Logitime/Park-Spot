# Training data plan

High accuracy on Egyptian plates requires both a **plate detector** (YOLO) and
a **character classifier** (CNN).  This service ships with a synthetic-data
generator and a fine-tuning pipeline; you add real photos for generalization.

## 1. Synthetic base (already works, zero dependencies)

```
python tools/generate_synthetic.py --out data/synthetic --count 100000
```

Produces:

- `images/` + `labels/` — whole-plate images with YOLO detection labels
  (class `0` = plate) for detector pre-training/fine-tuning;
- `ocr/images/` + `ocr/labels/` — 28×28 per-character crops + integer class
  index (0..27 letters, 28..37 digits) for the CNN head;
- `dataset.yaml` — ready for `train_detection.py`;
- `ocr_train/char_list.txt` — the ordered class list consumed by
  `train_ocr.py` (must equal `lpr/ocr/charset.CLASS_CHARS`).

**Known limitation:** synthetic plates are clean & axis-aligned.  Use `--count`
large and rely on the augmentations (rotation, noise, blur) baked in; then
**fine-tune on real photos** (next section) to close the domain gap.

## 2. Real data (required for production accuracy)

Collect 2–5 minutes of gate video per plate at your site (day & night), or
collect phone/DSLR photos of Egyptian plates.  Target **≥ 30k plate instances**
and **≥ 3k instances per character class** for a robust classifier.

Public datasets to bootstrap (verify licenses before commercial use):

- Egyptian plate datasets published on Kaggle **("egyptian license plate",
  "ALPR egypt", "Egypt car plates")**.
- ARD / Arabic license plate recognition benchmarks.
- Any Middle-East plate set (UAE/Saudi) transfers partially for the Latin-style
  digits and plate geometry, but Arabic letters differ — always re-train the
  letter classes on Egyptian data.

## 3. Data pipeline for real images

1. Put labelled images under `data/real/{images,labels}` in YOLO format
   (class `0` = plate; optionally class `1` = vehicle for region filtering).
2. Detection fine-tune: `tools/train_detection.py --data data/real/dataset.yaml`
3. Crop plate regions → per-character crops using `lpr.ocr.preprocess.segment_plate`,
   label them manually or with a weak OCR, then
   `tools/train_ocr.py --data <char-dir>`.

## 4. Augmentation recommendations (albumentations)

- `Perspective(scale=(0.02,0.06))` — gate-camera skew
- `MotionBlur(blur_limit=(3,9))` (driving at gate)
- `RandomBrightnessContrast`, `CLAHE`
- `HueSaturationValue` (ambient/lighting)
- `HorizontalFlip` for mirrored parking-board prototypes (turn off for plates —
  mirroring breaks Arabic glyph direction!)

Keep class balance for `س` vs `ص`, `ح` vs `ج`, `ت` vs `ط`, `0` vs `O` (Arabic
doesn't use Latin O, but 0/O confusion appears in digit-vs-letter).

## Output models

- `models/egypt_plate_yolov8n.pt` / `.onnx` — detector (class 0 plate).
- `models/egypt_char_cnn.onnx` — 38-way character CNN (28×28 grayscale).