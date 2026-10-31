// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-chart.js custom_components/casora/scripts/casora-chart.js
// Issue #58 (chart card, casora_chart / casora_popup_chart) on the made-up "Testserver" (dev/casora_mock/testserver.py):
//   1. Phone with touch (Chromium and WebKit): tapping a series button of the chart (three sensors, different units →
//      casora-chart's own switch), a range segment (24 Std. / 7 Tage / 30 Tage / Jahr) and the Linie/Balken switch
//      changes the chart. Before, nothing happened on a phone; with a mouse it worked.
//   2. Desktop and phone: tapping a sensor under "Linien" opens its page in the popup; "Zurück" (top left) returns to
//      the chart popup – with the chart drawn again (before, the chart area stayed empty) and the series picked before
//      still selected (also across a range switch).
//   3. Long series names sit inside their buttons, cut with "…" at the end (before: cut at both sides on a phone).
// Nothing is saved: the tile only exists in the browser. CHART58_SHOTS=<dir>: store screenshots.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const ID = 'sensor.testserver_processor_use';
const RAM = 'sensor.testserver_memory_use_percent';
const TEMP = 'sensor.testserver_processor_temperature';
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const OUT = process.env.CHART58_SHOTS;

// State of the open popup: drawn chart (span, kind, selected series, paths), segments, whether "Zurück" shows.
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
  const sw = ch && ch.shadowRoot ? [...ch.shadowRoot.querySelectorAll('.sw button')].map((b) => (b.getAttribute('aria-selected') === 'true' ? '*' : '') + b.textContent.trim()) : [];
  // Name inside each series button: never cut at its start (long names end in "…").
  const inside = ch && ch.shadowRoot ? [...ch.shadowRoot.querySelectorAll('.sw button')].every((btn) => {
    const t = btn.querySelector('b'), r = btn.getBoundingClientRect(), q = t && t.getBoundingClientRect();
    return q && q.left >= r.left && q.right <= r.right && (t.scrollWidth <= t.clientWidth || getComputedStyle(t).textOverflow === 'ellipsis');
  }) : false;
  const back = pop.shadowRoot.querySelector('.header-back');
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 900), chart: !!ch, span: ch && ch._c ? ch._c.span : null,
    kind: ch && ch._c ? ch._c.kind : null, sel: ch ? ch._sel : null, sw, inside,
    paths: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('svg path').length : 0,
    slots: window.__pierce('.hp-chart-slot', pop.shadowRoot).length,
    segs: seg('data-casora-cspan'), shapes: seg('data-casora-cshape'), back: !!(back && !back.hidden) };
};

