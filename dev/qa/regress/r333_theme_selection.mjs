// @zustand: arbeit
// @parallel: allein   (rewrites the themes folder, HA's default theme, the user's profile theme and the installation design; all restored at the end)
// @deckt: custom_components/casora/scripts/casora-theme.js custom_components/casora/theme.py custom_components/casora/legacy_cleanup.py custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-addons.js
// Owner report on 26.10.60b2 (update from 26.10.59): "I can't select or activate the theme, not even in the
// Studio". Since the HACS review (hacs/default#12143, point 3) Casora serves its designs itself and b2 deletes
// the old themes/casora-themes.yaml, so HA's theme list no longer has them. The profile still named a Casora
// design (the Studio of the theme-file era wrote it there) and won over every Studio choice; a Studio choice
// set the profile to HA's "default", which then showed no Casora design at all; HA's profile picker offered no
// Casora design. Seeds what 26.10.59 leaves behind (theme file with Casora's marker, HA default theme and
// profile theme "Casora", one real theme of the user's own), lets the cleanup run, then: the profile follows
// the installation, Studio › Design applies at once and after a reload, HA's profile picker lists the
// designs, picking one there applies it, a real other theme wins, "default" shows the installation design,
// HA's own "Home Assistant" theme picked there is HA's look, an old name (Hemma 2) and the "default" the Studio of
// 26.10.60b1 wrote are migrated, phone too. Needs the throwaway HA's config folder on this machine.
// Pictures: CASORA_OUT.
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboards, dashboard, ready, check, need, finish, atFinish, shot, usePage, BASE, hostConfigDir } from './lib.mjs';
import { ws, tokens } from '../ws.mjs';

const MARKER = '# Von der Casora-Integration geschrieben und bei jedem Start aktualisiert – nicht bearbeiten.';
const OWN = 'QA r333 Moonbeam';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const c = await ws();
const CFG = await hostConfigDir(c);
await need('config folder of the test HA on this machine (throwaway HA)', !!CFG && fs.existsSync(path.join(CFG, 'configuration.yaml')), CFG);
await need('themes folder included by configuration.yaml', /themes:\s*!include_dir_merge_named\s+themes/.test(fs.readFileSync(path.join(CFG, 'configuration.yaml'), 'utf8')));
const P = (f) => path.join(CFG, f);
const read = (f) => { try { return fs.readFileSync(P(f), 'utf8'); } catch (e) { return null; } };
const put = (f, text) => { if (text === null) fs.rmSync(P(f), { force: true }); else { fs.mkdirSync(path.dirname(P(f)), { recursive: true }); fs.writeFileSync(P(f), text); } };
const api = async (method, p) => {
  const { access_token } = await tokens();
  const r = await fetch(BASE + '/api/' + p, { method, headers: { Authorization: 'Bearer ' + access_token } });
  return r.status;
};
const svc = (domain, service, data = {}) => c.cmd({ type: 'call_service', domain, service, service_data: data });
const userData = async (key) => (await c.cmd({ type: 'frontend/get_user_data', key })).value;
const setUserData = (key, value) => c.cmd({ type: 'frontend/set_user_data', key, value });
const entry = (await c.cmd({ type: 'config_entries/get', domain: 'casora' }))[0];
await need('Casora set up', !!entry);
const reloadCasora = async () => { await api('POST', `config/config_entries/entry/${entry.entry_id}/reload`); await sleep(4000); };

// Everything changed here, restored at the end
const FILES = ['themes/casora-themes.yaml', 'themes/qa-r333.yaml', '.storage/casora.legacy_cleanup'];
const before = Object.fromEntries(FILES.map((f) => [f, read(f)]));
const haBefore = await c.cmd({ type: 'frontend/get_themes' });
const profileBefore = await userData('theme');
const flagBefore = await userData('casora_theme_profile');
// Installation design as saved (read only; set back over Casora's own WebSocket command)
const designBefore = (() => { try { return JSON.parse(read('.storage/casora.theme')).data.design; } catch (e) { return undefined; } })();
atFinish(async () => {
  for (const f of FILES) put(f, before[f]);
  const c2 = await ws();
  await c2.cmd({ type: 'call_service', domain: 'frontend', service: 'reload_themes', service_data: {} }).catch(() => null);
  const def = haBefore.default_theme || 'default';
  await c2.cmd({ type: 'call_service', domain: 'frontend', service: 'set_theme', service_data: { name: def } }).catch(() => null);
  await c2.cmd({ type: 'call_service', domain: 'frontend', service: 'set_theme', service_data: { name: haBefore.default_dark_theme || 'none', mode: 'dark' } }).catch(() => null);
  await c2.cmd({ type: 'frontend/set_user_data', key: 'theme', value: profileBefore ?? null }).catch(() => null);
  await c2.cmd({ type: 'frontend/set_user_data', key: 'casora_theme_profile', value: flagBefore ?? null }).catch(() => null);
  if (designBefore !== undefined) await c2.cmd({ type: 'casora/theme/set', design: designBefore }).catch(() => null);
  await c2.cmd({ type: 'persistent_notification/dismiss', notification_id: 'casora_legacy_cleanup' }).catch(() => null);
  c2.close();
});

