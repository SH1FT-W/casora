#!/usr/bin/env node
// Abdeckungs-Inventar + Prüfmatrix (Feinschliff 1.3, Phase 0) – ohne Home Assistant, nur aus dem Code.
//
//   node dev/qa/matrix-inventar.mjs --out <ordner>
//
// Liest alle Flächen maschinell aus dem Checkout:
//  - Vorlagen aus dashboards/casora/button_card_templates.json (Popups je Öffner-Vorlage, Kacheln,
//    Badges, Raumkarte, Handy-/Kopf-Vorlagen; abstrakte Basis-Vorlagen werden mitgezählt, aber nicht abgebildet),
//  - Overlays/Menüs des Dashboards aus scripts/*.js (nur, wenn ihr Code-Merkmal gefunden wird),
//  - Studio-Flächen aus panel/*.js: Einstellungsseiten (PAGES), Stationen (Werkzeugleiste, Inspektor,
//    Menüs – wie dev/qa/ausrichtung.mjs), Dashboard-Abschnitte (SECS), Abläufe (_flowScreen), Rückfragen (_ask).
// Schreibt flaechen.json, matrix.json, matrix.csv. Die Beschneidungsregel steht unten (REGEL) und in matrix.json.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out');
if (!OUT) { console.error('--out <ordner> fehlt'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── 1. Vorlagen ────────────────────────────────────────────────────────────
const TPL = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const parents = (k) => { const t = (TPL[k] || {}).template; return t ? [].concat(t) : []; };
const chain = (k, seen = new Set()) => { if (seen.has(k)) return []; seen.add(k); return [k, ...parents(k).flatMap((p) => chain(p, seen))]; };
const ABSTRAKT = new Set(['casora_default', 'casora_entity', 'casora_shared', 'casora_popup_base', 'casora_badge_base',
  'casora_scene_core', 'casora_air_device', 'casora_climate_popup', 'casora_badge_media', 'casora_entity_actions']);
const KOPF = /^casora_(notifications_button|settings_button|assist_button|menu_icon|time|weather|now_playing(_\w+)?)$/;
// Schaltbare Domains (Zustände an/aus sinnvoll) – je Vorlage aus dem Namen bzw. der Familie.
const SCHALTBAR = /^casora_(light|switch|fan|cover|lock|media|game|thermostat|humidifier|air_purifier|vacuum|vent|badge_light|badge_light_group|badge_cover|badge_media_player|badge_lock_group|scenes|scene_row|badge_scene)/;
const ohneEntitaet = /^casora_(room|mobile_\w+|notifications_button|settings_button|assist_button|menu_icon|time|now_playing\w*|badge_\w+_group|scene_row|cameras|updates|battery|pulse|calendar|recipe|solar_tip|football)$/;

const flaechen = [];
const add = (f) => { flaechen.push({ zustaende: ['standard'], geraete: ['desktop', 'tablet', 'handy'], ...f }); };
const opensPopup = (k) => chain(k).some((c) => /^casora_popup_/.test(c)) || /casora_popup|casoraPopup|fire-dom-event/.test(JSON.stringify(TPL[k] || {}));

for (const k of Object.keys(TPL).sort()) {
  const ch = chain(k);
  const src = 'dashboards/casora/button_card_templates.json#' + k;
  if (ABSTRAKT.has(k)) { add({ id: 'basis:' + k, familie: 'basis', quelle: src, gruppe: 'kacheln', abstrakt: true,
    oeffnen: '– (nur geerbt, keine eigene Fläche)', zustaende: [], geraete: [] }); continue; }
  if (/^casora_popup_/.test(k)) {
    // Popup-Vorlagen werden über ihre Öffner abgebildet (siehe unten); hier nur als Quelle gezählt.
    const oeffner = Object.keys(TPL).filter((o) => o !== k && !/^casora_popup_/.test(o) && !ABSTRAKT.has(o) && chain(o).includes(k));
    add({ id: 'popupvorlage:' + k, familie: 'popup-vorlage', quelle: src, gruppe: 'popups', abstrakt: true, oeffner,
      oeffnen: oeffner.length ? 'über Öffner ' + oeffner.join(', ') : 'per Skript (scripts/local) bzw. Unter-Popup', zustaende: [], geraete: [] });
    continue;
  }
  const isBadge = /^casora_badge_/.test(k);
  const isMobile = /^casora_mobile_/.test(k);
  const familie = k === 'casora_room' ? 'raumkarte' : isBadge ? (/_group$/.test(k) ? 'badge-gruppe' : 'badge')
    : isMobile ? 'handy-vorlage' : KOPF.test(k) ? 'kopf' : /scene_row/.test(k) ? 'handy-vorlage' : 'kachel';
  const gruppe = (familie === 'handy-vorlage') ? 'handy' : (familie === 'kopf') ? 'handy' : 'kacheln';
  const geraete = familie === 'handy-vorlage' ? ['handy'] : familie === 'raumkarte' ? ['desktop', 'tablet'] : ['desktop', 'tablet', 'handy'];
  const ent = !ohneEntitaet.test(k);
  const z = ['standard'];
  if (ent && SCHALTBAR.test(k)) z.push('an', 'aus');
  if (ent && familie !== 'kopf') z.push('nicht_verfuegbar', 'lange_namen');
  if (['kachel', 'badge', 'badge-gruppe', 'kopf'].includes(familie)) z.push('hover', 'gedrueckt');
  add({ id: 'vorlage:' + k, familie, quelle: src, gruppe, vorlage: k, erbt: ch.slice(1), entitaet: ent,
    oeffnen: `button-card mit Vorlage ${k} (window.__pierce('button-card'), _config.template enthält ${k})`, zustaende: z, geraete });
  // Popup dieser Kachel/dieses Badges (eigene Popup-Vorlage oder Popup direkt in der Vorlage).
  if (opensPopup(k) && !/^casora_(room|mobile_\w+|scene_row|menu_icon|time|now_playing_(chip|controls|header|primary))$/.test(k)) {
    const pv = ch.find((c) => /^casora_popup_/.test(c) && c !== 'casora_popup_base') || ch.find((c) => c === 'casora_climate_popup') || null;
    const pz = ['standard'];
    if (ent && SCHALTBAR.test(k)) pz.push('an', 'aus');
    if (ent) pz.push('nicht_verfuegbar', 'lange_namen');
    add({ id: 'popup:' + k, familie: 'popup', quelle: pv ? 'dashboards/casora/button_card_templates.json#' + pv : src, gruppe: 'popups',
      vorlage: k, popupvorlage: pv, entitaet: ent,
      oeffnen: `Kachel/Badge ${k} antippen → window.casoraPopup.surface bzw. HA-Dialog`, zustaende: pz });
  }
}

// ── 2. Overlays/Menüs des Dashboards (Merkmal im Code muss existieren) ───────
const SCRIPTS = ['custom_components/casora/scripts', 'custom_components/casora/scripts/local']
  .flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f));
