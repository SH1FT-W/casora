// @zustand: stress
// @parallel: ui
// Gemeldet: Tablet quer (1024×768, Touch) mit angedockter HA-Seitenleiste – der Raum-Kopf
// (Wetter, Raumtitel, Badges) lag unter der Seitenleiste, nur „…ung“ eines Badges schaute
// hervor; die Kachelreihe begann ebenfalls bei x=0, die erste Kachel war verdeckt.
// Erwartet: Kopf und Kachelreihe beginnen rechts neben der angedockten Seitenleiste; ist die
// Seitenleiste ausgeblendet (HA „Seitenleiste ausblenden“, Kiosk), bleibt alles ganz links.
// CASORA_LOCAL=1: zusätzlich casora_shared/casora_room aus diesem Checkout nur im Browser
// unterschieben (das Test-HA hat sonst die eingespielten Vorlagen) – gespeichert wird nichts.
import fs from 'node:fs';
import { open, usePage, ready, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora-Dashboard mit Räumen', dash);
const view = (dash.config.views || [])[1];
const url = '/' + dash.url + '/' + (view.path || '1');

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const TABLET = { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA };
const LOCAL_TPL = process.env.CASORA_LOCAL
  ? JSON.parse(fs.readFileSync(new URL('../../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'))
  : null;

async function measure(sidebar) {
  const { page, context } = await open(TABLET);
  usePage(page);
  // HA merkt sich die Seitenleiste im localStorage: docked = angedockt, always_hidden = aus.
  await context.addInitScript((m) => localStorage.setItem('dockedSidebar', JSON.stringify(m)), sidebar);
  await ready(page, url, () => window.__pierce('#badges_media').length > 0 && window.__pierce('casora-smart-row').length > 0, 90000);
  if (LOCAL_TPL) {
    await page.evaluate((T) => {
      const pl = window.__pierce('ha-panel-lovelace')[0];
      const L = pl.lovelace;
      const bct = { ...(L.config.button_card_templates || {}), casora_shared: T.casora_shared, casora_room: T.casora_room };
      pl._setLovelaceConfig({ ...L.config, button_card_templates: bct }, L.rawConfig, L.mode);
    }, LOCAL_TPL);
  }
  await page.waitForFunction(() => window.__pierce('#badges_media').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  return page.evaluate(() => {
    const box = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width) }; };
    const sb = window.__pierce('ha-sidebar')[0];
    const sbBox = sb ? box(sb) : null;
    const root = window.__pierce('#badges_media')[0].getRootNode();
    const name = root.querySelector('#name');
    const row = window.__pierce('casora-smart-row').filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0)[0];
    const n = box(name);
    // Sichtbar: der Punkt in der Titelmitte gehört zum Raum-Kopf, nicht zur Seitenleiste.
    let hit = document.elementFromPoint(n.l + 4, (n.t + n.b) / 2);
    for (let i = 0; hit && hit.shadowRoot && i < 30; i++) { const d = hit.shadowRoot.elementFromPoint(n.l + 4, (n.t + n.b) / 2); if (!d || d === hit) break; hit = d; }
    let underSidebar = false;
    for (let e = hit, i = 0; e && i < 80; e = e.parentElement || (e.getRootNode && e.getRootNode().host), i++) if (e === sb) underSidebar = true;
    return {
      sidebar: sbBox && sbBox.w > 0 && sbBox.r > 0 ? sbBox : null,
      name: n, nameText: name.textContent.trim(), opacity: getComputedStyle(name).opacity,
      underSidebar, row: row ? box(row) : null,
    };
  });
}

// Angedockt: alles rechts der Seitenleiste.
const d = await measure('docked');
await need('HA-Seitenleiste bei 1024 px angedockt', d.sidebar, d.sidebar);
const edge = d.sidebar.r;
await check(`Raumtitel „${d.nameText}“ liegt rechts der Seitenleiste (x ${d.name.l} ≥ ${edge})`, d.name.l >= edge, d.name);
await check('Raumtitel ganz im Bild', d.name.r <= 1024 && d.name.w > 20 && d.name.t >= 0 && d.name.b <= 768, d.name);
await check('Raumtitel sichtbar, nicht unter der Seitenleiste', !d.underSidebar && parseFloat(d.opacity) > 0.5, { underSidebar: d.underSidebar, opacity: d.opacity });
await check(`Kachelreihe beginnt rechts der Seitenleiste (x ${d.row && d.row.l} ≥ ${edge})`, !!d.row && d.row.l >= edge, d.row);

// Ausgeblendet: ganz links wie bisher.
const h = await measure('always_hidden');
await check('Seitenleiste ausgeblendet: Raumtitel ganz links', !h.sidebar && h.name.l < 80, { sidebar: h.sidebar, name: h.name });
await check('Seitenleiste ausgeblendet: Kachelreihe ab dem linken Rand', !!h.row && h.row.l === 0, h.row);

await finish();
