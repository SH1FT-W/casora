"""tools/build-i18n.py builds the pattern matrix once per language, not once per step.

    python3 dev/unit/i18n_matrix_once_test.py

The matrix tests every pattern against the samples of every other pattern, which is most of the
builder's run time. Ordering the patterns and listing the patterns an order hides share it.
"""

from __future__ import annotations

import importlib.util
import io
import os
import sys
from contextlib import redirect_stdout

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import i18n_patterns  # noqa: E402

PHRASES = os.path.join(ROOT, "custom_components/casora/translations/dashboard/phrases")
langs = [f for f in os.listdir(PHRASES) if f.endswith(".json")]

spec = importlib.util.spec_from_file_location("build_i18n", os.path.join(ROOT, "tools/build-i18n.py"))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

calls = []
real = i18n_patterns.matrix


def counting(patterns):
    calls.append(len(patterns))
    return real(patterns)


i18n_patterns.matrix = counting
try:
    with redirect_stdout(io.StringIO()):
        build.main()
finally:
    i18n_patterns.matrix = real

if len(calls) != len(langs):
    print("FAIL matrix built %d times for %d languages" % (len(calls), len(langs)))
    sys.exit(1)
# The matrix of the ordered list, carried over from the unordered one, equals one built from scratch.
pats = [r"^Ø (.+)$", r"^Ø von (\d+) Lampen$", r"^(\d+) Tage?$", r"^(\d+) Tag$"]
idx = [1, 0, 3, 2]
carried = i18n_patterns.reordered(i18n_patterns.matrix(pats), idx)
fresh = i18n_patterns.matrix([pats[i] for i in idx])
if carried != fresh:
    print("FAIL reordered() differs from a matrix built on the ordered patterns")
    sys.exit(1)
print("ok: matrix built once per language (%d calls)" % len(calls))
