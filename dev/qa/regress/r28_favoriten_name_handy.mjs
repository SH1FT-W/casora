// @zustand: arbeit
// Wunsch (Hemma 2.2.0): „Favoriten“ am Handy umbenennen – Studio, Home › Darstellung, Feld
// „Name am Handy“. Erwartet: der Abschnitt heißt danach so, bleibt aber die Favoriten (Merkmal
// variables.favorites): kein Raum im Handy-Menü, Verknüpfung mit Home bleibt, Neuladen behält den
// Namen. Leeres Feld = wieder Standard „Favorites“. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const { page } = await open();
await studio(page, dash.url);

const setup = await page.evaluate(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  if (!p._pair || p._pair.safe === false) return { pair: false };
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => I.isHomeRoom(r, rooms));
  p._room = ri < 0 ? 0 : ri; p._sel = null;
  p._renderTabs && p._renderTabs();
  p._renderForm();
  await new Promise((r) => setTimeout(r, 900));
  const row = [...p.shadowRoot.querySelectorAll('#pane .row')].find((e) => /^(Name am Handy|Name on phone)$/i.test(((e.querySelector('label') || {}).textContent || '').trim()));
  const inp = row && row.querySelector('input');
  if (inp) inp.setAttribute('data-qa', 'handyname');
  return { pair: true, field: !!inp, placeholder: inp && inp.placeholder, value: inp && inp.value };
});
await need('Handy-Dashboard gekoppelt', setup.pair);
await check('Feld „Name am Handy“ bei Home', setup.field, setup);

const NEU = 'Qa Lieblinge';
const state = () => page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const pair = p._pair;
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => I.isHomeRoom(r, rooms));
  const link = (pair.link.links || [])[ri < 0 ? 0 : ri] || {};
  const sec = link.section != null ? pair.mobile.compact.rooms[link.section] : null;
  // Aufbauen und wieder einlesen wie beim Speichern/Neuladen.
  const cfg = I.expandMobileConfig(pair.mobile.compact, pair.mobile.scaffold, pair.mobile.extras, pair.mobile.templates, pair.mobile.chrome);
  const back = I.extractMobileConfig(cfg);
  const relink = I.linkPair(p._state, back);
  const nav = (cfg.views[0].cards || []).find((c) => c && c.type === 'custom:casora-mobile-nav');
  const ov = relink.links.find((l) => l.overview);
  return {
    name: sec && sec.name, vars: sec && sec.variables,
    navNames: nav ? nav.rooms.map((r) => r.name) : null,
    nachLaden: ov && ov.section != null ? back.compact.rooms[ov.section].name : null,
  };
});

if (setup.field) {
  await page.click('[data-qa=handyname]');
  await page.keyboard.type(NEU, { delay: 0 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(900);
  const a = await state();
  await check('Abschnitt heißt wie eingegeben', a.name === NEU, a);
  await check('Merkmal favorites gesetzt', !!(a.vars && a.vars.favorites === true), a.vars);
  await check('kein Raum im Handy-Menü', Array.isArray(a.navNames) ? !a.navNames.includes(NEU) : true, a.navNames);
  await check('nach Neuladen weiter Home-Favoriten mit eigenem Namen', a.nachLaden === NEU, a);

  await page.fill('[data-qa=handyname]', '');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(900);
  const b = await state();
  await check('leer = wieder Standard „Favorites“', b.name === 'Favorites', b);
}
await finish();
