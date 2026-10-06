// Eigene Kachelart: aus dem Kachelmenü anlegen (KI: Mock-Integration), Kachel umstellen, speichern,
// Dashboard (Desktop + Handy) zeigt die eigene Art, die von Casoras Vorlage erbt. Zum Schluss
// wieder aufräumen (Kachel zurück, Vorlage weg).   CASORA_QA_DASH (Standard qa-arbeit)
import assert from 'node:assert/strict';
import { open, ready, BASE } from './harness.mjs';
import { check, ende } from './ergebnis.mjs';

const DASH = process.env.CASORA_QA_DASH || 'qa-arbeit';
const { browser, page, errors } = await open({ width: 1440, height: 1000 });
await ready(page, '/casora-studio?dash=' + DASH, () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass && p._kaStart; });
const ws = (msg) => page.evaluate((m) => document.querySelector('home-assistant').hass.callWS(m), msg);

// Ein Raum mit einer Kamera-Kachel (sonst irgendeiner Casora-Kachel mit Entität).
const pick = await page.evaluate(() => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  let at = rooms.findIndex((r) => (r.tiles || []).some((t) => t.template === 'casora_camera' && t.entity));
  if (at < 0) at = rooms.findIndex((r) => (r.tiles || []).some((t) => typeof t.template === 'string' && /^casora_/.test(t.template) && t.entity));
  const tile = rooms[at].tiles.find((t) => (t.template === 'casora_camera' || /^casora_/.test(String(t.template))) && t.entity);
  return { at, path: rooms[at].path, base: tile.template, entity: tile.entity, mobile: (p._pair || {}).mobileUrl || null };
});
assert.ok(pick.at >= 0, 'Raum mit Casora-Kachel');
await ready(page, '/casora-studio?dash=' + DASH + '&room=' + pick.path, () => { const p = window.__panel && window.__panel(); return p && p._state && p._kaStart; });
await page.waitForTimeout(1500);
await page.evaluate(() => localStorage.setItem('casora.aiCost.skip', '1'));

// Kachelmenü → „Als eigene Kachelart anlegen …“ (echte Klicks über die Kachelliste).
const opened = await page.evaluate(async ([base, entity]) => {
  const p = window.__panel();
  const room = p._state.compact.rooms[p._room];
  const i = room.tiles.findIndex((t) => t.template === base && t.entity === entity);
  p._sel = { group: 'tiles', key: null }; p._group = 'tiles'; p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  const cards = [...p.shadowRoot.querySelectorAll('.tilegrid .tile')];
  const dots = cards[i] && cards[i].querySelector('.rowmenu');
  if (!dots) return 'keine Kachelliste';
  dots.click();
  await new Promise((r) => setTimeout(r, 400));
  const item = [...p.shadowRoot.querySelectorAll('.combo-menu *')].find((e) => e.childElementCount === 0 && /eigene Kachelart|own tile type/i.test(e.textContent));
  if (!item) return 'kein Menüeintrag';
  item.closest('.combo-opt').pick();
  return 'ok';
}, [pick.base, pick.entity]);
assert.equal(opened, 'ok', 'Menüeintrag öffnet den Assistenten');
await page.waitForFunction(() => !!window.__panel().shadowRoot.querySelector('[data-ka=name]'), null, { timeout: 10000 });

const LABEL = 'E2E Kachelart ' + Date.now().toString(36);
await page.evaluate((label) => {
  const r = window.__panel().shadowRoot;
  const n = r.querySelector('[data-ka=name]'); n.value = label; n.dispatchEvent(new Event('input'));
  const w = r.querySelector('[data-ka=wish]'); w.value = 'Der Name soll rot sein'; w.dispatchEvent(new Event('input'));
}, LABEL);
await page.waitForFunction(() => { const b = window.__panel().shadowRoot.querySelector('[data-ka=ai]'); return b && !b.disabled && !b.hidden; }, null, { timeout: 15000 });
await page.evaluate(() => window.__panel().shadowRoot.querySelector('[data-ka=ai]').click());
await page.waitForFunction(() => !!window.__panel().shadowRoot.querySelector('[data-ka=after] button-card'), null, { timeout: 30000 });
await page.waitForTimeout(2500);
const preview = await page.evaluate(() => {
  const r = window.__panel().shadowRoot;
  const nameColor = (side) => {
    const c = r.querySelector('[data-ka=' + side + '] button-card');
    const n = c && c.shadowRoot && c.shadowRoot.querySelector('#name');
    return n ? getComputedStyle(n).color : null;
  };
  return { before: nameColor('before'), after: nameColor('after'), notes: [...r.querySelectorAll('.ka-notes div')].map((d) => d.textContent) };
});
assert.ok(preview.notes.length, 'KI-Hinweis sichtbar');
assert.notEqual(preview.before, preview.after, 'Vorschau zeigt die Änderung (Namensfarbe)');
await page.evaluate(() => window.__panel().shadowRoot.querySelector('[data-ka=create]').click());
await page.waitForTimeout(2500);

