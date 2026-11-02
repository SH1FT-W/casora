"""Order the dashboard phrase patterns so a specific pattern is tried before a general one.

The runtime (casora-i18n.js) takes the first pattern that matches. A general pattern such as
"^Ø (.+)$" listed before "^Ø von (\\d+) Lampen$" therefore hides the specific one for good.

For every pattern we build sample texts (groups filled with plausible values, each alternative and
optional part tried) and test the other patterns against them. Pattern A covers B when A matches
all samples of B. If A covers B but not the other way round, B is the narrower one and goes first;
both covering each other is a duplicate (error). Patterns that share only some samples go by the
amount of fixed text, more first. order() sorts stably along that relation; shadowed() lists the
pairs a given order gets wrong.

The samples are matched with Python's re; the phrase patterns only use syntax that means the same
in JavaScript (literals, \\d \\s \\S, classes, groups, alternation, quantifiers).

Used by tools/build-i18n.py and dev/unit/i18n_shadow_test.py.
"""

import heapq
import itertools
import re

try:  # Python 3.11+
    import re._parser as sre_parse  # type: ignore[import-not-found]
    import re._constants as sre_c  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    import sre_parse  # type: ignore[no-redef]
    import sre_constants as sre_c  # type: ignore[no-redef]

# Fill characters, most plausible first: a digit for numbers, letters for names.
CANDIDATES = "5aKx ä-.:,/%"
MAX_SAMPLES = 32

_CAT = {
    sre_c.CATEGORY_DIGIT: lambda c: c.isdigit(),
    sre_c.CATEGORY_NOT_DIGIT: lambda c: not c.isdigit(),
    sre_c.CATEGORY_SPACE: lambda c: c.isspace(),
    sre_c.CATEGORY_NOT_SPACE: lambda c: not c.isspace(),
    sre_c.CATEGORY_WORD: lambda c: c.isalnum() or c == "_",
    sre_c.CATEGORY_NOT_WORD: lambda c: not (c.isalnum() or c == "_"),
}


def _in_set(items, c, icase):
    neg = False
    hit = False
    for op, av in items:
        if op is sre_c.NEGATE:
            neg = True
        elif op is sre_c.LITERAL:
            hit = hit or chr(av) == c or (icase and chr(av).lower() == c.lower())
        elif op is sre_c.RANGE:
            hit = hit or av[0] <= ord(c) <= av[1]
        elif op is sre_c.CATEGORY:
            hit = hit or _CAT.get(av, lambda _c: False)(c)
    return hit != neg


def _pick(test, extra=()):
    """Up to three different characters the test accepts, most plausible first."""
    out = []
    for c in list(CANDIDATES) + list(extra) + [chr(o) for o in range(33, 0x250)]:
        if c not in out and test(c):
            out.append(c)
            if len(out) == 3:
                return out
    if not out:
        raise ValueError("no character fits")
    return out


def _product(parts):
    """Concatenate variant lists, capped so a pattern never explodes."""
    out = [""]
    for variants in parts:
        out = [a + b for a, b in itertools.islice(itertools.product(out, variants), MAX_SAMPLES)]
    return out


def _gen(seq, groups, icase):
    parts = []
    for op, av in seq:
        if op is sre_c.LITERAL:
            parts.append([chr(av)])
        elif op is sre_c.NOT_LITERAL:
            parts.append(_pick(lambda c, n=chr(av): c != n))
        elif op is sre_c.ANY:
            parts.append(["x", "5"])
        elif op is sre_c.IN:
            lits = [chr(v) for o, v in av if o is sre_c.LITERAL]
            parts.append(_pick(lambda c, it=av: _in_set(it, c, icase), lits))
        elif op is sre_c.BRANCH:
            alts = []
            for b in av[1]:
                alts.extend(_gen(b, groups, icase))
            parts.append(alts)
        elif op is sre_c.SUBPATTERN:
            gid, add, _del, sub = av
            inner = _gen(sub, groups, icase or bool(add & sre_c.SRE_FLAG_IGNORECASE))
            if gid is not None:
                groups[gid] = inner[0]
            parts.append(inner)
        elif op in (sre_c.MAX_REPEAT, sre_c.MIN_REPEAT, getattr(sre_c, "POSSESSIVE_REPEAT", None)):
            lo, hi, sub = av
            inner = _gen(sub, groups, icase)
            n = max(lo, 1) if hi else 0
            reps = [s * n for s in inner]
            if hi > n:  # one more repetition tells "(\\d)" from "(\\d+)"
                reps += [s * (n + 1) for s in inner[:1]]
            parts.append(reps + ([""] if lo == 0 else []))
        elif op is sre_c.GROUPREF:
            parts.append([groups.get(av, "")])
        elif op in (sre_c.AT, sre_c.ASSERT, sre_c.ASSERT_NOT):
            parts.append([""])
        else:
            raise ValueError("unsupported regex element %s" % op)
    return _product(parts)


