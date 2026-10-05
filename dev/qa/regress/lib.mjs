// Gemeinsamer Rahmen für die Regressionstests (dev/qa/regress/r*.mjs).
//
// Jeder Test hält einen Fehler fest, den ein Nutzer gemeldet hat, damit er nicht
// wiederkommt. Ausgabe: je Prüfung eine Zeile „ok“/„FEHLER“, am Ende genau eine Zeile
//   PASS r01_studio_szenen_badge
//   FAIL r01_studio_szenen_badge – 1 von 3 Prüfungen (Bild: /tmp/casora-qa/…png)
// Rückgabe 0 = PASS, 1 = FAIL. Bei jedem Fehler entsteht ein Bildschirmfoto.
//
// Zustand des Test-HA: jeder Test nennt ihn in der Kopfzeile, z. B.
//   // @zustand: arbeit
// dev/qa/gate.sh liest das und lässt den Test im passenden Zustand laufen
// (frisch = neuer Nutzer, arbeit = Testhaus mit Casora-Dashboards, stress = viele Geräte).
//
// Umgebung: CASORA_TOKENS (sonst Anmeldung über dev/qa/token.mjs), CASORA_LOCAL=1
// (Panel/Skripte aus diesem Checkout statt aus dem Test-HA), CASORA_QA_DASH (Dashboard
// vorgeben), CASORA_OUT (Bilder, Standard /tmp/casora-qa).
import path from 'node:path';
import { tokens, ws } from '../ws.mjs';

process.env.CASORA_OUT = process.env.CASORA_OUT || '/tmp/casora-qa';
await tokens();
const H = await import('../../e2e/harness.mjs');
export const { BASE, PIERCE, ready, call } = H;

const NAME = path.basename(process.argv[1] || 'test', '.mjs');
let checks = 0, fails = 0, firstShot = null, page = null;
const browsers = [];

// Browser öffnen (Optionen wie harness.open, zusätzlich lang: 'en' für englische Oberfläche).
export async function open(opts = {}) {
  const o = await H.open(opts);
  // Die Welle öffnet ihre Liste im Casora-Look von selbst (1.0.11); Tests, die das Antippen prüfen,
  // brauchen den alten Anfangszustand. Wer das automatische Öffnen prüft: open({ welleAuto: true }).
  if (!opts.welleAuto) await o.context.addInitScript(() => { window.CASORA_QA_NO_WELLE_AUTO = true; });
  if (opts.lang) await o.context.addInitScript((l) => localStorage.setItem('selectedLanguage', JSON.stringify(l)), opts.lang);
  browsers.push(o.browser);
  page = o.page;
  return o;
}

export function usePage(p) { page = p; }

export async function shot(label) {
  if (!page) return null;
  const f = `${NAME}_${String(label).replace(/[^\w-]+/g, '_').slice(0, 40)}`;
  try { return await H.shot(page, f); } catch (e) { return null; }
}

// Eine Prüfung. Bei Fehlschlag: Bildschirmfoto (einmal je Prüfung).
export async function check(label, ok, info) {
  checks++;
  if (ok) { console.log('  ok     ' + label); return true; }
  fails++;
  const p = await shot(label);
  if (!firstShot) firstShot = p;
  console.log('  FEHLER ' + label + (info !== undefined ? ' – ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')
    + (p ? '  📸 ' + p : ''));
  return false;
}

// Voraussetzung fehlt (z. B. kein passendes Dashboard im Zustand): zählt als FAIL,
// damit das Gate nicht still etwas auslässt.
export async function need(label, ok, info) {
  if (ok) return;
  await check('Voraussetzung: ' + label, false, info);
  await finish();
}

// Aufräumen, das auch bei need() (beendet sofort) laufen muss, z. B. Prüf-Dashboards löschen
// oder Benutzerdaten zurücksetzen. Sonst sahen spätere Tests auf demselben HA die Reste
// (04.10.2026: r39 brach per need() ab, das dunkle Weich-Theme blieb stehen, r32 sah Nachtbilder).
const finishers = [];
export function atFinish(fn) { finishers.push(fn); }

export async function finish() {
  while (finishers.length) { try { await finishers.shift()(); } catch (e) { /* weiter */ } }
  for (const b of browsers) { try { await b.close(); } catch (e) { /* schon zu */ } }
  if (!checks) { fails++; console.log('  FEHLER keine Prüfung gelaufen'); }
  if (fails) console.log(`FAIL ${NAME} – ${fails} von ${checks} Prüfungen` + (firstShot ? ` (Bild: ${firstShot})` : ''));
  else console.log(`PASS ${NAME} – ${checks} Prüfungen`);
  process.exit(fails ? 1 : 0);
}

