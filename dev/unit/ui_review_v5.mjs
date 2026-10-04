// UI-Review 01.10.2026 (Apple-HIG-Blick), freigegebene Punkte – nicht still zurückdrehen:
//  V5  eine Popup-Familie: kein Popup mehr ohne Fläche (Sheet), Kreuz mit Abstand zur Kante,
//      Licht-Kopfzahl zählt die gewählte Raumliste.
//  V6  Kamera-Knöpfe ≥ 44 pt (52 px) mit Beschriftung nach der echten Funktion,
//      Offline-Hinweis mit „Erneut versuchen“.
//  V7  Kacheln am Handy: keine Schrumpf-Schrift mehr, „…“ statt Verkleinern; Netzwerk kurz.
//  Weitere Funde: Raster unter breitem Diagramm, Scroll-Hinweis, Badge-Breite, Karussell-Punkte,
//      Menüsymbol, Raumleisten-Pfeil.
//   node dev/unit/ui_review_v5.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(src('custom_components/casora/panel/casora-templates.json')).templates;
const O = JSON.parse(src('dashboards/casora/button_card_templates.json'));
const core = src('custom_components/casora/scripts/casora-core.js');
const pop = src('custom_components/casora/scripts/local/03-popups.js');
const std = src('custom_components/casora/scripts/local/05-standard-medien.js');
const swipe = src('custom_components/casora/scripts/casora-swipe-card.js');
const en = JSON.parse(src('custom_components/casora/translations/dashboard/phrases/en.json')).exact;

// ── V5 ──
const popupStyles = (o, out = []) => {
  if (Array.isArray(o)) o.forEach((x) => popupStyles(x, out));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'popup_styles' && Array.isArray(v)) v.forEach((p) => p && typeof p.styles === 'string' && out.push(p.styles));
      else popupStyles(v, out);
    }
  }
  return out;
};
for (const [name, set] of [['Paket', T], ['Overlay', O]]) {
  const flat = Object.entries(set).filter(([, v]) => popupStyles(v).some((s) => /--casora-popup-tint:\s*transparent/.test(s))).map(([k]) => k);
  assert.deepEqual(flat, [], `${name}: Popups ohne Sheet-Fläche: ${flat.join(', ')}`);
}
for (const k of ['casora_popup_light', 'casora_popup_camera', 'casora_climate_popup']) {
  assert.ok(popupStyles(T[k]).some((s) => s.includes('--casora-popup-header-gap: 14px') && s.includes('.header { padding-top')),
    `${k}: Schließen-Kreuz mit Sheet-Abstand`);
}
const lpc = T.casora_popup_light.custom_fields.lpc_init;
assert.ok(lpc.includes('_casoraLPRstEl[_pgid] = this') && lpc.includes("querySelector('.lp-st')"), 'Licht-Kopfzahl folgt der Raumauswahl');
assert.ok(lpc.includes("oc + ' An'") && !lpc.includes("oc + ' an'"), 'Licht-Kopf: „1 An“ groß');

// ── V6 ──
const cam = T.casora_popup_camera.tap_action.casora_popup.content;
assert.equal(cam, T.casora_popup_camera.icon_tap_action.casora_popup.content, 'Kamera: tap und icon_tap gleich');
assert.ok(/width:52px;height:52px;/.test(cam) && !/width:38px;height:38px;/.test(cam), 'Kamera-Knöpfe 52 px');
for (const l of ["'Ton')", "'Aufnahme')", "'Ausfüllen')"]) assert.ok(cam.includes(l), 'Kamera-Beschriftung ' + l);
assert.ok(cam.includes('cam-lbl') && cam.includes('height:52px;padding:0 15px'), 'Zubehör-Pille 52 px + Beschriftung');
assert.ok(cam.includes("'Erneut versuchen'") && cam.includes("name === 'retry'") && !cam.includes('ihr Dienst läuft nicht'), 'Offline-Hinweis mit Erneut versuchen');
assert.ok(/width:52px;height:52px;/.test(pop) && pop.includes("casoraTr('Beschreiben')"), 'KI-Knopf 52 px „Beschreiben“');
for (const k of ['Ton', 'Beschreiben', 'Erneut versuchen', 'Prüfe Strom und WLAN der Kamera.', 'Sirene', 'Schloss', 'Tor']) assert.ok(en[k], 'englisch: ' + k);
// Beschriftungen sind ≥ 44 pt Ziele: Knopfgröße aus der Vorlage lesen.
assert.ok(Number((cam.match(/'width:(\d+)px;height:\1px;'/) || [])[1]) >= 44, 'Kamera-Knopf ≥ 44');

// ── V7 ──
assert.ok(!T.casora_entity.styles.card.some((c) => String(c['--casora-name-fit'] || '').includes('casoraTextEm')), 'Kachelname schrumpft nicht mehr');
assert.ok(core.includes('data-casora-clip') && core.includes("text-overflow:ellipsis;"), 'Zustand am Handy mit „…“');
assert.ok(T.casora_network.state_display.includes("'↑' : '↓'") && !T.casora_network.state_display.includes('Mbit/s ${dir}'), 'Netzwerk kurz mit Pfeil');

// ── Weitere Funde ──
assert.ok(!/max-width': '560px'/.test(pop.slice(pop.indexOf('Ein Raster (01.10.2026)'), pop.indexOf('Ein Raster (01.10.2026)') + 400)), 'FBH-Einzelraum ohne Mittelspalte');
assert.ok(std.includes('&& !full.length) colS'), 'Standard-Layout: Spalte unter vollem Block gleich breit');
assert.ok(core.includes(':host([more-below]) .more') && core.includes("toggleAttribute('more-below'"), 'Scroll-Hinweis im Popup');
assert.ok(T.casora_badge_base.extra_styles.includes('max-width: calc(100vw - 2 * var(--casora-badge-row-gutter, 16px))'), 'Badge höchstens bildschirmbreit');
assert.ok(/#dots \{\s*position: absolute;\s*left: 50%;\s*top:/.test(swipe), 'Karussell-Punkte oben');
assert.ok(T.casora_menu_icon.extra_styles.includes(':host .hamburger{ opacity: 0 !important; }'), 'Menüsymbol am Desktop in Ruhe unsichtbar');
assert.ok(core.includes(".bar.more-r-on .more-r"), 'Raumleiste: Pfeil ohne Maske am Vorfahren');
console.log('ok ui_review_v5');
