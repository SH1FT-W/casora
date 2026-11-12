"""Phone idle words match the dashboard in every shipped language, without HA."""
import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class IdleWordsTest(unittest.TestCase):
    def test_phone_idle_matches_dashboard(self):
        tree = ast.parse((ROOT / "custom_components/casora/live_activity.py").read_text())
        words = next(ast.literal_eval(node.value) for node in tree.body
                     if isinstance(node, (ast.Assign, ast.AnnAssign))
                     and isinstance(node.value, ast.Dict)
                     and any(isinstance(key, ast.Constant) and key.value == "idle" and isinstance(value, ast.Tuple)
                             for key, value in zip(node.value.keys, node.value.values)))
        expected = ("Inaktiv", "Inactive", "Inactivo", "Inactif", "Inattivo", "Inactief", "Nieakt.", "Inativo", "Inaktiv")
        self.assertEqual(words["idle"], expected)
        for index, lang in enumerate(("de", "en", "es", "fr", "it", "nl", "pl", "pt", "nb")):
            with self.subTest(language=lang):
                for store in ("translations/dashboard/phrases", "scripts/i18n"):
                    path = ROOT / "custom_components/casora" / store / f"{lang}.json"
                    if path.exists():
                        phrases = json.loads(path.read_text())["exact"]
                        self.assertEqual(words["idle"][index], phrases.get("Inaktiv", "Inaktiv" if lang == "de" else None))


if __name__ == "__main__":
    unittest.main()
