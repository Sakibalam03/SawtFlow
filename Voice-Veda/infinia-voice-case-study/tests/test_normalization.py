from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from normalization import normalize_for_wer


def test_english_punctuation_and_case():
    assert normalize_for_wer("Hello, WORLD!", "en") == "hello world"


def test_arabic_diacritics_tatweel_and_digits():
    assert normalize_for_wer("السَّلام ــ ٢٠٢٦", "ar") == "السلام 2026"


def test_hindi_marks_are_preserved():
    assert normalize_for_wer("कृपया फ़ाइल जाँचें।", "hi") == "कृपया फ़ाइल जाँचें"

