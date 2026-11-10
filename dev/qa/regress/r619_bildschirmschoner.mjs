// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/46-screensaver.js#_casoraSaver custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview
// Screensavers for wall tablets (46-screensaver.js) and their Studio page:
//   - the settings start has a tile "Screensaver"; its page shows a preview drawn by the dashboard's own code, a chip
//     for each of the ten screensavers, and the select offers them all;
//   - every chip draws its screensaver (an example where the house has nothing to show), the preview follows the
//     select of the draft, nothing is saved by looking;
//   - on the dashboard ?casora_saver=1 covers the dashboard with the screensaver, a touch brings the dashboard back.
// Pictures: R619_BILD=1.
import { ws } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, dashboard, check, need, finish, atFinish, shot, BASE } from './lib.mjs';

const KINDS = ['himmel', 'land', 'fotos', 'wort', 'wetter', 'linie', 'woche', 'musik', 'energie', 'ruhe'];
const dash = await studioDashboard();
await need('Dashboard fürs Studio', dash);
const c = await ws();
const before = await c.cmd({ type: 'lovelace/config', url_path: dash });
atFinish(async () => { await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: before }); c.close(); });
const pic = async (label) => { if (process.env.R619_BILD) await shot(label); };

const o = await open({ width: 1440, height: 900, dark: false });
const page = o.page;
usePage(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
// The dashboard first: its scripts draw the preview.
await dashboard(page, dash);
await check('Modul auf dem Dashboard geladen', await page.evaluate(() => !!(window._casoraSaver && window._casoraSaver.KINDS.length === 10)));
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);

await P(`p._csShow('n-start')`);
await wait(900);
await check('Kachel „Bildschirmschoner“ auf der Einstellungs-Startseite', await P(`return [...p.shadowRoot.querySelectorAll('#pane *')].some((x) => /^(Bildschirmschoner|Screensaver)$/.test((x.textContent || '').trim()));`));
await pic('start');
await P(`p._csShow('n-saver')`);
await wait(1500);
const state = () => P(`const r = p.shadowRoot, st = r.querySelector('.cs-saver-stage'), sv = st && st.querySelector('.cs-sv');
  const sel = r.querySelector('[data-key="casora_screensaver_kind"] select');
  const b = st ? st.getBoundingClientRect() : null;
  return { stage: !!st, kind: sv ? sv.dataset.kind : '', w: b ? Math.round(b.width) : 0, h: b ? Math.round(b.height) : 0,
    chips: [...r.querySelectorAll('.cs-saver-chip')].map((x) => x.dataset.kind), pressed: (r.querySelector('.cs-saver-chip[aria-pressed="true"]') || {}).dataset?.kind || '',
    options: sel ? [...sel.options].map((x) => x.value) : null, minutes: !!r.querySelector('[data-key="casora_screensaver"]'),
    text: sv ? sv.textContent.replace(/\\s+/g, ' ').slice(0, 160) : '' };`);
let s = await state();
await check('Vorschau gezeichnet', s.stage && KINDS.includes(s.kind) && s.w > 400 && s.h > 250, JSON.stringify(s).slice(0, 300));
await check('ein Chip je Bildschirmschoner', JSON.stringify(s.chips) === JSON.stringify(KINDS), s.chips.join(','));
await check('Startzeit als Einstellung', s.minutes);
await pic('seite');
for (const k of KINDS) {
  await P(`p.shadowRoot.querySelector('.cs-saver-chip[data-kind="' + arg + '"]').click();`, k);
  await wait(k === 'fotos' ? 900 : 350);
  s = await state();
  // Photos without a room photo shows a landscape; everything else draws itself (the preview brings an example).
  await check('Chip ' + k + ' zeichnet ' + k, s.kind === k && s.pressed === k && s.text.length > 3, s.kind + ' · ' + s.text.slice(0, 80));
  await pic('vorschau_' + k);
}
// The select appears once a start time is set; the preview follows it and nothing is saved by looking.
await P(`const el = p.shadowRoot.querySelector('[data-key="casora_screensaver"] select'); el.value = '5'; el.dispatchEvent(new Event('change', { bubbles: true }));`);
await wait(900);
s = await state();
await check('Auswahl bietet „Abwechselnd“ und alle zehn', s.options && JSON.stringify(s.options) === JSON.stringify([''].concat(KINDS)), JSON.stringify(s.options));
await P(`const el = p.shadowRoot.querySelector('[data-key="casora_screensaver_kind"] select'); el.value = 'woche'; el.dispatchEvent(new Event('change', { bubbles: true }));`);
await wait(700);
s = await state();
await check('Vorschau folgt der Auswahl', s.kind === 'woche' && s.pressed === 'woche', s.kind);
await pic('auswahl_woche');
const mid = await c.cmd({ type: 'lovelace/config', url_path: dash });
await check('Ansehen speichert nichts', JSON.stringify(mid) === JSON.stringify(before));
await P('if (p._csDirty() || p._isDirty()) await p._csDiscardAll();').catch(() => {});

// On the dashboard: forced by the address, a touch ends it.
await page.goto(BASE + '/' + dash + '?casora_saver=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('.cs-sv-layer .cs-sv'), null, { timeout: 60000 }).catch(() => {});
const on = await page.evaluate(() => { const l = document.querySelector('.cs-sv-layer'); const b = l ? l.getBoundingClientRect() : null;
  return { layer: !!l, full: !!b && b.width >= innerWidth - 2 && b.height >= innerHeight - 2, kind: (l && l.querySelector('.cs-sv') || {}).dataset?.kind || '' }; });
await check('Dashboard: Bildschirmschoner liegt über allem', on.layer && on.full && KINDS.includes(on.kind), JSON.stringify(on));
await pic('dashboard');
await page.mouse.click(400, 300);
await wait(900);
await check('eine Berührung holt das Dashboard zurück', await page.evaluate(() => !document.querySelector('.cs-sv-layer')));
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
