// Umzug Hemma → Casora: Wetter in jedem Raum.
//   node dev/unit/umzug_wetter.mjs
// Gemeldet (Umzugstest): Hemma zeigte das Wetter der Übersicht in jedem Raum (im Browser
// gemerkt). Casora liest nur das Dashboard – nach dem Umzug fehlte es überall außer in der
// Übersicht. Erwartet: der Umzug übernimmt es in Räume ohne eigenes Wetter.
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Wetter übernehmen (casora-panel-umzug.js spreadWeather)
globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8')
  .replace('new URL("./hemma-originals.json", import.meta.url).href', '"x"');
new Function(src)();
const { spreadWeather } = window.casoraUmzug;
const home = { name: 'Home', home: true, vars: { weather_entity: 'weather.forecast_home', weather_temp_sensor: 'sensor.aussen' } };
const wz = { name: 'Wohnzimmer', vars: {} };
const bad = { name: 'Bad', vars: { weather_entity: 'weather.andere' } };
assert.equal(spreadWeather([home, wz, bad]), 1);
assert.deepEqual(wz.vars, { weather_entity: 'weather.forecast_home', weather_temp_sensor: 'sensor.aussen' }, 'Raum ohne Wetter bekommt das der Übersicht');
assert.deepEqual(bad.vars, { weather_entity: 'weather.andere' }, 'eigenes Wetter bleibt');
assert.equal(spreadWeather([{ name: 'Home', home: true, vars: {} }, { name: 'X', vars: {} }]), 0, 'ohne Wetter nichts');
console.log('ok umzug_wetter');
