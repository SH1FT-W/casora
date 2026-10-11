// @zustand: arbeit
// @parallel: allein   (speichert das Dashboard und stellt es am Ende wieder her)
// Gemeldet (11.10.2026): Updates-Popup bei „Aktuell“ geöffnet, dann „Nach Updates suchen“ – neue Einträge
// erschienen erst nach erneutem Öffnen (die Liste wurde nur gebaut, wenn beim Öffnen schon etwas offen war).
// Erwartet: „Aktuell“ verschwindet und das neue Update steht im offenen Popup. Zustände nur im Browser.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const c0 = await ws(); const orig = await c0.cmd({ type: 'lovelace/config', url_path: dash.url }); c0.close();
atFinish(async () => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: orig }); } finally { c.close(); } });
{
  const cfg = JSON.parse(JSON.stringify(orig)); let done = false;
  (function w(o) { if (done || !o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(w);
    if (Array.isArray(o.cards) && o.cards.some((c) => c && c.type === 'custom:button-card' && [].concat(c.template || []).some((t) => /casora_(light|switch|thermostat|cover|media|weather_warning)/.test(t)))) {
      o.cards.unshift({ type: 'custom:button-card', template: 'casora_updates' }); done = true; return; }
    Object.values(o).forEach(w); })(cfg.views[0]);
  await need('Updates-Kachel eingesetzt', done);
  const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); } finally { c.close(); }
}

const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
await dashboard(page, dash.url);
// Ausgangslage: nichts offen.
const ids = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => id.startsWith('update.')));
await need('Update-Entitäten im Haus', ids.length > 0, ids.length);
await fakeStates(page, Object.fromEntries(ids.map((id) => [id, { state: 'off' }])), { sticky: true });
// Die Kachel kann in einer Wisch-Reihe außerhalb des Bildes liegen: direkt antippen (Klick auf ihre ha-card).
let tapped = false;
for (let i = 0; i < 20 && !tapped; i++) { if (i) await page.waitForTimeout(500); tapped = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_updates'));
  const c = b && b.shadowRoot && b.shadowRoot.querySelector('ha-card'); if (!c) return false; c.click(); return true; }); }
await need('Updates-Kachel angetippt', tapped);
await page.waitForTimeout(2500);
const text = () => page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const t = (n) => { let o = ''; if (n.shadowRoot) o += t(n.shadowRoot); for (const k of n.childNodes) o += k.nodeType === 3 ? k.textContent : (k.tagName === 'STYLE' ? '' : t(k)); return o; };
  return p ? t(p).replace(/\s+/g, ' ') : null; });
const a = await text();
await need('Popup offen', a);
await check('beim Öffnen „Aktuell“', /Aktuell/.test(a), a.slice(0, 300));

// „Nach Updates suchen“ findet etwas: ein Update wird verfügbar.
const NEW = ids[0];
await fakeStates(page, { [NEW]: { state: 'on', attributes: { title: 'QA Testpaket', installed_version: '1.0.0', latest_version: '1.1.0', in_progress: false } } }, { sticky: true });
await page.waitForTimeout(2000);
const b = await text();
await check('neues Update erscheint im offenen Popup', /QA Testpaket/.test(b), b.slice(0, 600));
await check('„Verfügbare Updates“ steht darüber', /Verfügbare Updates/.test(b), b.slice(0, 600));
const twice = (b.match(/1 Update verfügbar/g) || []).length;
const shownTwice = await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open')); let n = 0;
  (function w(r, d) { if (d > 16) return; if (r !== p.shadowRoot) r.querySelectorAll('.hui-line').forEach((l) => { if (l.getBoundingClientRect().height > 0 && /Update verf/.test(l.textContent)) n++; });
    r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) w(e.shadowRoot, d + 1); }); })(p.shadowRoot || p, 0);
  return n; });
await check('Statuszeile nicht doppelt (nur im Kopf)', shownTwice === 0, { sichtbarImInhalt: shownTwice, imText: twice });
await finish();