const scriptSrc = Object.fromEntries(SCRIPTS.map((f) => [f, rd(f)]));
const where = (re) => Object.entries(scriptSrc).filter(([, s]) => re.test(s)).map(([f]) => f);
const OVERLAYS = [
  { id: 'overlay:navbar-desktop', merkmal: /class CasoraNavBar/, geraete: ['desktop', 'tablet'], aktion: 'navbar', z: ['standard', 'hover'],
    oeffnen: 'casora-nav-bar (Raumleiste oben) – sichtbar auf jeder Ansicht' },
  { id: 'overlay:navbar-handy', merkmal: /class CasoraMobileNav/, geraete: ['handy'], aktion: 'navbar', z: ['standard', 'gedrueckt'],
    oeffnen: 'casora-mobile-nav (Glas-Leiste unten)' },
  { id: 'overlay:raeume-menue', merkmal: /hmn-item|class CasoraNavBar/, geraete: ['desktop', 'tablet', 'handy'], aktion: 'raeume', z: ['standard', 'lange_namen'],
    oeffnen: 'Handy: mittlere Taste der Navigationsleiste; Desktop/Tablet: Pfeil/„⋯“ am Ende der Raumleiste (more-r)' },
  { id: 'overlay:szenen-menue', merkmal: /casoraNavScenes = function/, geraete: ['desktop', 'tablet', 'handy'], aktion: 'szenen', z: ['standard'],
    oeffnen: 'Handy: rechte Taste (Palette) der Navigationsleiste; Desktop/Tablet: „Szenen ⌄“ in der Raumleiste' },
  { id: 'overlay:glocke', merkmal: /casoraNotifySources|notifications_button/, geraete: ['desktop', 'tablet', 'handy'], aktion: 'glocke', z: ['standard'],
    oeffnen: 'Glocke oben rechts (casora_notifications_button) antippen' },
  { id: 'overlay:mehr-menue', merkmal: /_casoraMoreOpen/, geraete: ['desktop', 'tablet', 'handy'], aktion: 'mehr', z: ['standard'],
    oeffnen: '„⋯“ oben rechts (casora_settings_button) antippen' },
  { id: 'overlay:assist', merkmal: /assist/i, geraete: ['desktop', 'tablet', 'handy'], aktion: 'assist', z: ['standard'],
    oeffnen: 'Sprechblase oben rechts (casora_assist_button) antippen' },
  { id: 'overlay:welle', merkmal: /Medien-Welle/, geraete: ['desktop', 'tablet'], aktion: 'welle', z: ['standard'],
    oeffnen: 'ein media_player „playing“ (fakeStates) → Welle oben rechts antippen' },
  { id: 'overlay:rueckfrage', merkmal: /casoraConfirmSpec|casoraConfirmSwitch/, geraete: ['desktop', 'tablet', 'handy'], aktion: 'rueckfrage', z: ['standard'],
    oeffnen: 'window.casoraConfirmSpec({…}) bzw. Kachel mit variables.confirm_toggle schalten' },
  { id: 'overlay:handy-raumseite', merkmal: /class CasoraFilterOverlay/, geraete: ['handy'], aktion: 'raumseite', z: ['standard', 'lange_namen'],
    oeffnen: 'window._casoraFilter.set(<room_key>) – Raumseite am Handy' },
  { id: 'overlay:handy-startseite', merkmal: /casora_mobile_filter/, geraete: ['handy'], aktion: 'seite', z: ['standard'],
    oeffnen: 'Handy-Dashboard <dash>-mobile/home, ganze Seite' },
  { id: 'overlay:desktop-startseite', merkmal: /class CasoraNavBar/, geraete: ['desktop', 'tablet'], aktion: 'seite', z: ['standard'],
    oeffnen: 'Desktop-Dashboard <dash>/home, ganze Seite' },
  { id: 'overlay:desktop-raumseite', merkmal: /class CasoraNavBar/, geraete: ['desktop', 'tablet'], aktion: 'raumseite', z: ['standard'],
    oeffnen: 'Desktop-Dashboard, erste Raum-Ansicht, ganze Seite' },
];
for (const o of OVERLAYS) {
  const files = where(o.merkmal);
  if (!files.length) { console.log('  Merkmal fehlt, Fläche entfällt: ' + o.id); continue; }
  add({ id: o.id, familie: 'overlay', quelle: files.slice(0, 3).join(', '), gruppe: 'handy', aktion: o.aktion,
    oeffnen: o.oeffnen, zustaende: o.z, geraete: o.geraete });
}

