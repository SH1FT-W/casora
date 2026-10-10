"""Vorlagen-Bündel schlank (tools/js_schlank.py): Kommentarzeilen und Einrückung weg, Bedeutung gleich.

    python3 dev/unit/vorlagen_schlank_test.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from js_schlank import schlank, schlank_wert  # noqa: E402

FAELLE = [
    ("  const a = 1;\n  // weg\n  return a;", "const a = 1;\nreturn a;"),
    ("  /* weg */\n  x();", "x();"),
    ("  /* mehr-\n     zeilig */\n  x();", "x();"),
    ("  x(); /* bleibt */", "x(); /* bleibt */"),
    ("  const s = `\n    zeile // kein Kommentar\n  `;", "const s = `\n    zeile // kein Kommentar\n  `;"),
    ("  const s = `a ${ f({\n    b: 1 }) } c\n    d`;", "const s = `a ${ f({\nb: 1 }) } c\n    d`;"),
    ("  const r = /\\/\\/[\"'`]/g;\n  // weg\n  y();", "const r = /\\/\\/[\"'`]/g;\ny();"),
    ("  const q = 'http://x' + \"//\";\n    z();", "const q = 'http://x' + \"//\";\nz();"),
    ("  const d = a / b / c;\n   e();", "const d = a / b / c;\ne();"),
    ("  return /x/.test(s)\n  ;", "return /x/.test(s)\n;"),
    ("  const t = `${a}`;\n  // c\n  f(`x\n  y`);", "const t = `${a}`;\nf(`x\n  y`);"),
    ("a\n\n  b", "a\n\nb"),
]
for src, want in FAELLE:
    got = schlank(src)
    assert got == want, (src, got, want)
assert schlank_wert("[[[\n  // c\n  return 1;\n]]]") == "[[[\nreturn 1;\n]]]"
assert schlank_wert("kein [[[ ]]] Ausdruck am Rand x") == "kein [[[ ]]] Ausdruck am Rand x"

# Ganzes Bündel: jeder Ausdruck bleibt gültiges JS (Node prüft beide Fassungen) und wird kürzer.
src = json.load(open(os.path.join(ROOT, "dashboards/casora/button_card_templates.json"), encoding="utf-8"))
paare = []
def walk(o):
    if isinstance(o, dict):
        for x in o.values(): walk(x)
    elif isinstance(o, list):
        for x in o: walk(x)
    elif isinstance(o, str):
        t = o.strip()
        if t.startswith("[[[") and t.endswith("]]]"):
            paare.append((o, schlank_wert(o)))
walk(src)
assert len(paare) > 1000, len(paare)
alt = sum(len(a) for a, _ in paare)
neu = sum(len(b) for _, b in paare)
assert neu < alt * 0.92, (alt, neu)
# Idempotent
assert all(schlank_wert(b) == b for _, b in paare[:400])
js = r"""
const paare = JSON.parse(require('fs').readFileSync(0, 'utf8'));
let bad = 0;
const body = (s) => { const t = s.trim(); return t.slice(3, -3); };
for (const [a, b] of paare) {
  let okA = true, okB = true;
  try { new Function('entity', 'states', 'user', 'hass', 'variables', 'html', body(a)); } catch (e) { okA = false; }
  try { new Function('entity', 'states', 'user', 'hass', 'variables', 'html', body(b)); } catch (e) { okB = false; }
  if (okA !== okB) { bad++; if (bad < 4) console.error('UNTERSCHIED', body(a).slice(0, 120)); }
}
process.exit(bad ? 1 : 0);
"""
r = subprocess.run(["node", "-e", js], input=json.dumps(paare), text=True, capture_output=True)
assert r.returncode == 0, r.stderr[:2000]
print(f"ok vorlagen_schlank ({len(paare)} Ausdrücke, {alt} → {neu} Zeichen)")
