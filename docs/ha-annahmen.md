# HA-Annahmen

<!-- Vorlage aus repo-vorlagen/vorlagen/ha-annahmen.md. Der HA-Beta-Bericht (repo-vorlagen/ha-beta-bericht.md)
     gleicht diese Liste jeden Monat mit den Neuerungen der HA-Beta ab. Nur festhalten, was bei einer Änderung
     in HA still kaputtginge. -->

Worauf sich dieses Repo bei Home Assistant verlässt. Bei jeder Änderung am Code mitpflegen.
Angelegt im Oktober 2026 mit dem, was dabei gelesen wurde – noch nicht vollständig, wächst mit jeder Anpassung.

**Getestet mit:** HA 2026.10 · **Mindestversion:** `hacs.json` (2026.9.0)

## Annahmen

| Annahme | Wo im Code | Abgesichert durch |
|---|---|---|
| HA-Dialoge: `ha-dialog` → (Shadow) `wa-dialog` → (Shadow) natives `<dialog>`, geöffnet mit `showModal()` | `scripts/casora-core.js` Dialog-Chrome (`patchShowModal`, `CSS_BY_HOST`) | `dev/unit/dialog_offset_fullscreen.mjs` (nur Casora-Seite) |
| HA zeigt Standard-Dialoge bei `max-width: 450px` oder `max-height: 500px` bildschirmfüllend (`min-height: 100dvh`); Casora setzt seinen Versatz nur außerhalb davon (`min-width: 451px and min-height: 501px`) | `scripts/casora-core.js` `CSS_BY_HOST['wa-dialog']` | `dev/unit/dialog_offset_fullscreen.mjs` (Grenze von Hand gegen `src/components/ha-dialog.ts` geprüft) |
| Vollbild-Dialoge tragen am `ha-dialog` das Attribut `fullscreen` bzw. `width="full"` | `scripts/casora-core.js` `wantsOffset()` | `dev/unit/dialog_offset_fullscreen.mjs` |
| `document.querySelector('home-assistant').hass.panels[hass.panelUrl].component_name` ist `lovelace` für Dashboards | `scripts/casora-core.js` `wantsOffset()` | `dev/unit/dialog_offset_fullscreen.mjs` (Attrappe) |
| Theme-Variable `--dialog-surface-margin-top` verschiebt HA-Dialoge (am Handy setzt HA sie selbst auf 0) | `theme.yaml` (`dialog-surface-margin-top`) | keiner |
| Lovelace-Ressourcen unter `hass.data["lovelace"].resources` (früher Dict-Schlüssel) mit `async_items`, `async_load`/`loaded`, `async_create_item`, `async_update_item`, `async_delete_item`; im yaml-Modus ohne `async_create_item` | `__init__.py` `_lovelace_resources`, `_sync_script_resources`, `_remove_script_resources` | `dev/unit/hemma_entfernen_test.py`, `dev/unit/remove_entry_resources_test.py` (Attrappen) |
| `async_remove_entry` läuft beim Löschen des Config-Eintrags | `__init__.py` | keiner |
| Themes: `hass.data["frontend_themes"]`, `["frontend_themes_store"]`, `["frontend_default_theme"]`, `["frontend_default_dark_theme"]`, Ereignis `themes_updated`, Dienst `frontend.set_theme` | `helfer.py` `_setup_theme`, `_inject_theme` | `dev/unit/theme_frueh_test.py`, `dev/unit/theme_hemma_umstellung_test.py` |

## Fremde Integrationen

Integrationen, deren Entitäten oder Attribute dieses Repo liest (Domain, was genau, wo):

- noch nicht erfasst

## Prüfbefehl

```sh
keiner
```
