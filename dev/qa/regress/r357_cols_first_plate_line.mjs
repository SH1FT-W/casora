// @zustand: arbeit
// @parallel: ui
// Rule 12 (symmetry, owner 26.10.2026): in a two-column popup the first plates of both columns start on one line.
// Prod: climate badge popup „Klima“ – left „Messwerte“ with rows, right only „Mehr · Lüftungs-Coach“ without a
// heading; „Mehr“ sat about 13 px lower than „Temperatur“. Checks every marked column pair (colsMark) of the
// climate badge and humidifier popups on desktop 1440: tops of the first plates equal (±1 px).
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);

const cases = await page.evaluate(() => {
  const st = document.querySelector('home-assistant').hass.states;
  const k = Object.keys(st);
  const temp = k.find((x) => x.startsWith('sensor.') && st[x].attributes.device_class === 'temperature' && /wohn|living/i.test(x)) || k.find((x) => x.startsWith('sensor.') && st[x].attributes.device_class === 'temperature');
  return [
    { name: 'Klima-Badge', tpl: 'casora_badge_temp', eid: temp },
    { name: 'Luftbefeuchter', tpl: 'casora_humidifier', eid: k.find((x) => x.startsWith('humidifier.')) },
  ].filter((c) => c.eid);
});
await need('Klima-Badge im Testhaus', cases.find((c) => c.name === 'Klima-Badge'), cases);
for (const c of cases) {
  const r = await page.evaluate(async (c) => {
    const ha = document.querySelector('home-assistant');
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 120 && x.height > 60 && x.top > 60; });
    const el = document.createElement('button-card');
    try { el.setConfig({ type: 'custom:button-card', template: c.tpl, entity: c.eid }); } catch (e) { return { err: String(e) }; }
    el.hass = ha.hass; old.parentNode.insertBefore(el, old);
    await new Promise((res) => setTimeout(res, 600));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail.config.tap_action; if (act && act.casora_popup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    await new Promise((res) => setTimeout(res, 4800));
    const s = window.casoraPopup && window.casoraPopup.surface;
    const deep = (root, sel, out) => { root.querySelectorAll(sel).forEach((n) => out.push(n)); root.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) deep(n.shadowRoot, sel, out); }); return out; };
    const BODY = '.hui-plate,.hui-srow,.hui-mhd,.hui-acts,.hui-kc,.hui-seg,[data-casora-body]';
    const pairs = [];
    if (s) deep(s, 'style', []).forEach((stl) => {
      const re = /\/\*casora-cols:([\w-]+),([\w-]+)\*\//g; let m;
      while ((m = re.exec(stl.textContent || ''))) {
        const root = stl.getRootNode(); const a = root.getElementById(m[1]), b = root.getElementById(m[2]);
        if (!a || !b) continue;
        const first = (el) => { let best = null, lbl = ''; deep(el, BODY, []).forEach((n) => { if (n.closest && n.closest('.hui-mbd')) return; const q = n.getBoundingClientRect(); if (q.width > 2 && q.height > 2 && (best === null || q.top < best)) { best = q.top; lbl = n.textContent.replace(/\s+/g, ' ').trim().slice(0, 30); } }); return { top: best, lbl }; };
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        if (Math.abs(ra.top - rb.top) > 80 || ra.width < 50 || rb.width < 50) continue; // stacked, not side by side
        pairs.push({ a: first(a), b: first(b) });
      }
    });
    window.__r357el = el;
    return { pairs };
  }, c);
  await shot(c.name + ' Desktop');
  if (r.err || !r.pairs.length) { await check(c.name + ': zweispaltiges Popup gefunden', c.name !== 'Klima-Badge' && !r.err ? true : false, r); }
  for (const p of r.pairs || []) {
    if (p.a.top == null || p.b.top == null) continue;
    await check(c.name + ': erste Platten beider Spalten auf einer Linie (' + p.a.lbl + ' | ' + p.b.lbl + ')', Math.abs(p.a.top - p.b.top) <= 1, p);
  }
  await page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r357el) window.__r357el.remove(); await new Promise((res) => setTimeout(res, 600)); });
}
await finish();
