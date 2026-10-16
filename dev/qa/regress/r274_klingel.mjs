// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/24-klingel.js dev/casora_mock/klingel.py
// Community-Karte Reolink-Türklingel (#23) an der erfundenen Testklingel camera.testklingel_sub (dev/casora_mock/klingel.py):
//   1. Kachel: „Bereit“ (nach dem Start steht der Klingelknopf frisch auf „aus“ – das ist kein Klingeln).
//   2. Popup: Kopf, Live-Bild mit Ton-Knopf, Schnellantworten, Sirene, Verlauf aus HAs Recorder, Einstellungen.
//   3. Klingeln (Testdienst casora_mock.klingel_druecken, Knopf nur 2 s an) → Kachel „Hat geklingelt“ mit rotem
//      Punkt, auch nachdem der Knopf wieder aus ist; Popup-Kopf „Hat geklingelt“, im Verlauf oben mit „Neu“.
//   4. Ton an der Klingel aus → Hinweis unter dem Bild mit „Einschalten“.
// Die Kachel entsteht nur im Browser (nicht gespeichert); Schalter werden am Ende zurückgestellt.
import { open, casoraDashboard, dashboard, check, need, finish, stable, atFinish, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'camera.testklingel_sub';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1100, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Testklingel im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
const tok = await tokens();
const svc = (d, s, data) => fetch(BASE + '/api/services/' + d + '/' + s,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
atFinish(() => svc('switch', 'turn_on', { entity_id: 'switch.testklingel_record_audio' }));
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_reolink_doorbell', entity: id, name: 'Haustür' });
  el.classList.add('qa-r274');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, ID);
const tile = () => stable(page, () => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r274');
  const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  if (!st) return null;
  const full = st.querySelector('.sf-f');
  return { text: String((full || st).textContent || '').replace(/\s+/g, ' ').trim(), dot: !!st.querySelector('span[aria-hidden="true"]') };
}, null, { max: 10000, quiet: 800 });
const popText = () => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  const live = window.__pierce('casora-klingel-live', pop.shadowRoot)[0];
  const note = live && live.shadowRoot.querySelector('.nt');
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 2500), live: !!live,
    sound: !!(live && live.shadowRoot.querySelector('.snd')), talk: !!(live && live.shadowRoot.querySelector('.tlk')),
    note: note && !note.hidden ? note.textContent.replace(/\s+/g, ' ').trim() : '' };
}, null, { max: 12000, quiet: 1200 });
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };
const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r274').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });

let t = await tile();
await check('Kachel: „Bereit“ oder ein früheres Klingeln (kein Fehltext)', t && /^(Bereit|Aktuell|Hat geklingelt|Geklingelt vor .+)$/.test(t.text.replace(/ /g, ' ')), t);
await page.mouse.click(at.x, at.y);
let p = await popText();
await check('Popup: Live-Bild mit Ton-Knopf, ohne Sprechen (Standard aus)', p && p.live && p.sound && !p.talk, p);
await check('Popup: Schnellantworten, Sirene, Verlauf mit früherem Klingeln, Einstellungen', p && /Schnellantworten/.test(p.txt) && /Bin gleich da/.test(p.txt)
  && /Sirene/.test(p.txt) && /Verlauf/.test(p.txt) && /Hat geklingelt/.test(p.txt) && /Einstellungen/.test(p.txt), p && p.txt);
await closePop();

await svc('casora_mock', 'klingel_druecken', { dauer: 2, person: 20 });
await page.waitForTimeout(4000);
t = await tile();
await check('Klingeln: Kachel „Hat geklingelt“ mit Punkt, auch nach dem Loslassen', t && t.text === 'Hat geklingelt' && t.dot, t);
await page.mouse.click(at.x, at.y);
p = await popText();
await check('Popup: Kopf „Hat geklingelt“, im Verlauf „Neu“', p && /Hat geklingelt/.test(p.txt) && /Neu/.test(p.txt), p && p.txt);
await svc('switch', 'turn_off', { entity_id: 'switch.testklingel_record_audio' });
await page.waitForTimeout(1500);
p = await popText();
await check('Ton an der Klingel aus: Hinweis mit „Einschalten“', p && /Ton ist an der Klingel aus/.test(p.note) && /Einschalten/.test(p.note), p && p.note);
await closePop();
await finish();
