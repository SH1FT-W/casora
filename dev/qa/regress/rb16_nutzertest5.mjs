// @zustand: arbeit
// @parallel: ui
// Nutzertest 5 (07.10.2026). Erwartet: Cover-Kacheln (Garagentor, Jalousie) bieten „Vor dem Schalten
// fragen“ an; im Popup fährt „Auf“ ohne Bestätigen nicht; ⌘K findet die Option über „rückfrage“ und
// den Lüften-Empfänger über „push“; am Handy sind Meldungen breit, die Speichern-Leiste im Lüften-Blatt
// überlappt nicht und das Namensfeld im Szenen-Dialog sieht wie ein Feld aus. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);

const { page, browser } = await open({ width: 1600, height: 1000, dark: false });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
await H(() => window.__panel()._bClose && window.__panel()._bClose());
await page.waitForTimeout(600);

// Cover-Kachel (vorhanden oder neu im ersten Raum) wählen
const cov = await H(() => {
  const p = window.__panel(); const rs = p._state.compact.rooms;
  for (let i = 0; i < rs.length; i++) {
    const t = (rs[i].tiles || []).find((x) => /^cover\./.test(String(x.entity || '')) && [].concat(x.template || []).includes('casora_cover'));
    if (t) return { i, entity: t.entity, key: p._tileKey(t), added: false };
  }
  const id = Object.keys(p._hass.states).find((e) => /^cover\./.test(e) && typeof (p._hass.states[e].attributes || {}).current_position === 'number');
  if (!id) return null;
  const i = rs.findIndex((r, k) => k > 0 && r.path);
  const t = { type: 'custom:button-card', template: 'casora_cover', entity: id, name: 'Garage QA' };
  p._undoStack.push(p._snap()); rs[i].tiles = (rs[i].tiles || []).concat([t]); p._markDirty();
  return { i, entity: id, key: p._tileKey(t), added: true };
});
await need('Cover-Kachel', cov);
await H((c) => { const p = window.__panel(); p._room = c.i; p._renderTabs(); p._renderForm(); p._bOpen = true;
  const t = p._state.compact.rooms[c.i].tiles.find((x) => p._tileKey(x) === c.key); p._select({ group: 'tiles', key: c.key, label: t.name || '' }); }, cov);
await page.waitForTimeout(1200);
// „Sichtbarkeit & Rückfrage“ aufklappen und den Schalter echt anklicken
const sw = await H(() => { const r = window.__panel().shadowRoot; const row = r.querySelector('#pane #band-tiles .tile.sel .row.mask');
  if (!row) return null; const f = row.closest('.adv'); if (f && !f.classList.contains('open')) f.querySelector('.advsum').click(); return true; });
await check('Cover-Kachel bietet „Vor dem Schalten fragen“ an', !!sw);
await page.waitForTimeout(500);
if (sw) {
  const at = await H(() => { const s = window.__panel().shadowRoot.querySelector('#pane .tile.sel .row.mask .switch, #pane .tile.sel .row.mask [role=switch], #pane .tile.sel .row.mask input');
    s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.click(at[0], at[1]);
  await page.waitForTimeout(600);
  const on = await H((c) => { const p = window.__panel(); const t = p._state.compact.rooms[c.i].tiles.find((x) => p._tileKey(x) === c.key); return (t.variables || {}).confirm_toggle === true; }, cov);
  await check('Schalter setzt die Rückfrage', on);
  // Popup der Vorschau: „Auf“ (data-casora-svc) ohne Bestätigen fährt nicht
  await H(() => { const p = window.__panel(); p._cpDismissed = null; const t = p._cpTarget(); if (t) p._cpOpen(t); });
  await page.waitForTimeout(3500);
  const res = await H(async (c) => {
    const ha = document.querySelector('home-assistant');
    const calls = []; const orig = ha.hass.callService;
    ha.hass.callService = function (d, s, data, tgt) { calls.push(d + '.' + s); return Promise.resolve(); };
    const find = (root, out) => { root.querySelectorAll('*').forEach((e) => { if (e.dataset && e.dataset.casoraSvc && /set_cover_position|open_cover/.test(e.dataset.casoraSvc) && /"position":100|open_cover/.test(e.dataset.casoraSvc)) out.push(e); if (e.shadowRoot) find(e.shadowRoot, out); }); return out; };
    const btn = find(window.__panel().shadowRoot, [])[0];
    if (!btn) { ha.hass.callService = orig; return { btn: false, ids: window.__casoraConfirmIds }; }
    window._casoraUILastTap = 0; window._casoraPopupOpenedAt = 0;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 400));
    const asked = !!document.querySelector('.casora-askfirst');
    const ask = document.querySelector('.casora-askfirst');
    if (ask) ask.shadowRoot.querySelector('.no').click();
    await new Promise((r) => setTimeout(r, 300));
    ha.hass.callService = orig;
    return { btn: true, asked, calls, ids: window.__casoraConfirmIds };
  }, cov);
  await check('Popup-Knopf „Auf“ fragt nach', res.btn && res.asked, res);
  await check('… und fährt ohne Bestätigen nicht', res.btn && !res.calls.length, res);
  await H(() => window.__panel()._cpClose && window.__panel()._cpClose(true));
}

