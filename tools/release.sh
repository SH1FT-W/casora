#!/bin/sh
# Release vorbereiten – nur mit grünem Qualitäts-Gate für HEAD (dev/qa/gate.sh).
#
# Versionen sind Kalender-Versionen YY.M.N (Jahr zweistellig, Monat ohne Null, N = laufende Nummer des
# Releases im Monat ab 1, veröffentlichte GitHub-Releases des Monats zählen, auch alte X.Y.Z) – Tag „vYY.M.N“, z. B. v26.10.31.
# Die nächste Nummer rechnet tools/next-version aus.
#
#   tools/release.sh                   Version von tools/next-version, prüft alles, zeigt die Befehle
#   tools/release.sh 26.10.31          dasselbe mit ausdrücklicher Version (muss = tools/next-version sein)
#   tools/release.sh 26.10.31 --publish   führt Tag, Push und gh release create danach aus
#   tools/release.sh 26.10.31 --same-whats-new   WHATS_NEW darf wie beim letzten Release sein
#   tools/release.sh 26.10.32 --andere-version   Version weicht bewusst von tools/next-version ab
#   tools/release.sh 26.10.32 --patch   echter Notfall-Hotfix: Patch-Gate (dev/qa/gate.sh --patch) zugelassen
#   tools/release.sh --beta [--publish] Beta für Tester: nächste Nummer mit bK (26.10.58b1, b2 …), Vorabversion auf
#                                       GitHub (HACS „Beta-Versionen anzeigen“; ohne HACS meldet sie Casoras Update-Entität mit der Option „Beta-Versionen“). Patch-Gate
#                                       reicht; Pflicht nur .qa/release-notes-<version>.md (englisch, von Hand);
#                                       kein CHANGELOG/WHATS_NEW/Website. Gepusht wird nur der Tag, main nicht –
#                                       die Website zeigt weiter die stabile Version. Betas zählen nicht als Nummer.
#                                       – nie automatisch, Standard bleibt das volle Gate
#
# Prüft: Version im Schema YY.M.N und = tools/next-version, sauberer Arbeitsstand, .qa/gate-<HEAD>.json
# grün und vollständig (Kalender-Version: volles Gate, dev/qa/gate.sh --voll; Patch-Gate nur mit --patch),
# CHANGELOG in der Integration aktuell (sync-changelog --check), manifest-Version = <version>,
# CHANGELOG.md und CHANGELOG.de.md haben je einen Abschnitt „## <version>“, WHATS_NEW (casora-panel-welcome.js) gefüllt
# und seit dem letzten Release geändert. Versionshinweise: .qa/release-notes-<version>.md.
# Verteilung: Das GitHub-Release ist die Quelle; Casora (update_source.py, anonym über die
# öffentliche GitHub-API, meldet nur) und HACS (installiert) finden es von selbst. Jedes Release (auch --beta) bekommt das Paket
# casora.zip (tools/build-release-zip.py: custom_components/casora des Release-Commits, Dateien im Zip-Root,
# deterministisch). HACS lädt wegen hacs.json „zip_release“ nur dieses Paket statt des ganzen Repo-Archivs,
# Casora selbst lädt nichts herunter. Ohne Paket scheitert die HACS-Installation dieses Releases.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

VER=""; PUBLISH=0; SAME_WN=0; OTHER_VER=0; PATCH=""; BETA=0
for a in "$@"; do
  case "$a" in
    --publish) PUBLISH=1 ;;
    --same-whats-new) SAME_WN=1 ;;
    --andere-version) OTHER_VER=1 ;;
    --patch) PATCH="--patch" ;;
    --beta) BETA=1 ;;
    -h|--help) sed -n '2,/^set -eu/p' "$0" | sed '$d'; exit 0 ;;
    -*) echo "Unbekannte Option: $a" >&2; exit 2 ;;
    *) VER="${a#v}" ;;
  esac
done

fail() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

# 0) Version: Kalender-Schema YY.M.N, Vorschlag aus tools/next-version (zählt die GitHub-Releases des Monats)
NEXT="$(tools/next-version)" || fail "tools/next-version fehlgeschlagen"
if [ $BETA = 1 ]; then
  # Beta: bK hinter der nächsten Nummer, K = höchste schon vergebene Beta dieser Nummer + 1.
  git fetch -q --tags origin 2>/dev/null || true
  K=$(git tag -l "v${NEXT}b*" | sed -n "s/^v${NEXT}b\([0-9][0-9]*\)$/\1/p" | sort -n | tail -1)
  WANT="${NEXT}b$(( ${K:-0} + 1 ))"
  [ -z "$VER" ] && VER="$WANT"
  [ "$VER" = "$WANT" ] || fail "Beta-Version $VER ≠ $WANT (nächste Beta)"
  ok "Beta $VER (stabil folgt $NEXT)"
elif [ -z "$VER" ]; then
  VER="$NEXT"
  echo "Version von tools/next-version: $VER"
fi
if [ $BETA = 0 ]; then
echo "$VER" | grep -Eq '^[0-9]{2}\.([1-9]|1[0-2])\.[1-9][0-9]*$' \
  || { echo "Version muss YY.M.N sein (z. B. $NEXT): $VER" >&2; exit 2; }
