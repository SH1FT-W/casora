// Owner, 06.11.2026: „Überschriften etc. – da haben wir noch Unstimmigkeiten“.
//   1. The section of an item's state is „Zustand“ (popup-richtlinien-v3.md §6: Bedienung → Zustand → Verlauf); humidifier,
//      mower, pet, air purifier and fan called it „Status“.
//   2. A Verlauf plate is headed „<what> · <span>“ like the thermostat's („Temperatur · 24 Std.“, _hpChartTitle,
//      richtlinien §7.2); the free tile said „Verlauf“, the oven „Garraum“, the fridge nothing, the climate popup
//      „Verlauf“.
//   node dev/unit/popup_headings.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const dir = new URL('../../custom_components/casora/scripts/local/', import.meta.url);
const mods = fs.readdirSync(dir).filter((x) => x.endsWith('.js')).map((f) => [f, fs.readFileSync(new URL(f, dir), 'utf8')]);
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const tpls = Object.entries(T).map(([n, t]) => [n, JSON.stringify(t)]);

// 1. „Status“ is no section heading.
for (const [n, s] of mods.concat(tpls)) {
  assert.ok(!/UI\.(?:group|section)\([^;]*?,\s*'Status'\s*\)/.test(s), n + ': section „Status“ → „Zustand“');
}

// 2. Verlauf plates (casora-chart literal, plate, 120 high) carry „<what> · 24 Std.“.
let n = 0;
for (const [f, s] of mods) {
  for (const m of s.matchAll(/\{ type: 'custom:casora-chart',([\s\S]*?)\}, do_not_eval: true \}/g)) {
    const cfg = m[1];
    if (!/plate: true/.test(cfg) || !/height: (?:120|v3 \? 120)/.test(cfg)) continue;
    n++;
    assert.match(cfg, /title: (?:v3 \? )?(?:'[^']+ · 24 Std\.'|T\('[^']+'\) \+ ' · ' \+ T\('24 Std\.'\))/, f + ': Verlauf head „<what> · 24 Std.“');
  }
}
assert.ok(n >= 5, 'Verlauf plates found: ' + n);
{
  const c = T.casora_climate_popup.tap_action.casora_popup.content;
  assert.ok(c.includes("UI.label('Verlauf · 24 Std.')"), 'climate v3: Verlauf head with its span');
}
console.log('popup_headings: ok');
