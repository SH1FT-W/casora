// @zustand: frisch
// @parallel: allein   (sets the installation design and toggles Casora's overlay helpers; both restored at the end)
// @deckt: custom_components/casora/theme.py custom_components/casora/actions.py custom_components/casora/helfer.py custom_components/casora/scripts/casora-theme.js
// HACS review (hacs/default#12143, point 3): Casora appended four scripts to scripts.yaml and wrote
// themes/casora-themes.yaml on every start. Expected now: the cards' actions are services casora.* (no
// script.casora_* needed), the designs come from the integration and are applied in the browser without being
// an HA theme (HA's own default theme stays "default"), the dashboard shows the Casora look (variables on
// <html>, UIX finds the design by name), and the former script actions still work. With CASORA_CONFIG_DIR
// (config folder of the test HA) also: reloading Casora and running casora.einrichten leave scripts.yaml,
// configuration.yaml and the themes folder byte for byte as they were. Picture: CASORA_OUT (Home, dark).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboards, dashboard, ready, check, need, finish, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const c = await ws();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async (id) => (await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === id);
const svc = (service, data) => c.cmd({ type: 'call_service', domain: 'casora', service, service_data: data });

// 1. Services instead of scripts
const services = await c.cmd({ type: 'get_services' });
for (const s of ['light_smart_toggle', 'thermostat_overlay_toggle', 'actions_overlay_toggle', 'restart_toggle']) {
  await check('service casora.' + s, !!(services.casora && services.casora[s]));
}

// 2. No config writes (only with access to the test HA's config folder)
const CFG = process.env.CASORA_CONFIG_DIR || '';
if (CFG) {
  const files = ['configuration.yaml', 'scripts.yaml'];
  const read = (f) => { try { return fs.readFileSync(path.join(CFG, f), 'utf8'); } catch (e) { return null; } };
  const themes = () => { try { return fs.readdirSync(path.join(CFG, 'themes')).sort().join(','); } catch (e) { return '-'; } };
  const before = Object.fromEntries(files.map((f) => [f, read(f)]));
  const tBefore = themes();
  const entry = (await c.cmd({ type: 'config_entries/get', domain: 'casora' }))[0];
  await c.cmd({ type: 'call_service', domain: 'casora', service: 'einrichten', service_data: {}, return_response: true }).catch(() => null);
  await c.cmd({ type: 'config_entries/reload', entry_id: entry.entry_id }).catch(() => null);
  await sleep(4000);
  for (const f of files) await check(f + ' unchanged after reload + casora.einrichten', read(f) === before[f]);
  await check('themes folder unchanged (no casora-themes.yaml written)', themes() === tBefore, { before: tBefore, after: themes() });
  await check('scripts.yaml has no Casora script added', (read('scripts.yaml') || '').split('casora_').length === (before['scripts.yaml'] || '').split('casora_').length);
}

// 3. Designs are served, not registered as HA themes
const got = await c.cmd({ type: 'casora/theme/get', name: 'Casora' });
await check('design served by the integration', got && got.theme && got.theme.modes && got.theme['uix-theme'] === 'Casora');
const haThemes = await c.cmd({ type: 'frontend/get_themes' });
// (An old theme file of an earlier version may still name one; the fresh state has none.)
await check('HA default theme not set to a Casora design', !/^Casora/.test(String(haThemes.default_theme || '')), haThemes.default_theme);

// 4. The former script actions work
const overlay = async (service, field, bool, text) => {
  const key = 'qa.r326_' + service;
  await svc(service, { [field]: key });
  await sleep(600);
  const on = (await state(bool)) || {};
  const txt = (await state(text)) || {};
  await check(service + ': opens', on.state === 'on' && txt.state === key, { on: on.state, text: txt.state });
  await svc(service, { [field]: key });
  await sleep(600);
  await check(service + ': same key closes', ((await state(bool)) || {}).state === 'off');
};
await overlay('thermostat_overlay_toggle', 'thermostat_entity_id', 'input_boolean.casora_thermostat_overlay', 'input_text.casora_thermostat_active_entity');
await overlay('actions_overlay_toggle', 'actions_entity_id', 'input_boolean.casora_actions_overlay', 'input_text.casora_actions_active_entity');

