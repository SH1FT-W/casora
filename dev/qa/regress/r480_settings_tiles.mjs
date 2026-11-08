// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-personal.js custom_components/casora/panel/casora-panel-b-ux.js custom_components/casora/panel/casora-panel-live.js custom_components/casora/panel/casora-panel.js
// Settings in eight tiles (since 03.11.2026 the only structure: the topics of 26.10., their subpages and the preview
// switch are gone). Walks the map
// (window.casoraSettingsMap) and clicks through every tile:
//   - the gear opens the start with eight tiles; every tile shows its frequent blocks, "Advanced" draws its blocks only
//     when opened; dashboard sections are drawn in the tile (no links) and say "Only this dashboard";
//   - every switch of every tile (dashboard sections and settings for all dashboards) is flipped, saved with the one
//     bar, read back after a reload of the Studio (persisted), flipped back, saved and read back again (restored);
//     selects, a text, a range and an option field the same way;
//   - unsaved changes: "Done" asks (Back stays, Discard leaves without saving, Save saves), switching dashboards and
//     the HA sidebar ask as well;
//   - search; every earlier way in (topic ids, subpage ids with a focus) lands on its tile and block, no preview switch;
//     phone width without sideways scrolling.
// Whatever happens, the dashboards, settings and options are written back at the end (atFinish).
import { ws } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, casoraDashboards, check, need, finish, atFinish } from './lib.mjs';

const dash = await studioDashboard();
await need('Dashboard fürs Studio', dash);
const c = await ws();
const getCfg = async (u) => { try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } catch (e) { return null; } };
const pair = (await casoraDashboards()).find((d) => d.url === dash + '-mobile');
const tryCmd = async (m) => { try { return await c.cmd(m); } catch (e) { return null; } };
const optsOf = (r) => (r && r.options) || null;
const tankOf = (r) => (r ? { radius: r.radius, cars: Object.fromEntries((r.cars || []).map((x) => [x.device_id, x.fuel])) } : null);
const liveOf = (r) => (r ? { targets: r.targets, devices: r.devices } : null);
const saved = { dash: await getCfg(dash), mobile: pair ? await getCfg(pair.url) : null,
  settings: (await c.cmd({ type: 'casora/settings/get' })).settings || {},
  options: optsOf(await tryCmd({ type: 'casora/options/get' })),
  tank: tankOf(await tryCmd({ type: 'casora/tanken/get' })),
  live: liveOf(await tryCmd({ type: 'casora/live/get' })) };
// Whatever happened: every store back as it was (only what changed, options reload the integration).
atFinish(async () => {
  if (saved.dash) await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: saved.dash });
  if (saved.mobile) await c.cmd({ type: 'lovelace/config/save', url_path: pair.url, config: saved.mobile });
  await c.cmd({ type: 'casora/settings/set', settings: saved.settings });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (saved.options && !same(optsOf(await tryCmd({ type: 'casora/options/get' })), saved.options)) await tryCmd({ type: 'casora/options/set', options: saved.options });
  if (saved.tank && !same(tankOf(await tryCmd({ type: 'casora/tanken/get' })), saved.tank)) await tryCmd({ type: 'casora/tanken/set', ...saved.tank });
  if (saved.live && !same(liveOf(await tryCmd({ type: 'casora/live/get' })), saved.live)) {
    await tryCmd({ type: 'casora/live/set', targets: saved.live.targets, devices: saved.live.devices, devices_replace: true });
  }
  c.close();
});

