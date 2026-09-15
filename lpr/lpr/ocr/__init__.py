from .charset import (
    CLASS_CHARS,
    DIGITS_INDIC,
    DIGITS_WEST,
    EGYPT_CHARS,
    INDEX_TO_LABEL,
    LABEL_TO_INDEX,
    LETTERS,
    N_CLASSES,
    TRANSLIT,
    index_of,
    to_western_digits,
    transliterate,
)
from .egypt import PlateResult, parse_result, validate
from .engine import DemoOcr, EgyptPlateOcr, OcrError, make_ocr

__all__ = [
    "CLASS_CHARS",
    "DIGITS_INDIC",
    "DIGITS_WEST",
    "EGYPT_CHARS",
    "INDEX_TO_LABEL",
    "LABEL_TO_INDEX",
    "LETTERS",
    "N_CLASSES",
    "TRANSLIT",
    "index_of",
    "to_western_digits",
    "transliterate",
    "PlateResult",
    "parse_result",
    "validate",
    "DemoOcr",
    "EgyptPlateOcr",
    "OcrError",
    "make_ocr",
]