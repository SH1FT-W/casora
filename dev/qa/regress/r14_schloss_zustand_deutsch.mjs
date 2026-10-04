// @zustand: stress
// Gemeldet (QA-Rundgang, Stresshaus): Im Schlösser-Popup standen rohe englische Zustände
// („Unavailable“, „Jammed“) in der deutschen Oberfläche. Erwartet: jeder Schloss-Zustand
// deutsch (Klemmt, Offline, Wird geöffnet … über window._casoraStateText), kein roher HA-Zustand.
// Zustände werden nur im Browser untergeschoben.
import { open, casoraDashboard, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /casora_popup_lock/.test(JSON.stringify(d.config)));
await need('Casora-Dashboard mit Schlösser-Kachel', dash);
const { page } = await open();
const view = dash.config.views.find((v) => /casora_popup_lock/.test(JSON.stringify(v))) || dash.config.views[0];
await dashboard(page, dash.url + '/' + (view.path || '0'), 3);

await check('Zustandstext-Helfer geladen', await page.evaluate(() => typeof window._casoraStateText === 'function'));
// Der Helfer selbst: nie der rohe englische Zustand, eigene Liste der Vorlage hat Vorrang.
const direct = await page.evaluate(() => {
  if (typeof window._casoraStateText !== 'function') return null;
  const h = document.querySelector('home-assistant').hass;
  const f = (id, s, m) => window._casoraStateText(h, { entity_id: id, state: s, attributes: {} }, m);
  return { jammed: f('lock.x', 'jammed'), unav: f('lock.x', 'unavailable'), own: f('lock.x', 'unavailable', { unavailable: 'Offline' }),
    opening: f('lock.x', 'opening'), cover: f('cover.x', 'open'), unknown: f('sensor.x', 'unknown') };
});
await check('Helfer: jammed → Klemmt, unavailable → Nicht verfügbar, eigene Liste gewinnt',
  !!direct && direct.jammed === 'Klemmt' && direct.unav === 'Nicht verfügbar' && direct.own === 'Offline'
  && direct.opening === 'Wird geöffnet…' && direct.cover === 'Geöffnet' && direct.unknown === 'Unbekannt', direct);

const locks = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((e) => e.startsWith('lock.')));
await need('mindestens 4 Schlösser', locks.length >= 4, locks);
const RAW = ['jammed', 'unavailable', 'opening', 'unknown', 'locking', 'unlocking', 'open'];
const tile = (await cards(page)).find((c) => c.t.some((t) => /^casora_(lock|popup_lock)$/.test(t)) && c.y < 900);
await need('sichtbare Schlösser-Kachel', tile, (await cards(page)).map((c) => c.t.join('+')).slice(0, 12));
const popup = async () => {
  await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h / 2);
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const out = [];
    window.__pierce('#locks .hui-row').forEach((r) => { if (r.getBoundingClientRect().width) out.push({ id: r.dataset.casoraMi || '', t: r.innerText.replace(/\s+/g, ' ').trim() }); });
    return out;
  });
};
// Erst die Schlösser des Popups lesen, dann genau denen die schwierigen Zustände geben.
const first = await popup();
const ids = first.map((r) => r.id).filter(Boolean);
await need('Schlösser-Popup mit Schlosszeilen', ids.length, first);
await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) {} });
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
await fakeStates(page, Object.fromEntries(ids.map((e, i) => [e, { state: RAW[i % RAW.length] }])));
const rows = (await popup()).map((r) => r.t);
await need('Schlösser-Popup mit Schlosszeilen', rows.length, rows);
const bad = rows.filter((t) => /\b(Unavailable|Jammed|Unknown|Opening|Open|Locking|Unlocking|Locked|Unlocked|battery)\b/.test(t));
await check('keine rohen englischen Zustände im Schlösser-Popup', !bad.length, bad);
await check('„Klemmt“ steht bei einem klemmenden Schloss', rows.some((t) => /Klemmt/.test(t)), rows);
await finish();