const o = await open({ width: 1440, height: 900, dark: true });
const page = o.page;
usePage(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);
// Nothing unsaved may be left before a reload: otherwise the Studio offers to restore it (a dialog in the way).
const reopen = async () => {
  await P('if (p._csDirty() || p._isDirty()) await p._csDiscardAll();').catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  await studio(page, dash);
  const restore = await P(`await new Promise((r) => setTimeout(r, 400)); const b = [...p.shadowRoot.querySelectorAll('.askcard button')].find((x) => /Verwerfen|Discard/.test(x.textContent));
    if (b) { b.click(); await new Promise((r) => setTimeout(r, 800)); } return !!b;`);
  if (restore) console.log('  info   Wiederherstellen-Frage verworfen');
};
const openTile = async (id, adv = true) => {
  await P(`p._csShow('n-${id}')`);
  await wait(1200);
  // Sections of a fold tile (Home & devices) are closed until opened.
  await P(`p.shadowRoot.querySelectorAll('#pane .cn-fold:not(.open) > .cn-bhead').forEach((h) => h.click());`);
  await wait(200);
  if (adv) {
    await P(`const d = p.shadowRoot.querySelector('#pane .cn-adv'); if (d && !d.open) d.open = true;`);
    await wait(800);
  }
};
// Every switch and tick box on the open tile, by a name that survives a redraw: block, field key (dashboard
// sections) or row text.
const SW = `const out = []; const seen = {};
  p.shadowRoot.querySelectorAll('#pane .cn-block').forEach((blk) => {
    const b = blk.dataset.pkey.slice(3);
    blk.querySelectorAll('button.sw, [role=switch], input[type=checkbox]').forEach((sw) => {
      if (!sw.getClientRects().length) return;
      const keyRow = sw.closest('.row[data-key]');
      const tog = sw.closest('.togglecard');
      const row = sw.closest('.frow, .row, .casora-prow') || sw.parentElement;
      const base = b + ':' + (keyRow ? 'k=' + keyRow.dataset.key : tog ? 'toggle' : (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50));
      seen[base] = (seen[base] || 0) + 1;
      out.push({ id: base + '#' + seen[base], on: sw.type === 'checkbox' ? String(sw.checked) : sw.getAttribute('aria-checked'), el: sw });
    });
  });`;
const states = () => P(SW + ` const m = {}; out.forEach((x) => { m[x.id] = x.on; }); return m;`);
const flip = (id) => P(SW + ` const x = out.find((y) => y.id === arg); if (!x) return false; x.el.click(); return true;`, id);
const saveBar = async () => {
  const r = await P(`const bar = p.shadowRoot.querySelector('.cs-bar'); const btn = bar && bar.querySelector('.cs-save');
    const shown = !!bar && !bar.classList.contains('cs-clean');
    if (!btn || btn.disabled) return { shown, clicked: false };
    btn.click();
    for (let i = 0; i < 60 && (p._cs && p._cs.busy); i++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 600));
    return { shown, clicked: true, dirty: p._csDirty(), dash: p._isDirty(), err: p._cs && p._cs.err };`);
  return r;
};

let map = [];
const part = async (name, fn) => {
  try { await fn(); } catch (e) { await check(name + ': ohne Abbruch', false, String(e && e.message || e).split('\n')[0]); }
};

