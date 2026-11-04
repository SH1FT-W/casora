// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/25-coffee.js#K.sec,K.roles,doneAct,CARE_DONE dev/casora_mock/coffee.py
// Coffee machine popup: confirm care as done (owner, 04.11.2026: "ich kann die Wartung im Popup gar nicht zurücksetzen").
// The made-up "Bohnenwerk" (power-curve integration like delonghi, dev/casora_mock/coffee.py) has a "<task>_done"
// button per task. Desktop 1440 and phone 393 (light):
//   1. Due care rows (Entkalken "Fällig", Brühgruppe "Überfällig") and due warnings (Satzbehälter leeren, Milchsystem)
//      show "Erledigt"; a care row that is not due (Wasserfilter) shows none.
//   2. Tap → the row asks "Zurücksetzen" (same row mechanism as the vacuum's wear parts).
//   3. Confirm → button.press on exactly that task's button, short note "Erledigt", the row updates live (not due).
// The tile exists only in the browser (not saved); services act on the test device only.
// Pictures: CASORA_KAFFEE_BILDER=<folder> stores popup and question per view.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, check, need, finish, stable, atFinish, usePage, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const W = 'bohnenwerk';
const SW = 'sensor.' + W + '_status';
const BILDER = process.env.CASORA_KAFFEE_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const tok = await tokens();
const svc = (s, data) => fetch(BASE + '/api/services/casora_mock/' + s,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
const warn = (art) => svc('kaffee_warnung', { art, geraet: W });
atFinish(async () => { await warn('aus'); });

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

for (const view of [{ tag: 'Desktop', width: 1440, height: 1000, mobile: false, press: ['Entkalken', 'descale', 'sensor.' + W + '_entkalken_in', '42.5'] },
  { tag: 'Handy', width: 393, height: 852, mobile: true, press: ['Satzbehälter leeren', 'grounds', 'sensor.' + W + '_trester_leeren_in', '6'] }]) {
  const { tag, mobile } = view;
  const { page } = await open({ width: view.width, height: view.height, mobile, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, mobile && dash.phone ? dash.phone.url : dash.url, 3);
  await need(tag + ': Bohnenwerk im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], SW));
  await need(tag + ': Bestätigungsknöpfe am Bohnenwerk (Mock)', await page.evaluate((w) => !!document.querySelector('home-assistant').hass.states['button.' + w + '_descale_done'], W));
  await warn('aus');
  for (const a of ['entkalken', 'bruehgruppe', 'satz', 'milch']) await warn(a);
  await page.waitForFunction((w) => document.querySelector('home-assistant').hass.states['binary_sensor.' + w + '_milchsystem_reinigen'].state === 'on', W, { timeout: 15000 }).catch(() => {});
  await page.evaluate(([id, left]) => {
    const ha = document.querySelector('home-assistant');
    return window.loadCardHelpers().then((h) => {
      const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_coffee', entity: id, name: 'Kaffee' });
      el.classList.add('qa-r553');
      el.hass = ha.hass;
      el.style.cssText = 'position:fixed;left:' + left + 'px;top:200px;width:200px;height:160px;z-index:99990;';
      ha.shadowRoot.appendChild(el);
      setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
    });
  }, [SW, mobile ? 20 : 400]);
  await page.waitForTimeout(1200);
  const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r553').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  // Rows of the open popup: label, value, action, armed, question.
  const rows = () => stable(page, () => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    if (!pop) return null;
    return window.__pierce('.hui-srow', pop.shadowRoot).map((r) => {
      const ends = [...r.querySelectorAll('.hui-end')].map((n) => n.textContent.trim()).filter(Boolean);
      const cf = r.querySelector('.hui-cf');
      return { text: r.textContent.replace(/\s+/g, ' ').trim(), ends, armed: r.classList.contains('armed'), cf: cf ? cf.textContent.trim() : null };
    });
  }, null, { max: 12000, quiet: 1200 });
  const find = (list, re) => (list || []).find((r) => re.test(r.text));
  let rs = await rows();
  await check(tag + ': Popup offen', rs && rs.length > 0, rs);
  const ent = find(rs, /^Entkalken/), bg = find(rs, /^Brühgruppe/), fl = find(rs, /^Wasserfilter/), sz = find(rs, /^Satzbehälter leeren/), mk = find(rs, /^Milchsystem/);
  await check(tag + ': Entkalken „Fällig“ + „Erledigt“', ent && ent.ends.includes('Erledigt') && ent.ends.includes('Fällig'), ent);
  await check(tag + ': Brühgruppe bleibt „Überfällig“ + „Erledigt“', bg && bg.ends.includes('Erledigt') && bg.ends.includes('Überfällig'), bg);
  await check(tag + ': Wasserfilter nicht fällig → keine Aktion', fl && !fl.ends.includes('Erledigt') && !fl.cf, fl);
  await check(tag + ': Hinweis Satzbehälter leeren + „Erledigt“', sz && sz.ends.includes('Erledigt'), sz);
  await check(tag + ': Hinweis Milchsystem + „Erledigt“', mk && mk.ends.includes('Erledigt'), mk);
  if (BILDER) await page.screenshot({ path: `${BILDER}/${tag.toLowerCase()}-popup.png` });

  // 2. Tap the row → question "Zurücksetzen".
  const [label, task, sensor, back] = view.press;
  const re = new RegExp('^' + label);
  const pt = await page.evaluate((src) => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    const r = window.__pierce('.hui-srow', pop.shadowRoot).find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim()));
    if (!r) return null;
    r.scrollIntoView({ block: 'center' });
    const q = r.getBoundingClientRect();
    return { x: q.x + q.width * 0.35, y: q.y + q.height / 2 };
  }, re.source);
  await need(tag + ': Zeile ' + label, pt);
  if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(700);
  rs = await rows();
  const armed = find(rs, re);
  await check(tag + ': Rückfrage „Zurücksetzen“ in der Zeile', armed && armed.armed && armed.cf === 'Zurücksetzen', armed);
  if (BILDER) await page.screenshot({ path: `${BILDER}/${tag.toLowerCase()}-rueckfrage.png` });

  // 3. Confirm → button.press on that task's button, note, row updates.
  const before = await page.evaluate((w) => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((id) => id.startsWith('button.' + w + '_')).reduce((o, id) => { o[id] = S[id].state; return o; }, {}); }, W);
  await page.evaluate(() => { window.__qaNotes = []; document.querySelector('home-assistant').addEventListener('hass-notification', (e) => window.__qaNotes.push(e.detail && e.detail.message), { capture: true }); });
  const cf = await page.evaluate((src) => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    const r = window.__pierce('.hui-srow.armed', pop.shadowRoot).find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim()));
    const b = r && r.querySelector('.hui-cf');
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  }, re.source);
  await need(tag + ': Knopf „Zurücksetzen“', cf);
  if (mobile) await page.touchscreen.tap(cf.x, cf.y); else await page.mouse.click(cf.x, cf.y);
  await page.waitForFunction(([id, v]) => document.querySelector('home-assistant').hass.states[id].state === v, [sensor, back], { timeout: 10000 }).catch(() => {});
  const after = await page.evaluate((w) => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((id) => id.startsWith('button.' + w + '_')).reduce((o, id) => { o[id] = S[id].state; return o; }, {}); }, W);
  const changed = Object.keys(after).filter((id) => after[id] !== before[id]);
  await check(tag + ': genau button.' + W + '_' + task + '_done gedrückt', changed.length === 1 && changed[0] === 'button.' + W + '_' + task + '_done', changed);
  const notes = await page.evaluate(() => window.__qaNotes);
  await check(tag + ': kurze Rückmeldung „Erledigt“', notes.includes('Erledigt'), notes);
  await page.waitForTimeout(800);
  rs = await rows();
  const now = find(rs, task === 'descale' ? /^Entkalken/ : re);
  await check(tag + ': Zeile aktualisiert (nicht mehr fällig, ohne Aktion)', task === 'descale'
    ? now && !now.ends.includes('Erledigt') && now.ends.some((e) => /42,5/.test(e)) : !now, now);
  await check(tag + ': andere fällige Zeilen behalten „Erledigt“', (find(rs, /^Brühgruppe/) || { ends: [] }).ends.includes('Erledigt'), rs && rs.map((r) => r.text));
  await page.close();
}
await finish();
