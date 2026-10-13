// @zustand: arbeit
// Community (1.5) einmal ganz durchspielen, wie ein Nutzer im Studio:
//   1. Community-Seite: ohne Katalog im Repo (404) „Noch keine Karten.“ statt „GitHub nicht erreichbar“.
//   2. „Eigene Kachel teilen …“ → Kachel wählen → Name/Kurzbeschreibung → GitHub-Link: Titel „Community-Karte: …“,
//      Block ```casora-karte``` mit Platzhaltern (keine Geräte-IDs), Kennung, IssueBar-Markierung; „Deine geteilten Karten“ merkt sie.
//   3. „Kartenwunsch einreichen …“ → Pflichtfelder → Vorschau → GitHub-Link „Kartenwunsch: …“ ohne Geräte-IDs.
//   4. Katalog mit genau dieser Karte (wie die Action sie aufnimmt) → „Hinzufügen“ → Gerät zuordnen → Kachel im Raum.
// GitHub wird nicht aufgerufen: window.open, Katalog und Suche sind im Browser abgefangen; gespeichert wird nichts.
// COM_OUT=<datei>: die beiden GitHub-Links als JSON ablegen (für einen echten Lauf gegen ein Test-Repo).
import fs from 'node:fs';
import { open, studioDashboard, studio, check, need, finish, atFinish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard', dash);
const { page, context } = await open({ width: 1440, height: 1000, theme: 'Casora' });
let katalog = null;
await context.route(/raw\.githubusercontent\.com\/SH1FT-W\/casora\/main\/community\/karten\.json/, (r) =>
  katalog ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(katalog) }) : r.fulfill({ status: 404, body: '404: Not Found' }));
let suche = { total_count: 0, items: [] };
await context.route(/api\.github\.com\/search\/issues/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(suche) }));
await studio(page, dash);

// Raum mit teilbarer Kachel wählen, GitHub-Fenster abfangen.
const room = await page.evaluate(() => {
  const p = window.__panel(), C = window.casoraCommunity, rooms = p._state.compact.rooms;
  const k = Object.keys(rooms).find((x) => (rooms[x].tiles || []).some((t) => C.shareable(t)));
  if (k == null) return null;
  p._room = isNaN(Number(k)) ? k : Number(k);
  p._renderForm();
  window.__opened = [];
  window.open = (u) => { window.__opened.push(u); return null; };
  return { key: k, tiles: rooms[k].tiles.length };
});
await need('Raum mit teilbarer Kachel', room);

const pane = () => page.evaluate(() => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (!a) return null;
  return { title: (a.querySelector('h3') || {}).textContent || '', text: a.textContent.replace(/\s+/g, ' ').slice(0, 600),
    chips: [...a.querySelectorAll('.comchip')].map((b) => b.textContent.trim()), picks: a.querySelectorAll('.askpick').length,
    inputs: a.querySelectorAll('.comin').length, warn: (a.querySelector('.fieldwarn') || {}).textContent || '' };
});
const inPane = (fn, arg) => page.evaluate(([src, arg]) => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  return new Function('a', 'arg', src)(ps[ps.length - 1], arg);
}, [fn, arg]);
const ok = () => inPane("a.querySelector('.askacts button:last-child').click()");
const chip = (txt) => inPane("[...a.querySelectorAll('.comchip')].find((b) => b.textContent.indexOf(arg) >= 0).click()", txt);
const fill = (i, v) => inPane("const x = a.querySelectorAll('.comin')[arg[0]]; x.value = arg[1]; x.dispatchEvent(new Event('input', { bubbles: true }));", [i, v]);
const wait = (ms = 900) => page.waitForTimeout(ms);
const community = async () => { page.evaluate(() => window.__panel()._comCatalog()); await wait(1800); return pane(); };

// 1. Community-Seite ohne Katalog
let s = await community();
await check('Community-Seite offen mit beiden Wegen', s && /Community/.test(s.title) && s.chips.length >= 2, s);
await check('Ohne Katalog: „Noch keine Karten.“ (kein „nicht erreichbar“)', s && /Noch keine Karten/.test(s.text) && !/nicht erreichbar/.test(s.text), s && s.text);

// 2. Teilen
await chip('teilen');
await wait();
s = await pane();
await check('Kachel-Auswahl zum Teilen', s && s.picks > 0, s);
await ok();
await wait();
s = await pane();
await check('Teilen-Dialog mit Name und Kurzbeschreibung', s && s.inputs === 2 && /Geteilt als|Shared as/i.test(s.text), s);
await ok();
await wait(400);
s = await pane();
await check('Ohne Kurzbeschreibung: Hinweis statt stumm', s && /Kurzbeschreibung|description/i.test(s.warn), s && s.warn);
await fill(1, 'Testkarte aus dem Prüflauf');
await ok();
await wait(1500);
const shareUrl = await page.evaluate(() => window.__opened[window.__opened.length - 1] || '');
const su = shareUrl ? new URL(shareUrl) : null;
const sTitle = su ? su.searchParams.get('title') : '', sBody = su ? su.searchParams.get('body') : '';
const block = /```casora-karte\s*\n([\s\S]*?)\n```/.exec(sBody || '');
let card = null; try { card = block && JSON.parse(block[1]); } catch (e) { /* bleibt null */ }
await check('GitHub-Link „Community-Karte: …“ ins Casora-Repo', su && /github\.com\/SH1FT-W\/casora\/issues\/new/.test(shareUrl) && /^Community-Karte: /.test(sTitle), sTitle);
await check('Karte nur mit Platzhaltern, keine Geräte-IDs', card && card.slots && card.slots.length > 0
  && !/"[a-z_]+\.[a-z0-9_]+"/.test(JSON.stringify(card).replace(/"@slot:\d+"/g, '')), card);