// ── Structure ────────────────────────────────────────────────────────────────
await part('Aufbau', async () => {
await P('p._bOpenSettings(null);');
await wait(1500);
const start = await P(`return { page: p._csPage, tiles: [...p.shadowRoot.querySelectorAll('.cn-grid .cs-hubtile')].map((b) => b.dataset.tile) };`);
await check('Zahnrad öffnet die neue Startseite mit acht Kacheln', start.page === 'n-start' && start.tiles.length === 8, start);
map = await P(`return window.casoraSettingsMap.tiles.map((t) => ({ id: t.id, blocks: t.blocks.map((b) => ({ k: b.k, adv: !!b.adv, sec: b.sec || null, link: !!b.updates, personal: !!b.personal })) }));`);
for (const tile of map) {
  await openTile(tile.id, false);
  const seen = await P(`return [...p.shadowRoot.querySelectorAll('#pane .cn-block')].map((b) => ({ k: b.dataset.pkey.slice(3),
    rows: b.querySelectorAll('section.cn-card .row').length, only: !!b.querySelector('.cn-only'), link: !!b.querySelector('.frow .chev, .frow [class*=chev]') }));`);
  const often = tile.blocks.filter((b) => !b.adv);
  await check(`${tile.id}: häufige Blöcke, Dashboard-Abschnitte im Block`, often.filter((b) => b.sec || b.link).every((b) => seen.some((s) => s.k === b.k))
    && seen.every((s) => often.some((b) => b.k === s.k))
    && often.filter((b) => b.sec).every((b) => { const s = seen.find((x) => x.k === b.k); return s && s.rows > 0 && (s.only || b.personal); }), seen);
  const adv = tile.blocks.filter((b) => b.adv);
  if (!adv.length) continue;
  const inAdv = await P(`const d = p.shadowRoot.querySelector('#pane .cn-adv'); const before = d.querySelectorAll('.cn-block').length;
    d.open = true; await new Promise((r) => setTimeout(r, 900));
    const after = [...d.querySelectorAll('.cn-block')].map((b) => b.dataset.pkey.slice(3)); d.open = false; return { before, after };`);
  await check(`${tile.id}: „Erweitert“ zeichnet erst beim Öffnen`, inAdv.before === 0 && adv.filter((b) => b.sec).every((b) => inAdv.after.includes(b.k))
    && inAdv.after.every((k) => adv.some((b) => b.k === k)), inAdv);
}
for (const [q, k] of [['müll', 'waste'], ['uhr', 'time'], ['rollladen', 'security'], ['lüften', 'vent'], ['tankstelle', 'fuel'], ['beta', 'updates'], ['schrift', 'font'], ['glocke', 'bell']]) {
  const hits = await P('return p._csNeuFind(arg).map((h) => h.b.k);', q);
  await check(`Suche „${q}“ findet ${k}`, hits.includes(k), hits);
}
const hit = await P(`p._nOpen = new Set(); const t = window.casoraSettingsMap.tiles.find((x) => x.id === 'house'); p._csNeuGo(t, t.blocks.find((b) => b.k === 'security'));
  await new Promise((r) => setTimeout(r, 1500)); const box = p.shadowRoot.querySelector('#pane [data-pkey="nb-security"]');
  const closed = [...p.shadowRoot.querySelectorAll('#pane .cn-fold:not(.open)')].map((b) => b.dataset.pkey);
  return { page: p._csPage, open: !!(box && box.classList.contains('open')), block: !!box, closed, shows: !!(box && box.querySelector('.frow')?.getClientRects().length) };`);
await check('Treffer öffnet genau seinen Abschnitt', hit.page === "n-house" && hit.open && hit.block && hit.shows && hit.closed.length >= 3, hit);
});

// ── Every switch of every tile: flip, save, reload, check; flip back, save, reload, check ─────────
let flipped = 0;
await part('Schalter', async () => {
for (const tile of map) {
  await openTile(tile.id);
  const s0 = await states();
  const ids = Object.keys(s0);
  if (!ids.length) continue;
  // Last to first: a switch that unfolds more switches below does not move the ones still to come.
  for (const id of ids.slice().reverse()) { await flip(id); await wait(250); }
  const bar1 = await saveBar();
  await check(`${tile.id}: Leiste zeigt Ungespeichertes und speichert (${ids.length} Schalter)`, bar1.shown && bar1.clicked && !bar1.dirty && !bar1.err, bar1);
  await reopen();
  await openTile(tile.id);
  const s1 = await states();
  const both = ids.filter((id) => id in s1);
  const notKept = both.filter((id) => s1[id] === s0[id]);
  await check(`${tile.id}: nach Neuladen sind alle ${ids.length} Schalter umgestellt (gespeichert)`, both.length === ids.length && !notKept.length, { notKept, missing: ids.filter((id) => !(id in s1)) });
  for (const id of Object.keys(s1).reverse()) if (id in s0 && s1[id] !== s0[id]) { await flip(id); await wait(250); }
  const bar2 = await saveBar();
  await reopen();
  await openTile(tile.id);
  const s2 = await states();
  const back = ids.filter((id) => s2[id] !== s0[id]);
  await check(`${tile.id}: zurückgestellt und gespeichert`, bar2.clicked && !back.length, { back, bar2 });
  flipped += both.length;
}
});
await check('Schalter insgesamt umgestellt und zurück', flipped >= 45, flipped);

