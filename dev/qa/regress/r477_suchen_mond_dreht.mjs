// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#v3StatusHtml,K.v3Status
// Maintainer report 02.11.2026 (26.11.5, iPhone): in the Software-Updates popup (v3 dial) the moon „Suchen“ stopped
// spinning right after the tap, and „Suche …“ stood under the moon instead. Wanted: the spinning arrow is the only
// signal – it spins while the search runs and stops when it is done; no „Suche …“ text at the moon or under the wheel.
// All in the browser: the search's service and WS calls are held back (released by the test), nothing goes to HA;
// a re-render during the search is forced by handing the page a new hass (as a state change does).
import { open, casoraDashboard, dashboard, shot, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const view = dash.config.views[0];

const RUNS = [
  { tag: 'handy', o: { width: 393, height: 852, mobile: true, safari: true, theme: 'Casora', dark: false } },
  { tag: 'desktop', o: { width: 1440, height: 900, theme: 'Casora', dark: true } },
];
for (const R of RUNS) {
  console.log('  – ' + R.tag);
  const { page, browser } = await open(R.o);
  await dashboard(page, dash.url + '/' + (view.path || '0'));

  const ok0 = await page.evaluate(() => {
    const K = window._casoraUpdCheck;
    if (!K) return false;
    try { localStorage.removeItem('casora.updCheck'); } catch (e) { /* no storage */ }
    K.last = null; K.found = null; K.err = false; K.SETTLE = 0;
    let release;
    window.__qaHold = new Promise((r) => { release = r; });
    window.__qaRelease = () => release();
    const run = K.run;
    K.run = (h) => run(Object.create(h, {
      callWS: { value: async () => { await window.__qaHold; return []; } },
      callService: { value: async () => { await window.__qaHold; return []; } },
    }));
    return true;
  });
  await need(R.tag + ': update search loaded (03-popups.js)', ok0);

  // Open the popup like the bell: an invisible tile with the template, tapped (as r103).
  const hit = await page.evaluate(async () => {
    const ha = document.querySelector('home-assistant');
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: ['casora_updates'] });
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return await new Promise((res) => {
      el.addEventListener('hass-action', (ev) => {
        const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
        if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); res(true); } else res(false);
      }, { capture: true, once: true });
      try { el._handleAction({ detail: { action: 'tap' } }, { isIcon: false }); } catch (e) { res(false); }
      setTimeout(() => res(false), 1500);
    });
  });
  await need(R.tag + ': updates popup open', hit);

  // The moon, whether its glyph runs a rotation, and the texts at the dial (moon and under the wheel).
  const moon = () => page.evaluate(() => {
    const m = window.__pierce('.hui-moon[data-huc]').find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!m) return null;
    const ic = m.querySelector('.ic'), r = m.getBoundingClientRect();
    const run = ic && ic.getAnimations ? ic.getAnimations().filter((a) => a.playState === 'running').length : 0;
    const name = ic ? getComputedStyle(ic).animationName : '';
    const under = window.__pierce('.huc-v3').filter((x) => x.getBoundingClientRect().height > 0).map((x) => x.innerText.trim()).join(' | ');
    const host = m.getRootNode();
    const dial = host.querySelector ? [...host.querySelectorAll('.hui-moon, .huc-v3')].map((x) => x.innerText.trim()).join(' | ') : '';
    return { text: m.innerText.trim(), spin: run > 0 && name !== 'none', anim: name, run, busy: m.getAttribute('aria-busy') === 'true',
      x: r.x + r.width / 2, y: r.y + r.height / 2, under, dial };
  });
  let m0 = null, prev = null;
  for (let i = 0; i < 30; i++) {
    m0 = await moon();
    if (m0 && prev && Math.abs(m0.y - prev.y) < 1) break;
    prev = m0; await page.waitForTimeout(300);
  }
  await need(R.tag + ': moon „Suchen“ at the dial', m0 && /^Suchen$/.test(m0.text), m0);
  await check(R.tag + ': before the search the arrow stands still', !m0.spin && !m0.busy, m0);
  await shot(R.tag + '_1_vorher');

  if (R.o.mobile) await page.touchscreen.tap(m0.x, m0.y); else await page.mouse.click(m0.x, m0.y);
  await page.waitForTimeout(500);
  const m1 = await moon();
  await check(R.tag + ': while searching the arrow spins', m1 && m1.spin && m1.busy, m1);
  await check(R.tag + ': no „Suche …“ at the moon or under the wheel', m1 && !/Suche\b/.test(m1.dial), m1);
  await shot(R.tag + '_2_suche');

  // A state change while searching re-renders the popup: the arrow keeps spinning.
  await page.evaluate(() => {
    const ha = document.querySelector('home-assistant'), h = ha.hass;
    const id = Object.keys(h.states).find((k) => k.startsWith('update.')) || Object.keys(h.states)[0];
    const s = h.states[id];
    ha.hass = Object.assign({}, h, { states: Object.assign({}, h.states, { [id]: Object.assign({}, s, { last_updated: new Date().toISOString(),
      attributes: Object.assign({}, s.attributes, { qa_tick: Date.now() }) }) }) });
  });
  await page.waitForTimeout(1000);
  const m2 = await moon();
  await check(R.tag + ': after a re-render the arrow still spins', m2 && m2.spin && m2.busy, m2);
  await check(R.tag + ': after a re-render still no „Suche …“', m2 && !/Suche\b/.test(m2.dial), m2);
  await shot(R.tag + '_3_neu_gezeichnet');

  await page.evaluate(() => window.__qaRelease());
  await page.waitForFunction(() => window._casoraUpdCheck && !window._casoraUpdCheck.busy, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const m3 = await moon();
  await check(R.tag + ': when done the spin stops', m3 && !m3.spin && !m3.busy, m3);
  await check(R.tag + ': the result stands under the wheel', m3 && /Zuletzt gesucht/.test(m3.under), m3);
  await shot(R.tag + '_4_fertig');
  await browser.close().catch(() => {});
}
await finish();
