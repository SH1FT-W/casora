// Tanken im Auto-Popup (1.2): Empfehlungslogik und Kürzel-Kreise ohne Browser.
//   node dev/unit/tanken_empfehlung.mjs
// Erwartet: Lernphase → Hinweis statt Empfehlung, Tank knapp → „Jetzt tanken“, abends im Schnitt
// mindestens 2 ct günstiger → „Warte bis heute Abend“, Preis am Tief → „Jetzt tanken“, sonst „Kein
// großer Unterschied“; ohne Sensor keine Zeile.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => ({ hass: { entities: {}, locale: { language: 'de' } } }), addEventListener: () => {} };
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/12-tanken.js', import.meta.url), 'utf8');
new Function(src)();
const K = window._casoraTank;
assert.ok(K && typeof K.advice === 'function');

// Typischer Tag: tagsüber 1,75 €, ab 19 Uhr 1,69 €, nachts 1,72 €.
const day = Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 22 ? 1.69 : h < 6 ? 1.72 : 1.75));
const base = { price: 1.749, typical: day, hour: 15, tank: 40, range: 300, learn: 0, fuel: 'Super E10', low: 1.69 };

// Lernphase: Hinweis mit Resttagen, keine Empfehlung.
let a = K.advice({ ...base, learn: 5 });
assert.equal(a.kind, 'lernen');
assert.equal(a.text, 'Die Empfehlung kommt, sobald genug Preise gesammelt sind, in etwa 5 Tagen.');
assert.equal(K.advice({ ...base, learn: 1 }).text, 'Die Empfehlung kommt, sobald genug Preise gesammelt sind, in etwa einem Tag.');
assert.equal(a.short, 'Preise werden gesammelt');

// Abends günstiger → warten.
a = K.advice(base);
assert.equal(a.kind, 'warten');
assert.equal(a.hour, 19);
assert.equal(a.title, 'Warte bis heute Abend');
assert.equal(a.eyebrow, 'Heute ab 19 Uhr');
assert.equal(a.text, 'Tank reicht noch 300 km. Ab 19 Uhr lag Super E10 in den letzten 14 Tagen im Schnitt 6 ct niedriger.');
assert.equal(a.short, 'abends günstiger');

// Tank knapp schlägt jede Ersparnis.
a = K.advice({ ...base, tank: 12, range: 85 });
assert.equal(a.kind, 'knapp');
assert.equal(a.title, 'Jetzt tanken');
assert.equal(a.text, 'Tank bei 12 %, noch etwa 85 km. Warten lohnt sich nicht.');
assert.equal(K.advice({ ...base, tank: null, range: 40 }).text, 'Noch etwa 40 km. Warten lohnt sich nicht.');

// Abends: Preis am Tief → jetzt tanken.
a = K.advice({ ...base, hour: 20, price: 1.689 });
assert.equal(a.kind, 'jetzt');
assert.equal(a.text, 'Super E10 liegt gerade im unteren Bereich der letzten 14 Tage.');

// Flacher Tag → kein großer Unterschied.
a = K.advice({ ...base, typical: Array(24).fill(1.72), price: 1.74, low: 1.72 });
assert.equal(a.kind, 'egal');

// Spät abends: nächstes Tief erst morgen → „morgen“, nur übliche Tankzeiten (6 bis 22 Uhr).
const morning = Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 9 ? 1.65 : 1.75));
a = K.advice({ ...base, typical: morning, hour: 23, price: 1.75, low: 1.65 });
assert.equal(a.kind, 'warten');
assert.equal(a.hour, 7);
assert.equal(a.eyebrow, 'Morgen ab 7 Uhr');
// 1.2.1 (E1): Uhrzeit im Format der Sprache – englisch 12 Stunden, deutsch bleibt „19 Uhr“.
window.casoraLocale = () => 'en';
const en = K.advice(base);
assert.equal(en.eyebrow.replace(/\u202f/g, ' '), 'Heute ab 7:00 PM');
assert.ok(/^Tank reicht noch 300 km\. Ab 7:00.PM lag/.test(en.text), en.text);
window.casoraLocale = () => 'de';
assert.equal(K.advice(base).eyebrow, 'Heute ab 19 Uhr');
assert.equal(a.title, 'Warte bis morgen früh');

// Keine offene Tankstelle.
assert.equal(K.advice({ ...base, price: null }).kind, 'keine');

// Kürzel-Kreise statt Markenlogos.
assert.equal(K.abbr({ b: 'Freie', n: 'Freie Tankstelle Mühlweg' }), 'FM');
assert.equal(K.abbr({ b: '', n: 'Autohof Nord' }), 'AN');
assert.equal(K.abbr({ b: 'Bahnhof-Tankstelle', n: '' }), 'BT');
assert.equal(K.abbr({ b: 'Marke', n: 'Einzelname' }), 'MA');

// Ohne Sensor (nicht eingerichtet) keine Zeile.
window._casoraUI = { group: () => '<g>' };
window._casoraHH = { on: () => true };
window._casoraCar = { map: () => ({}), read: () => ({}) };
assert.equal(K.row(null, {}), '');

console.log('ok tanken_empfehlung');
