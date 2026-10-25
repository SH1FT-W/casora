// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js
// Issue #63: the Home "Jalousien" tile read "85 % Geöffnet" - the HA cover group's own current_position (another
// member list) - while its popup said "Position 70 %", the average of the six listed blinds (4 x 100 %, 1 %, 20 %).
// Tile and popup now share casoraCoverSummary: the same members, the same average, the count first.
// Expected (desktop 1440 light like the reporter, phone 393 WebKit), with the covers set locally (fakeStates, nothing
// goes to HA) to 100/100/100/100/1/20 and the tile entity an HA group whose current_position says 85:
//   1. Tile with a cover list: "Alle geöffnet · Ø 70 %" (narrow "Alle geöffnet"), never "85".
//   2. Its popup: head "Alle geöffnet · Ø 70 %", slider "70 %", one row per listed cover.
//   3. Mixed (two closed): tile and popup head "4 von 6 geöffnet · Ø 50 %" ... same text in both.
//   4. Tile on the HA group without a list: counts the group's members (one unavailable left out), the popup lists
//      the same members; tile and popup head agree.
// COV63_BILDER=<folder>: pictures of tile and popup (desktop light, phone).
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const OUT = process.env.COV63_BILDER;
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const phone = all.find((d) => d.url === desk.url + '-mobile');

const GROUP = 'cover.qa_cov63_group';

// Mounts a casora_cover tile (like the Home group tile: the HA group as entity, the covers as list) above the
// first visible tile, reads its state text, opens its popup and reads head, slider and rows.
const probe = async (page, variables, shotName) => {
  const r = await page.evaluate(async ([group, variables]) => {
    const ha = document.querySelector('home-assistant');
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 100 && x.height > 50 && x.top > 40; });
    if (!old) return { missing: 'a tile to mount next to' };
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: 'casora_cover', entity: group, name: 'Jalousien', variables });
    el.hass = ha.hass;
    el.style.cssText = 'display:block;width:' + Math.round(old.getBoundingClientRect().width) + 'px';
    old.parentNode.insertBefore(el, old);
    window.__cov63el = el;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((res) => setTimeout(res, 1200));
    const card = el.shadowRoot && el.shadowRoot.querySelector('ha-card');
    const st = el.shadowRoot && el.shadowRoot.querySelector('#state');
    const full = st ? (st.querySelector('.sf-f') || st).textContent.replace(/\s+/g, ' ').trim() : '';
    const shown = st ? st.innerText.replace(/\s+/g, ' ').trim() : '';
    return { full, shown, card: card ? card.innerText.replace(/\s+/g, ' ').trim() : '' };
  }, [GROUP, variables]);
  if (r.missing) return r;
  if (shotName && OUT) {
    const box = await page.evaluate(() => { const b = window.__cov63el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    await page.screenshot({ path: `${OUT}/${shotName}-kachel.png`, clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 } });
  }
  const p = await page.evaluate(async () => {
    const el = window.__cov63el;
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    const S = () => window.casoraPopup && window.casoraPopup.surface;
    for (let i = 0; i < 40 && !(S() && window.__pierce('.hui-row', S()).length); i++) await new Promise((res) => setTimeout(res, 200));
    await new Promise((res) => setTimeout(res, 900));
    const s = S();
    if (!s) return { missing: 'popup' };
    const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
    const rows = window.__pierce('.hui-row', s).map(txt);
    // The popup's text across its shadow roots (head, slider, rows).
    const text = window.__pierce('button-card', s).map((b) => (b.shadowRoot ? txt(b.shadowRoot.querySelector('ha-card')) : '')).join(' | ');
    return { rows, text: (txt(s) + ' | ' + text).replace(/ /g, ' ') };
  });
  if (shotName && OUT && !p.missing) await page.screenshot({ path: `${OUT}/${shotName}-popup.png` });
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__cov63el) window.__cov63el.remove(); });
  await page.waitForTimeout(400);
  return Object.assign(r, { popup: p });
};

const VIEWS = [
  ['Desktop', { width: 1440, height: 900, dark: false }, desk.url],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, dark: false }, phone && phone.url],
];

