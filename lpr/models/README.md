# detection
# - Place your fine-tuned YOLO checkpoint(s) here.
#
#   YOLOv8n/s/m  ->  e.g. `egypt_plate_yolov8n.pt`
#   ONNX export  ->  `egypt_plate_yolov8n.onnx`  (see tools/export_onnx.py)
#
# Point `detection.model` in config.yaml at the checkpoint path (relative to
# this repo root or absolute).
#
# Download a base model from the Ultralytics release page, e.g.:
#   wget https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt
# Then fine-tune with tools/train_detection.py on the Egypt plate dataset
# (see data/README.md). The class map expected is: 0 = plate, 1 = vehicle.

# Placeholder file — real checkpoints are NOT committed to the repository.