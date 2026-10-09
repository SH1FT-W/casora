// @zustand: arbeit
// Wunsch (1.1.2): In den Einstellungen unter „Glocke & Meldungen“ eine Ausnahmeliste „Nicht melden“.
// Erwartet: Die Auswahl zeigt nur Geräte, die die Glocke überhaupt melden kann (Fenstersensor ja,
// Lampe nein), nach Raum, mit Meldungsart und „Meldet gerade“; gewählt steht das Gerät in der Liste,
// × nimmt es wieder heraus. Eine Ausnahme (notify.exclude) nimmt den Eintrag aus der Glocke am
// Desktop und am Handy, entfernt kommt er wieder. Nichts wird in HA gespeichert – im Studio bleibt der
// Entwurf ungespeichert, im Dashboard wird die Einstellung nur im Browser gesetzt.
import { open, usePage, studio, casoraDashboard, ready, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

// ── Dashboard: welches offene Fenster meldet die Glocke gerade? ─────────────────────────────
const bell = async (page, url) => {
  await ready(page, '/' + url, '() => !!window._casoraNotify && !!window._casoraLocalLoaded', 60000);
  await page.waitForFunction(() => window._casoraNotify.rows.length > 0, null, { timeout: 20000 }).catch(() => {});
};
const rowsOf = (page) => page.evaluate(() => window._casoraNotify.rows.map((r) => ({ id: r.id, entity: r.entity || null, label: r.label })));
// Nach dem Umstellen bis zu 8 s auf den erwarteten Stand warten (want(rows)); die Glocke baut ihre
// Liste teils nachgelagert neu (09.10.2026: „entfernt → Eintrag wieder da“ im Gate rot, einzeln grün).
const rowsUntil = async (page, want) => { let r = await rowsOf(page);
  for (const t0 = Date.now(); !want(r) && Date.now() - t0 < 8000;) { await page.waitForTimeout(300); r = await rowsOf(page); }
  return r; };
const setEx = (page, list) => page.evaluate(async (l) => {
  const S = window.CASORA_SETTINGS = window.CASORA_SETTINGS || {};
  S.notify = Object.assign({}, S.notify || {}, { exclude: l });
  await window._casoraNotify.refresh();
}, list);

const desk = await open({ width: 1440, height: 900 });
usePage(desk.page);
await bell(desk.page, dash.url + '/' + (dash.config.views[0].path || '0'));
const rows0 = await rowsOf(desk.page);
const win = rows0.find((r) => /^casora:open:/.test(r.id) && r.entity);
await need('Testhaus: offenes Fenster/Tür in der Glocke', win, rows0);
const E = win.entity;

// ── Studio: Auswahl ───────────────────────────────────────────────────────────────────────────
const st = await open({ width: 1440, height: 900 });
usePage(st.page);
await studio(st.page, dash.url);
await st.page.evaluate(() => window.__panel()._csShow('alerts'));
await st.page.waitForFunction(() => !!window.__panel().shadowRoot.querySelector('[data-pkey="notify_exclude"] .gx-addrow'), null, { timeout: 20000 });
await check('Abschnitt „Nicht melden“ unter Glocke & Meldungen', true);
await st.page.evaluate(() => window.__panel().shadowRoot.querySelector('[data-pkey="notify_exclude"] .gx-addrow').click());
await st.page.waitForFunction(() => !!window.__panel().shadowRoot.querySelector('.gx-add .mrow'), null, { timeout: 10000 });
const pick = await st.page.evaluate(() => {
  const root = window.__panel().shadowRoot;
  const S = window.__panel()._hass.states;
  const rows = [...root.querySelectorAll('.gx-add .mrow')].map((b) => ({ id: b.dataset.entity, name: b.querySelector('b').textContent,
    sub: b.querySelector('.msub').textContent, now: b.querySelector('.mkind').textContent }));
  return { rows, heads: [...root.querySelectorAll('.gx-add .mhead')].map((h) => h.textContent),
    lights: Object.keys(S).filter((id) => id.indexOf('light.') === 0).length };
});
const ids = pick.rows.map((r) => r.id);
await check('Auswahl hat Einträge, nach Raum gruppiert', pick.rows.length > 0 && pick.heads.length > 0, pick.heads);
await need('Testhaus: Lampen vorhanden', pick.lights > 0);
await check('keine Lampe in der Auswahl', !ids.some((id) => /^light\./.test(id)), ids.filter((id) => /^light\./.test(id)));
await check('nur meldefähige Arten (keine Schalter/Medien/Szenen)', !ids.some((id) => /^(switch|media_player|scene|script|cover|climate|fan)\./.test(id)));
const mine = pick.rows.find((r) => r.id === E);
await check('offenes Fenster/Tür aus der Glocke steht in der Auswahl', !!mine, E);
await check('… mit Meldungsart und „Meldet gerade“', !!mine && /offen/i.test(mine.sub) && /Meldet gerade/.test(mine.now), mine);
// Suche nach dem Namen findet es.
await st.page.evaluate((n) => { const i = window.__panel().shadowRoot.querySelector('.gx-add input'); i.value = n; i.dispatchEvent(new Event('input')); }, mine ? mine.name : '');
const found = await st.page.evaluate(() => [...window.__panel().shadowRoot.querySelectorAll('.gx-add .mrow')].map((b) => b.dataset.entity));
await check('Suche findet das Gerät', found.includes(E), found.length);
await st.page.evaluate((id) => window.__panel().shadowRoot.querySelector('.gx-add .mrow[data-entity="' + id + '"]').click(), E);
await st.page.waitForTimeout(400);
const after = await st.page.evaluate((id) => {
  const p = window.__panel(); const root = p.shadowRoot;
  return { listed: !!root.querySelector('[data-pkey="notify_exclude"] .gx-row[data-entity="' + id + '"]'),
    picker: !!root.querySelector('.gx-add'), draft: ((p._cs.S.notify || {}).exclude || []).slice(), dirty: p._csDirty() };
}, E);
await check('gewählt: steht in der Liste, Auswahl zu, Entwurf ungespeichert', after.listed && !after.picker && after.draft.includes(E) && after.dirty, after);
await st.page.evaluate(() => window.__panel()._csBar && window.__panel()._csBar());
await st.page.evaluate((id) => window.__panel().shadowRoot.querySelector('[data-pkey="notify_exclude"] .gx-row[data-entity="' + id + '"] .casora-x').click(), E);
await st.page.waitForTimeout(400);
const gone = await st.page.evaluate((id) => ({ listed: !!window.__panel().shadowRoot.querySelector('.gx-row[data-entity="' + id + '"]'),
  draft: ((window.__panel()._cs.S.notify || {}).exclude || []).slice() }), E);
await check('× nimmt es wieder heraus', !gone.listed && !gone.draft.includes(E), gone);

// ── Glocke Desktop ────────────────────────────────────────────────────────────────────────────
usePage(desk.page);
await setEx(desk.page, [E]);
const rows1 = await rowsUntil(desk.page, (r) => !r.some((x) => x.entity === E));
await check('Desktop: Ausnahme → Eintrag weg', !rows1.some((r) => r.entity === E), rows1.map((r) => r.label));
await check('Desktop: übrige Einträge bleiben', rows1.length === rows0.length - 1, [rows0.length, rows1.length]);
await setEx(desk.page, []);
const rows2 = await rowsUntil(desk.page, (r) => r.some((x) => x.entity === E));
await check('Desktop: entfernt → Eintrag wieder da', rows2.some((r) => r.entity === E), rows2.map((r) => r.label));

// ── Glocke Handy ──────────────────────────────────────────────────────────────────────────────
const ph = await open({ width: 390, height: 844, mobile: true, scale: 3 });
usePage(ph.page);
await bell(ph.page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'));
const p0 = await rowsOf(ph.page);
await check('Handy: Eintrag vorher da', p0.some((r) => r.entity === E), p0.map((r) => r.label));
await setEx(ph.page, [E]);
const p1 = await rowsUntil(ph.page, (r) => !r.some((x) => x.entity === E));
await check('Handy: Ausnahme → Eintrag weg', !p1.some((r) => r.entity === E), p1.map((r) => r.label));
await setEx(ph.page, []);
const p2 = await rowsUntil(ph.page, (r) => r.some((x) => x.entity === E));
await check('Handy: entfernt → Eintrag wieder da', p2.some((r) => r.entity === E), p2.map((r) => r.label));

await finish();
