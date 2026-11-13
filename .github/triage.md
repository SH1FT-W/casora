# Triage rules for Casora

Read by the issue triage workflow (.github/workflows/issue-triage.yml) in addition to its general steps.

## What Casora is
A Home Assistant dashboard with its own Studio (custom_components/casora). Most dashboard code is in
custom_components/casora/scripts/ (casora-core.js and scripts/local/*.js), the Studio in custom_components/casora/panel/,
the tile templates in dashboards/casora/button_card_templates.json. Texts users see are written in German in the code;
the other languages are in custom_components/casora/translations/.

## Kind labels
- A request for a new card (tile) or a card variant gets **kartenwunsch** instead of enhancement.
- A German word showing in another language is a **bug** (translation gap). The German text in the code is the
  source; the translation tables are custom_components/casora/translations/dashboard/phrases/<lang>.json.

## When to ask for diagnostics
- **Casora diagnostics** (Studio: menu top right, Help, Copy diagnostics, paste into the issue): ask only when the
  problem depends on the reporter's house: a device or integration not recognised or shown wrongly, a tile or badge
  with wrong values, setup or migration problems, errors. Do not ask for it when the report is clear without it, for
  example a translation gap, a setting that is ignored, or a visual detail shown in a screenshot.
- **Display diagnosis** (open the dashboard on the affected device, add ?casora_diag to the address or tap the page
  title five times quickly, Copy, paste): ask only for layout problems on a specific screen (something overlaps,
  sits wrong or has the wrong size), together with the device and browser.
- If the diagnostics are already in the issue, read them (version, language, device) and use them.

## Versions
Casora uses calendar versions YY.M.N, betas YY.M.NbK (tags with a leading v). The diagnostics' first line names the
installed version. A bug fixed in a later release or beta: name that version.