process.on('unhandledRejection', async (e) => {
  checks++; fails++;
  const p = await shot('abbruch');
  console.log('  FEHLER Abbruch: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') + (p ? '  📸 ' + p : ''));
  firstShot = firstShot || p;
  await finish();
});

// ── Dashboards ────────────────────────────────────────────────────────────────

let _dashes = null;
// Alle Speicher-Dashboards mit Casora-Räumen: [{ url, title, mobile, config }].
export async function casoraDashboards() {
  if (_dashes) return _dashes;
  const c = await ws();
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  const out = [];
  // dashboard-hemma(-mobile) (Zustand „arbeit“) ist eine speichergesperrte Fixture mit alten
  // Vorlagen – für Produktprüfungen ungeeignet, deshalb nie als Casora-Dashboard.
  for (const d of list.filter((x) => x.mode === 'storage' && !/^dashboard-hemma/.test(x.url_path))) {
    let cfg = null;
    try { cfg = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }); } catch (e) { continue; }
    const s = JSON.stringify(cfg || {});
    if (!s.includes('"casora_room"') && !s.includes('casora_mobile')) continue;
    out.push({ url: d.url_path, title: d.title, mobile: /-mobile$/.test(d.url_path), config: cfg });
  }
  c.close();
  // Vorgegebenes zuerst, dann „mein-casora“ bzw. „test-neu“ (im Studio angelegt), dann übrige,
  // importierte Kopien (zeigen mangels Geräten oft keine Badges/Kacheln) und qa-* zuletzt.
  const want = process.env.CASORA_QA_DASH;
  const rank = (d) => (want && (d.url === want || d.url === want + '-mobile') ? 0
    : /^mein-casora/.test(d.url) ? 1 : /^test-neu/.test(d.url) ? 1.5
    : /^qa-/.test(d.url) ? 3 : /importiert/.test(d.url) ? 2.5 : 2);
  out.sort((a, b) => rank(a) - rank(b));
  _dashes = out;
  return out;
}

// Desktop-Dashboard (mit Casora-Räumen) und sein Handy-Gegenstück, falls vorhanden.
export async function casoraDashboard(pred = () => true) {
  const all = await casoraDashboards();
  const desk = all.find((d) => !d.mobile && pred(d));
  if (!desk) return null;
  return { ...desk, phone: all.find((d) => d.url === desk.url + '-mobile') || null };
}

