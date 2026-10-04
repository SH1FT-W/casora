#!/bin/sh
# Alle E2E-Tests gegen das Docker-HA im Zustand „arbeit“ (dev/haus.sh arbeit). Aufruf: CASORA_TOKENS=… ./alle.sh
cd "$(dirname "$0")"
N=/opt/homebrew/opt/node@22/bin/node
for t in t01_finder t11_solar t12_auto t02_import_hemma1 t07_import_hemma2 t03_neues_dashboard t04_handy t05_assistent t06_lokal t08_menue_handy_en t09_rundlauf t10_drucker_vorlage t13_kachelfelder t14_abfall t15_sauger t16_fbh t17_ki t18_persoenliches t19_umzug t21_kachelart; do
  echo "=== $t"
  $N $t.mjs 2>&1 | grep -E "abweichend|gefunden|Fehlerkarten|Browser-Fehler|Speichern:|Gespeichert|FEHLER|Error|Timeout|→|Assistent:|ALT|NEU|Fertig:|identisch|ABWEICHUNG|geprueft|felder|SYMBOL|KI-|Abfall:|diff|Tagesstart|ABWEICHUNG|identisch|hauptschalter|FEHLT|optionen|seite|gefunden|umzug|gemerkt" | cut -c1-220
done
