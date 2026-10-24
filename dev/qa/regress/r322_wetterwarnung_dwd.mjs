// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/01-basis.js dev/casora_mock/testserver.py
// Weather warning tile with the DWD level sensor (issue #55). Reported: with HA's "Deutscher Wetterdienst (DWD)
// Weather Warnings" installed the tile's device picker stayed empty – it only took a safety binary_sensor (NINA).
// Expected, at the made-up region "Testland Nord" (dev/casora_mock/testserver.py, level 3 with two warnings):
//   1. Studio: the tile's device list and the "Warning sensors" list offer both DWD level sensors (the safety
//      binary sensors stay); the finder suggests the current level, never the advance warning; "Add tile" →
//      "Weather warning" → the suggestion dialog lists the sensor, "Use" puts it on the tile (in memory only).
//   2. Dashboard: the tile is active in the Severe colour, says "Warnungen · Schwere Warnung" and names the most
//      severe warning plus the count ("Schweren Sturmböen · 1 weitere"); the popup lists both warnings with the
//      region, and the bell builds one row per warning from the same list (casoraWarnings).
// Nothing is saved: the tile lives only in the browser. DWD_BILDER=<folder>: pictures of tile and popup.
import { open, studio, casoraDashboard, dashboard, check, need, finish, stable, usePage } from './lib.mjs';

const NOW = 'sensor.testserver_wetterwarnung_stufe';
const PRE = 'sensor.testserver_vorwarnung_stufe';
const OUT = process.env.DWD_BILDER;
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

// ── 1. Studio ──
const s = await open({ width: 1600, height: 1000, dark: true });
usePage(s.page);
await studio(s.page, dash.url);
await need('DWD-Testsensor im Testhaus (Mock)', await s.page.evaluate((id) => !!window.__panel()._hass.states[id], NOW));
const pick = await s.page.evaluate(([now, pre]) => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const type = I.TILE_TYPES.find((t) => t.id === 'casora_weather_warning');
  const field = type.fields.find((f) => f.key === 'sensors');
  const list = p._entityList(type.domains, type.classes, type.accept);
  const flist = p._entityList(field.domains, field.classes, field.accept);
  const rooms = p._state.compact.rooms;
  const homeIdx = rooms.findIndex((r) => I.isHomeRoom(r, rooms));
  const home = rooms[homeIdx < 0 ? 0 : homeIdx];
  return { tile: [now, pre].filter((e) => list.includes(e)), field: [now, pre].filter((e) => flist.includes(e)),
    binary: list.filter((e) => e.startsWith('binary_sensor.')).length, cands: p._tileCandidates(type, home).map((c) => c.id), homeIdx: homeIdx < 0 ? 0 : homeIdx };
}, [NOW, PRE]);
await check('Studio: Geräteliste der Kachel bietet beide DWD-Stufensensoren', pick.tile.length === 2, pick);
await check('Studio: Liste „Warnungs-Sensoren“ bietet sie ebenfalls', pick.field.length === 2, pick);
await check('Studio: Sicherheits-Binärsensoren bleiben in der Liste', pick.binary > 0, pick);
await check('Finder: schlägt die aktuelle Warnstufe vor, nicht die Vorwarnstufe', pick.cands.includes(NOW) && !pick.cands.includes(PRE), pick.cands);

// "Add tile" → "Weather warning" in the home room, the suggestion dialog, "Use" (double-click = pick + OK).
await s.page.evaluate(async (i) => { const p = window.__panel(); p._room = i; p._sel = null; p._bOpen = true; p._stackOpenReq = 'tiles'; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 1200));
  const b = [...p.shadowRoot.querySelectorAll('#pane button')].find((x) => x.getClientRects().length && /Kachel hinzufügen|Add tile/.test(x.textContent));
  if (b) b.setAttribute('data-qa', 'kachel-neu'); }, pick.homeIdx);