await check('Kennung und IssueBar-Markierung im Text', /<!-- casora-id:[a-z0-9]+ -->/.test(sBody) && /<!-- issuebar:action approve=freigegeben ready=in-pruefung decline=abgelehnt -->/.test(sBody), sBody && sBody.slice(-200));
const mine = await page.evaluate(() => document.querySelector('home-assistant').hass.connection.sendMessagePromise({ type: 'frontend/get_user_data', key: 'casora_community_shared' }));
// Die gemerkte Einreichung am Ende wieder entfernen (andere Tests sehen sonst „Deine geteilten Karten“).
const mineBefore = (mine && Array.isArray(mine.value) ? mine.value : []).filter((m) => sBody.indexOf('casora-id:' + m.id) < 0);
atFinish(() => page.evaluate((v) => document.querySelector('home-assistant').hass.connection.sendMessagePromise({ type: 'frontend/set_user_data', key: 'casora_community_shared', value: v }), mineBefore).catch(() => {}));
await check('„Deine geteilten Karten“ merkt die Einreichung', mine && Array.isArray(mine.value) && mine.value.some((m) => sBody.indexOf('casora-id:' + m.id) >= 0), mine);

// 3. Kartenwunsch
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
await ok();
await wait(1200);
const wishUrl = await page.evaluate(() => window.__opened[window.__opened.length - 1] || '');
const wu = wishUrl ? new URL(wishUrl) : null;
const wBody = wu ? wu.searchParams.get('body') : '';
await check('GitHub-Link „Kartenwunsch: Prüfgerät QA“ mit Vorschau-Text', wu && wu.searchParams.get('title') === 'Kartenwunsch: Prüfgerät QA' && wBody === preview, wu && wu.searchParams.get('title'));
await check('Wunsch ohne Geräte-ID', wBody && wBody.indexOf(ent) < 0 && /sensor\.<geraet>/.test(wBody), wBody && wBody.slice(0, 300));

// 4. Katalog mit dieser Karte → hinzufügen
katalog = { v: 1, cards: [{ id: 'k1', issue: 1, title: card ? card.name : 'X', desc: 'Testkarte aus dem Prüflauf', by: 'qa', card }] };
// GitHub meldet die eigene Einreichung als freigegeben (wie nach der Action: geschlossen, Label „freigegeben“).
suche = { total_count: 1, items: [{ number: 7, state: 'closed', html_url: 'https://github.com/SH1FT-W/casora/issues/7', comments: 1,
  labels: [{ name: 'community-karte' }, { name: 'in-pruefung' }, { name: 'freigegeben' }] }] };
s = await community();
await page.waitForTimeout(1500);
s = await pane();
await check('„Deine geteilten Karten“: Stand „Freigegeben“ mit Issue-Nummer', s && /Freigegeben/.test(s.text) && /#7/.test(s.text), s && s.text);
await check('Katalog zeigt die freigegebene Karte', s && s.text.indexOf(card && card.name) >= 0 && /@qa/.test(s.text), s && s.text);
const before = await page.evaluate((k) => window.__panel()._state.compact.rooms[k].tiles.length, room.key);
await chip('Hinzufügen');
await wait(1200);
s = await pane();
await check('Geräte zuordnen: ein Feld je Platzhalter', s && /Gerät|device/i.test(s.text), s);
const doms = (card && card.slots || []).map((x) => x.domain);
const picks = await page.evaluate((doms) => doms.map((d) => Object.keys(document.querySelector('home-assistant').hass.states).find((k) => k.split('.')[0] === d)), doms);
await inPane("const ins = a.querySelectorAll('.combo input'); arg.forEach((v, i) => { const x = ins[i]; x.focus(); x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); x.blur(); });", picks);
await wait(500);
await ok();
await wait(1200);
const after = await page.evaluate((k) => { const t = window.__panel()._state.compact.rooms[k].tiles; return { n: t.length, last: t[t.length - 1] }; }, room.key);
await check('Karte als Kachel im Raum (gleiche Vorlage, eigene Geräte)', after.n === before + 1 && after.last.template === card.template
  && (!card.entity || after.last.entity === picks[0]), after);

if (process.env.COM_OUT) fs.writeFileSync(process.env.COM_OUT, JSON.stringify({ share: { title: sTitle, body: sBody }, wish: { title: wu && wu.searchParams.get('title'), body: wBody } }, null, 1));
await finish();
