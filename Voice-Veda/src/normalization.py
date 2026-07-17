"""Unicode-aware normalization used only for round-trip ASR scoring."""

from __future__ import annotations

import re
import unicodedata


ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
ARABIC_DIACRITICS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")


def normalize_for_wer(text: str, language: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    if language == "ar":
        text = ARABIC_DIACRITICS.sub("", text).replace("ـ", "").translate(ARABIC_DIGITS)
    if language == "en":
        text = text.lower()
    # Unicode categories L, M, and N retain Arabic letters and Devanagari matras/Nukta.
    text = "".join(char if unicodedata.category(char)[0] in {"L", "M", "N"} else " " for char in text)
    return re.sub(r"\s+", " ", text).strip()

