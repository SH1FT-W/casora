// Weich-Wiedergabe (09.10.2026): Cover-Streifen (Raumkarte/Handy) und Cover-Bühne (Welle-Menü).
//   node dev/unit/np_cover_streifen.mjs
// Prüft ohne Browser, was paint() aus 09-weich-wiedergabe.js zeichnet: (1) Zurück/Vor nur, wenn der
// Player sie kann (controls aus supported_features); (2) Streifen ohne Zeiten und Lautstärke;
// (3) Bühne nur für die erste Wiedergabe, mit Zeiten, „Gerät · Raum“ und Lautstärke nur bei
// volume_set (Bit 4) samt Pegel; (4) App ohne Medientitel (Netflix) steht als Titel, das Gerät darunter;
// (5) Coverfarbe gedämpft (Sättigung ≤ 70 %, Helligkeit 28–52 %), Uhrzeit-Format.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);
const hass = { themes: { darkMode: false }, areas: { wz: { name: 'Wohnzimmer' } }, devices: { d1: { area_id: 'wz' } },
  entities: { 'media_player.tv': { device_id: 'd1' }, 'media_player.box': { area_id: 'wz' } } };
const win = { addEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
class Img { set src(v) { this._s = v; } }
const ctx = vm.createContext({ window: win, document: { querySelector: (s) => (s === 'home-assistant' ? { hass } : null) },
  setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, requestAnimationFrame() {}, Image: Img,
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, console });
win.window = win;
vm.runInContext(fs.readFileSync(new URL('local/09-weich-wiedergabe.js', root), 'utf8'), ctx);
const NP = win._casoraNPSoft;

const states = {
  'media_player.box': { attributes: { friendly_name: 'Lautsprecher', supported_features: 4 | 16 | 32 | 16384 | 1, volume_level: 0.4 } },
  'media_player.tv': { attributes: { friendly_name: 'Fernseher', supported_features: 1 | 16384 } },
};
const box = { key: 'mp1', kind: 'player', entity: 'media_player.box', title: 'Lied', mtitle: 'Lied', subtitle: 'Band',
  source: 'Lautsprecher', playing: true, controls: { toggle: true, prev: true, next: true }, pos: 30, dur: 200, posAt: 0, art: '' };
const tv = { key: 'mp2', kind: 'player', entity: 'media_player.tv', title: 'Fernseher', mtitle: '', subtitle: '',
  source: 'Netflix', playing: true, controls: { toggle: true, prev: false, next: false }, pos: NaN, dur: NaN, posAt: 0, art: '/casora_assets/icons/netflix.png' };
const draw = (list, opt) => { const w = { isConnected: true, innerHTML: '' }; NP.paint({ rows: {} }, w, list, states, opt); return w.innerHTML; };
const rows = (html) => html.split('<div class="r ').slice(1);

// Streifen (Raumkarte/Handy)
let r = rows(draw([box, tv], {}));
assert.equal(r.length, 2, 'zwei Streifen');
assert.ok(/data-a="prev"/.test(r[0]) && /data-a="next"/.test(r[0]), 'Zurück/Vor beim Lautsprecher');
assert.ok(!/data-a="(prev|next)"/.test(r[1]), 'keine Zurück/Vor beim Fernseher ohne Bits 16/32');
assert.ok(r.every((x) => !/class="(tm|vo)"/.test(x)), 'Streifen ohne Zeiten und Lautstärke');
assert.ok(!r.some((x) => /^tn st/.test(x)), 'keine Bühne ohne stage');
assert.ok(/class="t">Netflix</.test(r[1]) && /class="s">Fernseher</.test(r[1]), 'App als Titel, Gerät darunter: ' + r[1]);
assert.ok(/class="s">Band · Lautsprecher</.test(r[0]), 'Unterzeile Interpret · Gerät');
assert.ok(/ nc"/.test(r[0]) && /^tn/.test(r[0]), 'ohne Cover: ruhiger Rückfall (nc)');

// Bühne (Welle-Menü)
let html = draw([box, tv], { panel: true, stage: true });
r = rows(html);
assert.ok(/^tn st/.test(r[0]) && !/^tn st/.test(r[1]), 'nur die erste Wiedergabe als Bühne');
assert.ok(/class="t0">0:30</.test(r[0]) && /class="t1">−2:50</.test(r[0]), 'Zeiten auf der Bühne: ' + r[0].slice(0, 400));
assert.ok(/class="vo"/.test(r[0]) && /aria-valuenow="40"/.test(r[0]), 'Lautstärke 40 % auf der Bühne');
assert.ok(/class="a">Band</.test(r[0]) && /class="s">Lautsprecher · Wohnzimmer</.test(r[0]), 'Interpret und „Gerät · Raum“');
html = draw([tv, box], { panel: true, stage: true });
r = rows(html);
assert.ok(/^tn st/.test(r[0]) && !/class="vo"/.test(r[0]), 'Fernseher ohne volume_set: keine Lautstärke');
assert.ok(!/class="tm"/.test(r[0]), 'ohne Dauer keine Zeiten');
assert.ok(/class="s">Fernseher · Wohnzimmer</.test(r[0]), 'Raum über das Gerät: ' + r[0].slice(0, 600));

// Farbe und Uhr
const hsl = (c) => c.match(/\d+/g).map(Number);
let [, s, l] = hsl(NP.clampColor(255, 255, 0));
assert.ok(s <= 70 && l >= 28 && l <= 52, 'Gelb gedämpft: ' + [s, l]);
[, s, l] = hsl(NP.clampColor(5, 5, 5));
assert.ok(l >= 28, 'Schwarz aufgehellt');
assert.equal(NP.clock(65), '1:05');
assert.equal(NP.clock(3725), '1:02:05');
console.log('ok np_cover_streifen');
