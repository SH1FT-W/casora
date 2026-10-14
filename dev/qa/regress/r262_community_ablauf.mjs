// @zustand: arbeit
// Community (1.5) einmal ganz durchspielen, wie ein Nutzer im Studio:
//   1. Community-Seite: nur „Kartenwunsch einreichen …“ (kein Teilen mehr), Liste „Community-Karten“;
//      große Vorschau (Kachel/Popup) beim Antippen des Vorschaubilds, Esc schließt nur die Vorschau.
//   2. Prüf-Community-Karte: erst nicht in „Kachel hinzufügen“; „Hinzufügen“ → steht in der Auswahl und in
//      den Casora-Einstellungen (community.added); „Entfernen“ bei benutzter Kachel fragt nach, „Kacheln auch
//      entfernen“ nimmt sie aus dem Raum.
//   3. „Kartenwunsch einreichen …“ → Pflichtfelder → Vorschau → GitHub-Link „Kartenwunsch: …“ ohne Geräte-IDs,
//      mit Kennung; „Deine Kartenwünsche“ zeigt den Stand („Gebaut“).
// GitHub wird nicht aufgerufen: Links in neuen Tabs und die Suche sind im Browser abgefangen. Die Casora-Einstellungen und
// die gemerkten Wünsche werden am Ende zurückgesetzt; das Dashboard wird nicht gespeichert.
// COM_OUT=<datei>: den GitHub-Link als JSON ablegen (für einen echten Lauf gegen ein Test-Repo).
import fs from 'node:fs';
import { open, studioDashboard, studio, check, need, finish, atFinish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard', dash);
const { page, context } = await open({ width: 1440, height: 1000, theme: 'Casora' });
let suche = { total_count: 0, items: [] };
await context.route(/api\.github\.com\/search\/issues/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(suche) }));
await studio(page, dash);

const ws = (msg) => page.evaluate((m) => document.querySelector('home-assistant').hass.callWS(m), msg);
const settings0 = ((await ws({ type: 'casora/settings/get' })) || {}).settings || {};
atFinish(() => ws({ type: 'casora/settings/set', settings: settings0 }).catch(() => {}));

// Prüf-Community-Karte (wie eine mitgelieferte), Raum wählen, GitHub-Fenster abfangen.
const room = await page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals, rooms = p._state.compact.rooms;
  if (!I.TILE_TYPES.some((t) => t.id === 'casora_qa_com')) {
    I.TILE_TYPES.push(window.casoraCommunityType({ id: 'casora_qa_com', label: 'QA-Prüfkarte', template: 'casora_qa_com',
      domains: ['sensor'], community: { desc: 'Karte aus dem Prüflauf', needs: 'sensor' } }));
  }
  window.casoraCommunityOn = new Set();
  const k = Object.keys(rooms)[0];
  p._room = isNaN(Number(k)) ? k : Number(k);
  p._renderForm();
  window.__opened = [];
  window.__openedActive = [];
  // GitHub öffnet ein Link mit target=_blank; mitschreiben, ob der Klick dabei noch als Nutzeraktion galt
  // (sonst blockieren Safari und die HA-App den neuen Tab still – 14.10.).
  const click0 = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.target === '_blank') { window.__opened.push(this.href); window.__openedActive.push(!!(navigator.userActivation && navigator.userActivation.isActive)); return; }
    return click0.call(this);
  };
  window.open = (u) => { window.__opened.push(u); window.__openedActive.push(false); return null; };
  return { key: k };
});
await need('Raum', room);

const pane = () => page.evaluate(() => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (!a) return null;
  return { title: (a.querySelector('h3') || {}).textContent || '', text: a.textContent.replace(/\s+/g, ' ').slice(0, 800),
    chips: [...a.querySelectorAll('.comchip')].map((b) => b.textContent.trim()), picks: a.querySelectorAll('.askpick').length,
    inputs: a.querySelectorAll('.comin').length, warn: (a.querySelector('.fieldwarn') || {}).textContent || '' };
});
const inPane = (fn, arg) => page.evaluate(([src, arg]) => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  return new Function('a', 'arg', src)(ps[ps.length - 1], arg);
}, [fn, arg]);
const ok = () => inPane("a.querySelector('.askacts button:last-child').click()");
const chip = (txt) => inPane("[...a.querySelectorAll('.comchip')].find((b) => b.textContent.indexOf(arg) >= 0).click()", txt);
const qa = () => inPane("a.querySelector('.comchip[data-com=\"casora_qa_com\"]').click()");
const fill = (i, v) => inPane("const x = a.querySelectorAll('.comin')[arg[0]]; x.value = arg[1]; x.dispatchEvent(new Event('input', { bubbles: true }));", [i, v]);
const wait = (ms = 900) => page.waitForTimeout(ms);
// Ohne await: der Dialog bleibt offen, bis der Test ihn bedient (beim Schließen des Browsers nicht als Fehler werten).
const community = async () => { page.evaluate(() => window.__panel()._comCatalog()).catch(() => {}); await wait(1800); return pane(); };
const pickable = () => page.evaluate(() => window.__casoraPanelInternals.TILE_TYPES
  .filter((t) => !t.hidden && (!t.onlyIf || t.onlyIf(window.__panel()._hass))).some((t) => t.id === 'casora_qa_com'));