// Irgendein Dashboard, das das Studio laden kann (Casora zuerst, sonst Hemma) – für
// Seiten, die nur die Studio-Seitenleiste brauchen (auch im Zustand „frisch“).
export async function studioDashboard() {
  const cas = (await casoraDashboards()).find((d) => !d.mobile);
  if (cas) return cas.url;
  const c = await ws();
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  let hit = null;
  for (const d of list.filter((x) => x.mode === 'storage')) {
    try {
      const cfg = await c.cmd({ type: 'lovelace/config', url_path: d.url_path });
      if (/_room"/.test(JSON.stringify(cfg))) { hit = d.url_path; break; }
    } catch (e) { /* leer */ }
  }
  c.close();
  return hit;
}

// Studio öffnen und ein Dashboard laden (nur im Speicher – gespeichert wird nichts).
// Im Zustand „frisch“ gibt es kein Casora-Dashboard: dort zeigt das Studio beim Start die
// Begrüßung bzw. den Einrichtungsassistenten (Vollbild-Ablauf, kein _state). Deshalb nicht auf
// _state warten, sondern auf ein fertiges Panel (Studio steht oder Ablauf ist offen) und dann
// laden – _load schließt den Ablauf. Öffnet er sich danach noch einmal (später Startlauf), wird nachgeladen.
export async function studio(pg, dash) {
  await ready(pg, '/casora-studio', () => { const p = window.__panel && window.__panel();
    return !!(p && p._hass && (p._state || p._flowMode)); });
  const loadOnce = () => pg.evaluate(async (d) => { const p = window.__panel(); p._setDash(d); p._remember(d); await p._load(); }, dash);
  // Im Zustand „frisch“ navigiert der Begrüßungs-/Startablauf teils noch einmal, während geladen
  // wird („Execution context was destroyed“) – dann auf das Panel warten und erneut laden.
  const load = async () => {
    for (let i = 0; i < 3; i++) {
      try { return await loadOnce(); } catch (e) {
        if (!/context was destroyed|navigation/i.test(String(e && e.message))) throw e;
        await pg.waitForLoadState('domcontentloaded').catch(() => {});
        await pg.addScriptTag({ content: PIERCE }).catch(() => {});
        await pg.waitForFunction(() => { const p = window.__panel && window.__panel(); return !!(p && p._hass && (p._state || p._flowMode)); }, null, { timeout: 45000 }).catch(() => {});
        await pg.waitForTimeout(800);
      }
    }
    return loadOnce();
  };
  await load();
  const ok = () => pg.waitForFunction(() => { const p = window.__panel();
    return !p._flowMode && p._state && p._state.compact && p._state.compact.rooms; }, null, { timeout: 30000 });
  await ok().catch(async () => { await load(); await ok(); });
  await pg.waitForTimeout(2000);
}

// Studio-Schritte, die ein Neuladen des Studios abbrechen kann („Execution context was destroyed“):
// Das Studio lädt neu, wenn kurz vorher ein Dashboard gespeichert wurde (zu Beginn des Gates durch
// das Anlegen der Prüf-Dashboards). Dann Studio neu öffnen und den Schritt einmal wiederholen –
// ein echter Messfehler fällt beim zweiten Mal genauso auf.
export async function studioRetry(pg, dash, step) {
  try { return await step(); } catch (e) {
    if (!/context was destroyed|navigation/i.test(String(e && e.message))) throw e;
    console.log('  (Studio hat neu geladen – Schritt wird wiederholt)');
    await pg.waitForLoadState('domcontentloaded').catch(() => {});
    await pg.addScriptTag({ content: PIERCE }).catch(() => {});
    await studio(pg, dash);
    return step();
  }
}

// Dashboard-Ansicht öffnen und warten, bis die Kacheln stehen.
export async function dashboard(pg, url, min = 5) {
  await ready(pg, '/' + url, `() => window.__pierce('button-card').length >= ${min}`, 60000);
  await pg.waitForTimeout(3000);
}

// button-cards mit Vorlage (Teilname) und sichtbarer Größe, mit Lage im Fenster.
export async function cards(pg, template) {
  return pg.evaluate((tpl) => window.__pierce('button-card').map((b, i) => {
    const c = b._config || {};
    const t = [].concat(c.template || []);
    const r = b.getBoundingClientRect();
    return { i, t, x: r.x, y: r.y, w: r.width, h: r.height, text: (b.shadowRoot && b.shadowRoot.querySelector('ha-card')
      ? b.shadowRoot.querySelector('ha-card').innerText : '').replace(/\s+/g, ' ').trim() };
  }).filter((c) => c.w > 0 && c.h > 0 && (!tpl || c.t.includes(tpl))), template);
}

// Der Home-Assistant-Oberfläche lokal andere Zustände unterschieben (nur dieser Browser,
// nichts geht an HA): patch = { entity_id: { state, attributes? } | null (fehlt) }.
// sticky: true hält den Patch auch über echte state_changed-Ereignisse hinweg (HA schickt bei
// jedem Ereignis die volle Zustandsliste neu – ohne sticky kehrt ein „entferntes“ Gerät zurück,
// sobald im Haus irgendein Zustand wechselt, z. B. durch parallel laufende Tests).
export async function fakeStates(pg, patch, { sticky = false } = {}) {
  await pg.evaluate(({ p, sticky }) => {
    const ha = document.querySelector('home-assistant');
    const hass = ha.hass;
    if (sticky && typeof ha._updateHass === 'function') {
      const apply = (st) => {
        const out = { ...st };
        for (const [id, v] of Object.entries(p)) {
          if (v === null) { delete out[id]; continue; }
          const old = out[id] || { entity_id: id, attributes: {}, context: { id: 'qa' } };
          out[id] = { ...old, state: v.state, attributes: { ...old.attributes, ...(v.attributes || {}) } };
        }
        return out;
      };
      const orig = ha.__qaOrigUpdateHass || ha._updateHass;
      ha.__qaOrigUpdateHass = orig;
      ha._updateHass = function (obj) { return orig.call(this, obj && obj.states ? { ...obj, states: apply(obj.states) } : obj); };
    }
    const states = { ...hass.states };
    for (const [id, v] of Object.entries(p)) {
      if (v === null) { delete states[id]; continue; } // Entität „fehlt“
      const old = states[id] || { entity_id: id, attributes: {}, context: { id: 'qa' } };
      states[id] = { ...old, state: v.state, attributes: { ...old.attributes, ...(v.attributes || {}) },
        last_changed: new Date().toISOString(), last_updated: new Date().toISOString() };
    }
    // HA-eigener Weg (hass-base-mixin): verteilt den neuen hass wie ein state_changed.
    if (typeof ha._updateHass === 'function') { ha._updateHass({ states }); return; }
    const next = { ...hass, states };
    // Sonst: alle Karten bekommen den neuen hass wie bei einem echten state_changed.
    window.__pierce('*').forEach((el) => { if ('hass' in el && el.hass === hass) { try { el.hass = next; } catch (e) { /* nur lesen */ } } });
  }, { p: patch, sticky });
  await pg.waitForTimeout(1200);
}
