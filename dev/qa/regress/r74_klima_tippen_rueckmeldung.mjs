// @zustand: arbeit
// @parallel: ui
// Gemeldet 07.10.2026 (1.1.0, iPad/iPhone): Fußbodenheizung bzw. Klima hat kein Tipp-Feedback.
// Ursache: Die Thermostat-Kachel (auch mit Fußbodenheizungs-Popup) gab beim Antippen kein haptic –
// Licht und die übrigen Kacheln schon. Plus/Minus der Zieltemperatur (Thermostat- und
// Fußbodenheizungs-Popup) hatten nur Hover, beim Drücken änderte sich nichts (Licht-Popup: kleiner
// werden). Prüft im Casora-Look: Antippen der Kachel löst haptic aus, Drücken von Plus/Minus
// verkleinert den Knopf sichtbar.
// Geändert 10.10.2026 (1.3): Das Fußbodenheizungs-Popup für mehrere Räume hat keine gemeinsame
// Zieltemperatur mehr (Räume werden einzeln eingestellt, r246). Plus/Minus prüft der Einzelraum.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1180, height: 820, dark: false, theme: 'Casora' });
await page.addInitScript(() => { window.__haptic = []; window.addEventListener('haptic', (e) => window.__haptic.push(e.detail), true); });

const states = () => page.evaluate(() => document.querySelector('home-assistant').hass.states);
const svc = (d, s, data) => page.evaluate(([d, s, data]) => document.querySelector('home-assistant').hass
  .callService(d, s, data).then(() => 1, () => 0), [d, s, data]);

// Kachel suchen; fehlt ihr ein Gerät, bekommt sie ein Thermostat mit Heizen (nur in diesem Browser).
async function findTile(fbh) {
  for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
    await dashboard(page, dash.url + '/' + v, 3);
    const i = await page.evaluate((fbh) => {
      const st = document.querySelector('home-assistant').hass.states;
      const heat = Object.keys(st).filter((e) => e.startsWith('climate.') && (st[e].attributes.hvac_modes || []).includes('heat')
        && !(st[e].attributes.entity_id || []).length);
      return window.__pierce('button-card').findIndex((b) => {
        const t = [].concat((b._config || {}).template || []);
        if (!t.includes('casora_thermostat') || t.includes('casora_popup_fbh') !== fbh || b.getBoundingClientRect().width < 60) return false;
        // Gruppe (1.3 ohne Plus/Minus) bzw. ohne Gerät: ein einzelnes Thermostat unterschieben.
        const e = st[b._config.entity];
        const grp = e && ((e.attributes.member_entities || []).length || (e.attributes.entity_id || []).length);
        if ((!b._config.entity || grp) && heat.length) b.setConfig({ ...b._config, entity: heat.find((h) => !(st[h].attributes.member_entities || []).length) || heat[0] });
        return !!b._config.entity;
      });
    }, fbh);
    if (i > -1) return i;
  }
  return -1;
}

async function run(name, fbh, sel) {
  const i = await findTile(fbh);
  if (i < 0) { console.log(`  info   ${name}: keine Kachel im Testhaus`); return; }
  // Alle Thermostate auf Heizen, damit auch das Fußbodenheizungs-Popup Plus/Minus zeigt (Räume an).
  const st0 = await states();
  const ids = Object.keys(st0).filter((e) => e.startsWith('climate.') && (st0[e].attributes.hvac_modes || []).includes('heat'));
  for (const id of ids) {
    const before = st0[id];
    atFinish(async () => {
      if (before.attributes.temperature != null) await svc('climate', 'set_temperature', { entity_id: id, temperature: before.attributes.temperature });
      await svc('climate', 'set_hvac_mode', { entity_id: id, hvac_mode: before.state });
    });
    await svc('climate', 'set_hvac_mode', { entity_id: id, hvac_mode: 'heat' });
  }
  await page.waitForTimeout(1200);
  const p = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height - 30 }; }, i);
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__haptic = []; });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  const hap = await page.evaluate(() => window.__haptic.slice());
  await check(`${name}: Antippen der Kachel gibt haptisches Feedback`, hap.length > 0, hap);
  const btns = await stable(page, (sel) => window.__pierce(sel).map((b) => { const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, dis: b.classList.contains('dis') }; })
    .filter((b) => b.w > 0 && !b.dis), sel, { max: 5000 });
  await check(`${name}: Plus/Minus im Popup sichtbar`, btns && btns.length > 0, btns);
  if (btns && btns.length) {
    const b = btns[0];
    const tf = () => page.evaluate(({ x, y, sel }) => { const k = window.__pierce(sel).find((e) => { const r = e.getBoundingClientRect();
      return Math.abs(r.x + r.width / 2 - x) < 2 && Math.abs(r.y + r.height / 2 - y) < 2; });
      return k ? getComputedStyle(k).transform : null; }, { ...b, sel });
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(250);
    const rest = await tf();
    await page.mouse.down();
    await page.waitForTimeout(250);
    const down = await tf();
    // Weg vom Knopf loslassen, damit nichts eingestellt wird.
    await page.mouse.move(2, 2);
    await page.mouse.up();
    await check(`${name}: Drücken von Plus/Minus verändert den Knopf sichtbar`, rest !== down && /matrix/.test(down || ''), { rest, down });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}

// Gruppe (Ganzes Haus, 1.3): keine gemeinsame Zieltemperatur, Räume einzeln.
async function haus() {
  let i = -1;
  for (const v of (dash.config.views || []).map((x, k) => x.path || String(k))) {
    await dashboard(page, dash.url + '/' + v, 3);
    i = await page.evaluate(() => {
      const st = document.querySelector('home-assistant').hass.states;
      const grp = Object.keys(st).find((e) => e.startsWith('climate.') && (st[e].attributes.member_entities || []).length > 1);
      return grp ? window.__pierce('button-card').findIndex((b) => {
        const t = [].concat((b._config || {}).template || []);
        if (!t.includes('casora_popup_fbh') || b.getBoundingClientRect().width < 60) return false;
        if (b._config.entity !== grp) b.setConfig({ ...b._config, entity: grp });
        return true;
      }) : -1;
    });
    if (i > -1) break;
  }
  if (i < 0) { console.log('  info   Haus: keine Fußbodenheizungs-Gruppe im Testhaus'); return; }
  const members = await page.evaluate((i) => { const b = window.__pierce('button-card')[i];
    return document.querySelector('home-assistant').hass.states[b._config.entity].attributes.member_entities; }, i);
  // Räume an, unterschiedliche Zieltemperaturen.
  for (const [k, id] of members.entries()) {
    await svc('climate', 'set_hvac_mode', { entity_id: id, hvac_mode: 'heat' });
    await svc('climate', 'set_temperature', { entity_id: id, temperature: k % 2 ? 21 : 22 });
  }
  const p = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height - 30 }; }, i);
  await page.waitForTimeout(500);
  await page.mouse.click(p.x, p.y);
  const bar = await stable(page, () => {
    const vis = (sel) => window.__pierce(sel).filter((e) => e.getBoundingClientRect().width > 0).length;
    return { st: vis('.fb-st-b'), b: vis('.fb-tb'), rows: vis('[data-fbh-room]') };
  }, null, { max: 6000 });
  await check('Haus: keine gemeinsame Zieltemperatur (kein Plus/Minus, kein Balken), Räume als Zeilen',
    bar && bar.st === 0 && bar.b === 0 && bar.rows >= 2, bar);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}

await run('Thermostat', false, '.hp-st-b');
await run('Fußbodenheizung', true, '.fb-st-b');
await haus();
await finish();
