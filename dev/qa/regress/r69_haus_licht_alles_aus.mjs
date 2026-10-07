// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026): „Alles aus“ auch im Licht-Popup für das ganze Haus (Startseite ›
// Beleuchtung), aber mit Rückfrage. Erwartet im Casora-Look (Tablet 1024×768, hell): der Knopf steht
// wie im Raum-Popup unter der Zustandszeile; Tippen fragt „Alle N Lichter im Haus ausschalten?“
// (Fokus auf „Abbrechen“). Abbrechen schaltet nichts, „Ausschalten“ ruft light.turn_off genau für die
// eingeschalteten, sichtbaren Lichter auf. Dienstaufrufe werden im Browser abgefangen.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /casora_badge_light_group|light_group_entity/.test(JSON.stringify((d.config.views || [])[0] || {})));
await need('Casora-Dashboard mit Beleuchtungs-Badge auf der Startseite', dash);
const { page } = await open({ width: 1024, height: 768, dark: false, theme: 'Casora' });
const home = dash.config.views[0];
await dashboard(page, dash.url + '/' + (home.path || '0'), 3);
const lights = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => id.startsWith('light.')));
await fakeStates(page, Object.fromEntries(lights.map((id) => [id, { state: 'on' }])), { sticky: true });
await page.waitForTimeout(800);
await page.evaluate(() => {
  window.__qaCalls = [];
  document.querySelector('home-assistant').hass.callService = (d, s, data, target) => { window.__qaCalls.push([d, s, target && target.entity_id]); return Promise.resolve(); };
});
const at = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group')
    && x.getBoundingClientRect().width > 0);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Beleuchtungs-Badge sichtbar', at);
await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
await page.waitForTimeout(2500);
const hit = await page.evaluate(async () => {
  const b = window.__pierce('.lps-off').find((x) => x.getBoundingClientRect().width > 0);
  if (!b) return { btn: false };
  const s = window.__pierce('.lps-s').find((x) => x.getBoundingClientRect().width > 0);
  const spec = JSON.parse(b.getAttribute('data-lps-tap'));
  const st = document.querySelector('home-assistant').hass.states;
  const vis = window.casoraVisibleIds ? await window.casoraVisibleIds(spec.ids, { rooms: true }) : spec.ids;
  const r = b.getBoundingClientRect();
  return { btn: true, house: spec.house === 1, dis: b.classList.contains('dis'), text: b.textContent.trim(),
    below: !!s && r.top > s.getBoundingClientRect().bottom, ids: spec.ids,
    on: vis.filter((id) => st[id] && st[id].state === 'on'), at: { x: r.x + r.width / 2, y: r.y + r.height / 2 } };
});
await need('Haus-Licht-Popup mit Knopf „Alles aus“', hit.btn && hit.house, hit);
await check('Knopf „Alles aus“ unter der Zustandszeile, bedienbar', hit.text === 'Alles aus' && hit.below && !hit.dis, hit);
await check('nur Lichter im Knopf', hit.ids.every((id) => id.startsWith('light.')) && hit.on.length > 1, hit.ids);

const dialog = () => page.evaluate(() => {
  const host = document.querySelector('.casora-askfirst');
  if (!host) return null;
  const r = host.shadowRoot;
  return { title: r.querySelector('h2').textContent, no: r.querySelector('.no').textContent, yes: r.querySelector('.yes').textContent,
    focus: r.activeElement && r.activeElement.className, p: !!r.querySelector('p') };
});
const press = (cls) => page.evaluate((c) => document.querySelector('.casora-askfirst').shadowRoot.querySelector(c).click(), cls);

// 1) Abbrechen: Rückfrage erscheint, nichts wird geschaltet.
await page.mouse.click(hit.at.x, hit.at.y);
await page.waitForTimeout(900);
let d = await dialog();
await check('Rückfrage „Alle N Lichter im Haus ausschalten?“', d && d.title === 'Alle ' + hit.on.length + ' Lichter im Haus ausschalten?', d);
await check('Knöpfe „Abbrechen“ (Fokus) und „Ausschalten“', d && d.no === 'Abbrechen' && d.yes === 'Ausschalten' && d.focus === 'no', d);
await press('.no');
await page.waitForTimeout(600);
await check('Abbrechen schaltet nichts', (await page.evaluate(() => window.__qaCalls.length)) === 0 && !(await dialog()));

// 2) Ausschalten: genau die eingeschalteten, sichtbaren Lichter.
await page.mouse.click(hit.at.x, hit.at.y);
await page.waitForTimeout(900);
d = await dialog();
await need('Rückfrage erneut', d, d);
await press('.yes');
await page.waitForTimeout(1200);
const calls = await page.evaluate(() => window.__qaCalls);
const off = calls.find((c) => c[0] === 'light' && c[1] === 'turn_off');
await check('Ausschalten: light.turn_off für alle sichtbaren eingeschalteten Lichter',
  off && JSON.stringify([...off[2]].sort()) === JSON.stringify([...hit.on].sort()), { calls, on: hit.on });
await check('sonst kein Dienstaufruf', calls.length === 1, calls);
await finish();
