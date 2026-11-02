// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/local/18-ziele.js
// A tilted door contradicted itself (README screenshots, 02.11.2026): the doors popup said „Patio Door open“ in the
// head while its dial said „1 tilted“ and its list „Tilted“; the door's own popup said „Geöffnet“ in the dial and the
// newest history row although the list it was opened from said „Gekippt“. r460 knows only on/off, never a tilt.
//
// A combined door/window sensor (attribute „tilt“) is set to on + tilt: true via REST, then, on the desktop:
//   einzeln   the door's own popup (openMeasure): dial and newest history row say „Gekippt“, the head no „offen“
//   gruppe    every doors/windows group badge and the security badge: popup head, dial and the tile never say the
//             door is open while its list row says „Gekippt“ (no „offen“/„Geöffnet“ unless a row really is open)
// Restores the sensor afterwards.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

let tok = null;
const api = async (method, p, body) => {
  if (!tok) tok = (await tokens()).access_token;
  const r = await fetch(BASE + '/api/' + p, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(method + ' ' + p + ' → ' + r.status);
  return r.json();
};

const all = await api('GET', 'states');
const kombi = all.find((x) => /^binary_sensor\./.test(x.entity_id) && Object.prototype.hasOwnProperty.call(x.attributes, 'tilt')
  && /^(door|window)$/.test(x.attributes.device_class || ''));
await need('a combined door/window sensor (attribute tilt) in the test house', kombi);
const ID = kombi.entity_id;
atFinish(async () => { await api('POST', 'states/' + ID, { state: kombi.state, attributes: kombi.attributes }).catch(() => {}); });
await api('POST', 'states/' + ID, { state: 'on', attributes: { ...kombi.attributes, tilt: true } });

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false });
await dashboard(page, dash.url, 3);
await page.waitForFunction((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return s && s.state === 'on' && s.attributes.tilt === true; }, ID);

// Head, dial, list rows and newest history row of the open popup.
const snap = () => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const txt = (e) => (e ? String(e.textContent || '').replace(/[​]/g, '').replace(/\s+/g, ' ').trim() : '');
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const els = [];
  (function walk(n) { for (const ch of n.children || []) { els.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } })(s);
  const hs = s.querySelector('.header-status');
  const stageEl = els.find((e) => e.classList && e.classList.contains('hui-stage') && vis(e));
  const main = stageEl ? [...stageEl.querySelectorAll('.hui-dl-c .hui-dl-t, .hui-dl-c .hui-st-val, .hui-st-head .hui-st-val, .hui-st-stat .hui-st-text')].filter(vis)[0] : null;
  const rows = els.filter((e) => e.classList && e.classList.contains('hui-row') && vis(e)).map((r) => {
    const leaves = [...r.querySelectorAll('*')].filter((k) => !k.children.length && vis(k) && txt(k)).map(txt);
    return leaves;
  });
  const tl = els.filter((e) => e.classList && e.classList.contains('cz-dot') && vis(e)).map((d) => {
    const c = d.parentElement && d.parentElement.parentElement ? d.parentElement.parentElement.children : [];
    return c[2] && c[2].children[0] ? txt(c[2].children[0]) : '';
  });
  return { title: txt(s.querySelector('.header-title')), head: vis(hs) ? txt(hs) : '', stage: txt(main), stageAll: txt(stageEl), rows, tl };
});
const settled = async () => {
  let last = '', since = Date.now(), v = null;
  for (const t0 = Date.now(); Date.now() - t0 < 12000; await page.waitForTimeout(250)) {
    v = await snap();
    const k = JSON.stringify(v);
    if (!v || /Wird geladen/.test(k) || k !== last) { last = k; since = Date.now(); } else if (Date.now() - since >= 1200) return v;
  }
  return v;
};
const closeAll = async () => {
  for (let i = 0; i < 4 && await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)); i++) {
    await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(450);
  }
};
const OPEN_WORD = /\boffen\b|geöffnet/i;

// ── the door's own popup ──
await page.evaluate((id) => window._casoraZiele.openMeasure(id), ID);
const one = await settled();
await need('the door popup opens', one, one);
await check(`einzeln: dial says „Gekippt“ (dial „${one.stage}“)`, one.stage === 'Gekippt', one);
await check(`einzeln: head does not say open (head „${one.head}“)`, !OPEN_WORD.test(one.head), one);
await check(`einzeln: newest history row says „Gekippt“ (row „${one.tl[0] || ''}“)`, !one.tl.length || one.tl[0] === 'Gekippt', one.tl);
await closeAll();

// ── group badges: doors/windows and security ──
const badges = await page.evaluate(() => window.__pierce('button-card').map((b, i) => {
  const t = [].concat((b._config || {}).template || []), r = b.getBoundingClientRect();
  return { i, t: t.join('+'), w: r.width };
}).filter((x) => x.w > 20 && /casora_badge_(contact_group|security_group)\b/.test(x.t)));
await need('a doors/windows or security badge on the dashboard', badges.length, badges);
let seen = 0;
for (const b of badges) {
  const at = await page.evaluate((i) => { const el = window.__pierce('button-card')[i]; el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2,
      tile: [...(el.shadowRoot || el).querySelectorAll('*')].filter((k) => !k.children.length && k.getClientRects().length && !k.closest('style'))
        .map((k) => String(k.textContent || '').trim()).filter(Boolean).join(' ') }; }, b.i);
  await page.waitForTimeout(250);
  await page.mouse.click(at.x, at.y);
  for (let t1 = Date.now(); Date.now() - t1 < 3500 && !await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)); ) await page.waitForTimeout(200);
  const s = await settled();
  await closeAll();
  if (!s) continue;
  const tilted = s.rows.filter((r) => r[r.length - 1] === 'Gekippt');
  if (!tilted.length) continue;
  seen++;
  // Only a row that really says „Geöffnet“ allows „offen“ in head, dial or tile.
  const reallyOpen = s.rows.some((r) => r[r.length - 1] === 'Geöffnet');
  const where = `${b.t} „${s.title}“`;
  if (reallyOpen) { console.log(`  info   ${where}: also an open row, head „${s.head}“`); continue; }
  await check(`gruppe ${where}: head does not call the tilted door open (head „${s.head}“)`, !OPEN_WORD.test(s.head), s);
  await check(`gruppe ${where}: dial does not call it open (dial „${s.stageAll}“)`, !/\b\d*\s*geöffnet\b|\boffen\b/i.test(s.stage), s.stage);
  await check(`gruppe ${where}: tile does not call it open (tile „${at.tile}“)`, !OPEN_WORD.test(at.tile), at.tile);
}
await check('at least one group popup lists the tilted door', seen > 0, seen);
await finish();
