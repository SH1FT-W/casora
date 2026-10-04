// Issue #2 (Klima-Popup, Messwerte): Luftqualitätssensoren zeigten den Gerätenamen und falsche
// Großschreibung („LuftqualitäTsmonitor PM2,5“ – \b\w hält „ä“ für ein Wortende). Erwartet:
// kurze Messgrößen nach Geräteklasse wie bei Temperatur/Luftfeuchtigkeit (PM2.5, CO₂ …); sonst
// der Name ohne Raum- und Gerätenamen davor, Großschreibung umlautfest. Ohne Browser: die
// Namensfunktion aus der Vorlage casora_climate_popup laden; dazu kein \b\w mehr in den Vorlagen.
//   node dev/unit/klima_messwert_namen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const raw = fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8');
const tpl = JSON.parse(raw);
const src = tpl.casora_climate_popup.tap_action.casora_popup.content;
const a = src.indexOf('const cleanSensorName = ');
assert.ok(a > 0, 'cleanSensorName gefunden');
const b = src.indexOf('\n  };\n', a);
const fnSrc = src.slice(a, b + 5);

const hass = {
  devices: { d_aq: { name: 'ALPSTUGA air quality monitor', name_by_user: 'Luftqualitätsmonitor' }, d_lr: { name: 'Luftreiniger Core 300S' },
    d_gs: { name: 'Glücksfeder' } },
  entities: {
    'sensor.aq_pm25': { device_id: 'd_aq' }, 'sensor.aq_co2': { device_id: 'd_aq' }, 'sensor.lr_pm25': { device_id: 'd_lr' },
    'sensor.gs_feuchte': { device_id: 'd_gs' },
  },
};
const st = (dc, name) => ({ state: '5', attributes: { device_class: dc, friendly_name: name } });
const states = {
  'sensor.aq_pm25': st('pm25', 'Luftqualitätsmonitor PM2,5'),
  'sensor.aq_co2': st('carbon_dioxide', 'Luftqualitätsmonitor Kohlendioxid'),
  'sensor.lr_pm25': st('pm25', 'Luftreiniger Core 300S PM2,5'),
  'sensor.pm10': st('pm10', 'Wohnzimmer PM10'),
  'sensor.voc': st('volatile_organic_compounds_parts', 'Wohnzimmer VOC'),
  'sensor.no2': st('nitrogen_dioxide', 'Wetterstation Luftqualität Stickstoffdioxid'),
  'sensor.ozon': st('ozone', 'Ozon'),
  // eCO2 eines Luftsensors: Geräteklasse VOC, aber laut Entität CO2 – wie Schwellen und Symbol nach Entität.
  'sensor.luftsensor_eco2': st('volatile_organic_compounds_parts', 'CO2'),
  // ohne bekannte Geräteklasse: Gerätename und Raum vorne weg, Großschreibung mit Umlauten richtig
  'sensor.gs_feuchte': st('moisture', 'Glücksfeder bodenfeuchte'),
  'sensor.raum_glanz': st(null, 'Wohnzimmer süße überraschung'),
};
const clean = new Function('states', 'hass', 'variables', fnSrc + '\nreturn cleanSensorName;')(states, hass, { room_name: 'Wohnzimmer' });
const want = {
  'sensor.aq_pm25': 'PM2.5', 'sensor.aq_co2': 'CO₂', 'sensor.lr_pm25': 'PM2.5', 'sensor.pm10': 'PM10', 'sensor.voc': 'VOC',
  'sensor.no2': 'NO₂', 'sensor.ozon': 'O₃', 'sensor.luftsensor_eco2': 'CO₂',
  'sensor.gs_feuchte': 'Bodenfeuchte', 'sensor.raum_glanz': 'Süße Überraschung',
};
for (const [id, w] of Object.entries(want)) assert.equal(clean(id), w, id + ': ' + JSON.stringify(clean(id)));

// Allgemein: keine Großschreibung per \b\w mehr in den Vorlagen (Umlaute gelten dort als Wortgrenze).
const bw = (raw.match(/\\\\b\\\\w\/g/g) || []).length;
assert.equal(bw, 0, bw + '× /\\b\\w/g in den Vorlagen');
console.log('ok – Klima-Messwerte: PM2.5/CO₂ … nach Geräteklasse, ohne Gerätenamen, Großschreibung umlautfest');
