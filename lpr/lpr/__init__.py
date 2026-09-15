#!/usr/bin/env python3
"""ParkSpot LPR + gate service."

Camera capture (RTSP/USB) -> YOLO plate detection -> Egyptian plate OCR ->
match against ParkSpot bookings -> Siemens LOGO! gate control over Modbus TCP.
"""

__version__ = "0.1.0"