// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraLightScope,_casoraHomeLightVars,casoraLightTally
// Test round 26.11.2026 (u05-04, d02-01): on Home (qa-arbeit, desktop 1440) the badge „Beleuchtung“ said „1 an“, the
// tile „Beleuchtung“ right below it „4 an“ (popup „4 von 18 Lampen an“, lamps of rooms without a light badge). Badge
// and tile with the same name say the same (wortliste §2, 14.11.2026). Reads both and the tile's config; nothing is
// switched or saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => d.url === (process.env.CASORA_QA_DASH || 'qa-arbeit')) || await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
const v0 = dash.config.views[0];
const o = await open({ width: 1440, height: 900, dark: false });
const pg = o.page; usePage(pg);
await dashboard(pg, dash.url + '/' + (v0.path || '0'), 3);
await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
await pg.waitForTimeout(2000);
const r = await pg.evaluate(() => {
  const t = (x) => (x && x.shadowRoot && x.shadowRoot.querySelector('ha-card') ? x.shadowRoot.querySelector('ha-card').innerText : '').replace(/\s+/g, ' ').trim();
  const all = window.__pierce('button-card').filter((x) => x.getBoundingClientRect().width > 20);
  const tpl = (x) => [].concat((x._config || {}).template || []);
  const badge = all.find((x) => tpl(x).includes('casora_badge_light_group'));
  const tiles = all.filter((x) => tpl(x).includes('casora_light') && /^Beleuchtung/.test(t(x)));
  return { badge: t(badge), tiles: tiles.map((x) => ({ text: t(x), entity: x._config.entity, variables: x._config.variables || null })),
    home: window._casoraHomeLightVars ? window._casoraHomeLightVars() : null };
});
console.log(JSON.stringify(r, null, 1));
await need('badge and a light tile named Beleuchtung on Home', r.badge && r.tiles.length, r);
const count = (s) => String(s).replace(/^Beleuchtung\s*/, '');
for (const tl of r.tiles) await check('tile „Beleuchtung“ says what the badge says', count(tl.text) === count(r.badge), { badge: r.badge, tile: tl });
await finish();
