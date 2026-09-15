"""Egyptian plate character set and transliteration table.

Egyptian private/transport plates use the Arabic block (28 letters) plus
Western digits. Some older plates use Arabic-Indic digits (٠-٩) — we map both
digit forms to a single class set.
"""

from __future__ import annotations

# Latin transliterations chosen for ONE-TO-ONE matching against plates users
# type in the ParkSpot web/mobile app. Collisions (س/ص = S) are fine for
# matching because the transliteration is only used to *query* the API for an
# existing booking that a user typed in Latin.
# Exactly 28 letters (the standard printed Egyptian plate alphabet; ا without
# hamza) so class indices stay 0..27 letters / 28..37 digits (38 classes).
EGYPT_CHARS: str = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"

TRANSLIT: dict[str, str] = {
    "ا": "A",
    "ب": "B", "ت": "T", "ث": "TH",
    "ج": "G", "ح": "H", "خ": "KH",
    "د": "D", "ذ": "DH", "ر": "R", "ز": "Z",
    "س": "S", "ش": "SH",
    "ص": "S", "ض": "DH",
    "ط": "T", "ظ": "DH",
    "ع": "A", "غ": "GH",
    "ف": "F", "ق": "Q", "ك": "K",
    "ل": "L", "م": "M", "ن": "N",
    "ه": "H", "و": "W", "ي": "Y",
}

LETTERS: list[str] = list(EGYPT_CHARS)
DIGITS_WEST: list[str] = list("0123456789")
DIGITS_INDIC: list[str] = list("٠١٢٣٤٥٦٧٨٩")
INDIC_TO_WEST = dict(zip(DIGITS_INDIC, DIGITS_WEST))

# Class index layout for the OCR head: [0..27] letters, [28..37] digits.
LETTER_OFFSET = 0
DIGIT_OFFSET = len(LETTERS)
CLASS_CHARS: list[str] = LETTERS + DIGITS_WEST
N_CLASSES = len(CLASS_CHARS)
LABEL_TO_INDEX = {ch: i for i, ch in enumerate(CLASS_CHARS)}
INDEX_TO_LABEL = {i: ch for i, ch in enumerate(CLASS_CHARS)}

# Digits-only indices for fast filtering.
DIGIT_INDICES = set(range(DIGIT_OFFSET, DIGIT_OFFSET + 10))
LETTER_INDICES = set(range(LETTER_OFFSET, len(LETTERS)))


def to_western_digits(text: str) -> str:
    """Convert Arabic-Indic digits to Western digits in-place."""
    return "".join(INDIC_TO_WEST.get(ch, ch) for ch in text)


def index_of(ch: str) -> int:
    return LABEL_TO_INDEX.get(ch, -1)


def transliterate(letters: str) -> str:
    """Arabic letters -> Latin (best-effort), digits passed through."""
    out: list[str] = []
    for ch in letters:
        if ch in DIGITS_WEST:
            out.append(ch)
        elif ch in INDIC_TO_WEST:
            out.append(INDIC_TO_WEST[ch])
        else:
            out.append(TRANSLIT.get(ch, ""))
    return "".join(out)


def html_entities() -> str:  # pragma: no cover - docs helper
    return "".join(f"<li>{c} → {TRANSLIT.get(c,'?')}</li>" for c in LETTERS)