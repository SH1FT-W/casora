// @zustand: arbeit
// @parallel: ui
// Waste tile and popup head from the pickup date (02.11.2026): the tile and the popup head said „Bio in 2 T.“ while
// the bins list in the popup said „Restmüll · Heute“. The tile counted from the sensors' countdown (state, daysTo),
// the list from their date attributes; a countdown that already moved on (pickup day) or a stale one lost today.
// Expected: tile, head and list say the same – residual waste today. Made-up bin sensors (fakeStates, sticky), the
// tile built in the browser from the test house's casora_trash tile with these sensors; nothing is saved.
// Phone width (393x852, WebKit), where the tile shows the short form „Bio in 2 T.“.
// CASORA_LOCAL=1: casora_trash template and 00-finder.js from this checkout, in the browser only.
// R510_BILD=<dir>: pictures of the tile and the popup (vorher/nachher by CASORA_LOCAL).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const tileOf = (o) => {
  if (!o || typeof o !== 'object') return null;
  if ([].concat(o.template || []).includes('casora_trash')) return o;
  for (const x of Object.values(o)) { const t = tileOf(x); if (t) return t; }
  return null;
};
const desk = all.find((d) => !d.mobile && !/importiert/.test(d.url) && tileOf(d.config));
await need('Casora-Dashboard mit Abfall-Kachel', desk);
const read = (p) => fs.readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');
const LOCAL = process.env.CASORA_LOCAL
  ? { trash: JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates.casora_trash,
      finder: read('custom_components/casora/scripts/local/00-finder.js') }
  : null;

// Made-up bins: residual waste today by date while its countdown says 9; organic only a past date and countdown 2.
const ymd = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const REST = 'sensor.qa_r510_restmuell', BIO = 'sensor.qa_r510_bio';
const FAKE = {
  [REST]: { state: '9', attributes: { friendly_name: 'QA Restmüll', daysTo: 9, [ymd(-14)]: 'QA Rest', [ymd(0)]: 'QA Rest', [ymd(14)]: 'QA Rest' } },
  [BIO]: { state: '2', attributes: { friendly_name: 'QA Bio', daysTo: 2, 'QA Biobehaelter': ymd(-35) } },
};
const TILE = JSON.parse(JSON.stringify(tileOf(desk.config)));
// The test house's waste calendar may add its own events; residual waste today stays the first pickup.
TILE.variables = Object.assign({}, TILE.variables, { trash_sensors: { [REST]: 'Restmüll', [BIO]: 'Bio' } });

const { page } = await open({ dark: false, theme: 'Casora', width: 393, height: 852, mobile: true, safari: true });
usePage(page);
await dashboard(page, desk.url, 3);
if (LOCAL) {
  const done = await page.evaluate((L) => {
    // The finder from this checkout (casoraDevice.waste); the dashboard config is frozen: hand hui-root a copy with
    // the local template (button-card reads it there).
    new Function(L.finder)();
    const root = window.__pierce('hui-root')[0], ll = root && root.lovelace, cfg = ll && ll.config;
    if (!cfg || !cfg.button_card_templates) return false;
    root.lovelace = Object.assign({}, ll, { config: Object.assign({}, cfg, { button_card_templates: Object.assign({}, cfg.button_card_templates, { casora_trash: L.trash }) }) });
    return true;
  }, LOCAL);
  await need('casora_trash und 00-finder.js aus dem Checkout eingesetzt', done);
}
await fakeStates(page, FAKE, { sticky: true });

const made = await page.evaluate(async (tile) => {
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
  if (!old) return 'keine Kachel als Anker';
  const el = document.createElement('button-card');
  el.id = 'qa-r510';
  el.setConfig(Object.assign({ type: 'custom:button-card' }, tile));
  el.hass = ha.hass; old.parentNode.insertBefore(el, old);
  el.scrollIntoView({ block: 'center' });
  await new Promise((res) => setTimeout(res, 1000));
  return 'ok';
}, TILE);
await need('Abfall-Kachel mit den erfundenen Tonnen gebaut', made === 'ok', made);

const tileText = () => page.evaluate(() => {
  const el = window.__pierce('button-card').find((b) => b.id === 'qa-r510');
  const s = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  if (!s) return '';
  const leaves = [].filter.call(s.querySelectorAll('*'), (k) => !k.children.length && k.getClientRects().length && String(k.textContent || '').trim());
  return (leaves.length ? leaves.map((k) => k.textContent.trim()).join(' ') : s.textContent || '').replace(/\s+/g, ' ').trim();
});
let tile = '';
for (let i = 0; i < 20 && (!tile || tile === '…'); i++) { await page.waitForTimeout(250); tile = await tileText(); }
const DIR = process.env.R510_BILD;
const tag = LOCAL ? 'nachher' : 'vorher';
if (DIR) { fs.mkdirSync(DIR, { recursive: true }); await page.screenshot({ path: path.join(DIR, tag + '-kachel.png') }); }
await check('Kachel: Restmüll heute (Datum vor Countdown)', /^Heute Restmüll/.test(tile), tile);

const opened = await page.evaluate(() => {
  const el = window.__pierce('button-card').find((b) => b.id === 'qa-r510');
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  return true;
});
await need('Abfall-Popup geöffnet', opened);
let r = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(250);
  r = await page.evaluate(() => {
    const P = window.casoraPopup, el = P && P.element, S = P && P.surface;
    if (!el || !S) return null;
    const txt = (n) => (n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : '');
    const card = window.__pierce('button-card', S).find((b) => b.shadowRoot && b.shadowRoot.querySelector('#right'));
    const right0 = card && card.shadowRoot.querySelector('#right');
    // The list's text without its <style> blocks.
    const right = right0 && right0.cloneNode(true);
    if (right) right.querySelectorAll('style').forEach((n) => n.remove());
    const head = el._headerStatus && !el._headerStatus.hidden ? txt(el._headerStatus) : '';
    return right && head ? { head, list: txt(right) } : null;
  });
  if (r) break;
}
await need('Popup: Kopfzeile und Tonnen-Liste gezeichnet', r, r);
await page.waitForTimeout(600);
if (DIR) await page.screenshot({ path: path.join(DIR, tag + '-popup.png') });
await check('Popup-Kopf: Restmüll heute', /^Heute Restmüll/.test(r.head), r);
await check('Popup-Kopf nennt nicht Bio als Nächstes', !/^Bio/.test(r.head), r);
await check('Tonnen-Liste: Restmüll heute', /Restmüll[^·]*·[^·]*?Heute/.test(r.list.replace(/\s+/g, ' ')), r);
await finish();
