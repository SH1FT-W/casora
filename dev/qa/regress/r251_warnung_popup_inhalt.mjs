// @zustand: arbeit
// @parallel: allein   (speichert das Dashboard und stellt es am Ende wieder her)
// Gemeldet (11.10.2026): Das Popup der Warn-Kachel (NINA) zeigte bei aktiver Warnung „Noch kein Gerät
// zugeordnet“ statt der Warnung. Erwartet: Desktop und Handy zeigen die Warnung im Popup, kein Leer-Hinweis.
// Die Warnung gibt es nur im Browser (fakeStates), in HA wird nichts angelegt.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const W1 = 'binary_sensor.nina_warning_qa_ort_1', W2 = 'binary_sensor.nina_warning_qa_ort_2';
const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

const cfgOf = async (url) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: url }); } finally { c.close(); } };
const orig = { [dash.url]: await cfgOf(dash.url), [dash.phone.url]: await cfgOf(dash.phone.url) };
atFinish(async () => {
  const c = await ws();
  try { for (const [u, cfg] of Object.entries(orig)) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg }); } finally { c.close(); }
});

// Warn-Kachel wie im Studio (Sammel-Kachel über mehrere NINA-Sensoren) vorn in die erste Ansicht.
const TILE = { type: 'custom:button-card', template: 'casora_weather_warning', entity: W1, variables: { sensors: [W1, W2] } };
for (const u of [dash.url, dash.phone.url]) {
  const cfg = JSON.parse(JSON.stringify(orig[u]));
  const v = cfg.views[0];
  // Erste Kachelliste der Ansicht finden (sections/cards, beliebig tief) und die Kachel vorn einsetzen.
  let done = false;
  (function walk(o) { if (done || !o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
    // Handy: Favoriten-Reihe (casora-smart-row), die Kachel steckt dort in einer Bedingungs-Karte (nur bei Warnung).
    if (u === dash.phone.url && o.type === 'custom:casora-smart-row' && Array.isArray(o.cards)) {
      o.cards.unshift({ type: 'conditional', conditions: [{ condition: 'state', entity: W1, state: 'on' }],
        card: { type: 'custom:button-card', template: 'casora_weather_warning', entity: W1, variables: { size: 'large' } } }); done = true; return; }
    if (u === dash.url && Array.isArray(o.cards) && o.cards.some((c) => c && c.type === 'custom:button-card' && c.template && [].concat(c.template).some((t) => /casora_(light|switch|thermostat|cover|media)/.test(t)))) {
      o.cards.unshift(JSON.parse(JSON.stringify(TILE))); done = true; return; }
    Object.values(o).forEach(walk); })(v);
  await need(`Platz für die Warn-Kachel (${u})`, done);
  const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg }); } finally { c.close(); }
}

const WARN = { state: 'on', attributes: { friendly_name: 'Warnung 1', headline: 'Amtliche WARNUNG vor STARKEM GEWITTER',
  description: 'Es treten Gewitter auf.', severity: 'Moderate', event: 'STARKES GEWITTER',
  sent: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString() } };

for (const [label, url, size] of [['Desktop', dash.url, { width: 1440, height: 900 }], ['Handy', dash.phone.url, { width: 393, height: 852, mobile: true }]]) {
  const { page, browser } = await open({ ...size, theme: 'Casora', dark: false });
  await dashboard(page, url);
  await fakeStates(page, { [W1]: WARN, [W2]: { state: 'off', attributes: { friendly_name: 'Warnung 2' } } }, { sticky: true });
  const tile = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_weather_warning'));
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await need(`${label}: Warn-Kachel sichtbar`, tile);
  await page.waitForTimeout(400);
  const t2 = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_weather_warning'));
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(t2.x, t2.y);
  await page.waitForTimeout(4500);
  const pop = await page.evaluate(() => {
    const p = window.__pierce('casora-popup').find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!p) return null;
    const sr = p.shadowRoot || p, box = sr.querySelector('.soft-empty');
    const txt = (p.innerText || '') + ' ' + window.__pierce('*', p).map((e) => e.shadowRoot ? '' : '').join('');
    const deep = (function t(n) { let o = ''; if (n.shadowRoot) o += t(n.shadowRoot); for (const k of n.childNodes) o += k.nodeType === 3 ? k.textContent : t(k); return o; })(p).replace(/\s+/g, ' ');
    return { empty: p.hasAttribute('soft-empty'), shown: !!(box && !box.hidden), box: box ? box.textContent.trim() : '', warn: /GEWITTER/i.test(deep),
      kids: p.container ? [].map.call(p.container.children, (k) => Math.round(k.getBoundingClientRect().height)) : null };
  });
  await check(`${label}: Popup offen`, pop);
  await check(`${label}: kein Leer-Hinweis`, pop && !pop.empty && !pop.shown, pop);
  await check(`${label}: Warnung im Popup`, pop && pop.warn, pop);
  await browser.close();
}
await finish();
