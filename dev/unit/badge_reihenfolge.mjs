// Badge-Reihenfolge Studio = Dashboard, Szenen-Badge sortierbar, Name der Übersicht in der Handy-Leiste.
//   node dev/unit/badge_reihenfolge.mjs
// Gemeldet 03.10.2026: (1) eine umbenannte Übersicht hieß in der Handy-Leiste weiter „Zuhause“,
// (2) die Studio-Vorschau ordnete die Badges anders als das Dashboard, (3) Szenen fehlte in der
// Reihenfolge-Liste. Hier ohne Browser: Studio-Rangfolge (badgeOrderOf) gegen die Ausdrücke der
// Vorlagen (--casora-badge-order-*), order:var(...) an jeder Badge der oberen Reihe, home_label.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = [
  one(/^const BADGE_ORDER_IDS = .*$/m),
  grab(/^function badgeOrderOf\(/m),
  one(/^const MOBILE_NAV = .*$/m),
  one(/^const isDefaultHomeName = .*$/m),
  one(/^const isHomeRoom = [^;]*;/ms),
  one(/^const AUTO_HOME = .*$/m),
  one(/^const isLiteralName = .*$/m),
  one(/^const isAutoHome = .*$/m),
  one(/^const isDefaultHome = .*$/m),
  grab(/^function markPhoneManaged\(/m),
].join('\n');
const { BADGE_ORDER_IDS, badgeOrderOf, markPhoneManaged } =
  new Function(code + '\nreturn { BADGE_ORDER_IDS, badgeOrderOf, markPhoneManaged };')();

// ── Reihenfolge ──────────────────────────────────────────────────────────────
assert.deepEqual(BADGE_ORDER_IDS, ['security', 'climate', 'lights', 'people', 'energy', 'scenes', 'media'],
  'Standard = was das Dashboard ohne badge_order zeichnet');
assert.deepEqual(badgeOrderOf(undefined), BADGE_ORDER_IDS);
// Ältere gespeicherte Liste ohne Szenen: Szenen bleibt hinten.
assert.deepEqual(badgeOrderOf(['climate', 'lights', 'people', 'media', 'security', 'energy']),
  ['climate', 'lights', 'people', 'media', 'security', 'energy', 'scenes']);
assert.deepEqual(badgeOrderOf(['scenes', 'x', 'energy', 'scenes']).slice(0, 3), ['scenes', 'energy', 'security']);

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const jsOf = (s) => new Function('variables', String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
const rankFrom = (tpl, variables) => {
  const out = {};
  (T[tpl].styles.card || []).forEach((e) => Object.entries(e).forEach(([k, v]) => {
    const m = /^--casora-badge-order-(\w+)$/.exec(k);
    if (m) out[m[1]] = Number(jsOf(v)(variables));
  }));
  return out;
};
const saved = [undefined, null, ['energy', 'scenes', 'climate'], ['climate', 'lights', 'people', 'media', 'security', 'energy'],
  ['scenes', 'people', 'media', 'lights', 'climate', 'energy', 'security'], ['x', 'media', 'media']];
for (const tpl of ['casora_room', 'casora_mobile_filter_badges']) {
  for (const o of saved) {
    const r = rankFrom(tpl, { badge_order: o });
    assert.deepEqual(Object.keys(r).sort(), [...BADGE_ORDER_IDS].sort(), tpl + ': alle sieben Variablen');
    const dash = Object.keys(r).sort((a, b) => r[a] - r[b]);
    assert.deepEqual(dash, badgeOrderOf(o), tpl + ' ordnet wie das Studio: ' + JSON.stringify(o));
  }
}
assert.ok('badge_order' in (T.casora_mobile_filter_badges.variables || {}),
  'Handy-Badges deklarieren badge_order (sonst wird es nicht vom Desktop übernommen)');

// Jede Badge der oberen Reihe sortiert über ihre Variable, mit dem Standardplatz als Rückfall.
const HOST = {
  casora_badge_security_group: 'security', casora_badge_climate_group: 'climate', casora_badge_temp: 'climate',
  casora_badge_humidity: 'climate', casora_badge_air_quality: 'climate', casora_badge_light_group: 'lights',
  casora_badge_presence_group: 'people', casora_badge_presence: 'people', casora_badge_media_group: 'media',
  casora_badge_energy_group: 'energy', casora_badge_scene_group: 'scenes',
};
for (const [tpl, id] of Object.entries(HOST)) {
  const want = `order:var(--casora-badge-order-${id},${BADGE_ORDER_IDS.indexOf(id) + 1})`;
  assert.ok(String(T[tpl].extra_styles || '').includes(want), tpl + ' braucht ' + want);
}
// Keine Badge der Reihe ohne Platz (sonst order 0 = ganz vorn). Einzeln gezeigte
// Sicherheits-Unter-Badges (show_security_inline) sortieren über variables.inline.
const INLINE_SEC = "${variables?.inline ? 'order:var(--casora-badge-order-security,1);' : ''}";
const rowCards = [...T.casora_room.custom_fields.badges.card.cards,
  ...T.casora_mobile_filter_badges.custom_fields.badges.card.cards].filter((c) => c.template);
rowCards.forEach((c) => assert.ok(HOST[c.template]
  || (c.variables?.inline === true && String(T[c.template].extra_styles || '').includes(INLINE_SEC)),
  'Badge ohne Reihenfolge: ' + c.template));

// ── Handy-Raum: Chips Temperatur, Luftfeuchtigkeit, Luftqualität, dann Licht, Bewegung ──
// Gemeldet 04.10.2026 (1.0.2): Licht stand vorn. Die Klima-Chips sortieren über
// --casora-badge-order-climate (Standard 2), Licht und Bewegung haben kein order (0) –
// die Raum-Reihe setzt Klima deshalb auf 0, wie Hemma.
{
  const chips = T.casora_mobile_sensor_chips;
  const row = chips.styles.custom_fields.rooms_row;
  const v = row.find((x) => x['--casora-badge-order-climate'] !== undefined);
  assert.equal(String(v && v['--casora-badge-order-climate']), '0', 'Raum-Reihe: Klima-Chips vor Licht');
  const order = (t) => { const m = /order:var\(--casora-badge-order-climate,\s*(\d+)\)/.exec(String(T[t].extra_styles || '')); return m ? m[1] : null; };
  const kinds = chips.custom_fields.rooms_row.card.cards.map((c) => c.template);
  assert.deepEqual(kinds.slice(0, 4), ['casora_badge_temp', 'casora_badge_humidity', 'casora_badge_air_quality', 'casora_badge_light']);
  ['casora_badge_temp', 'casora_badge_humidity', 'casora_badge_air_quality'].forEach((t) => assert.ok(order(t) !== null, t + ' sortiert über Klima'));
  assert.ok(!/order:/.test(String(T.casora_badge_light.extra_styles || '')), 'Licht-Chip ohne eigenes order');
}

// ── Medien-Badge am Handy nur, wenn etwas läuft (wie am Desktop) ─────────────
// Gemeldet 04.10.2026: „Medien · Nichts läuft“ stand am Handy immer da (always_visible).
{
  const media = T.casora_mobile_filter_badges.custom_fields.badges.card.cards
    .filter((c) => c.template === 'casora_badge_media_group');
  assert.ok(media.length, 'Medien-Badge in der Handy-Leiste');
  media.forEach((c) => assert.ok(!(c.variables || {}).always_visible, 'Medien-Badge am Handy ohne always_visible'));
  assert.ok(!/forPhone\s*\?\s*players\.length > 0/.test(src), 'Studio-Handy-Vorschau: Medien nicht schon bei vorhandenen Playern');
}

// ── Name der Übersicht in der Handy-Leiste ───────────────────────────────────
const cfg = () => ({ views: [{ cards: [{ type: 'custom:casora-mobile-nav', home_label: 'Alt' }] }] });
const nav = (c) => c.views[0].cards[0];
const named = [{ path: 'home', name: 'Unser Haus', variables: {} }, { path: 'kueche', name: 'Küche', variables: {} }];
assert.equal(nav(markPhoneManaged(cfg(), true, true, named)).home_label, 'Unser Haus', 'eigener Name → home_label');
// Seit 04.10.2026: nur Casoras markierter Standardname wird übersetzt (home_auto), ohne
// Markierung steht „Home“ wie gespeichert.
const std = [{ path: 'home', name: 'Home', variables: { casora_auto_name: 'home' } }];
assert.equal(nav(markPhoneManaged(cfg(), true, true, std)).home_label, undefined, 'Standardname → kein home_label');
assert.equal(nav(markPhoneManaged(cfg(), true, true, std)).home_auto, true, 'Standardname → home_auto');
const old = [{ path: 'home', name: 'Home', variables: {} }];
assert.equal(nav(markPhoneManaged(cfg(), true, true, old)).home_label, 'Home', 'ohne Markierung → wie gespeichert');
const lit = [{ path: 'home', name: 'Home', variables: { name_literal: true } }];
assert.equal(nav(markPhoneManaged(cfg(), true, true, lit)).home_label, 'Home', 'getipptes „Home“ bleibt „Home“');
assert.equal(nav(markPhoneManaged(cfg())).home_label, 'Alt', 'Handy allein geöffnet: unberührt');

const navSrc = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/04-navigation.js', import.meta.url), 'utf8');
assert.ok(/home_label/.test(navSrc), 'Handy-Leiste liest home_label');

console.log('badge_reihenfolge: ok');
