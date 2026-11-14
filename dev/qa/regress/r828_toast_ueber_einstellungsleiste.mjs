// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b-plus.js#_bToastLift,_load
// Gate 14.11.2026 (rb15, phone): after opening the Studio a toast "Room added: Briefkasten · Undo" lay over
// "Save settings" of the settings bar (.cs-bar); the tap on the button hit the toast, the settings stayed unsaved.
// Two causes, both checked here:
// 1. The toast sat at the bottom on top of the settings bar. Expected: while the bar shows, "Save settings" is the
//    element under its own centre, on the phone, the tablet and the desktop, whether the toast came first or the bar.
// 2. A load right after another one (the Studio's start load, then another dashboard): the earlier load's timer
//    cleared the "loading" flag of the running one, its reconcile was reported as an edit ("Room added: …").
//    Expected: no toast after loading one dashboard right after another.
// Nothing is saved: the setting is changed and changed back, the dashboards are only loaded.
import { open, studio, casoraDashboards, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);

const panel = (pg, fn, a) => pg.evaluate(fn, a);
// The element under the centre of "Save settings" and the toast as it shows.
const probe = (pg) => panel(pg, () => {
  const r = window.__panel().shadowRoot;
  const b = r.querySelector('.cs-bar:not(.cs-clean) .cs-save');
  const t = r.querySelector('.btoast.on');
  if (!b) return { bar: false, toast: !!t };
  const q = b.getBoundingClientRect();
  const hit = r.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
  const tr = t && t.getBoundingClientRect();
  return { bar: true, toast: !!t, onSave: !!hit && (hit === b || b.contains(hit)), hit: hit && (hit.className || hit.tagName),
    save: [Math.round(q.top), Math.round(q.bottom)], toastAt: tr && [Math.round(tr.top), Math.round(tr.bottom)],
    toastInView: !!tr && tr.top >= 0 && tr.bottom <= innerHeight };
});
const toast = (pg) => panel(pg, () => window.__panel()._bToast('Raum hinzugefügt: Test', { action: { label: 'Rückgängig', run() {} } }));

for (const [name, size] of [['Handy', { width: 390, height: 844, mobile: true, scale: 2 }],
  ['Tablet', { width: 820, height: 1180, mobile: true }], ['Desktop', { width: 1600, height: 1000 }]]) {
  const o = await open({ ...size, dark: false });
  const pg = o.page;
  await studio(pg, dash.url);
  await panel(pg, () => window.__panel()._bClose && window.__panel()._bClose());
  await panel(pg, () => window.__panel()._csOpenPage('n-bell', 'nb-vent'));
  await pg.waitForTimeout(1500);
  const chip = () => panel(pg, () => { const c = window.__panel().shadowRoot.querySelector('.casora-chip'); if (c) c.click(); return !!c; });
  await need(`${name}: Seite „Glocke & Meldungen“ mit Lüften-Empfänger`, await chip());
  await pg.waitForTimeout(400);
  // a) bar first, then the toast
  await toast(pg);
  await pg.waitForTimeout(500);
  const a = await probe(pg);
  await check(`${name}: Toast nach der Leiste – „Einstellungen speichern“ nicht verdeckt`, a.bar && a.toast && a.onSave && a.toastInView, a);
  // b) toast first, then the bar (as in the gate: the toast was there when the setting changed)
  await chip();
  await pg.waitForTimeout(400);
  await toast(pg);
  await pg.waitForTimeout(300);
  await chip();
  await pg.waitForTimeout(500);
  const b = await probe(pg);
  await check(`${name}: Leiste nach dem Toast – „Einstellungen speichern“ nicht verdeckt`, b.bar && b.toast && b.onSave && b.toastInView, b);
  // back: setting as before, the toast back at its place
  await chip();
  await pg.waitForTimeout(500);
  const c = await panel(pg, () => { const t = window.__panel().shadowRoot.querySelector('.btoast'); return { bottom: t ? t.style.bottom : '' }; });
  await check(`${name}: ohne Leiste steht der Toast wieder an seinem Platz`, !c.bottom, c);
  await o.browser.close().catch(() => {});
}

// 2) one dashboard loaded right after another (the second one slow): no "Room added"
{
  const other = (await casoraDashboards()).find((d) => !d.mobile && d.url !== dash.url
    && ((d.config || {}).views || []).length !== ((dash.config || {}).views || []).length);
  await need('zweites Casora-Dashboard mit anderer Raumzahl', other);
  const o = await open({ width: 390, height: 844, mobile: true, dark: false, scale: 2 });
  const pg = o.page;
  await studio(pg, dash.url);
  await panel(pg, () => window.__panel()._bToastHide());
  const seen = await panel(pg, async ([a, b]) => {
    const p = window.__panel();
    const msgs = [];
    const orig = p._bToast;
    p._bToast = function (m) { msgs.push(m); return orig.apply(this, arguments); };
    p._setDash(a); await p._load();
    // The second load as long as on a fresh page in the gate (~2.5 s there): the dashboard arrives after 1.5 s.
    const ws = p._ws;
    p._ws = async function (m) { if (m && m.type === 'lovelace/config') await new Promise((r) => setTimeout(r, 1500)); return ws.apply(this, arguments); };
    p._setDash(b);
    try { await p._load(); } finally { p._ws = ws; }
    await new Promise((r) => setTimeout(r, 2500));
    p._bToast = orig;
    return { msgs, rooms: p._state.compact.rooms.length };
  }, [other.url, dash.url]);
  await check('Dashboard direkt nach einem anderen geladen: keine Meldung „Raum hinzugefügt“', !seen.msgs.some((m) => /Raum|Room/.test(m)), seen);
  await o.browser.close().catch(() => {});
}

await finish();