// ⌘K: Synonyme
const kq = async (q) => {
  await H(() => { const s = window.__panel().shadowRoot.querySelector('.msearch'); if (s) s.remove(); });
  await page.keyboard.press('Meta+k'); await page.waitForTimeout(300);
  await page.keyboard.type(q); await page.waitForTimeout(400);
  return H(() => { const e = window.__panel().shadowRoot.querySelector('.msearch .mrow'); return e ? e.innerText : ''; });
};
const r1 = await kq('rückfrage');
await check('⌘K „rückfrage“ → „Vor dem Schalten fragen“', /Vor dem Schalten fragen/.test(r1), r1);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await check('… öffnet die Option an einer Kachel', await H(() => !!window.__panel().shadowRoot.querySelector('#pane .tile.sel .row.mask')));
const r2 = await kq('push');
await check('⌘K „push“ → Lüften-Hinweise', /Lüften/.test(r2), r2);
await page.keyboard.press('Escape');
await H(() => { const p = window.__panel(); p._undoStack = []; p._resetUndo && p._resetUndo(); });
await browser.close();

// Tablet (Gruppe H): Popup der Vorschau bei offenem Blatt lesbar groß; „Im Popup ausprobieren“ bleibt;
// ⌘K findet ein Licht auch ohne Kachel („… einstellen“)
{
  const o = await open({ width: 1024, height: 768, dark: false, touch: true, scale: 1 });
  const pg = o.page;
  const P = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await P(() => window.__panel()._bClose && window.__panel()._bClose());
  const sw2 = await P(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
    for (let i = 0; i < rs.length; i++) { const t = (rs[i].tiles || []).find((x) => /^(switch|cover|light|fan)\./.test(String(x.entity || '')));
      if (t) { t.variables = { ...(t.variables || {}), confirm_toggle: true }; p._markDirty(); p._room = i; p._renderTabs(); p._renderForm();
        p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' }); return t.entity; } }
    return null; });
  await check('Tablet: schaltende Kachel gefunden', !!sw2);
  if (sw2) {
    await pg.waitForTimeout(1200);
    const tryBtn = await P(() => { const b = window.__panel().shadowRoot.querySelector('#pane .tile.sel .mtry'); return b ? !b.hidden : null; });
    await check('Tablet: „Im Popup ausprobieren“ steht dauerhaft unter der Option', tryBtn === true, tryBtn);
    await P(() => { const b = window.__panel().shadowRoot.querySelector('#pane .tile.sel .mtry'); if (b) b.click(); });
    await pg.waitForTimeout(3500);
    const pw = await P(() => { const p = window.__panel(); const l = p._cpLayer; const pop = l && l.querySelector('casora-popup');
      const s = pop && pop.surface; if (!s) return null; const r = s.getBoundingClientRect(); return { w: Math.round(r.width), wide: l.classList.contains('cp-wide') }; });
    await check('Tablet: Popup in der Vorschau mindestens 360 px breit (eigene Ebene)', pw && pw.wide && pw.w >= 360, pw);
    await P(() => window.__panel()._cpClose && window.__panel()._cpClose(true));
  }
  // Wie das Studio (casora-panel-b-mehr.js): Lichter mit entity_category (z. B. Status-LED eines
  // Access Points im Prüf-Dashboard qa-arbeit) bietet die Suche bewusst nicht zum Einstellen an.
  const light = await P(() => { const H = window.__panel()._hass; const E = H.entities || {}, D = H.devices || {};
    const fresh = new Set((window.__panel()._uxDevices() || []).filter((c) => c.fresh).map((c) => c.entity));
    const id = Object.keys(H.states).find((e) => /^light\./.test(e) && !fresh.has(e) && E[e] && !E[e].hidden && !E[e].entity_category && (E[e].area_id || (D[E[e].device_id] || {}).area_id));
    return id ? (E[id].name || H.states[id].attributes.friendly_name) : null; });
  if (light) {
    await pg.keyboard.press('Meta+k'); await pg.waitForTimeout(300);
    await pg.keyboard.type(light); await pg.waitForTimeout(500);
    const rows = await P(() => [...window.__panel().shadowRoot.querySelectorAll('.msearch .mrow')].map((e) => e.innerText.replace(/\s+/g, ' ')));
    await check('⌘K findet das Licht zum Einstellen', rows.some((r) => /einstellen/.test(r)), rows.slice(0, 5));
    await pg.keyboard.press('Escape');
  }
  await o.browser.close();
}

// Handy (Gruppe E): Meldung breit, Speichern-Leiste ohne Überlappung, Namensfeld sichtbar
{
  const o = await open({ width: 390, height: 844, mobile: true, dark: false, scale: 2 });
  const pg = o.page;
  const P = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await P(() => window.__panel()._bClose());
  await P(() => window.__panel()._bToast('Szene gespeichert: Filmabend', { sub: 'In Home Assistant gespeichert. Die Farbe speichert „Fertig“.', action: { label: 'Rückgängig', run() {} } }));
  await pg.waitForTimeout(500);
  const toast = await P(() => { const t = window.__panel().shadowRoot.querySelector('.btoast'); const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  await check('Handy: Meldung nutzt die Breite (nicht 6–8 Zeilen)', toast.w >= 330 && toast.h <= 110, toast);
  await P(() => window.__panel()._csOpenPage('vent'));
  await pg.waitForTimeout(1500);
  await P(() => { const c = window.__panel().shadowRoot.querySelector('.casora-chip'); if (c) c.click(); });
  await pg.waitForTimeout(500);
  const bar = await P(() => { const r = window.__panel().shadowRoot; const s = r.querySelector('.cs-bar .cs-state'), b = r.querySelector('.cs-bar .cs-save');
    if (!s || !b) return null; const a = s.getBoundingClientRect(), c = b.getBoundingClientRect(), rng = document.createRange(); rng.selectNodeContents(s);
    const t = rng.getBoundingClientRect(); return { text: s.textContent, over: !(t.right <= c.left || t.bottom <= c.top || t.top >= c.bottom || t.left >= c.right), a: [a.left, a.top, a.right, a.bottom].map(Math.round), b: [c.left, c.top, c.right, c.bottom].map(Math.round) }; });
  await check('Handy: Knopf überdeckt „Ungespeicherte Änderungen“ nicht', bar && /Ungespeichert/.test(bar.text) && !bar.over, bar);
  await P(() => { const c = window.__panel().shadowRoot.querySelector('.casora-chip'); if (c) c.click(); });
  await P(() => { const p = window.__panel(); p._csSheet && p._flowMode && p._exitFlow && p._exitFlow(false); });
  await pg.waitForTimeout(500);
  await P(() => window.__panel()._bSceneFromState());
  await pg.waitForTimeout(700);
  const fld = await P(() => { const i = window.__panel().shadowRoot.querySelector('.bsfs .bsin'); if (!i) return null; i.blur(); return getComputedStyle(i).boxShadow; });
  await check('Handy: Namensfeld im Szenen-Dialog hat einen sichtbaren Rand', !!fld && fld !== 'none', fld);
  await P(() => window.__panel()._bSceneClose());
}

await finish();
