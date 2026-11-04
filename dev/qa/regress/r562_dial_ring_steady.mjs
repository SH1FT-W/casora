// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#dArc,dialSvg,dialPaint
// Reported (owner, iPhone, 04.11.2026, light popup v3): "Der Kreis verändert sich bei 65 % minimal, bei 67 % wieder wie
// original" – also with the lamp set to 66 % and no finger on it. The filled arc is one SVG arc from 135° to the value,
// its end points rounded to 0.1. Around 66.7 % that arc spans 180°: the two ends are almost opposite, and SVG derives
// the arc's centre from them – a rounding error of a few hundredths moves that centre by several units, so the
// coloured ring (and its glow) sat a few pixels off the grey track between about 63 and 70 %.
// Expected (light popup, iPhone 393 × scale 3 in Chromium and WebKit, desktop 1440): for every value 0–100 % the
// filled arc lies on the track's circle (±0,5 px), the wheel, its drawing and the track keep their position and size
// (±0,5 px) – drawn by a redraw (lamp report) and by turning (dialPaint).
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);
const L = 'light.qa_dial_steady';
const lamp = (pct) => ({ [L]: { state: 'on', attributes: { friendly_name: 'Steady lamp', brightness: Math.max(1, Math.round(pct * 2.55)),
  supported_color_modes: ['brightness'], color_mode: 'brightness', supported_features: 32 } } });

async function popup(page, mobile) {
  await fakeStates(page, lamp(50), { sticky: true });
  await page.evaluate((L) => window.loadCardHelpers().then((h) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity: L, name: 'Steady lamp' });
    el.classList.add('qa-dial-tile'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:20px;top:120px;width:170px;height:100px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }), L);
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-dial-tile').getBoundingClientRect(); return { x: r.x + r.width - 30, y: r.y + r.height / 2 }; });
  if (mobile) await page.touchscreen.tap(t.x, t.y); else await page.mouse.click(t.x, t.y);
  await page.waitForFunction(() => { const p = window.casoraPopup && window.casoraPopup.element; return p && p.hasAttribute('open') && window.__pierce('.hui-dl', p.shadowRoot).some((e) => e.getBoundingClientRect().width > 0); }, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-dial-tile').forEach((e) => e.remove()));
  await page.waitForTimeout(1200);
}

// The wheel's boxes and how far the filled arc strays from the track's circle (px), at the value shown.
const measure = (page, paintPct) => page.evaluate((paintPct) => {
  const pop = window.casoraPopup && window.casoraPopup.element;
  const dl = pop && window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0);
  if (!dl) return null;
  // Turned: as while dragging (.drag, no transition) – a redraw is measured after its transition (.18 s).
  if (paintPct != null) { dl.classList.add('drag'); window._casoraUI.dialPaint(dl, paintPct); }
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100); };
  const svg = dl.querySelector('svg'), fl = dl.querySelector('.fl.ln'), k = svg.getBoundingClientRect().width / 420;
  let off = 0;
  if (fl && fl.style.display !== 'none' && parseFloat(dl.dataset.pct) > 0) {
    const n = fl.getTotalLength();
    for (let i = 0; i <= 60; i++) { const p = fl.getPointAtLength(n * i / 60); off = Math.max(off, Math.abs(Math.hypot(p.x - 210, p.y - 210) - 150)); }
  }
  dl.classList.remove('drag');
  return { pct: parseFloat(dl.dataset.pct), off: Math.round(off * k * 100) / 100, dl: box(dl), svg: box(svg), tr: box(dl.querySelector('.tr')) };
}, paintPct);
const spread = (list, key) => {
  const all = list.map((m) => m[key]).filter(Boolean);
  return Math.max(0, ...[0, 1, 2, 3].map((i) => Math.max(...all.map((b) => b[i])) - Math.min(...all.map((b) => b[i]))));
};

for (const [tag, opts] of [
  ['iPhone Chromium', { width: 393, height: 852, mobile: true, scale: 3, theme: 'Casora' }],
  ['iPhone WebKit', { width: 393, height: 852, mobile: true, scale: 3, safari: true, theme: 'Casora' }],
  ['desktop', { width: 1440, height: 900, theme: 'Casora' }],
]) {
  const { page } = await open(opts);
  usePage(page);
  await dashboard(page, dash.url, 3);
  await popup(page, !!opts.mobile);
  const first = await measure(page);
  if (!(await check(`${tag}: light popup with a dial`, !!first, first))) continue;
  // Redrawn at a value (the lamp reports it), around the half circle closely.
  const drawn = [];
  for (const p of [1, 10, 30, 50, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 72, 80, 90, 100]) {
    await fakeStates(page, lamp(p), { sticky: true });
    await page.waitForTimeout(250);
    drawn.push(await measure(page));
  }
  // Turned to every value 0–100 % (and the halves around 66 %).
  const turned = [];
  await page.waitForTimeout(300);
  for (let p = 0; p <= 100; p++) turned.push(await measure(page, p));
  for (const p of [65.5, 66.5, 66.6, 66.7, 66.8, 67.5]) turned.push(await measure(page, p));
  const all = drawn.concat(turned).filter(Boolean);
  const worst = all.reduce((a, m) => (m.off > a.off ? m : a), { off: 0 });
  await check(`${tag}: the filled arc lies on the track's circle at every value (±0,5 px)`, worst.off <= 0.5, { worst });
  await check(`${tag}: wheel, drawing and track keep position and size at every value (±0,5 px)`,
    spread(all, 'dl') <= 0.5 && spread(all, 'svg') <= 0.5 && spread(all, 'tr') <= 0.5,
    { dl: spread(all, 'dl'), svg: spread(all, 'svg'), tr: spread(all, 'tr') });
  await check(`${tag}: redraws show the value reported`, drawn.filter(Boolean).length === 18, drawn.map((m) => m && m.pct));
}
await finish();
