// @zustand: arbeit
// @parallel: ui
// Inventar 10.10.2026 (inv-01/02, DP-27): Eine Kachel casora_custom ohne eingebettete Karte (kein type)
// warf bei jedem Neuzeichnen in button-card „Cannot set properties of undefined (setting 'preview')“ und
// zeigte rot „TypeError“ – im Matrix-Dashboard auf allen Geräten, der Fehler landete bei jedem Popup.
// Erwartet: ohne Karte bleibt die Kachel leer und still; mit Karte wird sie wie bisher eingebettet.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await dashboard(page, desk.url);
await page.waitForTimeout(1500);
errs.length = 0;
const r = await page.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const ent = Object.keys(ha.hass.states).find((k) => k.startsWith('sensor.'));
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 120 && x.width < 420 && x.height > 60 && x.top > 100; });
  const mk = (cfg) => { const b = document.createElement('button-card'); b.setConfig(Object.assign({ type: 'custom:button-card', template: 'casora_custom', entity: ent }, cfg));
    b.hass = ha.hass; old.parentNode.insertBefore(b, old); return b; };
  const leer = mk({ name: 'leer' });
  const mit = mk({ custom_fields: { card: { type: 'markdown', content: 'QA r172 Inhalt' } } });
  for (let i = 0; i < 3; i++) { await new Promise((res) => setTimeout(res, 400)); leer.hass = mit.hass = Object.assign({}, ha.hass); }
  await new Promise((res) => setTimeout(res, 800));
  const deep = (n) => { let t = ''; for (const c of n.childNodes) t += c.nodeType === 3 ? c.data + ' ' : c.nodeType === 1 && c.tagName !== 'STYLE' ? deep(c) : '';
    if (n.shadowRoot) t += deep(n.shadowRoot); return t; };
  const out = { leer: deep(leer.shadowRoot).replace(/\s+/g, ' ').trim(), mit: deep(mit.shadowRoot).replace(/\s+/g, ' ').trim() };
  leer.remove(); mit.remove();
  return out;
});
await check('ohne Karte: kein „TypeError“ auf der Kachel', !/TypeError/.test(r.leer), r.leer);
await check('mit Karte: eingebettete Karte sichtbar', /QA r172 Inhalt/.test(r.mit), r.mit);
await check('keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 2).map((e) => e.slice(0, 200)));
await finish();
