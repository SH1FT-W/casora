"""KI-Update-Prüfung bekommt Casoras Release-Notes mit (release_notes.notes_for_ai)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "custom_components", "casora"))
import release_notes as rn  # noqa: E402

RELS = [
    {"tag_name": "v1.0.7", "body": "- **Neu** sieben\n\n<details><summary>Deutsch</summary>\n\n- **Neu** sieben DE\n\n</details>"},
    {"tag_name": "v1.0.6", "body": "- sechs"},
    {"tag_name": "v1.0.5", "body": "- fünf"},
    {"tag_name": "v1.0.8", "body": "", "draft": True},
    {"tag_name": "karten-2026", "body": "- Karte"},
]


def test_nur_neuere_aelteste_zuerst():
    out = rn.notes_for_ai(RELS, "1.0.5", "de")
    assert out == "## 1.0.6\n- sechs\n\n## 1.0.7\n- **Neu** sieben DE"


def test_englisch_und_nichts_neues():
    assert "sieben DE" not in rn.notes_for_ai(RELS, "1.0.6", "en")
    assert rn.notes_for_ai(RELS, "1.0.7", "de") == ""


def test_limit_behaelt_neueste():
    out = rn.notes_for_ai(RELS, "1.0.4", "en", limit=30)
    assert out.startswith("## 1.0.7") and "fünf" not in out


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
