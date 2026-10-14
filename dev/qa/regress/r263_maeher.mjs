// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/16-maeher.js
// Community-Karte Mähroboter (1.5) am erfundenen Gardena-artigen „Testmäher“ (dev/casora_mock/maeher.py):
//   1. Kachel: Zustand „Parkt bis zum nächsten Zeitplan“, ruhig; Popup mit Akku, Tasten Zur Station (aus) ·
//      Mähen · Parken, Status Akku/Verbindung/Betriebsstunden.
//   2. „Mähen“ im Popup → echter Dienst lawn_mower.start_mowing → Kachel „Mäht · 100 %“, hinterlegt.
//   3. Fehler (nur im Browser): Kachel „Steckt fest“, Popup zeigt den Fehler oben im Status.
// Am Ende schickt der Test den Mäher wieder in die Station (Zustand docked).
// MAEHER_BILDER=<ordner>: Bilder Desktop/Handy, hell/dunkel ablegen.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable, fakeStates, call } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'lawn_mower.testmaeher_lawn_mower';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const OUT = process.env.MAEHER_BILDER;

const run = async (view, dark, first) => {
  const { page } = await open(Object.assign({ theme: 'Casora', dark }, view));
  await dashboard(page, dash.url, 3);
  await need('Testmäher im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
  // Kachel im Browser erzeugen (nicht gespeichert) und hass weiterreichen, solange sie lebt.
  await page.evaluate(async (id) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_lawn_mower', entity: id, name: 'Mähroboter' });
    el.classList.add('qa-r263');
    el.hass = ha.hass;
    const phone = window.innerWidth < 600;
    el.style.cssText = 'position:fixed;left:' + (phone ? 16 : 400) + 'px;top:' + (phone ? 120 : 300) + 'px;width:' + (phone ? 170 : 220) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:5;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, ID);
  const tile = () => stable(page, () => {
    const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r263');
    const c = el && el.shadowRoot && el.shadowRoot.querySelector('ha-card');
    if (!c) return null;
    const st = el.shadowRoot.querySelector('#state');
    return { state: st ? st.textContent.trim() : '', active: getComputedStyle(c).getPropertyValue('--casora-active-overlay-opacity').trim() === '1' };
  }, null, { max: 8000, quiet: 800 });
  const openPop = async () => {
    const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r263').getBoundingClientRect();
      return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
    await page.mouse.click(at.x, at.y);
    return stable(page, () => {
      const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
      if (!pop) return null;
      // Sichtbarer Text durch alle Shadow-DOMs, ohne Stylesheets.
      const parts = [];
      const walk = (n) => n.childNodes.forEach((c) => {
        if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
        if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
        if (c.shadowRoot) walk(c.shadowRoot);
        walk(c);
      });
      walk(pop.shadowRoot);
      const txt = parts.join(' ').replace(/\s+/g, ' ');
      const btns = window.__pierce('.hm-b, .hh-pill', pop.shadowRoot).map((b) => ({ on: !b.classList.contains('dis'), svc: b.getAttribute('data-casora-svc') || '' }));
      return { txt: txt.slice(0, 900), btns };
    }, null, { max: 10000, quiet: 1000 });
  };
  const close = async () => {
    await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
    await page.waitForTimeout(600);
  };
  const tag = (view.mobile ? 'Handy' : 'Desktop') + (dark ? ' dunkel' : ' hell');
  const shot = (n) => OUT && page.screenshot({ path: OUT + '/' + n + '-' + tag.replace(' ', '-') + '.png' });

  let t = await tile();
  await check(tag + ': Kachel „Parkt bis zum nächsten Zeitplan“, ruhig', t && /Parkt bis zum nächsten Zeitplan/.test(t.state) && !t.active, t);
  await shot('1-kachel');
  let p = await openPop();
  await check(tag + ': Popup mit Akku und Status', p && /Akku 100/.test(p.txt) && /Verbindung/.test(p.txt) && /Betriebsstunden/.test(p.txt), p && p.txt);
  await check(tag + ': Tasten Zur Station (aus) · Mähen · Parken', p && p.btns.length === 3 && !p.btns[0].on && p.btns[1].on
    && /start_mowing/.test(p.btns[1].svc) && p.btns[2].on && /park_until_further_notice/.test(p.btns[2].svc), p && p.btns);
  // Verlauf (7 Tage) aus HAs Verlauf: der Testmäher hat Fahrten der letzten Tage (dev/casora_mock/maeher.py).
  const hv = await stable(page, () => {
    const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const parts = [];
    const walk = (n) => n.childNodes.forEach((c) => {
      if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
      if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
      if (c.shadowRoot) walk(c.shadowRoot);
      walk(c);
    });
    if (pop) walk(pop.shadowRoot);
    const t = parts.join(' ').replace(/\s+/g, ' ');
    return { gemaeht: (t.match(/Gemäht/g) || []).length, fahrten: /\d+ Fahrten/.test(t), fehler: /Fehler/.test(t), ganz: /Ganzer Verlauf/.test(t) };
  }, null, { max: 10000, quiet: 1500 });
  await check(tag + ': Verlauf mit Mähfahrten, Summe, Fehler und „Ganzer Verlauf“', hv && hv.gemaeht >= 3 && hv.fahrten && hv.fehler && hv.ganz, hv);
  await shot('2-popup');
  if (first) {
    // Echter Dienst über die Taste im Popup.
    await page.evaluate(() => {
      const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
      window.__pierce('.hm-b.lg, .hh-pill.pri', pop.shadowRoot)[0].click();
    });
    await page.waitForTimeout(1500);
    const st = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, ID);
    await check(tag + ': „Mähen“ startet den Mäher (lawn_mower.start_mowing)', st === 'mowing', st);
    await close();
    t = await tile();
    await check(tag + ': Kachel „Mäht · 100 %“, hinterlegt', t && /Mäht · 100/.test(t.state) && t.active, t);
    await shot('3-maeht');
    const tok = await tokens();
    await call(tok.access_token, 'lawn_mower', 'dock', { entity_id: ID });
    await page.waitForTimeout(800);
  } else await close();
  // Fehler nur im Browser.
  await fakeStates(page, { [ID]: { state: 'error', attributes: { state: 'ERROR', last_error_code: 'TRAPPED', activity: 'NONE' } } }, { sticky: true });
  t = await tile();
  await check(tag + ': Fehler auf der Kachel „Steckt fest“', t && /Steckt fest/.test(t.state), t);
  p = await openPop();
  await check(tag + ': Fehler im Popup', p && /Steckt fest/.test(p.txt), p && p.txt);
  await shot('4-fehler');
  await close();
  await page.context().close();
};

atFinish(async () => {
  const tok = await tokens();
  await call(tok.access_token, 'lawn_mower', 'dock', { entity_id: ID }).catch(() => {});
});
await run({ width: 1440, height: 1000 }, true, true);
await run({ width: 1440, height: 1000 }, false, false);
await run({ width: 393, height: 852, mobile: true }, true, false);
await finish();