await need('Knopf „Kachel hinzufügen“ im Inspektor', await s.page.locator('[data-qa=kachel-neu]').count());
const before = await s.page.evaluate(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].tiles.length; });
await s.page.locator('[data-qa=kachel-neu]').click();
await s.page.waitForTimeout(900);
await s.page.locator('.combo-menu:visible').getByText(/^(Wetterwarnung|Weather warning)$/).first().click();
const ask = await stable(s.page, (now) => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (!a) return null;
  return { picks: [...a.querySelectorAll('.askpick')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    dwd: [...a.querySelectorAll('.askpick')].findIndex((r) => /Aktuelle Warnstufe/.test(r.textContent)) };
}, NOW, { max: 8000, quiet: 600 });
await check('Dialog schlägt den DWD-Sensor „Testland Nord Aktuelle Warnstufe“ vor', ask && ask.dwd >= 0, ask);
if (ask && ask.dwd >= 0) {
  await s.page.evaluate((i) => { const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
    ps[ps.length - 1].querySelectorAll('.askpick')[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }, ask.dwd);
  await s.page.waitForTimeout(1200);
}
const added = await s.page.evaluate(() => { const p = window.__panel(); const t = p._state.compact.rooms[p._room].tiles; const l = t[t.length - 1] || {};
  return { n: t.length, tpl: l.template, entity: l.entity }; });
await check('Kachel „Wetterwarnung“ mit dem DWD-Sensor hinzugefügt (nur im Speicher)', added.n === before + 1 && added.tpl === 'casora_weather_warning' && added.entity === NOW, added);
await s.page.context().close();

// ── 2. Dashboard (tile only in the browser, as r320) ──
const { page } = await open({ width: 1440, height: 1000, dark: true, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url, 3);
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_weather_warning', entity: id });
  el.classList.add('qa-r322');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:260px;height:180px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, NOW);
const tile = await stable(page, () => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r322');
  const sr = el && el.shadowRoot;
  if (!sr || !sr.querySelector('ha-card')) return null;
  const q = (s) => { const n = sr.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const W = window.casoraWarnings, S = document.querySelector('home-assistant').hass.states;
  const cs = getComputedStyle(sr.querySelector('ha-card'));
  return { name: q('#name'), state: q('#state'), colour: cs.getPropertyValue('--casora-icon-color-current').trim(), red: cs.getPropertyValue('--casora-color-red').trim(),
    bell: W ? W.list(S, [el._config.entity]).map((w) => W.kind(w) + '/' + w.severity) : null };
}, null, { max: 12000, quiet: 1000, until: (t) => !!t && /weitere/.test(t.state) });
await check('Kachel: „Warnungen · Schwere Warnung“ (höchste DWD-Stufe 3)', tile && tile.name === 'Warnungen · Schwere Warnung', tile);
await check('Kachel: schwerste Warnung plus Zähler („Schweren Sturmböen · 1 weitere“)', tile && /Schweren Sturmböen · 1 weitere/.test(tile.state), tile && tile.state);
await check('Kachel: Farbe der Stufe 3 (das Rot des Themes wie „Severe“)', tile && !!tile.red && tile.colour === tile.red, tile && [tile.colour, tile.red]);
await check('Glocke: zwei Zeilen aus derselben Liste (Sturmböen/Severe, Gewitter/Moderate)', tile && tile.bell && tile.bell.join('|') === 'Schwere Sturmböen/Severe|Gewitter/Moderate', tile && tile.bell);
const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r322').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height }; });
if (OUT) await page.screenshot({ path: OUT + '/1-kachel-desktop-dunkel.png', clip: { x: at.x - 24, y: at.y - 24, width: at.w + 48, height: at.h + 48 } });
await page.mouse.click(at.x + at.w * 0.7, at.y + at.h * 0.75);
const pop = await stable(page, () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(p.shadowRoot);
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 3000);
}, null, { max: 15000, quiet: 1500, until: (t) => !!t && /GEWITTER/.test(t) });
await check('Popup: Kopf „Schwere Warnung“ mit Region „Testland Nord“', pop && /Schwere Warnung/.test(pop) && /Testland Nord/.test(pop), pop);
await check('Popup: beide Warnungen mit Überschrift', pop && /UNWETTERWARNUNG vor SCHWEREN STURMBÖEN/.test(pop) && /WARNUNG vor GEWITTER/.test(pop), pop);
await check('Popup: Beschreibung und Verhaltenshinweis des DWD', pop && /Sturmböen mit Geschwindigkeiten/.test(pop) && /Blitzschlag/.test(pop), pop);
await check('Popup: Zeitraum je Warnung, kein undefined/NaN', pop && / bis /.test(pop) && !/undefined|NaN|—/.test(pop), pop);
if (OUT) await page.screenshot({ path: OUT + '/2-popup-desktop-dunkel.png' });
await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
await finish();
