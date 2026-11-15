// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraComfortLevel,casoraComfortWord,casoraComfortBands,casoraComfortType,casoraComfortOf custom_components/casora/panel/casora-panel-personal.js custom_components/casora/panel/casora-panel-settings.js dashboards/casora/button_card_templates.json
// #202: comfort rating by room type. Dashboard (desktop, readings faked in this browser only): at the same 21 °C the
// bedroom („Schlafzimmer“, automatic type Schlafen) says „Warm“ in orange while the living room („Wohnzimmer“, Wohnen)
// says „Angenehm“ in green; a room set to Keller/Lager at 68 % says „Etwas feucht“ (orange); a room set to
// Außen/unbeheizt shows its value without a word and without a comfort colour. Studio: Settings › Home & devices ›
// Room climate lists the rooms with their detected type („Automatisch (Schlafen)“), a value changed is a draft
// (save bar, discard brings the default back), and saving stores only what changed (one room type, one number).
// The house's settings are put back at the end. Screenshots for the maintainer with R890_SHOT=<folder>.
import fs from 'node:fs';
import { open, casoraDashboard, studio, dashboard, check, need, finish, usePage, fakeStates, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

process.env.CASORA_THEME = 'Casora';
const SHOT = process.env.R890_SHOT || '';
const dash = await casoraDashboard((d) => (d.config.views || []).some((v) => v.path === 'schlafzimmer') && (d.config.views || []).some((v) => v.path === 'wohnzimmer'));
await need('Casora dashboard with Schlafzimmer and Wohnzimmer', dash, dash && dash.url);
const view = (p) => (dash.config.views || []).find((v) => v.path === p);
const sensor = (p, k) => { const m = JSON.stringify(view(p) || {}).match(new RegExp('"' + k + '":"([^"]+)"')); return m && m[1]; };
const T = { sz: sensor('schlafzimmer', 'temp_sensor_1'), wz: sensor('wohnzimmer', 'temp_sensor_1'), fl: sensor('flur', 'humidity_sensor'),
  kt: sensor('kueche', 'temp_sensor_1') };
await need('rooms with climate sensors', T.sz && T.wz && T.fl && T.kt, T);

// ── Dashboard ──────────────────────────────────────────────────────────────────────────────────────────────
const dk = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(dk.page);
const page = dk.page;
// The climate badges of the open room: word line, the icon colour and the comfort colours to compare with.
const badges = () => page.evaluate(() => window.__pierce('button-card').filter((b) => {
  const t = [].concat((b._config || {}).template || []);
  return t.includes('casora_badge_temp') || t.includes('casora_badge_humidity');
}).map((b) => {
  const card = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
  if (!card) return null;
  const probe = (css) => { const d = document.createElement('span'); d.style.color = css; card.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  return { tpl: [].concat(b._config.template).find((x) => /badge_(temp|humidity)$/.test(x)), entity: (b._stateObj || {}).entity_id,
    room: (b._evaledVariables || {}).room_name, sub: String((card.querySelector('.badge-sub') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    color: probe('var(--casora-icon-color)'), green: probe(window.casoraComfortColor(0)), orange: probe(window.casoraComfortColor(1)),
    red: probe(window.casoraComfortColor(2)), neutral: probe('var(--secondary-text-color)') };
}).filter(Boolean));
// Local room types for this browser (the Studio's draft is checked below): Flur as cellar, Küche as outdoor.
const localTypes = () => page.evaluate(() => {
  window.CASORA_SETTINGS = { ...(window.CASORA_SETTINGS || {}), climate: { rooms: { Flur: 'keller', 'Küche': 'aussen' } } };
});
const visit = async (path) => {
  await dashboard(page, dash.url + '/' + path, 3);
  await localTypes();
  await fakeStates(page, { [T.sz]: { state: '21' }, [T.wz]: { state: '21' }, [T.kt]: { state: '21' }, [T.fl]: { state: '68' } }, { sticky: true });
  await page.waitForTimeout(800);
  return badges();
};
// Screenshots only: open the room's Klima badge so its sub-badges with the words show.
const openKlima = async () => {
  const at = await page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_climate_group')
      && x.getBoundingClientRect().width > 20);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(1500); }
};
let b = await visit('schlafzimmer');
const bed = b.find((x) => x.entity === T.sz && x.tpl === 'casora_badge_temp');
console.log('    bedroom', JSON.stringify(bed));
await check(`Schlafzimmer at 21 °C: „Warm“ (${bed && bed.sub})`, bed && /^Warm · 21°$/.test(bed.sub), bed);
await check('Schlafzimmer at 21 °C: orange', bed && bed.color === bed.orange, bed);
if (SHOT) { await openKlima(); await page.screenshot({ path: SHOT + '/klima-schlafzimmer.png', clip: { x: 300, y: 300, width: 800, height: 300 } }); }
b = await visit('wohnzimmer');
const liv = b.find((x) => x.entity === T.wz && x.tpl === 'casora_badge_temp');
console.log('    living', JSON.stringify(liv));
await check(`Wohnzimmer at 21 °C: „Angenehm“ (${liv && liv.sub})`, liv && /^Angenehm · 21°$/.test(liv.sub), liv);
await check('Wohnzimmer at 21 °C: green', liv && liv.color === liv.green, liv);
if (SHOT) { await openKlima(); await page.screenshot({ path: SHOT + '/klima-wohnzimmer.png', clip: { x: 300, y: 300, width: 800, height: 300 } }); }
b = await visit('flur');
const cel = b.find((x) => x.entity === T.fl && x.tpl === 'casora_badge_humidity');
console.log('    cellar', JSON.stringify(cel));
await check(`Flur set to Keller/Lager at 68 %: „Etwas feucht“ (${cel && cel.sub})`, cel && /^Etwas feucht · 68\s?%$/.test(cel.sub), cel);
await check('Keller at 68 %: orange', cel && cel.color === cel.orange, cel);
b = await visit('kueche');
const out = b.find((x) => x.entity === T.kt && x.tpl === 'casora_badge_temp');
console.log('    outdoor', JSON.stringify(out));
await check(`Küche set to Außen/unbeheizt: value only (${out && out.sub})`, out && out.sub === '21°', out);
await check('Außen: no comfort colour', out && out.color === out.neutral && ![out.green, out.orange, out.red].includes(out.color), out);

// ── Studio ─────────────────────────────────────────────────────────────────────────────────────────────────
const c = await ws();
const before = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
atFinish(async () => { try { await c.cmd({ type: 'casora/settings/set', settings: before }); } catch (e) { /* best effort */ } c.close(); });
await need('no room climate stored before the test', !before.climate, before.climate);
// The phone first: the desktop run saves at its end.
for (const [tag, opts] of [['phone', { width: 393, height: 852, mobile: true, scale: 2 }], ['desktop', { width: 1440, height: 900 }]]) {
  const st = await open({ ...opts, dark: false, theme: 'Casora' });
  usePage(st.page);
  await studio(st.page, dash.url);
  const P = (src, a) => st.page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
  await P(`p._casoraPersonal({ focus: 'climate' }); await new Promise((r) => setTimeout(r, 2500));`);
  const rows = await P(`const R = p.shadowRoot; return [...R.querySelectorAll('.casora-pclimroom')].map((r) => ({
    name: (r.querySelector('.rtext > b') || {}).textContent, type: (r.querySelector('.casora-pclimtype input') || {}).value }));`);
  console.log('    ' + tag + ' rows', JSON.stringify(rows));
  const typeOf = (n) => (rows.find((r) => r && r.name === n) || {}).type;
  await check(`${tag}: Room climate lists the rooms`, rows.length >= 6, rows);
  await check(`${tag}: Schlafzimmer „Automatisch (Schlafen)“`, typeOf('Schlafzimmer') === 'Automatisch (Schlafen)', rows);
  await check(`${tag}: Wohnzimmer „Automatisch (Wohnen)“`, typeOf('Wohnzimmer') === 'Automatisch (Wohnen)', rows);
  await check(`${tag}: Badezimmer „Automatisch (Bad)“, Küche „Automatisch (Küche)“, Flur „Automatisch (Flur/Nebenraum)“`,
    typeOf('Badezimmer') === 'Automatisch (Bad)' && typeOf('Küche') === 'Automatisch (Küche)' && typeOf('Flur') === 'Automatisch (Flur/Nebenraum)', rows);
  // The values of a type: Schlafen, ideal up to 20 °C.
  await P(`const b = p.shadowRoot.querySelector('.casora-pclimchips [data-type="schlafen"]'); b && b.click(); await new Promise((r) => setTimeout(r, 900));`);
  const field = () => P(`const i = p.shadowRoot.querySelector('input.casora-pnum[data-field="temp_ideal_max"]'); return i ? i.value : null;`);
  await check(`${tag}: Schlafen ideal up to 20 °C`, (await field()) === '20', await field());
  if (SHOT && tag === 'desktop') {
    await P(`const b = p.shadowRoot.querySelector('[data-pkey="nb-climate"]'); b && b.scrollIntoView({ block: 'start' });`);
    await st.page.waitForTimeout(800);
    await st.page.screenshot({ path: SHOT + '/studio.png' });
  }
  if (SHOT && tag === 'phone') {
    await P(`const b = p.shadowRoot.querySelector('[data-pkey="climate_values"]') || p.shadowRoot.querySelector('.casora-pclimchips'); b && b.scrollIntoView({ block: 'center' });`);
    await st.page.waitForTimeout(800);
    await st.page.screenshot({ path: SHOT + '/studio-handy.png' });
  }
  if (tag !== 'desktop') continue;
  // Draft: typing shows the save bar, discard brings the default back; nothing is stored.
  const typeIn = async (v) => {
    await st.page.locator('input.casora-pnum[data-field="temp_ideal_max"]').fill(v);
    await st.page.waitForTimeout(700);
  };
  await typeIn('21');
  await check('desktop: a changed value is a draft (save bar)', await P('return !!p._csOwnDirty();'));
  const mid = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
  await check('desktop: nothing stored before saving', !mid.climate, mid.climate);
  await P('await p._csDiscardAll(); await new Promise((r) => setTimeout(r, 1200));');
  await P(`if (!p.shadowRoot.querySelector('input.casora-pnum')) { p._casoraPersonal({ focus: 'climate' }); await new Promise((r) => setTimeout(r, 2000)); }
    const b = p.shadowRoot.querySelector('.casora-pclimchips [data-type="schlafen"]'); b && b.click(); await new Promise((r) => setTimeout(r, 900));`);
  await check(`desktop: discard → 20 °C again (${await field()})`, (await field()) === '20' && !(await P('return !!p._csOwnDirty();')));
  // Save: one number and one room type, nothing else.
  await typeIn('21');
  await st.page.locator('.casora-pclimtype[data-room="Flur"] input').click();
  await st.page.waitForTimeout(700);
  const picked = await P(`const o = [...p.shadowRoot.querySelectorAll('.combo-opt')].find((x) => ((x.querySelector('.lbl') || {}).textContent || '').trim() === 'Keller/Lager');
    if (!o) return false; o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); o.click(); return true;`);
  await check('desktop: Flur → Keller/Lager picked', picked);
  await st.page.waitForTimeout(700);
  await P('await p._csSave(); await new Promise((r) => setTimeout(r, 1500));');
  const saved = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
  console.log('    saved', JSON.stringify(saved.climate));
  await check('desktop: saved only the changes', JSON.stringify(saved.climate) === JSON.stringify({ rooms: { Flur: 'keller' }, types: { schlafen: { temp_ideal_max: 21 } } }), saved.climate);
  await check('desktop: the dashboards read it', await st.page.evaluate(() => (((window.CASORA_SETTINGS || {}).climate || {}).rooms || {}).Flur === 'keller'));
}
if (SHOT) fs.writeFileSync(SHOT + '/.r890', new Date().toISOString());
await finish();
