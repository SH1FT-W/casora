#!/bin/sh
# Release vorbereiten – nur mit grünem Qualitäts-Gate für HEAD (dev/qa/gate.sh).
#
#   tools/release.sh 0.6.0             prüft alles und zeigt die Befehle (führt nichts aus)
#   tools/release.sh 0.6.0 --publish   führt Tag, Push und gh release create danach aus
#   tools/release.sh 0.6.0 --same-whats-new   WHATS_NEW darf wie beim letzten Release sein
#
# Prüft: sauberer Arbeitsstand, .qa/gate-<HEAD>.json grün und vollständig (X.Y.0: volles Gate,
# X.Y.Z mit Z>0: auch Patch-Gate auf einem grünen vollen Gate eines Vorfahren, dev/qa/gate.sh --patch),
# CHANGELOG in der Integration aktuell (sync-changelog --check), manifest-Version = <version>,
# CHANGELOG.md und CHANGELOG.de.md haben je einen Abschnitt „## <version>“, WHATS_NEW (casora-panel-welcome.js) gefüllt
# und seit dem letzten Release geändert. Versionshinweise: .qa/release-notes-<version>.md.
# Verteilung: Das GitHub-Release ist die Quelle; Casora (update_source.py, anonym über die
# öffentliche GitHub-API) und HACS finden es von selbst.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

VER=""; PUBLISH=0; SAME_WN=0
for a in "$@"; do
  case "$a" in
    --publish) PUBLISH=1 ;;
    --same-whats-new) SAME_WN=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    -*) echo "Unbekannte Option: $a" >&2; exit 2 ;;
    *) VER="${a#v}" ;;
  esac
done
[ -n "$VER" ] || { echo "Aufruf: tools/release.sh <version> [--publish]" >&2; exit 2; }
echo "$VER" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "Version muss X.Y.Z sein: $VER" >&2; exit 2; }
TAG="v$VER"

fail() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

# 1) Gate (inkl. sauberem Arbeitsstand)
MSG="$(python3 tools/qa_gate.py --version "$VER")" || fail "$MSG"
ok "$MSG"

# 2) CHANGELOG in der Integration aktuell
python3 tools/sync-changelog.py --check >/dev/null || fail "CHANGELOG veraltet – python3 tools/sync-changelog.py, committen, Gate neu"
ok "CHANGELOG in der Integration aktuell"

# 3) Version im manifest
MV="$(python3 -c 'import json;print(json.load(open("custom_components/casora/manifest.json"))["version"])')"
[ "$MV" = "$VER" ] || fail "manifest.json hat Version $MV, nicht $VER"
ok "manifest.json: $MV"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "Tag $TAG gibt es schon"

# 4) CHANGELOG-Abschnitte → Versionshinweise (englisch oben, deutsch eingeklappt darunter;
#    Casora zeigt bei deutscher Oberfläche den Deutsch-Block, sonst Englisch: release_notes.pick_notes)
mkdir -p .qa
NOTES=".qa/release-notes-$VER.md"
python3 - "$VER" "$NOTES" <<'PY' || fail "Versionshinweise für $VER unvollständig (siehe oben)"
import re, sys
ver, out = sys.argv[1], sys.argv[2]

def section(path):
    text = open(path, encoding="utf-8").read()
    m = re.search(r"^## " + re.escape(ver) + r"\b.*?$\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1).strip() if m else ""

en, de = section("CHANGELOG.md"), section("CHANGELOG.de.md")
if not en:
    print(f"✗ CHANGELOG.md hat keinen Abschnitt „## {ver} …“ mit Inhalt", file=sys.stderr)
if not de:
    print(f"✗ CHANGELOG.de.md hat keinen Abschnitt „## {ver} …“ mit Inhalt (deutsche Fassung fehlt)", file=sys.stderr)
if not en or not de:
    sys.exit(1)
if "</details>" in en + de:
    print("✗ Die Abschnitte dürfen kein </details> enthalten (Trenner der Sprachen)", file=sys.stderr)
    sys.exit(1)
open(out, "w", encoding="utf-8").write(
    en + "\n\n<details><summary>Deutsch</summary>\n\n" + de + "\n\n</details>\n")
PY
ok "Versionshinweise aus CHANGELOG.md + CHANGELOG.de.md: $NOTES ($(wc -l <"$NOTES" | tr -d ' ') Zeilen)"

# 5) WHATS_NEW gefüllt (und neu)
WN_FILE=custom_components/casora/panel/casora-panel-welcome.js
wn() { python3 -c '
import re, sys
s = sys.stdin.read()
m = re.search(r"const WHATS_NEW = \[(.*?)\n\s*\];", s, re.S)
print("\n".join(l.strip() for l in (m.group(1) if m else "").splitlines() if l.strip() and not l.strip().startswith("//")))'; }
NOW="$(wn <"$WN_FILE")"
[ -n "$NOW" ] || fail "WHATS_NEW in $WN_FILE ist leer"
LAST="$(git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n1 || true)"
if [ -n "$LAST" ] && [ $SAME_WN = 0 ]; then
  BEFORE="$(git show "$LAST:$WN_FILE" 2>/dev/null | wn || true)"
  if [ "$NOW" = "$BEFORE" ]; then
    # Einträge verweisen auf Übersetzungsschlüssel – dann müssen sich wenigstens deren Texte ändern.
    git diff --quiet "$LAST" HEAD -- custom_components/casora/panel/casora-panel-welcome.js custom_components/casora/translations/panel \
      && fail "WHATS_NEW unverändert seit $LAST – neu füllen (oder --same-whats-new)"
  fi
fi
ok "WHATS_NEW: $(echo "$NOW" | wc -l | tr -d ' ') Einträge"

echo
echo "Release $TAG – Befehle:"
echo "  git tag -a $TAG -m $TAG"
echo "  git push origin HEAD $TAG"
echo "  gh release create $TAG --title $TAG --notes-file $NOTES"
if [ $PUBLISH = 1 ]; then
  echo
  echo "--publish: führe aus …"
  git tag -a "$TAG" -m "$TAG"
  git push origin HEAD "$TAG"
  gh release create "$TAG" --title "$TAG" --notes-file "$NOTES"
  ok "Release $TAG veröffentlicht"
else
  echo "(nichts ausgeführt – mit --publish ausführen)"
fi