const stored = async () => ((((await ws({ type: 'casora/settings/get' })) || {}).settings || {}).community || {}).added || [];

// 1. Community-Seite
let s = await community();
await check('Community-Seite offen, nur Kartenwunsch als Weg', s && /Community/.test(s.title) && s.chips.some((c) => /Kartenwunsch/.test(c))
  && !/teilen/i.test(s.text), s);
await check('Prüfkarte in der Liste mit „Hinzufügen“ und Integrations-Hinweis', s && /QA-Prüfkarte/.test(s.text) && /Braucht/.test(s.text)
  && s.chips.includes('Hinzufügen'), s && s.text);
await check('Vor dem Hinzufügen nicht in „Kachel hinzufügen“', !(await pickable()));

// Große Vorschau (Mähroboter hat Kachel- und Popup-Bild): Antippen öffnet sie, Esc schließt nur die Vorschau.
const lb = async () => page.evaluate(() => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane'); const a = ps[ps.length - 1];
  const l = a && a.querySelector('.comlb');
  return l ? { segs: [...l.querySelectorAll('.comseg button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')), src: (l.querySelector('img') || {}).src || '' } : null;
});
await inPane("a.querySelector('.comrow.card button.comzoom').click()");
await wait(1200);
let v = await lb();
await check('Vorschau groß: Kachel aktiv, Umschalter Kachel/Popup', v && /community\/casora_lawn_mower\.webp$/.test(v.src) && v.segs.join() === 'Kachel*,Popup', v);
const xm = await inPane("const x = a.querySelector('.comlb .comx'), b = x.getBoundingClientRect(), i = x.querySelector('ha-icon').getBoundingClientRect(); return [Math.round(i.x + i.width / 2 - b.x - b.width / 2), Math.round(i.y + i.height / 2 - b.y - b.height / 2)];");
await check('Schließen-× mittig im Kreis', xm && Math.abs(xm[0]) <= 1 && Math.abs(xm[1]) <= 1, xm);
await inPane("[...a.querySelectorAll('.comlb .comseg button')].find((b) => b.textContent === 'Popup').click()");
await wait(500);
v = await lb();
await check('Umschalter zeigt das Popup-Bild', v && /casora_lawn_mower-popup\.webp$/.test(v.src), v);
await page.keyboard.press('Escape');
await wait(500);
s = await pane();
await check('Esc schließt nur die Vorschau, Community bleibt offen', !(await lb()) && s && /Community/.test(s.title), s && s.title);
await check('Knopf „Popup ansehen“ sichtbar', await inPane("const b = [...a.querySelectorAll('.comlink')].find((x) => /Popup ansehen/.test(x.textContent)); return !!b && b.style.display !== 'none';"));

// 2. Hinzufügen
await qa();
await wait(1800);
s = await pane();
await check('Nach „Hinzufügen“: in der Auswahl', await pickable());
await check('Gemerkt in den Casora-Einstellungen', (await stored()).includes('casora_qa_com'), await stored());
await check('Knopf heißt jetzt „Entfernen“', s && s.chips.includes('Entfernen'), s && s.chips);
await check('Bestätigung in der Seite (nicht unter dem Weichzeichner)', s && /steht jetzt in „Kachel hinzufügen“/.test(s.text)
  && await inPane("return !!a.querySelector('.comrow.card .comflash')"), s && s.text);

// Entfernen bei benutzter Kachel: nachfragen, „Kacheln auch entfernen“.
await page.evaluate((k) => { window.__panel()._state.compact.rooms[k].tiles.push({ type: 'custom:button-card', template: 'casora_qa_com', entity: 'sensor.qa' }); }, room.key);
await qa();
await wait(1200);
s = await pane();
await check('Rückfrage: Kacheln behalten oder mit entfernen', s && s.picks === 2 && /1 Kachel/.test(s.text), s);
await inPane("a.querySelectorAll('.askpick')[1].click()");
await ok();
await wait(1800);
const left = await page.evaluate((k) => window.__panel()._state.compact.rooms[k].tiles.filter((t) => t.template === 'casora_qa_com').length, room.key);
await check('Kachel aus dem Raum entfernt', left === 0, left);
await check('Nicht mehr in der Auswahl und nicht mehr gemerkt', !(await pickable()) && !(await stored()).includes('casora_qa_com'), await stored());
s = await pane();
await check('Bestätigung nach dem Entfernen in der Seite', s && /Die Kacheln sind entfernt/.test(s.text), s && s.text);
await page.evaluate(() => { const ps = window.__panel().shadowRoot.querySelectorAll('.askpane'); const a = ps[ps.length - 1]; if (a) a.querySelector('.askacts button:last-child').click(); });
await wait(600);

