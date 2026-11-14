// Setpoint caption (owner 14.11.2026, V22): the dial of a thermostat-like device (Velair, kettle) says „Zielwert“, its
// own phrase – en „Target“, fr „Consigne“ – instead of „Ziel“, which stays the pet's daily goal („Goal“, „Objectif“).
// The oven's status line „Ziel 180 °C“ goes through the „Ziel …“ pattern („Target 180 °C“), not „Goal“ + number.
//   node dev/unit/i18n_setpoint_caption.mjs
// @deckt: custom_components/casora/scripts/local/31-velair.js, custom_components/casora/scripts/local/37-kettle.js, custom_components/casora/scripts/local/02-devices.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const CC = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, CC), 'utf8');
const DASH = read('scripts/casora-i18n.js');
const tick = () => new Promise((r) => setTimeout(r, 0));

async function dash(language) {
  const H = { hass: { locale: { language } } };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? H : /casora-i18n\.js/.test(q) ? { src: 'http://ha.local/casora_scripts/casora-i18n.js?v=1' } : null), addEventListener() {} };
  const fetchStub = (url) => { const m = /\/i18n\/([a-z]+)\.json/.exec(url); return Promise.resolve(m ? { ok: true, text: async () => read('scripts/i18n/' + m[1] + '.json') } : { ok: false }); };
  const store = new Map();
  const win = { dispatchEvent() {}, addEventListener() {} };
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', 'fetch', 'localStorage', 'location', 'navigator', DASH)(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }, fetchStub,
      { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, { href: 'http://ha.local/x' }, { language: 'de-DE' });
  } catch (e) { /* no browser */ }
  win.casoraTr('Heute');
  await tick(); await tick(); await tick();
  return win.casoraTr;
}

const WANT = { en: 'Target', fr: 'Consigne', es: 'Consigna', it: 'Impostata', nl: 'Doel', pl: 'Zadana', pt: 'Alvo', nb: 'Mål' };
for (const [lang, word] of Object.entries(WANT)) {
  const tr = await dash(lang);
  assert.equal(tr('Zielwert'), word, lang + ': setpoint caption');
  assert.notEqual(tr('Ziel'), 'Ziel', lang + ': the pet goal is translated too');
}
const en = await dash('en'), fr = await dash('fr');
assert.equal(en('Ziel'), 'Goal', 'pet goal stays „Goal“');
assert.equal(fr('Ziel'), 'Objectif');
assert.equal(en('Ziel 180 °C'), 'Target 180 °C', 'oven status line: the pattern');

const S = (f) => read('scripts/local/' + f);
for (const f of ['31-velair.js', '37-kettle.js']) {
  assert.ok(!/caption: 'Ziel'/.test(S(f)), f + ': no bare „Ziel“ caption');
  assert.match(S(f), /caption: 'Zielwert'/, f + ': setpoint caption');
}
assert.ok(!/T\('Ziel'\) \+ ' ' \+ target/.test(S('02-devices.js')), 'oven: „Ziel“ not translated alone before the number');
assert.match(S('26-haustier.js'), /T\('Ziel'\)/, 'pet keeps „Ziel“');
console.log('i18n_setpoint_caption: ok');
