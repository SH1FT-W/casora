// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/06-kalender.js
// Thermostat and floor-heating tiles read too busy (owner, 02.11.2026): „21,4° · Heizt auf 22°“, „22° · Ziel 22°“,
// „21° · Automatik · 20–24°“, and an Automatik tile showed its icon grey like „Aus“. Now every tile width says only
// „<room> · <state>“ – „Heizt“, „Kühlt“, „Bereit“ (idle at the target), „Automatik“, „Aus“ – no target, no range;
// the icon is grey only when off. The popup keeps „Heizt auf 22°“. Automatik is „An“ like Heizt/Bereit: switch on
// (desktop) and active surface; only Aus is inactive (owner, 02.11.2026).
// States are faked in the browser only (fakeStates), on the desktop (1440×900) and on the phone (393×852), both light.
// CASORA_LOCAL=1: casora_thermostat from this checkout is put under the dashboard in the browser only.
// R483_SHOTS=<folder>: a picture of the tile per state and viewport.
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboard, casoraDashboards, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const LOCAL_TPL = process.env.CASORA_LOCAL
  ? JSON.parse(fs.readFileSync(new URL('../../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'))
  : null;
const SHOTS = process.env.R483_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const ALL = await casoraDashboards();
const hasT = (d) => !!d && JSON.stringify(d.config).includes('casora_thermostat');
const dash = await casoraDashboard((d) => hasT(d) && hasT(ALL.find((x) => x.url === d.url + '-mobile')));
await need('a Casora dashboard (with phone pair) with a thermostat tile', dash);

// A single thermostat (no group) that knows heat and auto.
const pick = (pg) => pg.evaluate(() => window.__pierce('button-card').map((b, i) => {
  const c = b._config || {}; const t = [].concat(c.template || []);
  const e = document.querySelector('home-assistant').hass.states[c.entity]; const r = b.getBoundingClientRect();
  return { i, t, id: c.entity, w: r.width, grp: !!(e && e.attributes && (e.attributes.member_entities || Array.isArray(e.attributes.entity_id))),
    modes: (e && e.attributes.hvac_modes) || [] };
}).filter((c) => c.t.includes('casora_thermostat') && c.id && !c.grp && c.modes.includes('heat') && c.modes.includes('auto') && c.w > 40));

const inject = async (pg) => {
  if (!LOCAL_TPL) return;
  await pg.evaluate((T) => {
    const pl = window.__pierce('ha-panel-lovelace')[0];
    const L = pl.lovelace;
    pl._setLovelaceConfig({ ...L.config, button_card_templates: { ...(L.config.button_card_templates || {}), casora_thermostat: T.casora_thermostat } }, L.rawConfig, L.mode);
  }, LOCAL_TPL);
  await pg.waitForTimeout(2500);
};

// The tile's state line (what is visible) and the colour of its icon circle.
const read = (pg, id) => pg.evaluate((id) => {
  const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id
    && [].concat(x._config.template || []).includes('casora_thermostat') && x.getBoundingClientRect().width > 40);
  if (!b) return null;
  const sr = b.shadowRoot;
  const st = sr.querySelector('#state');
  const circ = sr.querySelector('#temp_puck .casora-icon-circle') || [...sr.querySelectorAll('.casora-icon-circle')][0];
  const r = b.getBoundingClientRect();
  const ha = sr.querySelector('ha-card');
  const ov = ha ? (ha.style.getPropertyValue('--casora-active-overlay-opacity').trim()
    || getComputedStyle(ha).getPropertyValue('--casora-active-overlay-opacity').trim()) : '';
  return { surface: ov === '1', toggle: window['_casora_toggle_' + id], text: st ? st.innerText.replace(/\s+/g, ' ').trim() : '', bg: circ ? getComputedStyle(circ).backgroundColor : '',
    ink: circ && circ.firstElementChild ? getComputedStyle(circ.firstElementChild).backgroundColor : '',
    box: { x: r.x, y: r.y, width: r.width, height: r.height } };
}, id);