if [ "$VER" != "$NEXT" ]; then
  [ $OTHER_VER = 1 ] || fail "Version $VER ≠ $NEXT (tools/next-version) – bewusst so? Dann --andere-version"
  echo "! Version $VER weicht von tools/next-version ($NEXT) ab (--andere-version)"
fi
ok "Version $VER"
fi
TAG="v$VER"

# 0b) Release-Paket casora.zip aus HEAD (= dem Commit, der den Tag bekommt), nicht aus dem Arbeitsstand
ZIP=".qa/release-$VER/casora.zip"
ZIP_COMMIT="$(git rev-parse HEAD)"
ZIP_MSG="$(python3 tools/build-release-zip.py "$ZIP" --ref "$ZIP_COMMIT")" || fail "casora.zip nicht gebaut"
ok "Paket $ZIP_MSG"

# 1) Gate (inkl. sauberem Arbeitsstand; Kalender-Versionen brauchen das volle Gate, Patch-Gate nur mit --patch)
[ -n "$PATCH" ] && echo "! --patch: Notfall-Hotfix, Patch-Gate wird angenommen"
if [ $BETA = 1 ]; then
  MSG="$(python3 tools/qa_gate.py --version "$NEXT" --patch)" || fail "$MSG"
else
  MSG="$(python3 tools/qa_gate.py --version "$VER" $PATCH)" || fail "$MSG"
fi
ok "$MSG"

# 2) CHANGELOG in der Integration aktuell
python3 tools/sync-changelog.py --check >/dev/null || fail "CHANGELOG veraltet – python3 tools/sync-changelog.py, committen, Gate neu"
ok "CHANGELOG in der Integration aktuell"

# 3) Version im manifest
MV="$(python3 -c 'import json;print(json.load(open("custom_components/casora/manifest.json"))["version"])')"
[ "$MV" = "$VER" ] || fail "manifest.json hat Version $MV, nicht $VER"
ok "manifest.json: $MV"
ZV="$(python3 -c 'import json,sys,zipfile;print(json.loads(zipfile.ZipFile(sys.argv[1]).read("manifest.json"))["version"])' "$ZIP")"
[ "$ZV" = "$VER" ] || fail "$ZIP hat Version $ZV, nicht $VER"
[ "$(git rev-parse HEAD)" = "$ZIP_COMMIT" ] || fail "HEAD hat sich seit dem Paketbau geändert – neu starten"
ok "Paket-Version: $ZV"

if [ $BETA = 1 ]; then
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "Tag $TAG gibt es schon"
  NOTES=".qa/release-notes-$VER.md"
  [ -s "$NOTES" ] || fail "Beta-Notizen fehlen: $NOTES (englisch, kurz: was testen)"
  ok "Beta-Notizen: $NOTES"
  echo
  echo "Beta $TAG – Befehle:"
  echo "  git tag -a $TAG -m $TAG $ZIP_COMMIT"
  echo "  git push origin $TAG"
  echo "  gh release create $TAG --prerelease --title $TAG --notes-file $NOTES $ZIP"
  if [ $PUBLISH = 1 ]; then
    git tag -a "$TAG" -m "$TAG" "$ZIP_COMMIT"
    git push origin "$TAG"
    gh release create "$TAG" --prerelease --title "$TAG" --notes-file "$NOTES" "$ZIP"
    ok "Beta $TAG veröffentlicht (Vorabversion)"
  else
    echo "(nichts ausgeführt – mit --publish ausführen)"
  fi
  exit 0
fi

# 3b) Website: statischer Fallback der Versionszeile (docs/index.html liest live aus manifest.json, der Text ist die Reserve)
WV="$(grep -o 'id="casora-version">Version [0-9.]*' docs/index.html | grep -o '[0-9][0-9.]*$')"
[ "$WV" = "$VER" ] || fail "docs/index.html zeigt als Fallback Version $WV, nicht $VER (Versionszeile im Hero anpassen)"
ok "docs/index.html Fallback: $WV"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "Tag $TAG gibt es schon"

# 4) CHANGELOG-Abschnitte → Versionshinweise auf GitHub nur englisch (seit 26.10.34). CHANGELOG.de.md bleibt Pflicht:
#    Casora liest bei deutscher Oberfläche die deutsche Fassung aus CHANGELOG.de.md (Updates-Popup).
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
open(out, "w", encoding="utf-8").write(en + "\n")
PY
ok "Versionshinweise (englisch) aus CHANGELOG.md: $NOTES ($(wc -l <"$NOTES" | tr -d ' ') Zeilen)"

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
echo "  git tag -a $TAG -m $TAG $ZIP_COMMIT"
echo "  git push origin HEAD $TAG"
echo "  gh release create $TAG --title $TAG --notes-file $NOTES $ZIP"
if [ $PUBLISH = 1 ]; then
  echo
  echo "--publish: führe aus …"
  git tag -a "$TAG" -m "$TAG" "$ZIP_COMMIT"
  git push origin HEAD "$TAG"
  gh release create "$TAG" --title "$TAG" --notes-file "$NOTES" "$ZIP"
  ok "Release $TAG veröffentlicht"
else
  echo "(nichts ausgeführt – mit --publish ausführen)"
fi
