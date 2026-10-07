// @zustand: stress
// Gemeldet: Die Szenen-Badge zeigte aufgeklappt höchstens zehn Szenen (casora_room hatte
// zehn feste Plätze), obwohl die Reihe inzwischen seitwärts blättert. Erwartet: je nicht
// ausgeschlossener Szene eine Unter-Badge, und die Reihe lässt sich verschieben.
// Zustand „stress“ hat 36 Szenen.
// CASORA_LOCAL=1: zusätzlich die Vorlagen aus diesem Checkout (nur im Speicher) unterschieben.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, cards, check, need, finish } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-stress')) || (await casoraDashboard());
await need('Casora-Dashboard', dash);

const W = 1280;
const { page, context } = await open({ width: W, height: 860 });
if (process.env.CASORA_LOCAL) {
  const tpl = fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8');
  await context.addInitScript((s) => {
    const T = JSON.parse(s).templates;
    const fix = (d) => {
      if (typeof d !== 'string' || d.indexOf('button_card_templates') < 0) return d;
      try {
        const j = JSON.parse(d);
        [].concat(j).forEach((m) => { const r = m && m.result;
          if (r && r.button_card_templates && r.views) Object.assign(r.button_card_templates, T); });
        return JSON.stringify(j);
      } catch (e) { return d; }
    };
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      addEventListener(t, fn, ...rest) {
        if (t === 'message' && typeof fn === 'function') {
          return super.addEventListener(t, (ev) => fn.call(this, new MessageEvent('message', { data: fix(ev.data) })), ...rest);
        }
        return super.addEventListener(t, fn, ...rest);
      }
    };
  }, tpl);
}
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));

// Erwartete Liste: dieselbe Quelle wie das Dashboard (casoraNavScenes mit scene_exclude der Raumkarte).
const want = await page.evaluate(() => {
  const room = window.__pierce('button-card').find((b) => {
    const v = b._config && b._config.variables;
    return v && v.show_scenes === true && [].concat(b._config.template || []).includes('casora_room');
  });
  if (!room || !window.casoraNavScenes) return null;
  const hass = document.querySelector('home-assistant').hass;
  const ids = window.casoraNavScenes(hass, room._config.variables.scene_exclude);
  return ids.filter((id) => hass.states[id] && hass.states[id].state !== 'unavailable').length;
});
await need('Raumkarte mit Szenen-Badge und casoraNavScenes', want !== null);
await need('mehr als zehn Szenen (Zustand „stress“)', want > 10, want);

let grp = (await cards(page, 'casora_badge_scene_group'))[0];
await need('Szenen-Badge sichtbar', grp);
// Die Badge-Reihe blättert und schneidet am Rand ab: Szenen-Badge erst ganz ins Bild holen,
// sonst trifft der Klick auf ihre Mitte die Raumkarte und die Reihe bleibt zu.
await page.evaluate((i) => window.__pierce('button-card')[i].scrollIntoView({ inline: 'nearest', block: 'nearest' }), grp.i);
await page.waitForTimeout(500);
grp = (await cards(page, 'casora_badge_scene_group'))[0];
await page.mouse.click(grp.x + grp.w / 2, grp.y + grp.h / 2);
await page.waitForTimeout(1800);

const subs = (await cards(page, 'casora_badge_scene')).filter((c) => c.y > grp.y);
await check('je Szene eine Unter-Badge (' + want + ')', subs.length === want, { sichtbar: subs.length, erwartet: want });

const row = await page.evaluate(() => {
  const r = window.__pierce('#badges_scenes').find((e) => e.clientWidth > 0);
  return r ? { sw: r.scrollWidth, cw: r.clientWidth, scroll: r.hasAttribute('data-cs-scroll') } : null;
});
await check('Szenen-Reihe ist breiter als der Platz und blättert (data-cs-scroll)', !!row && row.sw > row.cw + 20 && row.scroll, row);

if (subs.length) {
  const y = subs[0].y + subs[0].h / 2;
  const first = () => cards(page, 'casora_badge_scene').then((l) => {
    const r = l.filter((c) => Math.abs(c.y - subs[0].y) < 4);
    return r.length ? Math.min(...r.map((c) => c.x)) : null;
  });
  const before = await first();
  await page.mouse.move(Math.min(W - 80, subs[0].x + 200), y);
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(800);
  const after = await first();
  await check('Mausrad schiebt die Szenen-Reihe', after !== null && after < before - 20, { before, after });
  // Die letzte Szene ist nach ganz rechts blättern im Bild.
  await page.evaluate(() => { const r = window.__pierce('#badges_scenes').find((e) => e.clientWidth > 0); if (r) r.scrollLeft = r.scrollWidth; });
  await page.waitForTimeout(600);
  const last = (await cards(page, 'casora_badge_scene')).filter((c) => Math.abs(c.y - subs[0].y) < 4);
  const right = last.length ? Math.max(...last.map((c) => c.x + c.w)) : 0;
  await check('letzte Szene nach dem Blättern im Bild', right > 0 && right <= W + 2, { right, W });
}
await finish();
