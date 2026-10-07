// Unterzeile des Sicherheits-Sammelbadges (06.10.2026): Weich/Nebel bilden den Text mit
// window.casoraSecuritySummary (00-finden.js). Variable summary: short (Standard, Symbole mit Zahl)
// | detailed (Liste in Worten). Zustandswörter: „Alles sicher“, „Aktiv · <Modus>“, „Alarm!“.
//   node dev/unit/sicherheit_unterzeile.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/00-finden.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';

const Z = { triggered: false, disarmed: false, locks: 0, lockDead: 0, doors: 0, windows: 0,
  doorsTilted: 0, windowsTilted: 0, gates: 0, camDead: 0 };
const sec = (o = {}) => {
  const r = { ...Z, ...o };
  r.insecure = r.triggered || r.disarmed || !!(r.locks || r.doors || r.windows || r.doorsTilted || r.windowsTilted || r.gates);
  r.problem = !!(r.camDead || r.lockDead);
  return r;
};
const sum = window.casoraSecuritySummary;
const both = (s, o = {}) => [sum(s, { ...o, summary: 'short' }), sum(s, { ...o, summary: 'detailed' })];

// Alles zu: ohne Alarm „Alles sicher“, mit Alarm der Modus, ausgelöst „Alarm!“ – in beiden Arten gleich.
for (const r of both(sec())) assert.deepEqual(r, { text: 'Alles sicher', html: null });
for (const r of both(sec(), { alarmState: 'disarmed' })) assert.equal(r.text, 'Alles sicher');
for (const r of both(sec(), { alarmState: 'pending' })) assert.equal(r.text, 'Alles sicher');
const MODES = { armed_away: 'Abwesend', armed_home: 'Zuhause', armed_night: 'Nacht', armed_vacation: 'Urlaub', armed_custom_bypass: 'Bypass' };
for (const [st, w] of Object.entries(MODES)) for (const r of both(sec(), { alarmState: st })) assert.equal(r.text, 'Aktiv · ' + w);
for (const r of both(sec({ triggered: true, locks: 1, windows: 2 }), { alarmState: 'triggered' })) assert.deepEqual(r, { text: 'Alarm!', html: null });

// Ausführlich: Worte, „Schloss offen“ statt „1 Schloss“, Reihenfolge nach Wichtigkeit.
const mix = sec({ locks: 1, windows: 2, doorsTilted: 1, camDead: 1 });
assert.deepEqual(sum(mix, { summary: 'detailed' }), { text: 'Schloss offen · 2 Fenster offen · Tür gekippt · Kamera offline', html: null });
const all = sec({ disarmed: true, doors: 2, gates: 1, locks: 2, windows: 1, windowsTilted: 3, doorsTilted: 2, lockDead: 2, camDead: 2 });
assert.equal(sum(all, { summary: 'detailed' }).text,
  'Alarm aus · 2 Türen offen · Tor offen · 2 Schlösser offen · Fenster offen · 3 Fenster gekippt · 2 Türen gekippt · 2 Schlösser offline · 2 Kameras offline');
assert.equal(sum(sec({ gates: 2, lockDead: 1 }), { summary: 'detailed' }).text, '2 Tore offen · Schloss offline');
assert.equal(sum(sec({ disarmed: true }), { summary: 'detailed' }).text, 'Alarm aus');