for (const [tag, opts, url] of VIEWS) {
  if (!url) { await check(tag + ': Handy-Dashboard vorhanden', tag === 'Desktop', all.map((d) => d.url)); continue; }
  const { page } = await open(opts);
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  await dashboard(page, url, 3);
  // Six covers with a position from the test house (mock).
  const ids = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states)
    .filter((id) => id.startsWith('cover.') && !/group|gruppe/.test(id)).sort().slice(0, 7));
  await need(tag + ': sieben Jalousien im Testhaus', ids.length === 7, ids);
  const six = ids.slice(0, 6);
  const pos = (list) => Object.fromEntries(six.map((id, i) => [id, { state: list[i] > 0 ? 'open' : 'closed', attributes: { current_position: list[i] } }]));
  // The HA group: all seven (one more than the list) and its own current_position 85, like the reporter's.
  const group = { [GROUP]: { state: 'open', attributes: { entity_id: ids, current_position: 85, friendly_name: 'Jalousien' } } };

  // 1 + 2: the reporter's house.
  await fakeStates(page, Object.assign(pos([100, 100, 100, 100, 1, 20]), { [ids[6]]: { state: 'open', attributes: { current_position: 100 } } }, group), { sticky: true });
  let r = await probe(page, { covers: six }, tag === 'Desktop' ? 'desktop-hell' : 'handy-hell');
  await need(tag + ': Kachel + Popup', r && !r.missing && !r.popup.missing, r);
  await check(tag + ': Kachel "Alle geöffnet · Ø 70 %"', r.full === 'Alle geöffnet · Ø 70 %' || r.full === 'Alle geöffnet · Ø 70 %', r);
  await check(tag + ': Kachel zeigt nie die 85 der HA-Gruppe', !/85/.test(r.card), r.card);
  await check(tag + ': Popup-Kopf wie die Kachel', /Alle geöffnet · Ø 70/.test(r.popup.text), r.popup.text.slice(0, 200));
  await check(tag + ': Popup-Position 70 %', /70\s? ?%/.test(r.popup.text) && !/85/.test(r.popup.text), r.popup.text.slice(0, 300));
  await check(tag + ': eine Zeile je Jalousie der Liste', r.popup.rows.length === 6, r.popup.rows);

  // 3: mixed, two closed: (100+100+100+0+0+0+... ) -> 4 open of 6.
  // (A sticky patch replaces the previous one: the group goes into every patch.)
  await fakeStates(page, Object.assign(pos([100, 100, 40, 60, 0, 0]), { [ids[6]]: { state: 'open', attributes: { current_position: 100 } } }, group), { sticky: true });
  r = await probe(page, { covers: six }, tag === 'Desktop' ? 'desktop-gemischt' : 'handy-gemischt');
  await check(tag + ': gemischt "4 von 6 geöffnet · Ø 50 %"', /^4 von 6 geöffnet · Ø 50\s? ?%$/.test(r.full), r);
  await check(tag + ': gemischt, Popup-Kopf gleich', /4 von 6 geöffnet · Ø 50/.test(r.popup.text), r.popup.text.slice(0, 200));
  if (tag === 'Handy') await check('Handy: schmale Kachel zeigt die Zahl', /4 von 6 geöffnet/.test(r.shown), r.shown);

  // 4: the group without a list - its members count (one unavailable is left out), the popup lists them.
  await fakeStates(page, Object.assign(pos([100, 0, 0, 0, 0, 20]), { [ids[6]]: { state: 'unavailable', attributes: {} } }, group), { sticky: true });
  r = await probe(page, {}, tag === 'Desktop' ? 'desktop-gruppe' : null);
  await check(tag + ': Gruppe ohne Liste "2 von 6 geöffnet · Ø 20 %"', /^2 von 6 geöffnet · Ø 20\s? ?%$/.test(r.full), r);
  await check(tag + ': Gruppe ohne Liste, Popup-Kopf gleich', /2 von 6 geöffnet · Ø 20/.test(r.popup.text), r.popup.text.slice(0, 200));
  await check(tag + ': Gruppe ohne Liste, Popup zeigt die Mitglieder', r.popup.rows.length >= 6, r.popup.rows);
  await check(tag + ': keine Fehler in der Konsole', errs.length === 0, errs);
}
await finish();
