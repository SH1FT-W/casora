// @zustand: arbeit
// @deckt: custom_components/casora/scripts/filter-overlay.js#_appendRoomScenes dashboards/casora/button_card_templates.json#casora_scene_core
// Issue #142: on the phone's room page a running scene's name was dark on a dark tile. Expected: the running chip's
// name is readable on its own background, in the dark and the light look. „Running“ is faked in the browser only.
// Pictures: CASORA_R600_BILDER=<folder>.
import fs from 'node:fs';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_R600_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

const dash = await casoraDashboard();
await need('Casora dashboard with a phone layout', dash && dash.phone);
const c = await ws();
const phone = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
c.close();
const kids = (((phone.views[0] || {}).cards || [])[1] || {}).cards || [];
const rooms = kids.filter((x) => x && x.type === 'custom:casora-filter-overlay' && x.room);
await need('room pages on the phone', rooms.length > 0);

const key = (n) => 'room_' + String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const luminance = ([r, g, b]) => { const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const [tag, dark] of [['dark', true], ['light', false]]) {
  const o = await open({ width: 390, height: 844, mobile: true, dark, theme: 'Casora' });
  usePage(o.page);
  await o.context.addInitScript(() => {
    let sc; Object.defineProperty(window, '_casoraSC', { configurable: true, get: () => sc, set: (v) => {
      sc = v; if (v && v.isActive && !v.__qa) { v.isActive = () => true; v.__qa = 1; } } });
  });
  await dashboard(o.page, dash.phone.url + '/' + (phone.views[0].path || '0'), 3);
  let res = null;
  for (const room of rooms) {
    await o.page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), room.filter_category || key(room.room));
    for (let i = 0; i < 10 && !res; i++) {
      await o.page.waitForTimeout(500);
      res = await o.page.evaluate((name) => {
        // Resolves any CSS colour to [r, g, b, a] 0–1 by painting it.
        const paint = (css) => { const x = document.createElement('canvas'); x.width = x.height = 1; const g = x.getContext('2d', { willReadFrequently: true });
          g.fillStyle = css; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].map((v) => v / 255); };
        for (const b of window.__pierce('button-card')) {
          if (!((b._config || {}).template || '').toString().includes('casora_scene_row') || ((b._config || {}).variables || {}).room !== name) continue;
          const chip = b.shadowRoot && b.shadowRoot.querySelector('[data-scene]');
          if (!chip) continue;
          const nm = chip.querySelector('[data-casora-mid]');
          const cs = getComputedStyle(chip);
          return { room: name, scene: chip.getAttribute('data-scene'), bgCss: cs.backgroundColor, nameCss: getComputedStyle(nm).color, bg: paint(cs.backgroundColor), name: paint(getComputedStyle(nm).color),
            inline: chip.getAttribute('style').match(/background:[^;]*/g), tint: cs.getPropertyValue('--casora-entity-active-tint-current'), active: cs.getPropertyValue('--casora-entity-active-tint'), nameVar: cs.getPropertyValue('--casora-entity-name-active') };
        }
        return null;
      }, room.room);
    }
    if (res) break;
  }
  await need(tag + ': a room page with a scene', res);
  await o.page.waitForTimeout(800);
  if (BILDER) await o.page.screenshot({ path: `${BILDER}/${tag}.png` });
  // The tile is translucent: over the darkest backdrop it can have (black) in the dark look, over white in the light.
  const under = dark ? 0 : 1;
  const over = (c2) => c2.slice(0, 3).map((v) => v * c2[3] + under * (1 - c2[3]));
  const ratio = contrast(over(res.bg), res.name.slice(0, 3));
  await check(tag + ': a running scene\'s name is readable on its tile (contrast ≥ 3)', ratio >= 3, { ratio, bgCss: res.bgCss, tint: res.tint, active: res.active, inline: res.inline });
  await o.browser.close();
}
await finish();
