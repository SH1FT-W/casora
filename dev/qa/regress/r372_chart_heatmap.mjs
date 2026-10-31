// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-chart.js custom_components/casora/scripts/casora-chart.js
// Issue 100 (chart card, heatmap) on the made-up "Testserver" (dev/casora_mock/testserver.py):
//   1. Studio "Display: Heatmap": the tile shows the last 7 days as a small grid instead of the sparkline (desktop; the
//      phone pill hides both like before).
//   2. Popup: shape switch "Linie · Balken · Heatmap" with Heatmap active; the chart is a grid of days × 24 hours from
//      the hourly statistics with a scale (lowest … highest) below; 24 Std. = yesterday and today, 7 Tage = 7 rows,
//      Jahr = 12 rows of days; switching to "Linie" and back works.
//   3. Pointing at a cell reads its value and time in the popup head ("… Uhr"); letting go restores it.
//   4. Phone 393 px: the grid fits, the page does not scroll sideways.
//   5. A meter (total_increasing) as a heatmap: consumption per hour (statistics change).
// Nothing is saved: the tiles only exist in the browser. HEATMAP_SHOTS=<dir>: store screenshots.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const ID = 'sensor.testserver_processor_temperature';
const CPU = 'sensor.testserver_processor_use';
const ENERGY = 'sensor.testserver_energy';
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const OUT = process.env.HEATMAP_SHOTS;

const popupInfo = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0)[0];
  const seg = (attr) => window.__pierce('[' + attr + ']', pop.shadowRoot).map((s) => (s.className.includes(' on') ? '*' : '') + s.textContent.trim());
  const svg = ch && ch.shadowRoot && ch.shadowRoot.querySelector('svg');
  const cells = svg ? [...svg.querySelectorAll('rect[rx]')].filter((r) => !/fill:none|url\(/.test(r.getAttribute('style') || '')) : [];
  const ys = new Set(cells.map((r) => r.getAttribute('y')));
  const r = svg && svg.getBoundingClientRect();
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 900), chart: !!ch, span: ch && ch._c ? ch._c.span : null,
    kind: ch && ch._c ? ch._c.kind : null, src: ch && ch._data ? ch._data.src : null, cells: cells.length, rows: ys.size,
    filled: cells.filter((c) => /fill-opacity/.test(c.getAttribute('style') || '')).length,
    svgRight: r ? r.right : 0, vw: window.innerWidth, docW: document.documentElement.scrollWidth,
    segs: seg('data-casora-cspan'), shapes: seg('data-casora-cshape') };
};