const run = async (view) => {
  const tag = (view.mobile ? 'Phone' : 'Desktop') + (view.safari ? ' WebKit' : '');
  const { page } = await open(Object.assign({ theme: 'Casora', dark: false }, view));
  await dashboard(page, dash.url, 3);
  await need('Testserver in the test house (mock)', await page.evaluate((ids) => ids.every((id) => !!document.querySelector('home-assistant').hass.states[id]), [ID, RAM, TEMP]));
  await page.evaluate(async ([entity, ram, temp]) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity, name: 'CPU-Last',
      variables: { entity_2: ram, label_2: 'RAM', entity_3: temp, label_3: 'Temperatur' } });
    el.classList.add('qa-r335');
    el.hass = ha.hass;
    const phone = window.innerWidth < 600;
    el.style.cssText = 'position:fixed;left:' + (phone ? 16 : 400) + 'px;top:' + (phone ? 120 : 300) + 'px;width:' + (phone ? 170 : 220) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, [ID, RAM, TEMP]);
  await page.waitForTimeout(1500);
  const shot = (n) => OUT && page.screenshot({ path: OUT + '/' + n + '-' + tag.replace(/ /g, '-') + '.png' });
  // A real tap (touchscreen on the phone, mouse on the desktop) on the centre of an element found by fn.
  const tapAt = async (fn, arg) => {
    const at = await page.evaluate(([src, arg]) => {
      const el = new Function('arg', 'return (' + src + ')(arg)')(arg);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [fn.toString(), arg]);
    if (!at) return false;
    await page.waitForTimeout(400);
    // scrollIntoView may have moved it: measure again.
    const at2 = await page.evaluate(([src, arg]) => {
      const el = new Function('arg', 'return (' + src + ')(arg)')(arg);
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [fn.toString(), arg]);
    if (view.mobile) await page.touchscreen.tap(at2.x, at2.y); else await page.mouse.click(at2.x, at2.y);
    return true;
  };
  const info = (until, max = 15000) => stable(page, popupInfo, null, { max, quiet: 1500, until });
  const openPop = () => page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r335').getBoundingClientRect())
    .then((r) => (view.mobile ? page.touchscreen.tap(r.x + r.width * 0.7, r.y + r.height * 0.75) : page.mouse.click(r.x + r.width * 0.7, r.y + r.height * 0.75)))
    .then(() => info((p) => p && p.paths > 0 && /Durchschnitt/.test(p.txt)));
  const segEl = (a) => window.__pierce('[' + a[0] + ']').find((x) => new RegExp('\\|' + a[1] + '$').test(x.getAttribute(a[0])));
  const swEl = (i) => { const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0)[0];
    return ch && ch.shadowRoot.querySelectorAll('.sw button')[i]; };

  let p = await openPop();
  await check(tag + ': popup with chart, three series buttons (the first active), 24 Std. active',
    p && p.chart && p.sw.length === 3 && /^\*/.test(p.sw[0]) && p.sw[2] === 'Temperatur' && p.segs[0] === '*24 Std.', p && [p.sw, p.segs, p.paths]);
  await check(tag + ': series names sit inside their buttons (cut with "…" at the end, not at the start)', p && p.inside, p && p.sw);
  await shot('1-popup');
  // 1. Series button "Temperatur".
  await tapAt(swEl, 2);
  p = await info((x) => x && x.sel === 2);
  await check(tag + ': tap on series button "Temperatur" selects it', p && p.sel === 2 && /^\*Temperatur/.test(p.sw[2] || '') && p.paths > 0, p && [p.sel, p.sw]);
  await shot('2-series-temperature');
  // 2. Range "7 Tage".
  await tapAt(segEl, ['data-casora-cspan', '7d']);
  p = await info((x) => x && x.span === '7d' && /Letzte 7 Tage/.test(x.txt));
  await check(tag + ': tap on "7 Tage" switches the chart and the statistics', p && p.span === '7d' && p.segs[1] === '*7 Tage' && /Letzte 7 Tage/.test(p.txt), p && [p.span, p.segs]);
  await check(tag + ': the picked series "Temperatur" stays after the range switch', p && p.sel === 2, p && [p.sel, p.sw]);
  await shot('3-range-7d');
  // 3. Shape "Balken".
  await tapAt(segEl, ['data-casora-cshape', 'bar']);
  p = await info((x) => x && x.kind === 'bar');
  await check(tag + ': tap on "Balken" draws bars', p && p.kind === 'bar' && p.shapes.join('|') === 'Linie|*Balken|Heatmap' && p.paths > 0, p && [p.kind, p.shapes]);
  await shot('4-bars');
  await tapAt(segEl, ['data-casora-cshape', 'line']);
  p = await info((x) => x && x.kind === 'line');
  await check(tag + ': tap on "Linie" draws the line again', p && p.kind === 'line' && p.shapes[0] === '*Linie', p && [p.kind, p.shapes]);
  // 4. A sensor under "Linien" opens its page; "Zurück" returns with the chart drawn.
  const rowEl = (eid) => { const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    return window.__pierce('[data-casora-mi]', pop.shadowRoot).find((r) => r.getAttribute('data-casora-mi') === eid && r.getBoundingClientRect().width > 0); };
  const tapped = await tapAt(rowEl, RAM);
  await need(tag + ': sensor row "RAM" under "Linien"', tapped);
  p = await info((x) => x && x.back && !/Durchschnitt.*Linien/.test(x.txt), 8000);
  await check(tag + ': the RAM row opens a page with "Zurück"', p && p.back, p && [p.back, p.txt.slice(0, 200)]);
  await shot('5-subview');
  await tapAt(() => window.__pierce('casora-popup').find((p) => p.hasAttribute('open')).shadowRoot.querySelector('.header-back'));
  p = await info((x) => x && x.chart && x.paths > 0 && /Linien/.test(x.txt));
  await check(tag + ': after "Zurück" the chart is drawn again', p && p.chart && p.paths > 0 && /Linien/.test(p.txt), p && [p.chart, p.paths, p.slots, p.txt.slice(0, 200)]);
  await check(tag + ': after "Zurück" the picked series "Temperatur" is still selected', p && p.sel === 2 && /^\*Temperatur/.test(p.sw[2] || ''), p && [p.sel, p.sw]);
  await shot('6-after-back');
  // Still tappable after coming back.
  await tapAt(segEl, ['data-casora-cspan', '30d']);
  p = await info((x) => x && x.span === '30d');
  await check(tag + ': after "Zurück" a range tap still switches the chart', p && p.span === '30d' && p.paths > 0, p && [p.span, p.paths]);
  await page.context().close();
};

await run({ width: 1440, height: 1000 });
await run({ width: 393, height: 852, mobile: true });
await run({ width: 393, height: 852, mobile: true, safari: true });
await finish();
