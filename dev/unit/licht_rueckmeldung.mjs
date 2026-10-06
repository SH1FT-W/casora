// dashfix (06.10.2026): ruhige Rückmeldung nach dem Tippen.
// - Einzel-Licht-Popup: gewählter Weißton (Warm/Neutral/Kalt) ist hinterlegt und zeichnet nach dem
//   Tippen neu (vorher statische Karte ohne Markierung).
// - Szenen ohne lesbare Konfiguration (YAML, Hue …) gelten kurz nach dem Start als aktiv – der
//   Szenen-Badge blieb sonst bei „Keine Aktiv“.
//   node dev/unit/licht_rueckmeldung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

// Weißton: Popup-Inhalt für eine Weißton-Lampe bauen, dann die Weißton-Karte für zwei Zustände auswerten.
const content = body(T.casora_light.tap_action.casora_popup.content);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const window = { _casoraUI: { esc, tokens: { font: 'x', ink: '#111' } } };
const light = (state, k) => ({ entity_id: 'light.spot', state, attributes: { supported_color_modes: ['color_temp'], color_mode: state === 'on' ? 'color_temp' : null,
  color_temp_kelvin: k, min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 } });
const ent = light('off', null);
const hass = { entities: {}, devices: {}, areas: {} };
const out = new Function('window', 'entity', 'states', 'hass', 'variables', content)(window, ent, { 'light.spot': ent }, hass, {});
const cards = JSON.stringify(out).includes('Weißton') ? (function find(o) { if (!o || typeof o !== 'object') return null;
  if (o.custom_fields && typeof o.custom_fields.body === 'string' && o.custom_fields.body.includes('Weißton')) return o;
  for (const v of Object.values(o)) { const r = find(v); if (r) return r; } return null; })(out) : null;
assert.ok(cards, 'Weißton-Karte fehlt');
assert.equal(cards.entity, 'light.spot', 'Weißton-Karte beobachtet die Lampe');
assert.deepEqual(cards.triggers_update, ['light.spot']);
const seg = (st) => {
  const html = new Function('entity', body(cards.custom_fields.body))(st);
  return [...html.matchAll(/class="hui-sg( on)?"[^>]*>([^<]+)</g)].map((x) => x[2] + (x[1] ? ':on' : ''));
};
assert.deepEqual(seg(light('on', 2700)), ['Warm:on', 'Neutral', 'Kalt'], 'Warm markiert');
assert.deepEqual(seg(light('on', 5800)), ['Warm', 'Neutral', 'Kalt:on'], 'nächster Wert markiert');
assert.deepEqual(seg(light('off', null)), ['Warm', 'Neutral', 'Kalt'], 'aus: nichts markiert');
assert.ok(content.includes('.hl-seg .hui-sg.on'), 'Markierung hat einen Stil');

// Szenen ohne Konfiguration: kurz aktiv.
const sc = T.casora_scene_core.variables.casora_scene_core_guard.value;
assert.ok(/const RECENT_MS = \d+ \* 60000;/.test(sc));
assert.ok(/if \(!cfg \|\| !cfg\.entities\) \{\s*const t = Date\.parse\(states\?\.\[sceneId\]\?\.state\);\s*return isFinite\(t\) && Date\.now\(\) - t >= -5000 && Date\.now\(\) - t < RECENT_MS;/.test(sc));
assert.ok(Number(sc.match(/_casoraSCv !== (\d+)/)[1]) >= 34, 'Version erhöht');
console.log('ok licht_rueckmeldung');
