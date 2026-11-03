// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/02-devices.js#P.inner custom_components/casora/scripts/casora-core.js
// Owner report (01.11.2026, iPhone, 3D printer printing): the dial's centre was overfull. „1:21“ ran over the ring on
// the left, „Std. übrig“ next to it wrapped onto two lines and stuck out on the right, and four more lines
// („Schicht 78/254“, „PLA“, „53 %“, „Fertig gegen 21:02 Uhr“) reached the ring's ends. Expected (phone 393 WebKit,
// German and English, and desktop): value and unit on one line, the unit never wraps, every text line inside the ring's
// inner circle (popup-geo „rad“), nothing cut, at most two small lines under the value, no percent (the arc shows it).
// Also with a long time left („11:54“).
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish, atFinish, shot } from './lib.mjs';
import { MEASURE_GEO } from '../popup-geo.mjs';

const d = await casoraDashboard();
await need('ein Casora-Dashboard', d);

async function run(look, opts, hours) {
  const { page } = await open({ theme: 'Casora', dark: false, ...opts });
  usePage(page);
  await dashboard(page, d.url, 3);
  const svc = (s, data) => page.evaluate(([s, data]) => document.querySelector('home-assistant').hass.callService('casora_mock', s, data), [s, data]);
  atFinish(() => svc('reset', {}).catch(() => {}));
  const id = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).find((x) => x.startsWith('sensor.') && /arbeitsschritt|print_stage|druck/.test(x)) || null; });
  await need(look + ': Drucker-Sensor im Testhaus', id);
  await svc('scenario', { name: 'drucker_druckt' });
  await page.waitForTimeout(2000);
  // The owner's numbers: time left, layer 78/254, 53 %, PLA in the active slot (invented job).
  const c = await page.evaluate((id) => { const ha = document.querySelector('home-assistant');
    const c = window._casoraPrint && window._casoraPrint.auto(ha.hass.states[id], ha.hass);
    if (!c) return null;
    const S = ha.hass.states, slot = (c.slots || []).find((s) => S[s]) || c.ext || null;
    return { remaining: c.remaining, layer: c.layer, layers: c.layers, progress: c.progress, slot, activeSlot: c.activeSlot }; }, id);
  await need(look + ': Drucker erkannt', c && c.remaining, c);
  const patch = { [c.remaining]: { state: String(hours) } };
  if (c.layer) patch[c.layer] = { state: '78' };
  if (c.layers) patch[c.layers] = { state: '254' };
  if (c.progress) patch[c.progress] = { state: '53' };
  if (c.slot) patch[c.slot] = { state: 'PLA', attributes: { active: true, type: 'PLA', color: '#2a9d8f' } };
  await fakeStates(page, patch, { sticky: true });
  await page.evaluate((id) => {
    const ha = document.querySelector('home-assistant');
    return window.loadCardHelpers().then((h) => {
      const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_3d_printer', entity: id });
      el.id = 'qa-r446'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:20px;top:300px;width:200px;height:140px;z-index:99990;';
      ha.shadowRoot.appendChild(el);
    });
  }, id);
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r446')._handleAction({ detail: { action: 'tap' } }, { isIcon: false }));
  await page.waitForTimeout(4000);
  const m = await page.evaluate(() => {
    const dl = window.__pierce('.hui-dl').find((e) => e.getBoundingClientRect().width > 100 && e.querySelector('.hui-dl-c .hui-st-val'));
    if (!dl) return null;
    const c = dl.querySelector('.hui-dl-c'), v = c.querySelector('.hui-st-val'), n = v.querySelector('.hui-st-n'), u = v.querySelector('.hui-st-u');
    const lines = (el) => { if (!el) return 0; const r = document.createRange(); r.selectNodeContents(el);
      return new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 4))).size; };
    const nr = n.getBoundingClientRect(), ur = u ? u.getBoundingClientRect() : null, vr = v.getBoundingClientRect();
    // Small lines under the value: distinct text rows below it.
    const rows = new Set();
    const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.data.trim() || !t.parentElement.checkVisibility() || v.contains(t)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      for (const q of rg.getClientRects()) if (q.width > 1 && q.top >= vr.bottom - 2) rows.add(Math.round(q.top / 4));
    }
    const cut = [...c.querySelectorAll('*')].filter((e) => e.checkVisibility() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)
      && getComputedStyle(e).overflow !== 'visible').map((e) => e.className + ': ' + e.textContent.trim());
    return { value: n.textContent, unit: u ? u.textContent : '', unitLines: lines(u), valueLines: lines(n),
      // The unit stands beside the number or as one line right under it, never next to it on two lines.
      sameLine: !ur || (ur.top < nr.bottom && ur.bottom > nr.top) || (ur.top >= nr.bottom - 2 && ur.top - nr.bottom < 12), under: rows.size, text: c.textContent.replace(/\s+/g, ' ').trim(), cut };
  });
  await need(look + ': Rad im Drucker-Popup', m);
  await shot(look);
  const geo = await page.evaluate(MEASURE_GEO).catch((e) => ({ finds: [], err: String(e) }));
  const rad = (geo.finds || []).filter((f) => f.kind === 'rad');
  await check(`${look}: Wert und Einheit je in einer Zeile („${m.value} ${m.unit}“)`, m.valueLines === 1 && m.unitLines <= 1 && m.sameLine, m);
  await check(`${look}: Mitte im Innenkreis des Rings`, rad.length === 0, rad.map((f) => f.msg));
  await check(`${look}: nichts abgeschnitten`, m.cut.length === 0, m.cut);
  await check(`${look}: höchstens zwei kleine Zeilen unter dem Wert`, m.under <= 2, m.text);
  await check(`${look}: kein Prozent in der Mitte (zeigt der Bogen)`, !/%/.test(m.text), m.text);
  await page.context().browser().close();
}

await run('Handy WebKit', { width: 393, height: 852, mobile: true, safari: true }, 1.35);
await run('Handy WebKit 11:54', { width: 393, height: 852, mobile: true, safari: true }, 11.9);
await run('Handy englisch', { width: 393, height: 852, mobile: true, safari: true, locale: 'en-US' }, 1.35);
await run('Desktop', { width: 1440, height: 900 }, 1.35);
await finish();
