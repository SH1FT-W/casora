// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-basis.js#_fillStep,_fillPreview custom_components/casora/panel/casora-panel.js#_flowScreen,_createForm
// "Create dashboard…" from the Studio (Prüfrunde u01-08): step 1 opened as a sheet with X, step 2 ("Fill your rooms")
// switched to the full page, and after "Back" step 1 stayed a full page without X; Escape did nothing. Now all
// three steps stay a sheet over the Studio, Back returns to the same sheet, Escape closes it. Nothing is saved.
import { open, studio, studioDashboard, check, need, shot, finish } from './lib.mjs';

const { page } = await open({ width: 1440, height: 1000 });
await studio(page, process.env.CASORA_QA_DASH || await studioDashboard());
const H = (fn, arg) => page.evaluate(fn, arg);
await H(() => {
  const p = window.__panel();
  p._create = async () => { window.__qaCreated = true; };
  const c = document.querySelector('home-assistant').hass.connection;
  const o = c.sendMessagePromise.bind(c);
  c.sendMessagePromise = (m) => (/(save|create|update|delete|\/set$|call_service|execute_script)/.test(m && m.type)
    ? Promise.reject(new Error('qa: blocked ' + m.type)) : o(m));
});
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const mode = () => H(() => window.__panel()._flowMode);
const closeBtn = () => H(() => window.__pierce('.fnav').some((b) => b.offsetParent && /Close|Schließen/.test(b.getAttribute('aria-label') || '')));
const primary = (re) => H((src) => {
  const foot = window.__pierce('.flowfoot').filter((f) => f.offsetParent).pop();
  const b = foot && [...foot.querySelectorAll('button')].filter((x) => x.offsetParent && !x.classList.contains('ghost') && !x.disabled)
    .filter((x) => new RegExp(src, 'i').test(x.textContent.trim())).pop();
  if (b) b.click();
  return !!b;
}, re.source);

await H(() => window.__panel()._createForm());
await need('step 1: rooms', await until(() => window.__pierce('.rp-room').length > 0));
await check('step 1 is a sheet', (await mode()) === 'sheet', await mode());
await need('to step 2', await primary(/^(Weiter|Continue)$/));
await need('step 2: fill rooms', await until(() => window.__pierce('.themecard[data-k=auto]').some((e) => e.offsetParent)));
await check('step 2 stays a sheet (no full page)', (await mode()) === 'sheet', await mode());
await shot('u01-08 step 2 sheet');
// Back: the same sheet with X again.
await H(() => { const b = window.__pierce('.fnav').find((x) => x.offsetParent && /Back|Zurück/.test(x.getAttribute('aria-label') || '')); b && b.click(); });
await need('back on step 1', await until(() => window.__pierce('.rp-room').some((e) => e.offsetParent)));
await check('step 1 after Back: still a sheet', (await mode()) === 'sheet', await mode());
await check('step 1 after Back: close button there', await closeBtn());
// Step 3 in the sheet: the preview lays out (rooms side by side, not cut).
await need('to step 2 again', await primary(/^(Weiter|Continue)$/));
await until(() => window.__pierce('.themecard[data-k=auto]').some((e) => e.offsetParent));
await H(() => window.__pierce('.themecard[data-k=auto]')[0].click());
await until(() => { const f = window.__pierce('.flowfoot').filter((x) => x.offsetParent).pop();
  return !!f && [...f.querySelectorAll('button')].some((b) => /^(Weiter|Continue)$/.test(b.textContent.trim()) && !b.disabled); }, null, 20000);
await need('to the preview', await primary(/^(Weiter|Continue)$/));
await need('step 3: preview', await until(() => window.__pierce('.bs-room').some((e) => e.offsetParent)));
await check('step 3 is a sheet', (await mode()) === 'sheet', await mode());
const fit = await H(() => { const g = window.__pierce('.bs-grid').find((x) => x.offsetParent); return g ? { w: g.clientWidth, sw: g.scrollWidth } : null; });
await check('preview fits the sheet (no sideways overflow)', !!fit && fit.sw <= fit.w + 1, fit);
await shot('u01-08 step 3 sheet');
// Escape closes the sheet.
await page.keyboard.press('Escape');
await check('Escape closes the sheet', await until(() => !window.__panel()._flowMode, null, 5000));
await finish();