const run = async (view, dark) => {
  const tag = (view.mobile ? 'Phone' : 'Desktop') + (dark ? ' dark' : ' light');
  const { page } = await open(Object.assign({ theme: 'Casora', dark }, view));
  await dashboard(page, dash.url, 3);
  await need('Testserver in the test house (mock)', await page.evaluate((ids) => ids.every((id) => !!document.querySelector('home-assistant').hass.states[id]), [ID, CPU, ENERGY]));
  // The mock writes its hourly statistics shortly after HA starts (like r90): wait up to 60 s for a day of hours.
  let statsOk = false;
  for (let i = 0; i < 30 && !statsOk; i++) {
    statsOk = await page.evaluate(async (id) => {
      const r = await document.querySelector('home-assistant').hass.callWS({ type: 'recorder/statistics_during_period',
        start_time: new Date(Date.now() - 2 * 864e5).toISOString(), statistic_ids: [id], period: 'hour', types: ['mean'] });
      return (r[id] || []).length >= 12;
    }, ID).catch(() => false);
    if (!statsOk) await page.waitForTimeout(2000);
  }
  await need('hourly statistics of the test server (mock)', statsOk, ID);
  const makeTile = (cls, entity, name, variables, col) => page.evaluate(async ([cls, entity, name, variables, col]) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity, name, variables });
    el.classList.add(cls);
    el.hass = ha.hass;
    const phone = window.innerWidth < 600;
    el.style.cssText = 'position:fixed;left:' + ((phone ? 16 : 400) + col * (phone ? 190 : 260)) + 'px;top:' + (phone ? 120 : 300) + 'px;width:' + (phone ? 170 : 240) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, [cls, entity, name, variables, col || 0]);
  const shot = (n) => OUT && page.screenshot({ path: OUT + '/' + n + '-' + tag.replace(/ /g, '-') + '.png' });
  const tapTile = async (cls) => {
    const at = await page.evaluate((cls) => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.' + cls).getBoundingClientRect();
      return { x: r.x + r.width * 0.3, y: r.y + r.height * 0.75 }; }, cls);
    // On the phone the tile is ready later than its first paint: tap again until the popup opens (max 3 tries).
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(at.x, at.y);
      const ok = await page.waitForFunction(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 3000 }).then(() => true, () => false);
      if (ok) break;
    }
  };
  const seg = async (attr, value, until) => {
    await page.evaluate(([attr, value]) => { const s = window.__pierce('[' + attr + ']').find((x) => new RegExp('\\|' + value + '$').test(x.getAttribute(attr))); s.click(); }, [attr, value]);
    return stable(page, popupInfo, null, { max: 15000, quiet: 2000, until });
  };
  const close = async () => {
    await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
    await page.waitForTimeout(600);
  };

  await makeTile('qa-r372', ID, 'Prozessor', { chart_kind: 'heat', entity_2: CPU, label_2: 'CPU-Last' });
  const tile = await stable(page, () => {
    const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r372');
    const sr = el && el.shadowRoot;
    const ch = sr && window.__pierce('casora-chart', sr)[0];
    const r = ch && ch.getBoundingClientRect();
    return { kind: ch && ch._c ? ch._c.kind : null, mini: !!(ch && ch._c && ch._c.mini), visible: !!(r && r.width > 20),
      cells: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('svg rect').length : 0 };
  }, null, { max: 10000, quiet: 1000, until: (t) => view.mobile || (t && t.cells > 0) });
  if (view.mobile) await check(tag + ': tile without the small grid (pill, like the sparkline)', tile && !tile.visible, tile);
  else await check(tag + ': tile shows the last 7 days as a small heatmap', tile && tile.kind === 'heat' && tile.mini && tile.cells >= 24, tile);
  await shot('1-tile');

  await tapTile('qa-r372');
  let p = await stable(page, popupInfo, null, { max: 15000, quiet: 2000, until: (x) => x && x.kind === 'heat' && x.cells > 0 });
  await check(tag + ': shape switch Linie · Balken · Heatmap (active)', p && p.shapes.join('|') === 'Linie|Balken|*Heatmap', p && p.shapes);
  await check(tag + ': 24 Std. as a heatmap – yesterday and today, filled cells', p && p.span === '24h' && p.rows === 2 && p.filled >= 12, p && [p.span, p.rows, p.filled]);
  await check(tag + ': scale with lowest and highest value', p && /[\d,]+\s?°C [\d,]+\s?°C/.test(p.txt), p && p.txt);
  await check(tag + ': no sideways scrolling, grid inside the window', p && p.docW <= p.vw && p.svgRight <= p.vw, p && [p.docW, p.vw, p.svgRight]);
  await shot('2-popup-24h');
  p = await seg('data-casora-cspan', '7d', (x) => x && x.span === '7d' && x.kind === 'heat' && x.rows === 7);
  await check(tag + ': 7 Tage – seven rows of hours', p && p.rows === 7 && p.filled >= 100 && p.docW <= p.vw, p && [p.rows, p.filled, p.docW, p.vw]);
  // Point at a cell in the middle of the grid: the head reads value and time.
  const pt = await page.evaluate(() => {
    const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0)[0];
    const cell = [...ch.shadowRoot.querySelectorAll('svg rect[rx]')].filter((r) => /fill-opacity/.test(r.getAttribute('style') || ''))[60];
    cell.scrollIntoView({ block: 'center' });
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.waitForTimeout(400);
  await page.mouse.move(pt.x, pt.y);
  const read = await stable(page, () => {
    const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const w = window.__pierce('[data-casora-read-when]', pop.shadowRoot).map((n) => n.textContent.trim()).join(' ');
    const v = window.__pierce('[data-casora-read]', pop.shadowRoot).map((n) => n.textContent.trim()).join(' ');
    return { w, v };
  }, null, { max: 5000, quiet: 500, until: (x) => x && /Uhr/.test(x.w) });
  await check(tag + ': pointing at a cell reads value and time', read && /Uhr/.test(read.w) && /\d/.test(read.v), read);
  await shot('3-popup-7d-reading');
  await page.mouse.move(2, 2);
  p = await seg('data-casora-cspan', '30d', (x) => x && x.span === '30d' && x.rows >= 28);
  await check(tag + ': 30 Tage – one row per day, still no sideways scrolling', p && p.rows >= 28 && p.docW <= p.vw, p && [p.rows, p.docW, p.vw]);
  await shot('4-popup-30d');
  p = await seg('data-casora-cspan', '1y', (x) => x && x.span === '1y' && x.kind === 'heat' && x.rows >= 2 && x.rows <= 12);
  await check(tag + ': Jahr – months × days', p && p.rows >= 2 && p.rows <= 12 && p.cells > 28, p && [p.rows, p.cells]);
  await shot('5-popup-year');
  p = await seg('data-casora-cshape', 'line', (x) => x && x.kind === 'line');
  await check(tag + ': back to "Linie"', p && p.kind === 'line' && p.shapes.join('|') === '*Linie|Balken|Heatmap', p && p.shapes);
  p = await seg('data-casora-cshape', 'heat', (x) => x && x.kind === 'heat' && x.cells > 0);
  await check(tag + ': and to "Heatmap" again', p && p.kind === 'heat' && p.span === '1y', p && [p.kind, p.span]);
  await close();

  if (!view.mobile && dark) {
    await makeTile('qa-r372e', ENERGY, 'Server-Strom', { chart_kind: 'heat' }, 1);
    await page.waitForTimeout(1500);
    await tapTile('qa-r372e');
    p = await stable(page, popupInfo, null, { max: 15000, quiet: 2000, until: (x) => x && x.kind === 'heat' && x.cells > 0 });
    await check(tag + ': meter heatmap – consumption per hour (change)', p && p.src === 'change' && p.filled >= 12 && /kWh/.test(p.txt), p && [p.src, p.filled]);
    p = await seg('data-casora-cspan', '7d', (x) => x && x.span === '7d' && x.rows === 7);
    await shot('6-meter-7d');
    await close();
  }
  await page.context().close();
};

await run({ width: 1440, height: 1000 }, true);
await run({ width: 1440, height: 1000 }, false);
await run({ width: 393, height: 852, mobile: true }, false);
await run({ width: 393, height: 852, mobile: true }, true);
await finish();
