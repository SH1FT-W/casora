// @zustand: demo
// @parallel: ui
// Vorschaumaß (07.10.2026): Die Studio-Vorschau zeigte das Dashboard nicht maßstabsgetreu – im Look
// „Casora“ passten am Desktop knapp 6 statt 4–5 Kacheln in die Reihe, Kacheln waren zu klein, Badges
// zu hoch. Erwartet: Vorschau = echtes Dashboard, nur als Ganzes verkleinert. Verglichen wird je
// Ansicht (Desktop 1440×900, Tablet 1024×711) das Verhältnis zur Bildschirm- bzw. Vorschaubreite:
// Kachelbreite, Kachelhöhe, Titelschrift, Badge-Höhe und -Schrift (±5 %) und Kacheln je Reihe.
import { open, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 1);
await need('Casora-Dashboard mit Räumen', dash);
const view = dash.config.views[1].path || '1';

// Kacheln je Reihe aus Rand, Breite und Abstand (unabhängig davon, wie viele Kacheln der Raum hat).
const perRow = (w, pad, tw, gap) => Math.floor((w - pad + gap + 0.5) / (tw + gap));

async function echt(width, height) {
  const o = await open({ width, height, dark: false, theme: 'Casora', touch: width <= 1024 });
  await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"always_hidden"'));
  await dashboard(o.page, dash.url + '/' + view, 3);
  const m = await o.page.evaluate(() => {
    const P = window.__pierce('button-card');
    const tpl = (b) => [].concat((b._config || {}).template || []).join('+');
    const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
    const leaves = (b) => { const out = []; const walk = (root) => root.querySelectorAll('*').forEach((e) => {
      if (e.shadowRoot) walk(e.shadowRoot);
      if (!e.children.length && e.textContent.trim() && e.getBoundingClientRect().width) out.push(e); }); if (b.shadowRoot) walk(b.shadowRoot); return out; };
    const tiles = P.filter((b) => /casora_(cover|media|light|air_purifier|camera|thermostat|default|switch)$/.test(tpl(b)) && vis(b)
      && b.getBoundingClientRect().height > 100).map((b) => b.getBoundingClientRect()).sort((a, b) => a.x - b.x);
    const row = tiles.filter((t) => Math.abs(t.y - tiles[0].y) < 2);
    const badge = P.find((b) => /^casora_badge_.*group$/.test(tpl(b)) && vis(b));
    const bl = badge && leaves(badge).find((e) => +getComputedStyle(e).fontWeight >= 600);
    const room = P.find((b) => tpl(b) === 'casora_room');
    const title = room && leaves(room).map((e) => parseFloat(getComputedStyle(e).fontSize)).sort((a, b) => b - a)[0];
    return { W: innerWidth, tw: row[0] && row[0].width, th: row[0] && row[0].height, pad: row[0] && row[0].x,
      gap: row[1] ? row[1].x - row[0].x - row[0].width : 12, bh: badge && badge.getBoundingClientRect().height,
      bf: bl && parseFloat(getComputedStyle(bl).fontSize), title };
  });
  await o.browser.close();
  return m;
}

async function vorschau(size) {
  const o = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', studio: 'b' });
  await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"always_hidden"'));
  const { page } = o;
  await studio(page, dash.url);
  await page.evaluate((s) => { const p = window.__panel(); if (p._bClose) p._bClose(); p._room = 1; p._renderTabs(); p._miniSize = s; p._rebuildPreview(); }, size);
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const card = window.__panel().shadowRoot.querySelector('.card.map');
    const t = [...card.querySelectorAll('.mtile')].filter((e) => e.offsetWidth).map((e) => ({ x: e.offsetLeft, w: e.offsetWidth, h: e.offsetHeight })).sort((a, b) => a.x - b.x);
    const b = card.querySelector('.pbadge:not(.ghost):not(.sub)');
    const first = [...card.querySelectorAll('.mtile')].filter((e) => e.offsetWidth)
      .map((e) => e.getBoundingClientRect().left).sort((x, y) => x - y)[0];
    return { soft: card.classList.contains('soft'), W: card.offsetWidth, tw: t[0] && t[0].w, th: t[0] && t[0].h,
      pad: first !== undefined ? first - card.getBoundingClientRect().left : 0,
      scale: card.getBoundingClientRect().width / card.offsetWidth,
      gap: t[1] ? t[1].x - t[0].x - t[0].w : 0, bh: b && b.offsetHeight,
      bf: b && parseFloat(getComputedStyle(b.querySelector('.plabel')).fontSize),
      title: parseFloat(getComputedStyle(card.querySelector('.mini-name')).fontSize) };
  });
  m.pad = m.pad / m.scale;
  await o.browser.close();
  return m;
}

const near = (a, b) => a > 0 && b > 0 && Math.abs(a / b - 1) <= 0.05;
for (const [size, w, h] of [['desktop', 1440, 900], ['tablet', 1024, 711]]) {
  const e = await echt(w, h);
  const v = await vorschau(size);
  await need(size + ': Vorschau im Casora-Look', v.soft, v);
  const info = { echt: e, vorschau: v };
  await check(size + ': Kachelbreite im gleichen Verhältnis', near(v.tw / v.W, e.tw / e.W), info);
  await check(size + ': Kachelhöhe im gleichen Verhältnis', near(v.th / v.W, e.th / e.W), info);
  await check(size + ': Titelschrift im gleichen Verhältnis', near(v.title / v.W, e.title / e.W), info);
  await check(size + ': Badge-Höhe im gleichen Verhältnis', near(v.bh / v.W, e.bh / e.W), info);
  await check(size + ': Badge-Schrift im gleichen Verhältnis', near(v.bf / v.W, e.bf / e.W), info);
  await check(size + ': gleich viele Kacheln je Reihe',
    perRow(v.W, v.pad, v.tw, v.gap) === perRow(e.W, e.pad, e.tw, e.gap),
    { vorschau: perRow(v.W, v.pad, v.tw, v.gap), echt: perRow(e.W, e.pad, e.tw, e.gap), ...info });
}
await finish();