// 1. What 26.10.59 leaves behind
const names = ['Casora', 'Casora Glas', 'Casora Nebel'];
const designs = {};
for (const n of names) designs[n] = (await c.cmd({ type: 'casora/theme/get', name: n })).theme;
// JSON is YAML: the theme file as the old version wrote it (marker line first).
put('themes/casora-themes.yaml', MARKER + '\n' + JSON.stringify(designs, null, 1) + '\n');
put('themes/qa-r333.yaml', `"${OWN}":\n  primary-color: "#123456"\n  primary-background-color: "#0a1b2c"\n`);
await svc('frontend', 'reload_themes');
await svc('frontend', 'set_theme', { name: 'Casora' });
await svc('frontend', 'set_theme', { name: 'Casora', mode: 'dark' });
await c.cmd({ type: 'casora/theme/set', design: 'Casora' });
await setUserData('theme', { theme: 'Casora' });
await setUserData('casora_theme_profile', null);
let ha = await c.cmd({ type: 'frontend/get_themes' });
await need('old theme file loaded by HA', names.every((n) => ha.themes[n]) && !!ha.themes[OWN], Object.keys(ha.themes));
put('.storage/casora.legacy_cleanup', null);
await reloadCasora();
ha = await c.cmd({ type: 'frontend/get_themes' });
await check('cleanup removed the old theme file', read('themes/casora-themes.yaml') === null);
await check('HA no longer has the Casora designs as themes, the own theme stays', names.every((n) => !ha.themes[n]) && !!ha.themes[OWN], Object.keys(ha.themes));

// 2. Dashboard: the profile follows the installation, all designs are in the browser's theme list
const dashes = await casoraDashboards();
const dash = dashes.find((d) => !d.mobile);
await need('Casora dashboard', !!dash);
const { page } = await open({ themeSync: true, theme: 'Casora' });
const look = () => page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  const CT = window.casoraTheme;
  const cs = getComputedStyle(document.documentElement);
  const a = CT.active(h);
  const want = a ? CT.vars(CT.theme(a), h.themes.darkMode)['--primary-background-color'] : null;
  return { profile: h.selectedTheme && h.selectedTheme.theme, design: CT.design(), active: a, haTheme: h.themes.theme,
    list: Object.keys(h.themes.themes || {}), attr: document.documentElement.hasAttribute('data-casora-design'),
    bg: cs.getPropertyValue('--primary-background-color').trim(), want, uix: cs.getPropertyValue('--uix-theme').trim() };
});
const until = async (fn, ms = 15000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await look(); if (fn(v)) return v; await sleep(400); } return v; };
await dashboard(page, dash.url + '/0');
let v = await until((x) => x.profile === '' && x.list.includes('Casora Nebel'));
await check('profile "Casora" of the theme-file era = installation design: stays named in the profile', v.profile === 'Casora', v.profile);
await check('dashboard shows the installation design Casora', v.active === 'Casora' && v.attr && v.bg === v.want && v.uix === 'Casora', v);
await check('all designs in the browser\'s theme list, own theme kept', names.every((n) => v.list.includes(n)) && v.list.includes(OWN), v.list);
await shot('1_dashboard_casora');

