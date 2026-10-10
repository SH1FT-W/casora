// Leistung lst-07 (10.10.2026): casora_now_playing zeichnet nach der Schonfrist neu – bisher wirkungslos:
// button-card hat für hass keinen Getter (this.hass = undefined), und ein nacktes requestUpdate() lehnt
// shouldUpdate() ab. Die Kachel blieb im Zwischenstand. Erwartet: neues hass-Objekt + requestUpdate('_config').
//   node dev/unit/np_nachzeichnen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const v = T.casora_now_playing.variables.settled;
const code = (typeof v === 'string' ? v : v.value).replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const timers = [];
const window = { _casoraNPDesktopSettle: () => ({ pending: true, list: [] }) };
const calls = [];
const hass0 = { states: {} };
// Wie button-card: hass nur als Setter, _hass intern.
const el = { _hass: hass0, requestUpdate: (...a) => calls.push(['ru', ...a]) };
Object.defineProperty(el, 'hass', { set(h) { calls.push(['hass', h !== hass0]); this._hass = h; }, configurable: true });
const fn = new Function('window', 'states', 'variables', 'setTimeout', 'clearTimeout', code);
fn.call(el, window, {}, {}, (f, ms) => { timers.push(f); return 1; }, () => {});
assert.equal(timers.length, 1, 'Nachzeichnen geplant');
timers[0]();
assert.deepEqual(calls.find((c) => c[0] === 'hass'), ['hass', true], 'neues hass-Objekt gesetzt');
assert.ok(calls.some((c) => c[0] === 'ru' && c[1] === '_config'), 'requestUpdate("_config") – sonst lehnt button-card ab: ' + JSON.stringify(calls));
console.log('ok np_nachzeichnen');
