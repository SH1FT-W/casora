// Popup blueprint v2 (docs/handbuch/popup-blaupause.md), static, without HA:
//   node dev/unit/popup_blaupause.mjs            check
//   node dev/unit/popup_blaupause.mjs --stand    print today's counts (to update the exception list)
// Popups compose the shared pieces of window._casoraUI (casora-core.js) instead of building their own. What can be
// seen in the source is counted per file (dashboard modules) or per template (button_card_templates.json):
//  1. The pieces exist: UI.section/row/settingsRow/settings/actions/empty/width/page, casoraPopup.sub, widths 552/900.
//  2. Widths: a popup is 552 (one column) or 900 (two columns or a picture, max 920) – other widths only as listed.
//  3. „Weitere Einstellungen“ comes from UI.settingsRow/UI.settings (HH/K layout option settings), not a hand-made row.
//  4. Device popups have „Weitere Einstellungen“ as their last section (a settings marker in the module/template).
//  5. No own header in the content: no 28 px/800 title markup outside the frame.
//  6. No hand-made › arrows and pills: the › comes from the row types (UI.group), not an own SVG/mdi:chevron-right.
//  7. The main action is filled in the header tile's colour (UI.actions / .hh-pill.pri) – no fixed --casora-soft-primary.
// Legacy places that predate the blueprint are listed in popup_blaupause_ausnahmen.json with their count and reason
// (a ratchet like design_zaehler): more is red, fewer is red too – then the list is lowered (stages 2 and 3 shrink it).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const LOCAL = 'custom_components/casora/scripts/local/';
const MODS = fs.readdirSync(new URL(LOCAL, ROOT)).filter((f) => f.endsWith('.js')).sort();
const AUS = JSON.parse(rd('dev/unit/popup_blaupause_ausnahmen.json'));

