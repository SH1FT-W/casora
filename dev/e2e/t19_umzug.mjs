// @deckt: custom_components/casora/panel/casora-panel-umzug.js custom_components/casora/hemma_cleanup.py
// Umzugsassistent: findet Hemma-Dashboards, wertet sie aus (Räume, Kacheln, angepasste
// Vorlagen), zieht eines um und räumt danach auf (neue Dashboards, Merker).
import { open, ready, PIERCE } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';

const { browser, page, errors } = await open({ width: 1440, height: 1000 });
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzug && window.casoraUmzug; });
const res = await page.evaluate(async () => {
  const p = window.__panel(); const h = p._hass; const U = window.casoraUmzug;
  const s0 = (await h.callWS({ type: 'casora/settings/get' })).settings || {};
  delete s0.umzug; await h.callWS({ type: 'casora/settings/set', settings: s0 });
  const list = await U.candidates(p);
  const bundle = await p._bundleOnce();
  // Unlesbare Hemma-YAML-Dashboards: genannt, nicht auswählbar (Entscheidung 03.10.2026).
  const out = { gefunden: [], umzug: null, unlesbar: (list.broken || []).map((b) => b.title) };
  let target = null;
  for (const c of list) {
    const a = await U.analyze(c, bundle, h);
    out.gefunden.push({ titel: c.title, neuerName: U.proposeTitle(p, c), art: a.legacy ? 'Hemma 1' : 'Hemma 2', raeume: a.rooms.length, kacheln: a.tiles.length,
      eigene: a.own.length, angepasst: a.groups.map((g) => g.key), grundgeruest: a.structural });
    if (!a.legacy && !target) target = a;
  }
  if (target) {
    const before = (await h.callWS({ type: 'lovelace/dashboards/list' })).map((d) => d.url_path);
    const done = new Promise((resolve) => { const o = p._flowDone; p._flowDone = function (x) { p._flowDone = o; const r = o.call(this, x); resolve(x && x.url_path); return r; }; });
    p._casoraUmzugRun(target, {});
    const url = await Promise.race([done, new Promise((r) => setTimeout(() => r(null), 60000))]);
    const after = await h.callWS({ type: 'lovelace/dashboards/list' });
    const neu = after.filter((d) => !before.includes(d.url_path));
    const cfg = url ? await h.callWS({ type: 'lovelace/config', url_path: url }) : null;
    const merker = ((await h.callWS({ type: 'casora/settings/get' })).settings.umzug || {}).done || [];
    out.umzug = { url, neu: neu.map((d) => d.url_path), raeume: cfg ? cfg.views.length : 0, gemerkt: merker.some((x) => (typeof x === 'string' ? x : x && x.src) === target.c.url_path),
      // Nach einem erfolgreichen Umzug bietet das Studio die übrigen nicht erneut von selbst an.
      keinNeuesAngebot: await U.movedAny(h, merker) };
    for (const d of neu) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
    const s1 = (await h.callWS({ type: 'casora/settings/get' })).settings || {}; delete s1.umzug;
    await h.callWS({ type: 'casora/settings/set', settings: s1 });
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)));
check('Hemma-Dashboards gefunden', res.gefunden.length > 0 && res.gefunden.every((g) => g.raeume > 0 && g.kacheln > 0), res.gefunden);
check('ein Hemma-2-Dashboard umgezogen', !!(res.umzug && res.umzug.url && res.umzug.raeume > 0), res.umzug);
check('Umzug gemerkt, kein neues Angebot', !!(res.umzug && res.umzug.gemerkt && res.umzug.keinNeuesAngebot), res.umzug);
check('keine Browser-Fehler', !echteFehler(errors).length, echteFehler(errors));
await browser.close();
ende();