def samples(pattern):
    """Texts the pattern matches, groups filled with plausible values."""
    tree = sre_parse.parse(pattern)
    rx = re.compile(pattern)
    out = []
    for s in dict.fromkeys(_gen(list(tree), {}, False)):
        if rx.search(s):
            out.append(s)
    if not out:
        raise ValueError("no sample for pattern %r" % pattern)
    return out


def _matrix(patterns):
    """touch[a] = patterns b with a sample that a matches (a hides b on that text if listed first);
    cover[a] = patterns b whose samples a matches all (a is at least as broad as b)."""
    rx = [re.compile(p) for p in patterns]
    smp = [samples(p) for p in patterns]
    touch, cover = [], []
    for a, r in enumerate(rx):
        t, c = set(), set()
        for b in range(len(patterns)):
            if b == a:
                continue
            m = [bool(r.search(s)) for s in smp[b]]
            if any(m):
                t.add(b)
            if all(m):
                c.add(b)
        touch.append(t)
        cover.append(c)
    return touch, cover, smp


def _literals(seq):
    """Fixed characters a pattern requires: the more, the more specific."""
    n = 0
    for op, av in seq:
        if op is sre_c.LITERAL:
            n += 1
        elif op is sre_c.SUBPATTERN:
            n += _literals(av[3])
        elif op is sre_c.BRANCH:
            n += min(_literals(b) for b in av[1])
        elif op in (sre_c.MAX_REPEAT, sre_c.MIN_REPEAT, getattr(sre_c, "POSSESSIVE_REPEAT", None)):
            n += av[0] * _literals(av[2])
    return n


def literals(pattern):
    return _literals(list(sre_parse.parse(pattern)))


def _first(a, b, touch, cover, lit):
    """Which of two overlapping patterns must be tried first (None: they never meet)."""
    if b in cover[a] and a in cover[b]:
        return None if b not in touch[a] else "same"
    if b in cover[a]:
        return b  # a is broader
    if a in cover[b]:
        return a
    if b in touch[a] or a in touch[b]:
        # Partial overlap ("5 % Akku" vs "(\\d+) % (.*)"): the one with more fixed text first.
        if lit[a] != lit[b]:
            return a if lit[a] > lit[b] else b
        return min(a, b)
    return None


def order(patterns):
    """Stable order of the pattern indices so no pattern hides a more specific one.

    Raises ValueError for two patterns that match the same texts (the later one could never apply).
    """
    n = len(patterns)
    touch, cover, _ = _matrix(patterns)
    lit = [literals(p) for p in patterns]
    after = [set() for _ in range(n)]  # after[x] = patterns that must come after x
    indeg = [0] * n
    for a in range(n):
        for b in range(a + 1, n):
            f = _first(a, b, touch, cover, lit)
            if f is None:
                continue
            if f == "same":
                raise ValueError("duplicate pattern: %r / %r" % (patterns[a], patterns[b]))
            other = b if f == a else a
            after[f].add(other)
            indeg[other] += 1
    heap = [i for i in range(n) if indeg[i] == 0]
    heapq.heapify(heap)
    out = []
    while heap:
        i = heapq.heappop(heap)
        out.append(i)
        for a in after[i]:
            indeg[a] -= 1
            if indeg[a] == 0:
                heapq.heappush(heap, a)
    if len(out) != n:
        raise ValueError("pattern order has a cycle")
    return out


def shadowed(patterns):
    """(earlier, later, sample) for every pattern hidden, at least on one sample, by a less specific
    earlier one, and for later duplicates of an earlier pattern."""
    touch, cover, smp = _matrix(patterns)
    lit = [literals(p) for p in patterns]
    out = []
    for a in range(len(patterns)):
        for b in range(a + 1, len(patterns)):
            f = _first(a, b, touch, cover, lit)
            if f == b or f == "same":
                s = next(s for s in smp[b] if re.search(patterns[a], s))
                out.append((patterns[a], patterns[b], s))
    return out
