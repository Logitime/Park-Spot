"""Egyptian plate grammar + OCR post-processing.

Grammar (private / transport, the platform's primary class):

    [1-3 Arabic letters] [1-4 Western digits]          e.g.  س صد 1234
    XML variant: [Arabic letters] [Arabic-Indic digits] on older plates.

We keep the canonical storage form as bare letters+digits, e.g. "سصد1234".
Specific fleets (taxi "أجرة", transit) use 2 letters + 3-4 digits — covered
by the same validator.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import charset


@dataclass
class PlateResult:
    text: str            # canonical: letters+digits, e.g. "س صد1234" -> "سصد1234"
    letters: str
    digits: str
    confidence: float    # mean per-character confidence
    valid: bool
    reason: str = ""

    @property
    def latin(self) -> str:
        """Transliteration used as the Latin search term against the API."""
        return charset.transliterate(self.letters) + self.digits


ARABIC_LETTER = re.compile(r"[أ-ي]")
DIGIT = re.compile(r"[0-9]")


def validate(text: str) -> tuple[bool, str, str]:
    """Return (ok, letters, digits) for a candidate plate string."""
    text = charset.to_western_digits(text).replace(" ", "").strip()
    letters: list[str] = []
    digits: list[str] = []
    seen_digit = False
    for ch in text:
        if ARABIC_LETTER.match(ch):
            if seen_digit:
                # letters after digits — invalid for standard plates
                continue
            letters.append(ch)
        elif DIGIT.match(ch):
            seen_digit = True
            digits.append(ch)
        else:
            continue
    if not (1 <= len(letters) <= 3):
        return False, "".join(letters), "".join(digits)
    if not (1 <= len(digits) <= 4):
        return False, "".join(letters), "".join(digits)
    return True, "".join(letters), "".join(digits)


def parse_result(index_predictions: list[tuple[str, float]]) -> PlateResult:
    """Assemble per-character class labels into a validated PlateResult.

    ``index_predictions`` is an ordered list of (class_char, confidence) as a
    left→right scan of the plate crop.
    """
    if not index_predictions:
        return PlateResult("", "", 0.0, False, "no characters read")

    letters: list[str] = []
    digits: list[str] = []
    for ch, conf in index_predictions:
        if ch in charset.DIGITS_WEST:
            digits.append(ch)
        elif ch in charset.LETTERS:
            letters.append(ch)

    text = "".join(letters) + "".join(digits)
    confs = [c for _c, c in index_predictions]
    mean_conf = sum(confs) / len(confs)
    valid, _l, _d = validate(text)
    reason = "" if valid else "letters/digits outside grammar"
    return PlateResult(text, "".join(letters), "".join(digits), mean_conf, valid, reason)