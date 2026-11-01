// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/39-update-prompt.js custom_components/casora/updates.py
// Wish (01.11.2026): a calm prompt on the dashboard when a newer Casora version is out. Expected: an admin opens
// the dashboard with a (faked) newer version; the popup is NOT there at first paint, appears a few seconds after
// load ("Casora <version> ist da", v3, release-note lines, Installieren / Später / Diese Version überspringen),
// "Später" closes it and stores the choice in HA's user data, and the next load shows nothing.
// Only the version is faked in the browser: the answer of the real casora/updates/prompt is taken and marked
// newer and installable (as with HACS; Installieren is not tapped). Desktop 1440 and phone 393; screenshots to CASORA_SHOTS (if set).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboard, studioDashboard, studio, ready, check, need, finish, atFinish } from './lib.mjs';

const FAKE = '99.1.1';
const KEY = 'casora_update_prompt';
const SHOTS = process.env.CASORA_SHOTS || '';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const url = '/' + dash.url + '/' + (dash.config.views[0].path || '0');

const fake = (version) => {
  // Wrap the module's info() as soon as it exists: real WS answer, newer version.
  let U;
  Object.defineProperty(window, '_casoraUpdPrompt', {
    configurable: true,
    get() { return U; },
    set(v) {
      U = v;
      setTimeout(() => {
        const real = U.info;
        U.info = (h) => Promise.resolve(real(h)).then((r) => {
          window.__qaUpdReal = r;
          return Object.assign({}, r, { available: true, version, can_install: true, entity_id: r.entity_id || 'update.casora_update',
            lines: ['Farbe im Licht-Popup', 'Der Kreis zeigt das Licht', 'Lichtgruppen als eine Lampe'] });
        });
      }, 0);
    },
  });
};
const popupTitle = () => {
  const c = window.casoraPopup && window.casoraPopup.current;
  return c ? String(c.title || '') : '';
};
const userData = (pg, value) => pg.evaluate(async ([key, value, set]) => {
  const h = document.querySelector('home-assistant').hass;
  if (set) await h.connection.sendMessagePromise({ type: 'frontend/set_user_data', key, value });
  const r = await h.connection.sendMessagePromise({ type: 'frontend/get_user_data', key });
  return r && r.value;
}, [KEY, value === undefined ? null : value, value !== undefined]);

const RUNS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'phone', width: 393, height: 852, mobile: true },
];
for (const R of RUNS) {
  console.log('  – ' + R.tag);
  const { page, context } = await open({ width: R.width, height: R.height, theme: 'Casora', dark: false, ...(R.mobile ? { mobile: true } : {}) });
  await context.addInitScript(fake, FAKE);
  // A clean slate for this user (and again at the end).
  await ready(page, url, '() => !!(document.querySelector("home-assistant") && document.querySelector("home-assistant").hass)', 60000);
  await userData(page, null);
  atFinish(async () => { try { await userData(page, null); } catch (e) { /* closed */ } });

  // First paint: cards there, no prompt yet.
  const t0 = Date.now();
  await ready(page, url, '() => window.__pierce("button-card").length >= 5', 60000);
  const early = await page.evaluate(popupTitle);
  const earlyMs = Date.now() - t0;
  await check(`${R.tag}: no prompt at first paint (${earlyMs} ms)`, early === '' || earlyMs > 3500, early);

  // A few seconds later: the prompt.
  const got = await page.waitForFunction((v) => {
    const c = window.casoraPopup && window.casoraPopup.current;
    return c && String(c.title || '').indexOf(v) >= 0 ? c.title : null;
  }, FAKE, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
  await check(`${R.tag}: prompt appears after load`, got === `Casora ${FAKE} ist da`, got);
  const real = await page.evaluate(() => window.__qaUpdReal || null);
  await check(`${R.tag}: real casora/updates/prompt answered`, !!real && typeof real.available === 'boolean' && Array.isArray(real.lines), real);
  await page.waitForTimeout(900);
  const parts = await page.evaluate(() => ({
    v3: (window.casoraPopup.current || {}).variant,
    btns: window.__pierce('[data-casora-updp]').map((n) => n.getAttribute('data-casora-updp') + ':' + n.textContent.trim()),
    lines: window.__pierce('.cup-lines li').length,
  }));
  await check(`${R.tag}: v3 popup with three choices`, parts.v3 === 'v3' && ['install', 'later', 'skip'].every((w) => parts.btns.some((b) => b.startsWith(w + ':'))), parts);
  await check(`${R.tag}: release-note lines`, parts.lines === 3, parts);
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `update-popup-${R.tag}.png`) });
  }
  const stored0 = await userData(page);
  await check(`${R.tag}: shown version remembered per user`, stored0 && stored0.seen === FAKE, stored0);

  // "Später" with a real tap/click.
  const box = await page.evaluate(() => {
    const n = window.__pierce('[data-casora-updp="later"]')[0];
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await need(`${R.tag}: Später visible`, !!box);
  if (R.mobile) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(1200);
  await check(`${R.tag}: Später closes the popup`, (await page.evaluate(popupTitle)) === '');
  const stored = await userData(page);
  await check(`${R.tag}: Später stored for 24 h`, stored && stored.until > Date.now() + 23 * 3600e3 && !stored.seen, stored);

  // Next load: nothing.
  await ready(page, url, '() => window.__pierce("button-card").length >= 5', 60000);
  await page.waitForTimeout(10000);
  await check(`${R.tag}: not again after Später`, (await page.evaluate(popupTitle)) === '');
  await userData(page, null);
}

// Studio → Updates: "Update-Hinweis beim Öffnen" (default on) switched off → the dashboard stays quiet.
{
  console.log('  – studio toggle');
  const sd = await studioDashboard();
  await need('ein Dashboard fürs Studio', sd);
  const { page, context } = await open({ lang: 'de' });
  await context.addInitScript(fake, FAKE);
  await studio(page, sd);
  await userData(page, null);
  atFinish(async () => { try { await userData(page, null); } catch (e) { /* closed */ } });
  await page.evaluate(() => { const b = window.__pierce('.cu-side')[0]; if (b) b.click(); else window.__panel()._cuOpenPage(); });
  const sw = await page.waitForFunction(() => {
    const box = window.__pierce('.cu-prompt')[0];
    const s = box && box.querySelector('.sw, [role="switch"], button, input');
    return box && s && !s.disabled ? { text: box.textContent.replace(/\s+/g, ' ').trim(), on: s.getAttribute('aria-checked') || String(!!s.checked) } : null;
  }, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
  await check('studio: toggle under Updates, on by default', sw && /Update-Hinweis beim Öffnen/.test(sw.text) && sw.on === 'true', sw);
  await page.evaluate(() => { const box = window.__pierce('.cu-prompt')[0]; box.querySelector('.sw, [role="switch"], button, input').click(); });
  await page.waitForTimeout(1500);
  const st = await userData(page);
  await check('studio: off stored per user', st && st.off === true, st);
  await ready(page, url, '() => window.__pierce("button-card").length >= 5', 60000);
  await page.waitForTimeout(10000);
  await check('toggle off: no prompt on the dashboard', (await page.evaluate(popupTitle)) === '');
  await userData(page, null);
}
await finish();