// Every string of a template, joined (the [[[ … ]]] code and the plain values).
const strings = (x, out = []) => {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => strings(y, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((y) => strings(y, out));
  return out;
};
const SRC = {};
for (const f of MODS) SRC[LOCAL + f] = rd(LOCAL + f);
for (const [name, t] of Object.entries(T)) SRC['tpl:' + name] = strings(t).join('\n');
const count = (re) => {
  const out = {};
  for (const [k, s] of Object.entries(SRC)) {
    const n = (s.match(re) || []).length;
    if (n) out[k] = n;
  }
  return out;
};

// 1. The pieces exist (and stay where the handbook says).
const core = rd('custom_components/casora/scripts/casora-core.js');
for (const k of ['section', 'row', 'settingsRow', 'settings', 'actions', 'empty', 'width', 'switchHtml', 'page']) {
  assert.ok(new RegExp('\\b' + k + ': ' + k + '\\b').test(core), 'window._casoraUI.' + k + ' missing (casora-core.js)');
}
assert.ok(/sub: function \(cfg\)/.test(core), 'casoraPopup.sub missing');
assert.ok(/var WIDTH = \{ one: 552, two: 900, image: 900 \};/.test(core), 'widths 552/900 (rule 11)');
assert.ok(/SEC_ORDER = \['control', 'state', 'history', 'settings'\]/.test(core), 'fixed section order');
assert.ok(/data-casora-sec=/.test(core) && /data-casora-bp=/.test(core), 'sections and settings/empty rows are marked');

// 8. Symmetry (rule 12): every two-column layout helper marks its column pair, casora-core aligns the pair after
// opening (the column without a heading on top reserves the other one's heading height).
assert.ok(/function colsMark\(a, b\)/.test(core) && /function alignCols\(\)/.test(core) && /colsMark: |\.colsMark = colsMark/.test(core),
  'casora-core: colsMark/alignCols missing (rule 12, symmetry)');
assert.ok(/P\.open = function \(\) \{[\s\S]{0,200}setTimeout\(alignCols/.test(core), 'casora-core: alignCols not run after casoraPopup.open');
for (const [file, pair] of [['02-devices.js', "'left', 'right'"], ['05-weich-mehr.js', "'main', 'side'"], ['05-standard-medien.js', "'left', 'right'"]]) {
  assert.ok(SRC[LOCAL + file].includes('colsMark(' + pair + ')'), `${file}: two-column layout without colsMark(${pair}) (rule 12, symmetry)`);
}

// 2.–7. Counted against the exception list.
const CHECKS = {
  breite: {
    what: 'Popup-Breite außer 552/900/920 (casoraPopupWidth nehmen)',
    re: /--popup-(?:min|max)-width:\s*(?:min\()?(?!(?:552|900|920)px)\d+px/g,
  },
  weitere: {
    what: '„Weitere Einstellungen“ als eigene Zeile statt UI.settingsRow/UI.settings',
    re: /label:\s*'Weitere Einstellungen'/g,
  },
  kopf: {
    what: 'eigener Kopf im Inhalt (Titel 28 px/800 statt Rahmen)',
    re: /font-size:\s*28px\s*;\s*font-weight:\s*800/g,
  },
  pfeil: {
    what: 'eigener ›-Pfeil (SVG/mdi:chevron-right) statt Zeilenart',
    re: /M1 1L6 6L1 11|mdi:chevron-right/g,
  },
  primaer: {
    what: 'Hauptaktion in fester Farbe (--casora-soft-primary) statt Gerätefarbe',
    // A fallback inside the device colour (var(--casora-popup-accent, var(--casora-soft-primary …))) is fine.
    re: /(?<!--casora-popup-accent,\s?)var\(--casora-soft-primary\b/g,
  },
};
const stand = {};
const fehler = [];
for (const [key, c] of Object.entries(CHECKS)) {
  const now = count(c.re);
  stand[key] = now;
  const allow = (AUS[key] && AUS[key].stellen) || {};
  for (const [where, n] of Object.entries(now)) {
    const a = allow[where];
    if (!a) fehler.push(`${key}: ${where} – ${n}× ${c.what} (nicht in der Ausnahmeliste)`);
    else if (n > a.anzahl) fehler.push(`${key}: ${where} – ${n}× statt höchstens ${a.anzahl} (${c.what})`);
    else if (n < a.anzahl) fehler.push(`${key}: ${where} – nur noch ${n}× (Liste sagt ${a.anzahl}): Grenze in popup_blaupause_ausnahmen.json senken`);
  }
  for (const where of Object.keys(allow)) {
    if (!now[where]) fehler.push(`${key}: ${where} – Ausnahme nicht mehr nötig, aus popup_blaupause_ausnahmen.json streichen`);
  }
  for (const [where, a] of Object.entries(allow)) {
    if (!a.grund) fehler.push(`${key}: ${where} – Ausnahme ohne Grund`);
  }
}

// 4. Device popups: „Weitere Einstellungen“ as the last section. A popup is migrated when its source carries the
// settings marker; the not yet migrated ones are listed (stage 2/3) – a migrated one may not fall back.
const MARK = /\bsettings:\s*(?!null\b)|UI\.settings\(|UI\.settingsRow\(|_casoraUI\.settings\(|_casoraUI\.settingsRow\(|'devices\|'/;
const geraete = AUS.geraete || {};
for (const [where, g] of Object.entries(geraete.migriert || {})) {
  if (!SRC[where]) fehler.push(`geraete: ${where} gibt es nicht mehr – Liste anpassen`);
  else if (!MARK.test(SRC[where])) fehler.push(`geraete: ${where} (${g}) ohne „Weitere Einstellungen“-Abschnitt (UI.settings / Layout-Option settings)`);
}
for (const [where, g] of Object.entries(geraete.offen || {})) {
  if (!SRC[where]) fehler.push(`geraete: ${where} gibt es nicht mehr – Liste anpassen`);
  if (!g.grund) fehler.push(`geraete: ${where} – offen ohne Grund`);
}

if (process.argv.includes('--stand')) {
  console.log(JSON.stringify(stand, null, 1));
  process.exit(0);
}
assert.deepEqual(fehler, [], 'Popup-Blaupause v2 (docs/handbuch/popup-blaupause.md):\n  ' + fehler.join('\n  '));
const n = Object.values(stand).reduce((s, x) => s + Object.values(x).reduce((a, b) => a + b, 0), 0);
console.log(`ok popup_blaupause (${MODS.length} Module, ${Object.keys(T).length} Vorlagen, ${n} gelistete Altlasten, `
  + `${Object.keys(geraete.migriert || {}).length} Geräte-Popups mit „Weitere Einstellungen“, ${Object.keys(geraete.offen || {}).length} offen)`);
