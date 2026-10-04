// @zustand: arbeit
// Gemeldet: Das Licht-Popup war leer, wenn die Mitglieder der Lichtgruppe fehlten
// (umbenannt/gelöscht). Erwartet: das Popup zeigt immer mindestens eine Zeile – notfalls
// die Gruppe selbst. Fehlende Mitglieder werden nur im Browser „entfernt“.
import { open, casoraDashboard, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_light"/.test(JSON.stringify(d.config)));
await need('Casora-Dashboard mit Licht-Kachel', dash);
const view = dash.config.views.find((v) => /"casora_light"/.test(JSON.stringify(v))) || dash.config.views[0];
const { page } = await open();
await dashboard(page, dash.url + '/' + (view.path || '0'));

const light = async () => (await cards(page, 'casora_light'))[0];
const popupRows = () => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!pop) return null;
  const inner = window.__pierce('button-card, hui-tile-card, hui-entities-card', pop.shadowRoot || pop)
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return { rows: inner.length, text: (pop.shadowRoot || pop).textContent.replace(/\s+/g, ' ').trim().slice(0, 160) };
});
const openPopup = async () => {
  const t = await light();
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
  await page.waitForTimeout(2200);
};
const closePopup = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(1000); };

const t0 = await light();
await need('sichtbare Licht-Kachel', t0);
await openPopup();
const normal = await popupRows();
await check('Licht-Popup öffnet sich mit Zeilen', normal && normal.rows > 0, normal);
await closePopup();

// Alle Mitglieder der Lichtgruppe(n) fehlen lassen.
const members = await page.evaluate(() => {
  const s = document.querySelector('home-assistant').hass.states;
  return [...new Set(Object.values(s).filter((x) => x.entity_id.startsWith('light.') && Array.isArray(x.attributes.entity_id))
    .flatMap((x) => x.attributes.entity_id))];
});
if (members.length) {
  await fakeStates(page, Object.fromEntries(members.map((e) => [e, null])));
  await openPopup();
  const leer = await popupRows();
  await check(`Licht-Popup ohne Gruppenmitglieder nicht leer (${members.length} ausgeblendet)`, leer && leer.rows > 0, leer);
} else {
  console.log('  (keine Lichtgruppe mit Mitgliedern – nur Normalfall geprüft)');
}
await finish();