const CASES = {
  heizt: { state: 'heat', attributes: { hvac_action: 'heating', current_temperature: 21.4, temperature: 22, target_temp_low: null, target_temp_high: null } },
  bereit: { state: 'heat', attributes: { hvac_action: 'idle', current_temperature: 22, temperature: 22, target_temp_low: null, target_temp_high: null } },
  automatik: { state: 'auto', attributes: { hvac_action: 'idle', current_temperature: 21, temperature: null, target_temp_low: 20, target_temp_high: 24 } },
  aus: { state: 'off', attributes: { hvac_action: 'off', current_temperature: 21, temperature: 22, target_temp_low: null, target_temp_high: null } },
};
const WORD = { heizt: 'Heizt', bereit: 'Bereit', automatik: 'Automatik', aus: 'Aus' };

const run = async (where, pg, hit) => {
  const seen = {};
  for (const [k, v] of Object.entries(CASES)) {
    await fakeStates(pg, { [hit.id]: v }, { sticky: true });
    await pg.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id
      && x.getBoundingClientRect().width > 40); if (b) b.scrollIntoView({ block: 'center' }); }, hit.id);
    let r = null;
    for (const t0 = Date.now(); Date.now() - t0 < 6000; await pg.waitForTimeout(200)) {
      r = await read(pg, hit.id);
      if (r && r.text.includes(WORD[k])) break;
    }
    seen[k] = r;
    if (SHOTS && r) {
      const b = r.box, pad = 8;
      await pg.screenshot({ path: path.join(SHOTS, `${where}-${k}.png`),
        clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad } });
    }
    const t = r ? r.text : '';
    await check(`${where} ${k}: tile reads „<room> · ${WORD[k]}“ (tile „${t}“)`,
      new RegExp('^-?\\d+(,\\d)?° · ' + WORD[k] + '$').test(t), r);
    await check(`${where} ${k}: no target, no range on the tile`, !/ auf |Ziel|–|\d°.*\d°/.test(t), t);
  }
  for (const k of ['heizt', 'bereit', 'automatik']) {
    await check(`${where} ${k}: tile surface active`, !!(seen[k] && seen[k].surface), seen[k]);
    if (where === 'desktop') await check(`${where} ${k}: switch on`, !!(seen[k] && seen[k].toggle === true), seen[k]);
  }
  await check(`${where} aus: tile surface inactive`, !!(seen.aus && !seen.aus.surface), seen.aus);
  if (where === 'desktop') await check(`${where} aus: switch off`, !!(seen.aus && seen.aus.toggle === false), seen.aus);
  const grey = seen.aus && seen.aus.bg;
  for (const k of ['heizt', 'bereit', 'automatik']) {
    await check(`${where} ${k}: icon circle coloured, not the grey of „Aus“ (${seen[k] && seen[k].bg} vs ${grey})`,
      !!(seen[k] && seen[k].bg && grey && seen[k].bg !== grey), seen[k]);
  }
};

// ── Desktop ──
{
  const { page } = await open({ width: 1440, height: 900, dark: false });
  usePage(page);
  let hit = null;
  for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
    await dashboard(page, dash.url + '/' + v, 3);
    const list = await pick(page);
    if (list.length) { hit = { v, ...list[0] }; break; }
  }
  await need('desktop: a single thermostat tile with heat and auto', hit, dash.url);
  await inject(page);
  await run('desktop', page, hit);
  await page.context().browser().close().catch(() => {});
}

// ── Phone: the climate filter page ──
{
  const { page } = await open({ width: 393, height: 852, dark: false, mobile: true });
  usePage(page);
  await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);
  await inject(page);
  await page.evaluate(() => window._casoraFilter && window._casoraFilter.set('climate'));
  let list = [];
  for (const t0 = Date.now(); Date.now() - t0 < 8000 && !list.length; await page.waitForTimeout(250)) list = await pick(page);
  await need('phone: a single thermostat tile on the climate page', list.length, list);
  await run('phone', page, list[0]);
  await page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all')).catch(() => {});
}
await finish();