// Kurz (Standard, auch ohne Angabe): ein Symbol je Meldung mit Zahl und Vorlese-Text.
for (const o of [{}, { summary: 'short' }, { summary: 'irgendwas' }]) {
  const r = sum(mix, o);
  assert.equal(r.text, 'Schloss offen · 2 Fenster offen · Tür gekippt · Kamera offline', 'Text bleibt die Liste (Tooltip)');
  assert.ok(r.html && r.html.startsWith('<span class="cs-sum"'));
}
const html = sum(all, {}).html;
const icons = [...html.matchAll(/url\('\/i\/([\w-]+)\.svg'\)/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) === i);
assert.deepEqual(icons, ['door-open', 'garage', 'lock-open', 'window-open', 'window-tilt', 'lock', 'camera'], 'Reihenfolge der Symbole');
const labels = [...html.matchAll(/aria-label="([^"]+)" title="([^"]+)"/g)].map((m) => { assert.equal(m[1], m[2]); return m[1]; });
assert.deepEqual(labels, ['2 Türen offen', 'Tor offen', '2 Schlösser offen', 'Fenster offen', '3 Fenster gekippt', '2 Türen gekippt', '2 Schlösser offline', '2 Kameras offline']);
assert.ok(html.indexOf('>Alarm aus<') > 0 && html.indexOf('>Alarm aus<') < html.indexOf('door-open'), 'Alarm aus steht vorn, als Wort');
// gekippt hat ein eigenes Symbol (nicht das von „offen“), offline ist durchgestrichen.
const one = (o) => sum(sec(o), {}).html;
assert.ok(one({ windowsTilted: 1 }).includes('window-tilt') && !one({ windowsTilted: 1 }).includes('window-open'));
assert.ok(one({ windows: 1 }).includes('window-open') && !one({ windows: 1 }).includes('window-tilt'));
assert.ok(one({ camDead: 1 }).includes('rotate(-45deg)') && !one({ locks: 1 }).includes('rotate(-45deg)'));
// Zahl bei jedem Symbol, auch bei 1.
assert.ok(/font-weight:700">1<\/span>/.test(one({ locks: 1 })));
// Attribute werden übersetzt (Englisch) und maskiert.
window.casoraTr = (t) => ({ '2 Fenster offen': '2 windows open' }[t] || t);
assert.ok(sum(sec({ windows: 2 }), {}).html.includes('aria-label="2 windows open"'));
delete window.casoraTr;

// Englisch: alle Wörter haben einen Eintrag in phrases/en.json.
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json'));
const enTr = (t) => {
  if (en.exact[t]) return en.exact[t];
  for (const [p, r] of en.patterns) { const m = t.match(new RegExp(p)); if (m) return r.replace(/\{(\d)\}/g, (x, i) => m[+i]); }
  return t.includes(' · ') ? t.split(' · ').map(enTr).join(' · ') : null;
};
assert.equal(enTr('Alles sicher'), 'All secure');
assert.equal(enTr('Schloss offen'), 'Lock open');
assert.equal(enTr('2 Schlösser offen'), '2 locks open');
assert.equal(enTr('Aktiv · Abwesend'), 'Active · Away');
for (const part of sum(all, { summary: 'detailed' }).text.split(' · ')) assert.ok(enTr(part), 'Englisch fehlt: ' + part);

// Vorlage: Weich nutzt den Helfer mit variables.summary (Standard auto, siehe sicherheit_kurz_auto), Standard/Glas sagen „Schloss offen“.
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const g = T.casora_badge_security_group;
assert.equal(g.variables.summary, 'auto');
assert.ok(g.name.includes('window.casoraSecuritySummary(_sec') && g.name.includes('variables.summary'));
assert.ok(!g.name.includes('casora-entwurf-sicherheit'), 'Entwurfs-Umschalter entfernt');
assert.ok(g.name.includes("'Schloss offen', 'Schlösser offen'") && !g.name.includes("'1 Schloss'"));
for (const host of ['casora_room', 'casora_mobile_filter_badges']) {
  assert.ok(JSON.stringify(T[host]).includes('"summary":"[[[ return variables.security_summary ]]]"'), host + ' reicht security_summary weiter');
  assert.ok(Object.prototype.hasOwnProperty.call(T[host].variables, 'security_summary'), host + ' deklariert security_summary');
}
assert.ok(JSON.stringify(T.casora_mobile_sensor_chips).includes('return _rv.security_summary'), 'Handy-Raumseite reicht security_summary weiter');
assert.ok(fs.existsSync(new URL('../../custom_components/casora/assets/icons/window-tilt.svg', import.meta.url)));
console.log('ok sicherheit_unterzeile');