// Vorlage in beiden Dashboards, erbt von der Grundlage, nur die Änderung als Überlagerung.
const desk = await ws({ type: 'lovelace/config', url_path: DASH });
const own = Object.entries(desk.button_card_templates || {}).find(([, t]) => t && t.variables && t.variables.casora_tile && t.variables.casora_tile.label === LABEL);
assert.ok(own, 'eigene Vorlage im Desktop-Dashboard');
const [NAME, TPL] = own;
assert.match(NAME, /^own_/);
assert.equal(TPL.template, pick.base, 'erbt von der Casora-Vorlage');
assert.ok(!TPL.custom_fields && !TPL.tap_action, 'nur die Änderung, keine Kopie');
assert.ok(JSON.stringify(TPL.styles || {}).includes('FF453A'), 'Änderung der KI steht in der Überlagerung');
if (pick.mobile) {
  const mob = await ws({ type: 'lovelace/config', url_path: pick.mobile });
  assert.deepEqual((mob.button_card_templates || {})[NAME], TPL, 'gleiche Vorlage im Handy-Dashboard');
}

// Die Kachel nutzt sie jetzt (noch ungespeichert) → Speichern.
const saved = await page.evaluate(async (name) => {
  const p = window.__panel();
  const room = p._state.compact.rooms[p._room];
  const uses = room.tiles.filter((t) => t.template === name).length;
  const typ = (window.__casoraPanelInternals.USER_TILE_TYPES || []).find((t) => t.template === name);
  const ok = await p._save();
  return { uses, ok, typ: typ && { own: typ.own, label: typ.label, fields: (typ.fields || []).length } };
}, NAME);
assert.equal(saved.uses, 1, 'Kachel umgestellt');
assert.ok(saved.ok, 'gespeichert');
assert.ok(saved.typ && saved.typ.own && saved.typ.label === LABEL, 'Kachelart in der Auswahl');
assert.ok(saved.typ.fields > 0, 'Felder der Grundlage');
const desk2 = await ws({ type: 'lovelace/config', url_path: DASH });
assert.deepEqual(desk2.button_card_templates[NAME], TPL, 'Speichern lässt die eigene Vorlage stehen');
assert.ok(JSON.stringify(desk2.views).includes('"template":"' + NAME + '"'), 'Desktop-Ansicht nutzt die eigene Art');
if (pick.mobile) {
  const mob2 = await ws({ type: 'lovelace/config', url_path: pick.mobile });
  assert.ok(JSON.stringify(mob2.views).includes('"template":"' + NAME + '"'), 'Handy nutzt die eigene Art');
}

// Dashboard: die Kachel rendert mit der eigenen Art (roter Name).
await page.goto(BASE + '/' + DASH + '/' + pick.path);
await page.waitForTimeout(9000);
const dash = await page.evaluate((name) => {
  const all = []; const w = (r) => r.querySelectorAll('*').forEach((e) => { all.push(e); if (e.shadowRoot) w(e.shadowRoot); }); w(document);
  const c = all.find((e) => e.tagName === 'BUTTON-CARD' && e._config && [].concat(e._config.template || []).includes(name));
  const n = c && c.shadowRoot && c.shadowRoot.querySelector('#name');
  return { found: !!c, color: n ? getComputedStyle(n).color : null };
}, NAME);
assert.ok(dash.found, 'Dashboard zeigt die eigene Kachelart');
const [rr, gg] = (dash.color || '').match(/\d+/g).map(Number);
assert.ok(rr > 200 && gg < 120, 'mit der Änderung der KI (rot): ' + dash.color);

// Aufräumen: Kachel zurück, Vorlage weg.
await ready(page, '/casora-studio?dash=' + DASH + '&room=' + pick.path, () => { const p = window.__panel && window.__panel(); return p && p._state && p._kaStart; });
await page.waitForTimeout(1500);
const clean = await page.evaluate(async ([name, base]) => {
  const p = window.__panel();
  window.casoraKachelart.lib.tilesUsing(p._kaRooms(), name).forEach((u) => { u.tile.template = base; });
  await p._kaWrite({ [name]: null });
  p._markDirty();
  return p._save();
}, [NAME, pick.base]);
assert.ok(clean, 'aufgeräumt');
const desk3 = await ws({ type: 'lovelace/config', url_path: DASH });
assert.ok(!(desk3.button_card_templates || {})[NAME] && !JSON.stringify(desk3.views).includes(NAME), 'Vorlage und Verweise entfernt');

const bad = errors.filter((e) => !/addEventListener|404|MIME type/.test(e));
console.log('Browser-Fehler:', bad.slice(0, 6));
// Die einzelnen Schritte prüft assert (Abbruch mit Rückgabe 1); hier nur noch das Ergebnis.
check('alle Schritte durchlaufen (' + NAME + ')', true);
check('keine Browser-Fehler', !bad.length, bad.slice(0, 6));
await browser.close();
ende();