// 3. Kartenwunsch
const mine0 = await page.evaluate(() => document.querySelector('home-assistant').hass.connection.sendMessagePromise({ type: 'frontend/get_user_data', key: 'casora_community_wishes' }));
atFinish(() => page.evaluate((v) => document.querySelector('home-assistant').hass.connection.sendMessagePromise({ type: 'frontend/set_user_data', key: 'casora_community_wishes', value: v }),
  (mine0 && mine0.value) || null).catch(() => {}));
s = await community();
await chip('Kartenwunsch');
await wait();
s = await pane();
await check('Wunsch-Formular offen', s && s.inputs >= 4, s);
await fill(0, 'Prüfgerät QA');
const ent = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).find((k) => k.startsWith('sensor.')));
await inPane("const i = a.querySelector('.combo input'); i.focus(); i.value = arg; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur();", ent);
await wait(500);
await fill(1, 'Zustand und Wert');
await ok();
await wait();
s = await pane();
await check('Vorschau „Das wird öffentlich“', s && /öffentlich|public/i.test(s.title), s);
const preview = await inPane("return (a.querySelector('textarea') || {}).value || ''");
// Echter Klick (nicht per Skript), damit der Browser ihn als Nutzeraktion zählt.
const okAt = await inPane("const r = a.querySelector('.askacts button:last-child').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };");
await page.mouse.click(okAt.x, okAt.y);
await wait(1200);
const wishUrl = await page.evaluate(() => window.__opened[window.__opened.length - 1] || '');
const wishActive = await page.evaluate(() => window.__openedActive[window.__openedActive.length - 1]);
await check('GitHub öffnet direkt im Klick (Nutzeraktion noch aktiv, kein Popup-Blocker)', wishActive === true, wishActive);
const wu = wishUrl ? new URL(wishUrl) : null;
const wBody = wu ? wu.searchParams.get('body') : '';
await check('GitHub-Link „Kartenwunsch: Prüfgerät QA“ mit Vorschau-Text', wu && wu.searchParams.get('title') === 'Kartenwunsch: Prüfgerät QA' && wBody === preview, wu && wu.searchParams.get('title'));
await check('Wunsch ohne Geräte-ID, mit Kennung', wBody && wBody.indexOf(ent) < 0 && /sensor\.<geraet>/.test(wBody) && /<!-- casora-id:[a-z0-9]+ -->/.test(wBody), wBody && wBody.slice(-300));

// Stand des eigenen Wunschs: GitHub meldet ihn als gebaut.
suche = { total_count: 1, items: [{ number: 7, state: 'closed', html_url: 'https://github.com/SH1FT-W/casora/issues/7', comments: 0,
  labels: [{ name: 'kartenwunsch' }, { name: 'gebaut' }] }] };
s = await community();
await wait(1500);
s = await pane();
await check('„Deine Kartenwünsche“: Stand „Gebaut“ mit Issue-Nummer', s && /Deine Kartenwünsche/.test(s.text) && /Gebaut/.test(s.text) && /#7/.test(s.text), s && s.text);

// Eigenen Wunsch aus der Liste nehmen: × → Rückfrage mit „Auf GitHub öffnen“ → Entfernen → Zeile weg.
const wishes = () => inPane("return [...a.querySelectorAll('.comrow')].filter((r) => r.querySelector('.comrm')).length;");
const n0 = await wishes();
await inPane("[...a.querySelectorAll('.comrow')].filter((r) => r.querySelector('.comrm')).pop().querySelector('.comrm').click()");
await wait(1000);
s = await pane();
await check('Wunsch entfernen: Rückfrage mit „Auf GitHub öffnen“', s && /entfernen\?/.test(s.title) && /Auf GitHub öffnen/.test(s.text), s);
await ok();
await wait(2500);
await check('Wunsch ist aus „Deine Kartenwünsche“ verschwunden', (await wishes()) === n0 - 1, { n0, n: await wishes() });

if (process.env.COM_OUT) fs.writeFileSync(process.env.COM_OUT, JSON.stringify({ wish: { title: wu && wu.searchParams.get('title'), body: wBody } }, null, 1));
await finish();
