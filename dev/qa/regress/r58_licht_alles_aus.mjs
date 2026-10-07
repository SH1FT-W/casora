// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026): Im Licht-Popup eines Raums ein Knopf „Alles aus“, der alle Lichter dieses
// Raums ausschaltet (nur Licht). Erwartet im Casora-Look (Tablet 1024×768, hell): der Knopf steht
// unter „x von y An“, ist bedienbar, solange ein Licht an ist, und ruft light.turn_off genau für die
// eingeschalteten Lichter des Raums auf. Der Dienstaufruf wird im Browser abgefangen – am Test-HA
// schaltet nichts.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1 && /light/.test(JSON.stringify(d.config.views.slice(1))));
await need('Casora-Dashboard mit Raum und Beleuchtungs-Badge', dash);
const { page } = await open({ width: 1024, height: 768, dark: false, theme: 'Casora' });
let hit = null;
for (const v of dash.config.views.slice(1)) {
  if (!/light\./.test(JSON.stringify(v))) continue;
  await dashboard(page, dash.url + '/' + (v.path || '0'), 3);
    const at = await page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group')
      && x.getBoundingClientRect().width > 0);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!at) continue;
  // Alle Lichter im Browser einschalten (am Test-HA ändert sich nichts), damit der Knopf bedienbar ist.
  const lights = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => id.startsWith('light.')));
  await fakeStates(page, Object.fromEntries(lights.map((id) => [id, { state: 'on' }])), { sticky: true });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const ha = document.querySelector('home-assistant');
    window.__qaCalls = [];
    ha.hass.callService = (d, s, data, target) => { window.__qaCalls.push([d, s, target && target.entity_id]); return Promise.resolve(); };
  });
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  await page.waitForTimeout(2500);
  hit = await page.evaluate(() => {
    const b = window.__pierce('.lps-off').find((x) => x.getBoundingClientRect().width > 0);
    if (!b) return { btn: false };
    const s = window.__pierce('.lps-s').find((x) => x.getBoundingClientRect().width > 0);
    const spec = JSON.parse(b.getAttribute('data-lps-tap'));
    const st = document.querySelector('home-assistant').hass.states;
    return { btn: true, dis: b.classList.contains('dis'), text: b.textContent.trim(), below: !!s && b.getBoundingClientRect().top > s.getBoundingClientRect().bottom,
      ids: spec.ids, on: spec.ids.filter((id) => st[id] && st[id].state === 'on'), at: (() => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })() };
  });
  if (hit.btn && hit.on.length) break;
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
}
await need('Raum-Licht-Popup mit eingeschaltetem Licht', hit && hit.btn && hit.on.length, hit);
await check('Knopf „Alles aus“ unter der Zustandszeile', hit.text === 'Alles aus' && hit.below, hit);
await check('Knopf bedienbar, solange ein Licht an ist', !hit.dis, hit);
await check('nur Lichter im Knopf', hit.ids.every((id) => id.startsWith('light.')), hit.ids);
await page.mouse.click(hit.at.x, hit.at.y);
await page.waitForTimeout(1500);
const calls = await page.evaluate(() => window.__qaCalls);
const off = calls.find((c) => c[0] === 'light' && c[1] === 'turn_off');
await check('light.turn_off für die eingeschalteten Lichter', off && JSON.stringify([...off[2]].sort()) === JSON.stringify([...hit.on].sort()), { calls, on: hit.on });
await check('sonst kein Dienstaufruf', calls.length === 1, calls);
await finish();