// 3. Studio › Design: Casora Nebel applies at once and after a reload
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && p._built); });
await page.waitForTimeout(2000);
await page.evaluate(() => window.__panel()._casoraShowDesign());
await page.waitForTimeout(1200);
const clicked = await page.evaluate(() => {
  const card = window.__panel().shadowRoot.querySelector('.casora-lookcard[data-theme="Casora Nebel"]');
  if (card) card.click();
  return !!card;
});
await check('Studio offers Casora Nebel', clicked);
v = await until((x) => x.active === 'Casora Nebel' && x.bg === x.want);
await check('Studio pick applies at once (Studio)', v.design === 'Casora Nebel' && v.active === 'Casora Nebel' && v.bg === v.want && v.uix === 'Casora', v);
await shot('2_studio_nebel');
await dashboard(page, dash.url + '/0');
v = await until((x) => x.active === 'Casora Nebel' && x.bg === x.want);
await check('Studio pick shown on the dashboard after a reload, and named in the profile', v.active === 'Casora Nebel' && v.bg === v.want && v.profile === 'Casora Nebel', v);
await shot('3_dashboard_nebel');

// 4. HA's profile picker lists the designs; picking one there applies it
await ready(page, '/profile', () => window.__pierce('ha-theme-picker').length > 0);
await page.waitForTimeout(1500);
const items = await page.evaluate(() => window.__pierce('ha-theme-picker')[0]._getItems().map((x) => x.id));
await check('profile picker lists the Casora designs and the own theme', names.every((n) => items.includes(n)) && items.includes(OWN), items);
const pickProfile = (name) => page.evaluate((n) => {
  window.__pierce('ha-theme-picker')[0].dispatchEvent(new CustomEvent('value-changed', { detail: { value: n }, bubbles: true, composed: true }));
}, name);
await pickProfile('Casora Glas');
v = await until((x) => x.active === 'Casora Glas' && x.bg === x.want);
await check('profile pick Casora Glas applies (HA applies it too)', v.profile === 'Casora Glas' && v.active === 'Casora Glas' && v.haTheme === 'Casora Glas' && v.bg === v.want, v);
await shot('4_profile_glas');
await dashboard(page, dash.url + '/0');
v = await until((x) => x.active === 'Casora Glas');
await check('profile pick kept after a reload', v.active === 'Casora Glas' && (await userData('theme') || {}).theme === 'Casora Glas', v);

// 5. A real theme of the user's own wins, also HA's own "Home Assistant" picked deliberately
await ready(page, '/profile', () => window.__pierce('ha-theme-picker').length > 0);
await pickProfile(OWN);
v = await until((x) => x.profile === OWN && !x.attr);
await check('own HA theme wins (no Casora design over it)', v.active === '' && !v.attr && v.bg === '#0a1b2c', v);
await shot('5_profile_own_theme');
await pickProfile('default');
v = await until((x) => x.profile === 'default' && !x.attr);
await check('"Home Assistant" picked in the profile: HA\'s look, no Casora design', v.active === '' && !v.attr, v);

// 5b. "default" written by the Studio of 26.10.60b1 (owner's beta path): migrated once per user
await setUserData('casora_theme_profile', null);
await dashboard(page, dash.url + '/0');
v = await until((x) => x.profile === '' && x.active === 'Casora Nebel');
await check('"default" of 26.10.60b1 → Backend-selected once, installation design shown', v.profile === '' && v.active === 'Casora Nebel' && v.attr, v);

// 6. An old name in the profile (Hemma 2) is migrated and does not hide the Studio's design
await setUserData('theme', { theme: 'Hemma 2' });
v = await until((x) => x.profile === '' && x.active === 'Casora Nebel');
await check('old profile name Hemma 2 → Backend-selected, installation design shown', v.profile === '' && v.active === 'Casora Nebel', v);

// 7. Studio pick also when the profile names another design: the profile follows the installation
await setUserData('theme', { theme: 'Casora Glas' });
await until((x) => x.active === 'Casora Glas');
await page.evaluate(() => window.casoraTheme.set('Casora'));
v = await until((x) => x.active === 'Casora' && x.profile === '');
await check('Studio pick over a profile design: the profile takes the pick, Casora shown', v.active === 'Casora' && v.profile === 'Casora' && v.bg === v.want, v);

// 8. Phone
const phone = dashes.find((d) => d.mobile) || dash;
const m = await open({ themeSync: true, theme: '', mobile: true, width: 390, height: 844, scale: 3 });
usePage(m.page);
await dashboard(m.page, phone.url + '/0', 3);
const pv = await m.page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  const CT = window.casoraTheme;
  return { active: CT.active(h), attr: document.documentElement.hasAttribute('data-casora-design'),
    list: Object.keys(h.themes.themes || {}) };
});
await check('phone shows the installation design', pv.active === 'Casora' && pv.attr && names.every((n) => pv.list.includes(n)), pv);
await shot('6_phone');
c.close();
await finish();