const all = await c.cmd({ type: 'get_states' });
const light = all.find((s) => s.entity_id.startsWith('light.') && s.state === 'on' && !Array.isArray(s.attributes.entity_id))
  || all.find((s) => s.entity_id.startsWith('light.') && s.state === 'off' && !Array.isArray(s.attributes.entity_id));
await need('a light in the test house', !!light);
const was = light.state;
atFinish(async () => {
  const c2 = await ws();
  await c2.cmd({ type: 'call_service', domain: 'light', service: was === 'on' ? 'turn_on' : 'turn_off', target: { entity_id: light.entity_id } }).catch(() => null);
  c2.close();
});
await svc('light_smart_toggle', { light_entity: light.entity_id });
await sleep(1500);
const mid = (await state(light.entity_id)).state;
await check('light toggle switches the lamp', mid !== was, { was, now: mid });
await svc('light_smart_toggle', { light_entity: light.entity_id });
await sleep(1500);
await check('light toggle switches it back', (await state(light.entity_id)).state === was);
if (was === 'on') await check('light toggle remembered the lamp (scene)', !!(await state('scene.casora_restore_' + light.entity_id.replace('.', '_'))));

const helper = 'input_boolean.casora_restart_confirm_1';
const button = all.find((s) => s.entity_id.startsWith('button.'));
if (button && (await state(helper))) {
  await svc('restart_toggle', { button_entity: button.entity_id, helper_entity: helper });
  await sleep(600);
  await check('restart toggle: first tap asks to confirm', (await state(helper)).state === 'on');
  await c.cmd({ type: 'call_service', domain: 'input_boolean', service: 'turn_off', target: { entity_id: helper } });
}

// 5. Dashboard look: the installation design on <html>, without an HA theme
const dash = (await casoraDashboards()).find((d) => !d.mobile);
const { page } = await open({ dark: true, theme: '' });
const go = async () => {
  if (dash) await dashboard(page, dash.url + '/0');
  else await ready(page, '/casora-studio', () => !!window.casoraTheme);
  await page.evaluate(() => window.casoraTheme && window.casoraTheme.ready);
};
await go();
const prev = await page.evaluate(() => (window.casoraTheme ? window.casoraTheme.design() : undefined));
atFinish(async () => {
  const c2 = await ws();
  if (prev !== undefined) await c2.cmd({ type: 'casora/theme/set', design: prev }).catch(() => null);
  c2.close();
});
await c.cmd({ type: 'casora/theme/set', design: 'Casora' });
await page.waitForFunction(() => window.casoraTheme && window.casoraTheme.active(document.querySelector('home-assistant').hass) === 'Casora', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const look = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  const cs = getComputedStyle(document.documentElement);
  return { active: window.casoraTheme && window.casoraTheme.active(h), uix: cs.getPropertyValue('--uix-theme').trim(),
    layout: cs.getPropertyValue('--casora-popup-layout').trim(), bg: cs.getPropertyValue('--primary-background-color').trim(),
    registered: !!(h.themes.themes && h.themes.themes.Casora) };
});
await check('Casora design applied in the browser', look.active === 'Casora' && look.uix === 'Casora' && look.layout === 'soft', look);
await check('design known to UIX by name (browser copy of the theme list)', look.registered);
const want = got.theme.modes.dark['primary-background-color'] || got.theme['primary-background-color'];
await check('dark background from the design', !want || look.bg.replace(/\s/g, '') === String(want).replace(/\s/g, ''), { want, got: look.bg });
await shot('home_dunkel');
c.close();
await finish();
