// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/46-screensaver.js#_casoraSaver custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview
// Screensavers for wall tablets (46-screensaver.js) and their Studio page:
//   - the settings start has a tile "Screensaver"; its page shows a preview drawn by the dashboard's own code, a chip
//     for each of the ten screensavers, and the select offers them all;
//   - every chip draws its screensaver (an example where the house has nothing to show), the preview follows the
//     select of the draft, nothing is saved by looking;
//   - on the dashboard it starts after the time set (here one minute; ?casora_saver=1 lets a desktop browser count as a
//     tablet) and a touch brings the dashboard back.
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
  const b = st ? st.getBoundingClientRect() : null;
  return { stage: !!st, kind: sv ? sv.dataset.kind : '', w: b ? Math.round(b.width) : 0, h: b ? Math.round(b.height) : 0,
    chips: [...r.querySelectorAll('.cs-saver-chip')].map((x) => x.dataset.kind), pressed: (r.querySelector('.cs-saver-chip[aria-pressed="true"]') || {}).dataset?.kind || '',
    minutes: !!r.querySelector('[data-key="casora_screensaver"] .combo'), kindRow: !!r.querySelector('[data-key="casora_screensaver_kind"] .combo'),
    text: sv ? sv.textContent.replace(/\\s+/g, ' ').slice(0, 160) : '' };`);
let s = await state();
await check('Vorschau gezeichnet', s.stage && KINDS.includes(s.kind) && s.w > 400 && s.h > 250, JSON.stringify(s).slice(0, 300));
await check('ein Chip je Bildschirmschoner, vorn „Nacheinander“ (gewählt, solange nichts gewählt ist)', JSON.stringify(s.chips) === JSON.stringify(['mix', ...KINDS]) && s.pressed === 'mix', s.chips.join(',') + ' · ' + s.pressed);
await check('Startzeit als Einstellung', s.minutes);
await pic('seite');
for (const k of KINDS) {
  await P(`p.shadowRoot.querySelector('.cs-saver-chip[data-kind="' + arg + '"]').click();`, k);
  await wait(k === 'fotos' ? 900 : 350);
  s = await state();
  // Photos without a room photo shows a landscape; everything else draws itself (the preview brings an example).
  // The chip chooses (owner 11.11.2026: it only changed the picture, which looked like a choice): the draft has it.
  const dk = await P(`return [...new Set(p._state.compact.rooms.map((r) => r.variables.casora_screensaver_kind || ''))];`);
  await check('Chip ' + k + ' zeichnet ' + k + ' und wählt ihn im Entwurf', s.kind === k && s.pressed === k && s.text.length > 3 && dk.length === 1 && dk[0] === k, s.kind + ' · ' + JSON.stringify(dk) + ' · ' + s.text.slice(0, 60));
  await pic('vorschau_' + k);
}
// Photos (owner 11.11.2026): the preview drew a landscape although the rooms have photos (the Studio does not run the
// dashboard's casoraPhotoUrl); it takes the Studio's own photo list now. Under the preview the room photos to pick
// from: none picked shows all, a tap shows only the picked ones (casora_screensaver_photos on every room, a draft).
await P(`p.shadowRoot.querySelector('.cs-saver-chip[data-kind="fotos"]').click();`);
await wait(2000);
const fotos = () => P(`const r = p.shadowRoot, st = r.querySelector('.cs-saver-stage'), f = st && st.querySelector('.cs-photo');
  return { kind: ((st && st.querySelector('.cs-sv')) || {}).dataset?.kind || '', bg: f ? f.style.backgroundImage : '',
    tiles: [...r.querySelectorAll('.cs-saver-photo')].map((b) => ({ ref: b.dataset.ref, on: b.getAttribute('aria-pressed') === 'true', bg: b.style.backgroundImage })),
    vars: [...new Set(p._state.compact.rooms.map((x) => JSON.stringify(x.variables.casora_screensaver_photos ?? null)))] };`);
let f = await fotos();
const nm = await P(`const st = p.shadowRoot.querySelector('.cs-saver-stage .cs-name'); return { shown: st ? st.textContent.trim() : '', rooms: p._state.compact.rooms.map((r) => p._roomShown(r)) };`);
await check('Raumname wie im Dashboard, nicht der Pfad', nm.shown && nm.rooms.includes(nm.shown), JSON.stringify(nm).slice(0, 200));
await check('Fotos zeigt ein Raumfoto, keine Landschaft', f.kind === 'fotos' && /url\(".+"\)/.test(f.bg), JSON.stringify(f).slice(0, 300));
await check('Raumfotos zur Auswahl, ohne Auswahl alle an', f.tiles.length >= 2 && f.tiles.every((x) => x.on && /url\(".+"\)/.test(x.bg)), JSON.stringify(f.tiles).slice(0, 300));
await pic('fotos_alle');
const one = f.tiles[1];
await P(`p.shadowRoot.querySelector('.cs-saver-photo[data-ref="' + arg + '"]').click();`, one.ref);
await wait(900);
f = await fotos();
await check('ein Foto gewählt: nur dieses, in jedem Raum', f.tiles.filter((x) => x.on).map((x) => x.ref).join() === one.ref
  && f.vars.length === 1 && f.vars[0] === JSON.stringify([one.ref]), JSON.stringify({ on: f.tiles.filter((x) => x.on).map((x) => x.ref), vars: f.vars }));
await check('Vorschau zeigt das gewählte Foto', f.bg === one.bg, f.bg.slice(0, 120) + ' ≠ ' + one.bg.slice(0, 120));
await pic('fotos_eines');
await P(`p.shadowRoot.querySelector('.cs-saver-photo[data-ref="' + arg + '"]').click();`, one.ref);
await wait(700);
f = await fotos();
await check('letztes abgewählt: wieder alle', f.tiles.every((x) => x.on) && f.vars.length === 1 && f.vars[0] === 'null', JSON.stringify(f.vars));
// The note for a missing dashboard came under every setting of an open dashboard since the preview was added.
await check('kein „Öffne ein Dashboard“ bei offenem Dashboard', !(await P(`return [...p.shadowRoot.querySelectorAll('.cs-lede')].some((x) => /Open a dashboard in the Studio|Öffne im Studio ein Dashboard/.test(x.textContent));`)));
// The draft (the working copy of the dashboard) picks a kind: the preview follows it, nothing is saved by looking.
await check('Auswahl erst mit Startzeit', !s.kindRow);
await P(`for (const r of p._state.compact.rooms) { r.variables.casora_screensaver = '5'; r.variables.casora_screensaver_kind = 'woche'; }`);
await wait(1600);
s = await state();
await check('Vorschau folgt der Auswahl', s.kind === 'woche' && s.pressed === 'woche', s.kind);
await pic('auswahl_woche');
const mid = await c.cmd({ type: 'lovelace/config', url_path: dash });
await check('Ansehen speichert nichts', JSON.stringify(mid) === JSON.stringify(before));
await P('if (p._csDirty() || p._isDirty()) await p._csDiscardAll();').catch(() => {});

// On the dashboard: with a start time of one minute and ?casora_saver=1 (a desktop browser counts as a tablet) the
// screensaver covers the dashboard after a minute without a touch; a touch ends it.
const withSaver = JSON.parse(JSON.stringify(before));
for (const v of withSaver.views || []) { const h = (v.cards || [])[0]; if (h && h.variables) { h.variables.casora_screensaver = '1'; h.variables.casora_screensaver_kind = 'himmel'; } }
await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: withSaver });
await page.goto(BASE + '/' + dash + '?casora_saver=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window._casoraSaver && window._casoraSaver.shown), null, { timeout: 60000 }).catch(() => {});
await check('nicht sofort: erst nach der Startzeit', await page.evaluate(() => !document.querySelector('.cs-sv-layer')));
await page.waitForFunction(() => !!document.querySelector('.cs-sv-layer .cs-sv'), null, { timeout: 90000 }).catch(() => {});
const on = await page.evaluate(() => { const l = document.querySelector('.cs-sv-layer'); const b = l ? l.getBoundingClientRect() : null;
  return { layer: !!l, full: !!b && b.width >= innerWidth - 2 && b.height >= innerHeight - 2, kind: (l && l.querySelector('.cs-sv') || {}).dataset?.kind || '' }; });
await check('Dashboard: Bildschirmschoner liegt über allem', on.layer && on.full && KINDS.includes(on.kind), JSON.stringify(on));
await pic('dashboard');
await page.mouse.click(400, 300);
await wait(900);
await check('eine Berührung holt das Dashboard zurück', await page.evaluate(() => !document.querySelector('.cs-sv-layer')));
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
