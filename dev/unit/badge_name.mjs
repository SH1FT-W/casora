// Badges umbenennen („Name auf dem Badge“ im Studio).
//   node dev/unit/badge_name.mjs
// Studio-Audit 06.10.2026 (S-BADGE-NAME): Die Namen „Klima“, „Beleuchtung“ … standen fest in den
// Vorlagen. Jetzt: Raum-Variable <badge>_title → casora_room bzw. Handy-Filterbadges → variables.title
// der Gruppen-Badge; leer = Standardname. Der eigene Name wird nicht übersetzt (data-no-i18n).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const MAP = { casora_badge_climate_group: 'climate_title', casora_badge_energy_group: 'energy_title',
  casora_badge_light_group: 'lights_title', casora_badge_security_group: 'security_title',
  casora_badge_media_group: 'media_title', casora_badge_presence_group: 'people_title' };
for (const [tpl, key] of Object.entries(MAP)) {
  const name = T[tpl].name;
  assert.ok(/variables\.title \?/.test(name) && /data-no-i18n/.test(name), tpl + ': eigener Name mit Vorrang, unübersetzt');
  for (const host of ['casora_room', 'casora_mobile_filter_badges']) {
    const s = JSON.stringify(T[host]);
    assert.ok(s.includes('"template":"' + tpl + '"'), host + ' enthält ' + tpl);
    assert.ok(s.includes('return variables.' + key + ' '), host + ' reicht ' + key + ' weiter');
    assert.ok(Object.prototype.hasOwnProperty.call(T[host].variables || {}, key), host + ' deklariert ' + key);
  }
}
// Das Studio bietet das Feld je Badge an.
const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
for (const key of Object.values(MAP)) assert.ok(panel.includes('T("' + key + '", "Name on the badge")'), 'Studio-Feld ' + key);
console.log('ok badge_name');