// ── 3. Studio ──────────────────────────────────────────────────────────────
const PANEL = 'custom_components/casora/panel';
const pfiles = fs.readdirSync(path.join(ROOT, PANEL)).filter((f) => /^casora-panel.*\.js$/.test(f));
const psrc = Object.fromEntries(pfiles.map((f) => [f, rd(PANEL + '/' + f)]));
const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const methodAt = (s, i) => { const before = s.slice(0, i); const m = [...before.matchAll(/\n\s{2,4}(?:P\.)?(_[A-Za-z0-9]+)\s*(?:=\s*(?:async\s*)?function\s*)?\(([^)]*)\)\s*\{/g)].pop(); return m ? m[1] : '?'; };
const lit = (s) => { const m = s && s.match(/^\s*(?:t|tr)?\(?\s*"([^"]+)"/); return m ? m[1] : null; };

// 3a Einstellungsseiten (PAGES in casora-panel-settings.js)
const setSrc = psrc['casora-panel-settings.js'];
const pagesBlock = setSrc.slice(setSrc.indexOf('const PAGES = ['), setSrc.indexOf('];', setSrc.indexOf('const PAGES = [')));
for (const m of pagesBlock.matchAll(/\{ id: "(\w+)", label: "([^"]+)"/g)) {
  add({ id: 'studio:einstellungen-' + m[1], familie: 'studio-seite', quelle: PANEL + '/casora-panel-settings.js (PAGES ' + m[1] + ')', gruppe: 'studio',
    aktion: 'seite', ziel: m[1], oeffnen: `p._csOpenPage("${m[1]}") – Einstellungen › ${m[2]}`, zustaende: ['standard'] });
}
add({ id: 'studio:updates', familie: 'studio-seite', quelle: PANEL + '/casora-panel-updates.js', gruppe: 'studio', aktion: 'js', ziel: 'p._cuOpenPage()',
  oeffnen: 'p._cuOpenPage() – Updates', zustaende: ['standard'] });
add({ id: 'studio:zeitreise', familie: 'studio-seite', quelle: PANEL + '/casora-panel-versions.js', gruppe: 'studio', aktion: 'station', ziel: 'Zeitreise',
  oeffnen: '#brewind antippen – Zeitreise/Versionen', zustaende: ['standard'] });
add({ id: 'studio:meldung', familie: 'studio-toast', quelle: PANEL + '/casora-panel-b-plus.js (_bToast)', gruppe: 'studio', aktion: 'js',
  ziel: 'p._bToast("Kachel hinzugefügt", { undo: () => {} })', oeffnen: 'p._bToast(…) – Meldung unten mit „Rückgängig“', zustaende: ['standard'] });
// 3b Stationen (Werkzeugleiste, Inspektor, Menüs) – dieselben Wege wie dev/qa/ausrichtung.mjs
const ausr = rd('dev/qa/ausrichtung.mjs');
for (const m of ausr.slice(ausr.indexOf('const STATIONS = [')).matchAll(/\{ name: '([^']+)'/g)) {
  if (m[1] === 'Zeitreise' || m[1] === 'Updates' || /^Einstellungen: Haus$/.test(m[1])) continue;
  const slug = m[1].toLowerCase().replace(/[⌘()…⋯]/g, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  add({ id: 'studio:' + (slug || 'mehr-menue'), familie: /Menü|Suche|Ansehen|Auswahl/.test(m[1]) ? 'studio-menue' : /Inspektor|Editor|Badge/.test(m[1]) ? 'studio-inspektor' : 'studio-ansicht',
    quelle: 'dev/qa/ausrichtung.mjs STATIONS „' + m[1] + '“ (Panel: casora-panel-b*.js)', gruppe: 'studio', aktion: 'station', ziel: m[1],
    oeffnen: 'Station „' + m[1] + '“ wie in ausrichtung.mjs', zustaende: ['standard'] });
}
// 3c Dashboard-Abschnitte (SECS im neuen Studio)
const bSrc = psrc['casora-panel-b.js'];
const secs = bSrc.slice(bSrc.indexOf('const SECS = ['), bSrc.indexOf('];', bSrc.indexOf('const SECS = [')));
for (const m of secs.matchAll(/\["(\w+)", "([^"]+)"/g)) {
  add({ id: 'studio:dashboard-' + m[1].toLowerCase(), familie: 'studio-inspektor', quelle: PANEL + '/casora-panel-b.js (SECS ' + m[1] + ')', gruppe: 'studio',
    aktion: 'js', ziel: `p._bLeavePages && p._bLeavePages(); p._select({ group: "rooms", key: "${m[1]}", label: "${m[1]}" }); p._bOpen = true; p._renderForm && p._renderForm();`,
    oeffnen: 'Werkzeug „Dashboard“ › ' + m[2], zustaende: ['standard'] });
}
// 3d Abläufe (_flowScreen) – je Methode eine Fläche
const flows = new Map();
for (const [f, s] of Object.entries(psrc)) for (const m of s.matchAll(/_flowScreen\(\{([\s\S]{0,400}?)\}\)?/g)) {
  const meth = methodAt(s, m.index);
  const tm = m[1].match(/title:\s*([^\n]+)/);
  const key = f.replace(/^casora-panel-?|\.js$/g, '') + ':' + meth;
  if (!flows.has(key)) flows.set(key, { f, meth, line: lineOf(s, m.index), title: tm ? tm[1].trim().replace(/,$/, '').slice(0, 80) : '' });
}
for (const [key, x] of flows) {
  const umzug = /umzug|import/.test(x.f) || /Import|Hemma|Migrat/i.test(x.meth + x.title);
  add({ id: 'studio:ablauf-' + key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(), familie: 'studio-ablauf', quelle: `${PANEL}/${x.f}:${x.line} (${x.meth})`,
    gruppe: umzug ? 'umzug' : 'studio', aktion: 'ablauf', ziel: x.meth, titel: x.title,
    oeffnen: `Ablauf-Bildschirm aus ${x.meth}() – Titel ${x.title || '(dynamisch)'}`, zustaende: ['standard'], geraete: ['desktop', 'handy'] });
}
// 3e Rückfragen (_ask) – je Aufruf eine Fläche; Text nur, wo er im Code steht
for (const [f, s] of Object.entries(psrc)) for (const m of s.matchAll(/_ask\(\{([\s\S]{0,600}?)\}\)/g)) {
  const tm = m[1].match(/title:\s*(?:t|tr)?\(?\s*"([^"]+)"/) || m[1].match(/title:\s*([^,\n]+)/);
  const mm = m[1].match(/message:\s*(?:t|tr)?\(?\s*"([^"]+)"/);
  const meth = methodAt(s, m.index);
  const line = lineOf(s, m.index);
  const umzug = /umzug|import|settings/.test(f) && /Hemma|import|migrat/i.test(m[1]);
  add({ id: `studio:rueckfrage-${f.replace(/^casora-panel-?|\.js$/g, '') || 'kern'}-${line}`, familie: 'studio-dialog', quelle: `${PANEL}/${f}:${line} (${meth})`,
    gruppe: umzug ? 'umzug' : 'studio', aktion: 'ask', titel: tm ? tm[1].trim().slice(0, 90) : '', text: mm ? mm[1].slice(0, 160) : '',
    eingabe: /value:/.test(m[1]), oeffnen: `p._ask({title, message${/value:/.test(m[1]) ? ', value' : ''}}) wie in ${meth}()`, zustaende: ['standard'], geraete: ['desktop', 'handy'] });
}

// ── 4. Matrix ──────────────────────────────────────────────────────────────
const REGEL = [
  'R1 Grundzustand „standard“: jede abbildbare Fläche × jedes Gerät, auf dem sie existiert × hell/dunkel × de/en (de = Haus arbeit, en = Haus demo).',
  'R2 an/aus/nicht_verfuegbar: nur Flächen mit eigener Entität (an/aus nur schaltbare Domains); desktop·dunkel und handy·hell; nur de.',
  'R3 lange_namen: desktop·hell und handy·hell; nur de (deutsche Texte sind die längeren).',
  'R4 hover/gedrueckt: nur Bedienelemente (Kacheln, Badges, Kopf-Knöpfe, Navigationsleiste); desktop·hell und desktop·dunkel (hover) bzw. desktop·hell (gedrückt), Handy-Leiste gedrückt am Handy; nur de.',
  'R5 tablet nur im Grundzustand. Studio-Abläufe und Rückfragen: desktop hell/dunkel × de/en + handy hell × de/en (kein Tablet).',
  'R6 Zustände „leer“/„viele“ sind keine eigenen Zeilen: „viele“ = Haus arbeit im Grundzustand, „leer“ = nicht_verfuegbar bzw. Leerzustände der Studio-Seiten (wo das Haus sie hat).',
  'R7 abstrakte Basis-Vorlagen und Popup-Vorlagen sind gezählt, aber keine eigenen Zeilen (Popups erscheinen je Öffner als popup:<vorlage>).',
];
const HAUS = { de: 'arbeit', en: 'demo' };
const zeilen = [];
const push = (f, zustand, geraet, schema, sprache) => {
  const n = String(zeilen.length + 1).padStart(5, '0');
  const fl = f.id.replace(/^[a-z]+:/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const zid = `${n}_${fl}_${zustand}_${geraet}_${schema}_${sprache}`;
  zeilen.push({ zeile_id: zid, flaeche: f.id, familie: f.familie, zustand, geraet, schema, sprache, haus: HAUS[sprache],
    bild: `bilder/${f.gruppe}/${fl}/${zid}.png`, gruppe: f.gruppe });
};
for (const f of flaechen) {
  if (f.abstrakt) continue;
  const kurz = f.aktion === 'ablauf' || f.aktion === 'ask';
  for (const z of f.zustaende) for (const g of f.geraete) for (const s of ['hell', 'dunkel']) for (const l of ['de', 'en']) {
    if (z === 'standard') { if (kurz && (g === 'tablet' || (g === 'handy' && s === 'dunkel'))) continue; push(f, z, g, s, l); continue; }
    if (l !== 'de' || g === 'tablet') continue;
    if (['an', 'aus', 'nicht_verfuegbar'].includes(z) && !((g === 'desktop' && s === 'dunkel') || (g === 'handy' && s === 'hell'))) continue;
    if (z === 'lange_namen' && s !== 'hell') continue;
    if (z === 'hover' && g !== 'desktop') continue;
    if (z === 'gedrueckt' && (s !== 'hell' || (g !== 'desktop' && f.id !== 'overlay:navbar-handy'))) continue;
    push(f, z, g, s, l);
  }
}
// Reihenfolge der Gruppen fürs Abbilden: popups, kacheln, handy, studio, umzug
fs.writeFileSync(path.join(OUT, 'flaechen.json'), JSON.stringify(flaechen, null, 1));
fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify({ erzeugt: new Date().toISOString(), regel: REGEL, zeilen }, null, 1));
const COLS = ['zeile_id', 'flaeche', 'familie', 'zustand', 'geraet', 'schema', 'sprache', 'haus', 'bild', 'gruppe'];
fs.writeFileSync(path.join(OUT, 'matrix.csv'), [COLS.join(','), ...zeilen.map((z) => COLS.map((c) => /[,"]/.test(z[c]) ? '"' + String(z[c]).replace(/"/g, '""') + '"' : z[c]).join(','))].join('\n') + '\n');
const by = (k) => zeilen.reduce((a, z) => ((a[z[k]] = (a[z[k]] || 0) + 1), a), {});
const fby = flaechen.reduce((a, f) => ((a[f.familie] = (a[f.familie] || 0) + 1), a), {});
console.log(`Flächen ${flaechen.length} (abbildbar ${flaechen.filter((f) => !f.abstrakt).length}), Zeilen ${zeilen.length}`);
console.log('  je Familie', JSON.stringify(fby));
console.log('  Zeilen je Gruppe', JSON.stringify(by('gruppe')));
console.log('  Zeilen je Zustand', JSON.stringify(by('zustand')));
