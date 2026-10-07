// Sicherheits-Badge kurz oder ausführlich (07.10.2026): Einstellung security_summary je Raum.
// '' / auto (Standard) = Startseite kurz (Symbole mit Zahl), Räume ausgeschrieben;
// short = immer kurz, detailed = immer ausführlich. Drei Modi × Startseite/Raum, die Erkennung
// der Startseite am Desktop (window.casoraOnHomeView) und wer der Vorlage place mitgibt.
//   node dev/unit/sicherheit_kurz_auto.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/00-finden.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';

const mode = window.casoraSecurityMode;
const sec = { triggered: false, disarmed: false, locks: 0, lockDead: 0, doors: 1, windows: 2,
  doorsTilted: 0, windowsTilted: 0, gates: 0, camDead: 0, insecure: true, problem: false };

// Drei Modi × Startseite/Raum – und was dann in der Unterzeile steht.
const WANT = {
  '': { home: 'short', room: 'detailed' },
  auto: { home: 'short', room: 'detailed' },
  short: { home: 'short', room: 'short' },
  detailed: { home: 'detailed', room: 'detailed' },
};
for (const [set, by] of Object.entries(WANT)) {
  for (const place of ['home', 'room']) {
    const m = mode(set, place);
    assert.equal(m, by[place], `${set || '(leer)'} auf ${place}`);
    const r = window.casoraSecuritySummary(sec, { summary: m });
    assert.equal(r.text, 'Tür offen · 2 Fenster offen', 'Text bleibt die Liste in Worten');
    if (m === 'short') assert.ok(r.html && r.html.includes('window-open.svg'), 'kurz = Symbole');
    else assert.equal(r.html, null, 'ausführlich = Worte');
  }
}
// Unbekannter Ort zählt als Raum, alte/fremde Werte fallen auf Automatisch.
assert.equal(mode(undefined, null), 'detailed');
assert.equal(mode(null, 'home'), 'short');
assert.equal(mode('Detailed', 'home'), 'detailed');
assert.equal(mode('quatsch', 'home'), 'short');
// „Alles sicher“ bleibt in jedem Modus.
const ok = { ...sec, doors: 0, windows: 0, insecure: false };
for (const s of ['', 'short', 'detailed']) for (const p of ['home', 'room']) {
  assert.deepEqual(window.casoraSecuritySummary(ok, { summary: mode(s, p) }), { text: 'Alles sicher', html: null });
}

// Startseite am Desktop: die umgebende Ansicht (hui-view mit index + lovelace), wie isHomeRoom im Studio.
const viewOf = (views, index) => ({ localName: 'hui-view', lovelace: { config: { views } }, index, parentNode: null });
const cardIn = (view) => {
  // Karte in einer layout-card (grid-layout hat auch lovelace + index = Kartenplatz) im Shadow-Root.
  const grid = { localName: 'grid-layout', lovelace: view.lovelace, index: 3, parentNode: view };
  const shadow = { parentNode: null, host: { parentNode: { parentNode: null, host: grid } } };
  return { parentNode: { parentNode: shadow } };
};
const homeFirst = [{ path: 'home' }, { path: 'wohnzimmer' }];
assert.equal(window.casoraOnHomeView(cardIn(viewOf(homeFirst, 0))), true);
assert.equal(window.casoraOnHomeView(cardIn(viewOf(homeFirst, 1))), false);
const homeLater = [{ path: 'kueche' }, { path: 'home' }];
assert.equal(window.casoraOnHomeView(cardIn(viewOf(homeLater, 1))), true, 'Pfad „home“ zählt, auch nicht vorn');
assert.equal(window.casoraOnHomeView(cardIn(viewOf(homeLater, 0))), false);
const noHome = [{ path: 'a' }, { path: 'b' }];
assert.equal(window.casoraOnHomeView(cardIn(viewOf(noHome, 0))), true, 'ohne „home“ ist die erste Ansicht die Startseite');
assert.equal(window.casoraOnHomeView(cardIn(viewOf(noHome, 1))), false);
assert.equal(window.casoraOnHomeView({ parentNode: null }), null, 'außerhalb eines Dashboards: unbekannt');

// Vorlagen: Standard auto; Handy-Startseite sagt home, Handy-Raumseite room, der Desktop erkennt selbst.
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const g = T.casora_badge_security_group;
assert.equal(g.variables.summary, 'auto');
assert.ok(g.name.includes('window.casoraSecurityMode(variables.summary, place)'));
assert.ok(g.name.includes('window.casoraOnHomeView(this)'));
const groupIn = (t) => {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') { if (x.template === 'casora_badge_security_group') out.push(x); Object.values(x).forEach(walk); }
  };
  walk(T[t]);
  return out;
};
assert.deepEqual(groupIn('casora_mobile_filter_badges').map((c) => c.variables.place), ['home']);
assert.deepEqual(groupIn('casora_mobile_sensor_chips').map((c) => c.variables.place), ['room']);
assert.deepEqual(groupIn('casora_room').map((c) => c.variables.place), [undefined]);

// Studio: drei Werte, leer = Automatisch; Vorschau nutzt denselben Helfer.
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.ok(panel.includes('{ key: "security_summary", label: "Summary", type: "select", options: ["", "detailed", "short"]'));
assert.ok(panel.includes('optionLabels: { "": "Automatic", detailed: "Always detailed", short: "Always short" }'));
assert.ok(panel.includes('window.casoraSecurityMode(V.security_summary, secPlace)'));
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.equal(de['Always detailed'], 'Immer ausführlich');
assert.equal(de['Always short'], 'Immer kurz');
// ⌘K: „Sicherheit kurz“ / „Sicherheit ausführlich“ findet das Sicherheits-Badge.
const mehr = read('custom_components/casora/panel/casora-panel-b-mehr.js');
const words = /security: "(sicherheit [^"]+)"/.exec(mehr)[1];
for (const w of ['sicherheit', 'kurz', 'ausführlich']) assert.ok(words.includes(w), w);
console.log('ok sicherheit_kurz_auto');
