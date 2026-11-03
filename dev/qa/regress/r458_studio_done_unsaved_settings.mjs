// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-settings.js
// A global setting (saved with "Save settings", e.g. a waste switch) changed in the Studio and left unsaved was
// silently lost when "Done" closed the Studio. Expected: "Done" first asks "Save settings?" with Save / Discard /
// Back. Back stays in the Studio with the change still unsaved; Save writes it to HA, then leaves; Discard leaves
// without writing it. Leaving through the HA sidebar asks the same. The settings are written back at the end.
import { open, usePage, studio, studioDashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await studioDashboard();
await need('Casora dashboard for the Studio', dash);
const readSettings = async () => { const c = await ws(); try { return (await c.cmd({ type: 'casora/settings/get' })).settings || {}; } finally { c.close(); } };
const settings0 = await readSettings();
atFinish(async () => { const c = await ws(); await c.cmd({ type: 'casora/settings/set', settings: settings0 }); c.close(); });

const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);
const question = () => page.waitForFunction(() => { const p = window.__panel && window.__panel(); const c = p && p.shadowRoot.querySelector('.askcard'); return c && c.isConnected; }, null, { timeout: 8000 })
  .then(() => P(`const c = p.shadowRoot.querySelector('.askcard');
    return { title: c.querySelector('h3').textContent, buttons: [...c.querySelectorAll('.askacts button')].map((b) => b.textContent) };`))
  .catch(() => null);
const press = (re) => P(`const c = p.shadowRoot.querySelector('.askcard');
  const b = c && [...c.querySelectorAll('.askacts button')].find((x) => new RegExp(arg).test(x.textContent)); if (b) b.click(); return !!b;`, re);

// Opens the Studio, toggles the first switch on Settings > Home & devices > Waste; returns the waste section after it.
const changeWaste = async () => {
  await studio(page, dash);
  await P('await p._csShow("n-house", "nb-waste");');
  await wait(1500);
  const r = await P(`const sw = [...p.shadowRoot.querySelectorAll('.inspector [role=switch]')].find((x) => x.getClientRects().length);
    if (!sw) return null; sw.click(); await new Promise((r) => setTimeout(r, 300));
    return { dirty: p._csDirty(), waste: JSON.stringify((p._cs.S || {}).waste || {}) };`);
  return r;
};
const leftStudio = () => page.waitForFunction(() => !/casora/.test(location.pathname.split('/')[1] || '') || !window.__panel || !window.__panel(), null, { timeout: 15000 })
  .then(() => true).catch(() => false);

// 1) Back: stays, still unsaved.
let ch = await changeWaste();
await need('a waste switch that makes the settings unsaved', ch && ch.dirty, ch);
await P('p.$("donebtn").click();');
let q = await question();
await check('Done with unsaved settings asks', !!q, q);
await check('question "Save settings?" with Save, Discard, Back',
  q && /Einstellungen speichern\?|Save settings\?/.test(q.title) && ['Speichern|Save', 'Verwerfen|Discard', 'Zurück|Back'].every((re) => q.buttons.some((t) => new RegExp('^(' + re + ')$').test(t))), q);
await press('^(Zurück|Back)$');
await wait(1500);
await check('Back: still in the Studio, settings still unsaved', await P('return !!p.isConnected && p._csDirty();'));
await check('Back: nothing written to HA', JSON.stringify((await readSettings()).waste || {}) === JSON.stringify(settings0.waste || {}));

// 2) Save: written to HA, then the Studio closes.
await P('p.$("donebtn").click();');
q = await question();
await check('Done asks again', !!q, q);
await press('^(Speichern|Save)$');
await check('Save: the Studio closes', await leftStudio());
const savedWaste = JSON.stringify((await readSettings()).waste || {});
await check('Save: the change is in HA', savedWaste === ch.waste && savedWaste !== JSON.stringify(settings0.waste || {}), { savedWaste, want: ch.waste });

// 3) Discard: the Studio closes, HA keeps what it had.
const before = JSON.stringify((await readSettings()).waste || {});
ch = await changeWaste();
await need('settings unsaved again', ch && ch.dirty, ch);
await P('p.$("donebtn").click();');
q = await question();
await check('Done asks (discard round)', !!q, q);
await press('^(Verwerfen|Discard)$');
await check('Discard: the Studio closes', await leftStudio());
await check('Discard: HA unchanged', JSON.stringify((await readSettings()).waste || {}) === before);

// 4) Leaving through the HA sidebar asks too; Back stays.
ch = await changeWaste();
await need('settings unsaved for the sidebar round', ch && ch.dirty, ch);
const clicked = await page.evaluate(() => {
  const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.localName === 'ha-sidebar') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
  const sb = find(document);
  const all = (root, out) => { root.querySelectorAll('a[href]').forEach((a) => out.push(a)); root.querySelectorAll('*').forEach((e) => e.shadowRoot && all(e.shadowRoot, out)); return out; };
  const a = sb && all(sb.shadowRoot || sb, []).find((x) => /^\/(config|history|logbook|profile|developer-tools)/.test(x.getAttribute('href')));
  if (!a) return null; a.click(); return a.getAttribute('href');
});
await need('a sidebar link', clicked);
q = await question();
await check('sidebar: leaving with unsaved settings asks', !!q && /Einstellungen speichern\?|Save settings\?/.test(q.title), q);
if (q) await press('^(Zurück|Back)$');
await wait(1000);
await check('sidebar Back: still in the Studio, settings unsaved', await P('return !!p.isConnected && p._csDirty();'));
await finish();