// ── Selects, text, range (dashboard sections) ───────────────────────────────────
const pickCombo = (block, key, label) => P(`const row = p.shadowRoot.querySelector('#pane [data-pkey="nb-' + arg[0] + '"] .row[data-key="' + arg[1] + '"]');
  if (!row) return 'norow'; const inp = row.querySelector('.combo input'); inp.click(); inp.focus(); await new Promise((r) => setTimeout(r, 400));
  const name = (o) => o.textContent.replace('\u2713', '').trim();
  const opt = [...p.shadowRoot.querySelectorAll('.combo-opt')].find((o) => o.getClientRects().length && name(o) === arg[2]);
  if (!opt) return 'noopt:' + [...p.shadowRoot.querySelectorAll('.combo-opt')].filter((o) => o.getClientRects().length).map(name).join('|');
  (opt.pick ? opt.pick() : opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))); await new Promise((r) => setTimeout(r, 500)); return true;`, [block, key, label]);
const comboVal = (block, key) => P(`const row = p.shadowRoot.querySelector('#pane [data-pkey="nb-' + arg[0] + '"] .row[data-key="' + arg[1] + '"]');
  return row ? row.querySelector('.combo input').value : null;`, [block, key]);
await part('Auswahl, Text, Bereich, Option', async () => {
const SELECTS = [['look', 'font', 'font', 'Systemschrift'], ['use', 'hold', 'hold_mode', 'Popup öffnen'], ['use', 'screen', 'casora_idle_home', 'Nach 1 Minute'], ['use', 'perf', 'performance', 'An']];
for (const [tile, block, key, label] of SELECTS) {
  await openTile(tile);
  const was = await comboVal(block, key);
  const r = await pickCombo(block, key, label);
  const bar = await saveBar();
  await reopen(); await openTile(tile);
  const now = await comboVal(block, key);
  await check(`${tile} › ${key}: Auswahl „${label}“ gespeichert`, r === true && bar.clicked && now === label, { was, r, now, bar });
  const r2 = await pickCombo(block, key, was);
  await saveBar();
  await reopen(); await openTile(tile);
  await check(`${tile} › ${key}: zurück auf „${was}“`, r2 === true && (await comboVal(block, key)) === was, { r2 });
}
// Text (scenes title on the badge) and range (room photo on the phone).
const setInput = (block, key, sel, v) => P(`const row = p.shadowRoot.querySelector('#pane [data-pkey="nb-' + arg[0] + '"] .row[data-key="' + arg[1] + '"]');
  if (!row) return null; const inp = row.querySelector(arg[2]); const was = inp.value; inp.focus(); inp.value = arg[3];
  inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.blur();
  await new Promise((r) => setTimeout(r, 500)); return was;`, [block, key, sel, v]);
const getInput = (block, key, sel) => P(`const row = p.shadowRoot.querySelector('#pane [data-pkey="nb-' + arg[0] + '"] .row[data-key="' + arg[1] + '"]');
  return row ? row.querySelector(arg[2]).value : null;`, [block, key, sel]);
for (const [tile, block, key, sel, v] of [['house', 'scenes', 'scenes_title', 'input', 'QA Szenen'], ['phone', 'phone', 'room_photo_blur', 'input[type=range]', '12']]) {
  await openTile(tile);
  const was = await setInput(block, key, sel, v);
  const bar = await saveBar();
  await reopen(); await openTile(tile);
  const now = await getInput(block, key, sel);
  await check(`${tile} › ${key}: „${v}“ gespeichert`, was !== null && bar.clicked && now === v, { was, now, bar });
  await setInput(block, key, sel, was);
  await saveBar();
  await reopen(); await openTile(tile);
  await check(`${tile} › ${key}: zurück`, (await getInput(block, key, sel)) === was, { was });
}
// An option of the integration (electricity price): saved through the same bar.
await openTile('wx');
const priceWas = (await c.cmd({ type: 'casora/options/get' })).options?.price_kwh;
const priceSet = await P(`const inp = p.shadowRoot.querySelector('#pane [data-pkey="nb-outdoor"] .cs-num input'); if (!inp) return false;
  inp.value = '0,31'; inp.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
const pbar = await saveBar();
await wait(4000);
const priceNow = (await c.cmd({ type: 'casora/options/get' })).options?.price_kwh;
await check('Strompreis (Integrations-Option) über die Leiste gespeichert', priceSet && pbar.clicked && priceNow === 0.31, { priceWas, priceNow, pbar });
await reopen(); await openTile('wx');
await P(`const inp = p.shadowRoot.querySelector('#pane [data-pkey="nb-outdoor"] .cs-num input'); inp.value = arg == null ? '' : String(arg).replace('.', ',');
  inp.dispatchEvent(new Event('input', { bubbles: true }));`, priceWas ?? null);
await saveBar();
await wait(4000);
await check('Strompreis zurück', (await c.cmd({ type: 'casora/options/get' })).options?.price_kwh === priceWas, priceWas);
});

// ── Unsaved changes: "Done", switching dashboards, HA sidebar ─────────────────────
await part('Ungespeichertes', async () => {
const flipClock = async () => { await openTile('look', false); return P(`const sw = p.shadowRoot.querySelector('#pane [data-pkey="nb-time"] .row[data-key="use_12h"] .sw'); const was = sw.getAttribute('aria-checked'); sw.click(); return was;`); };
const ask = () => P(`await new Promise((r) => setTimeout(r, 700)); const c = p.shadowRoot.querySelector('.askcard'); return c ? [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) : null;`);
// The answer may leave the Studio (navigation): click, then wait outside the page.
const answer = async (re) => {
  const ok = await P(`const b = [...p.shadowRoot.querySelectorAll('.askcard button')].find((x) => new RegExp(arg).test(x.textContent)); if (b) setTimeout(() => b.click(), 0); return !!b;`, re);
  await wait(1800);
  return ok;
};
const cfg12 = async () => JSON.stringify(await getCfg(dash)).match(/"use_12h":\s*true/g)?.length || 0;
const c12 = await cfg12();
await flipClock();
await P(`p.$('donebtn').click();`);
const d1 = await ask();
await check('„Fertig“ fragt bei Ungespeichertem: Speichern, Verwerfen, Zurück', d1 && ['Speichern', 'Verwerfen', 'Zurück'].every((x) => d1.includes(x)), d1);
await answer('^Zurück$');
await check('„Zurück“ bleibt im Studio, Änderung wartet', await P('return !!p._csOpen && p._csDirty();'));
await P(`p.$('donebtn').click();`); await ask();
await answer('^Verwerfen$');
await wait(1500);
await check('„Verwerfen“ verlässt das Studio ohne zu speichern', !/casora-studio/.test(page.url()) && (await cfg12()) === c12, { url: page.url() });
await reopen();
await flipClock();
await P(`p.$('donebtn').click();`); await ask();
await answer('^Speichern$');
await wait(2500);
await check('„Speichern“ speichert und verlässt das Studio', !/casora-studio/.test(page.url()) && (await cfg12()) !== c12, { url: page.url() });
await reopen();
await flipClock();
await saveBar();
const saved12 = await cfg12();
// Switching dashboards with unsaved settings.
const other = (await casoraDashboards()).find((d) => !d.mobile && d.url !== dash);
if (other) {
  await flipClock();
  await P(`p._dashSwitchPick('dash:' + arg);`, other.url);
  const d2 = await ask();
  await check('Dashboard wechseln fragt bei Ungespeichertem', !!d2 && d2.includes('Verwerfen'), d2);
  await answer('^Zurück$');
  await check('„Zurück“ bleibt beim Dashboard', await P('return p._dashUrl === arg && p._stateUrl === arg && p._csDirty();', dash));
  await P(`p._dashSwitchPick('dash:' + arg);`, other.url); await ask();
  await answer('^Verwerfen$');
  await wait(2500);
  const now12 = await cfg12();
  await check('„Verwerfen“ wechselt das Dashboard, nichts gespeichert', (await P('return p._stateUrl;')) === other.url && now12 === saved12, { now12, saved12 });
  await reopen();
}
// HA sidebar link with unsaved settings.
await flipClock();
const nav = await page.evaluate(() => { const a = window.__pierce('ha-sidebar a[href="/history"], ha-sidebar a[href="/logbook"]')[0]; if (!a) return false; a.click(); return true; });
if (nav) {
  const d3 = await ask();
  await check('HA-Seitenleiste fragt bei Ungespeichertem', !!d3 && d3.includes('Verwerfen'), d3);
  await answer('^Zurück$');
  await check('„Zurück“ bleibt im Studio', /casora-studio/.test(page.url()), page.url());
}
await P(`await p._csDiscardAll();`);
// The bell's own switch: the card stays open (rows visible), switched back it is as before.
await openTile('bell', false);
const tog = async () => P(`const sw = p.shadowRoot.querySelector('#pane [data-pkey="nb-bell"] .togglecard .sw'); sw.click(); await new Promise((r) => setTimeout(r, 700));
  const blk = p.shadowRoot.querySelector('#pane [data-pkey="nb-bell"]');
  return { on: blk.querySelector('.togglecard .sw').getAttribute('aria-checked'), rows: [...blk.querySelectorAll('.row[data-key]')].filter((r) => r.getClientRects().length).length };`);
const t1 = await tog(), t2 = await tog();
await check('Glocke aus- und wieder einschalten: Karte bleibt offen, Zeilen bleiben sichtbar', t1.on !== t2.on && t1.rows > 3 && t2.rows > 3, { t1, t2 });
await P(`await p._csDiscardAll();`);
});

// ── Earlier ways in: topic and subpage ids (Studio rows, the bell, ⌘K, saved links) land on the tile and block ─────
await part('Alte Wege', async () => {
const at = (id, focus) => P(`p._csShow(${JSON.stringify(id)}${focus ? ', ' + JSON.stringify(focus) : ''}); await new Promise((r) => setTimeout(r, 1300));
  const pane = p.shadowRoot.querySelector('#pane');
  return { page: p._csPage, topics: pane.querySelectorAll('.cs-hublist .frow').length, adv: !!(pane.querySelector('.cn-adv') || {}).open,
    blocks: [...pane.querySelectorAll('.cn-block')].filter((b) => b.getClientRects().length).map((b) => b.dataset.pkey) };`);
const start = await at('start');
const rows = await P(`return [...p.shadowRoot.querySelectorAll('#pane .frow')].filter((r) => r.getClientRects().length).map((r) => r.textContent.replace(/\\s+/g, ' ').trim());`);
await check('„start“ zeigt die acht Kacheln, keinen Schalter zurück', start.page === 'n-start' && !rows.some((t) => /bisherig|previous/i.test(t)), { start, rows });
for (const [id, focus, page, blk, adv] of [['t-look', null, 'n-look', null, false], ['t-ctl', null, 'n-use', null, false], ['t-msg', null, 'n-bell', null, false],
  ['live', null, 'n-phone', 'nb-live', false], ['fuel', null, 'n-wx', 'nb-fuel', false], ['calendar', null, 'n-house', 'nb-calendars', false],
  ['home', 'security', 'n-house', 'nb-security', false], ['alerts', null, 'n-bell', 'nb-notify', true]]) {
  const r = await at(id, focus);
  await check(`${id}${focus ? ' › ' + focus : ''} → ${page}${blk ? ' › ' + blk : ''}`, r.page === page && r.topics === 0 && (!blk || r.blocks.includes(blk)) && (!adv || r.adv), r);
}
});

// ── Phone width ────────────────────────────────────────────────────────────────
await part('Handy', async () => {
const ph = await open({ width: 390, height: 844, mobile: true, dark: true });
usePage(ph.page);
await studio(ph.page, dash);
const PP = (src) => ph.page.evaluate((src) => new Function('p', 'return (async () => {' + src + '})()')(window.__panel()), src);
for (const tile of map) {
  const r = await PP(`p._csShow('n-${tile.id}'); await new Promise((r) => setTimeout(r, 1300));
    const d = p.shadowRoot.querySelector('#pane .cn-adv'); if (d) { d.open = true; await new Promise((r) => setTimeout(r, 700)); }
    const pane = p.shadowRoot.querySelector('#pane');
    const wide = [...pane.querySelectorAll('*')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className).slice(0, 4);
    return { page: p._csPage, blocks: pane.querySelectorAll('.cn-block').length, wide };`);
  await check(`Handy: ${tile.id} ohne seitliches Scrollen`, r.page === 'n-' + tile.id && r.blocks > 0 && !r.wide.length, r);
}
});
await check('keine Skriptfehler', !errors.length, errors);
await finish();
