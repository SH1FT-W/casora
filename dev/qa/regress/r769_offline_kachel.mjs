// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js#casoraTileOffline,casoraOfflineHtml,casora-ago
// Wanted (V2, 14.11.2026, everyday-use round): a device that is unavailable looked exactly like „Aus“ (camera
// „Offline“ grey beside Apple TV „Aus“, PlayStation „Nicht verfügbar“ the same). Now every device tile that is
// unavailable shows „Offline · seit 2 Std.“ in the warning colour with a dashed rim and no switch; an „Aus“ tile stays
// as it was. Desktop and phone. The states are only changed in the browser.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => JSON.stringify(d.config).includes('"casora_media"'));
await need('Casora-Dashboard mit Medien-Kacheln', dash);
const has = (v, t) => JSON.stringify(v).includes(`"${t}"`);
const view = dash.config.views.find((v) => has(v, 'casora_media') && has(v, 'casora_light')) || dash.config.views.find((v) => has(v, 'casora_media'));

const read = (pg) => pg.evaluate(() => window.__pierce('button-card').filter((b) => {
  const c = b._config || {}; const r = b.getBoundingClientRect();
  return r.width > 0 && typeof c.entity === 'string' && /^(light|media_player|switch|fan|climate|cover)\./.test(c.entity)
    && [].concat(c.template || []).some((t) => /^casora_(light|media|switch|fan|air_purifier|thermostat|cover)$/.test(t));
}).map((b) => {
  const sr = b.shadowRoot; const card = sr.querySelector('ha-card'); const st = sr.querySelector('#state'); const tg = sr.querySelector('#toggle');
  const cs = getComputedStyle(card);
  return { entity: b._config.entity, state: st ? st.innerText.replace(/\s+/g, ' ').trim() : '', outline: cs.outlineStyle,
    stateColor: st ? getComputedStyle(st).color : '', toggle: !!(tg && getComputedStyle(tg).display !== 'none' && tg.getBoundingClientRect().width > 0) };
}));

for (const mobile of [false, true]) {
  const where = mobile ? 'Handy' : 'Desktop';
  const { page } = mobile ? await open({ width: 393, height: 852, mobile: true, dark: false }) : await open({ dark: false });
  usePage(page);
  if (mobile) {
    await need('Handy-Dashboard', dash.phone);
    await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);
    const room = 'room_' + (view.path || '');
    await page.evaluate((f) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: f } })), room);
    await page.waitForTimeout(2000);
  } else await dashboard(page, dash.url + '/' + (view.path || '0'));
  const before = await read(page);
  await need(`${where}: Geräte-Kacheln`, before.length >= 2, before.length);
  const victim = before.find((t) => /^media_player\./.test(t.entity)) || before[0];
  const light = before.find((t) => /^light\./.test(t.entity) && t.entity !== victim.entity);
  const plain = before.find((t) => t !== victim && t !== light);
  const ago = new Date(Date.now() - 2 * 3600 * 1000 - 5 * 60000).toISOString();
  const patch = { [victim.entity]: { state: 'unavailable', last_changed: ago } };
  if (light) patch[light.entity] = { state: 'unknown', last_changed: ago };
  await fakeStates(page, patch, { sticky: true });
  await page.waitForTimeout(1200);
  const after = await read(page);
  for (const id of Object.keys(patch)) {
    const t = after.find((x) => x.entity === id);
    if (!t) { console.log(`  info   ${where}: ${id} nicht sichtbar`); continue; }
    await check(`${where}: ${id} (${patch[id].state}) zeigt „Offline · seit 2 Std.“`, /^Offline · seit 2 Std\.$/.test(t.state) || (mobile && t.state === 'Offline'), t.state);
    await check(`${where}: ${id} gestrichelter Rand`, t.outline === 'dashed', t.outline);
    await check(`${where}: ${id} kein Schalter`, !t.toggle);
  }
  const p2 = plain && after.find((x) => x.entity === plain.entity);
  if (p2) {
    await check(`${where}: ${p2.entity} (verfügbar) ohne Offline-Rand`, p2.outline !== 'dashed' && !/Offline/.test(p2.state), p2);
    const v = after.find((x) => x.entity === victim.entity);
    if (v) await check(`${where}: Offline-Zustand in anderer Farbe als ein normaler Zustand`, v.stateColor !== p2.stateColor, [v.stateColor, p2.stateColor]);
  }
}
await finish();
