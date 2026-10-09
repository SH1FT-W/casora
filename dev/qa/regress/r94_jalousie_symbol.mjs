// @zustand: arbeit
// @parallel: ui
// Gemeldet (1.2.1): Im Jalousie-Popup zeigen die Zeilen der einzelnen Jalousien und „Position“ ein
// anderes Symbol (cover_open/cover_closed) als der große Ring im Popup-Kopf und die Kachel
// (cover_open1/cover_closed1). Erwartet: Kachel und Ring zeigen dasselbe Symbol wie die Zeile,
// in Lage-Stufen (100 offen, 70 cover_80, 50 cover_60, 30 cover_40, 0 zu), auch „Position“ –
// Desktop und Handy (WebKit), Casora-Design.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const has = (x, t) => JSON.stringify(x).includes(`"${t}"`);
const dash = await casoraDashboard((d) => has(d.config, 'casora_cover'));
await need('Casora-Dashboard mit Jalousie-Kachel (Desktop + Handy)', dash && dash.phone && has(dash.phone.config, 'casora_cover'));
// Desktop: Ansicht mit einer einzelnen Jalousie (ohne covers-Liste), sonst irgendeine mit Jalousie-Kachel.
const single = (v) => /"template":"casora_cover","entity":"cover\./.test(JSON.stringify(v));
const dview = dash.config.views.find((v) => has(v, 'casora_cover') && single(v)) || dash.config.views.find((v) => has(v, 'casora_cover'));
const pview = dash.phone.config.views.find((v) => has(v, 'casora_cover'));

// Sichtbare Jalousie-Kachel: Entität und (Gruppe) ihre Jalousien.
const find = (page) => page.evaluate(() => {
  const b = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_cover')
    && /^cover\./.test(b._config?.entity || '') && b.getBoundingClientRect().width > 0);
  return b ? [b._config.entity].concat((b._config.variables && b._config.variables.covers) || []) : null;
});
const pick = (page, id) => page.evaluate((id) => {
  const name = (s) => { const m = decodeURIComponent(String(s || '')).match(/(cover_[a-z0-9]+|curtain-[a-z]+|door-[a-z]+|window-shade-[a-z]+)/); return m ? m[1] : null; };
  const b = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_cover') && b._config?.entity === id && b.getBoundingClientRect().width > 0);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const img = b.shadowRoot && b.shadowRoot.querySelector('img');
  const r = b.getBoundingClientRect();
  return { tile: name(img && img.getAttribute('src')), x: r.x + r.width * 0.6, y: r.y + r.height * 0.75 };
}, id);
// Ring im Popup-Kopf (span.g, Maske) und erste Zeile (Kreis-Symbol).
const popup = (page) => page.evaluate(() => {
  const name = (s) => { const m = String(s || '').match(/(cover_[a-z0-9]+|curtain-[a-z]+|door-[a-z]+|window-shade-[a-z]+)/); return m ? m[1] : null; };
  const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const vis = (e) => e.getBoundingClientRect().width > 0;
  const g = window.__pierce('span.g').filter(vis).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  const ring = g ? name(dec(g.style.getPropertyValue('--g') + ' ' + getComputedStyle(g).webkitMaskImage)) : null;
  const rows = window.__pierce('.hui-srow').filter(vis).map((r) => {
    const el = [r, ...r.querySelectorAll('*')].find((e) => /cover_|curtain-|door-|window-shade-/.test(dec(getComputedStyle(e).webkitMaskImage || '') + dec(getComputedStyle(e).backgroundImage || '')));
    return el ? name(dec(getComputedStyle(el).webkitMaskImage + ' ' + getComputedStyle(el).backgroundImage)) : null;
  }).filter(Boolean);
  const sl = window.__pierce('.hui-sl-ic').filter(vis)[0];
  const pos = sl ? name(dec(getComputedStyle(sl).webkitMaskImage + ' ' + getComputedStyle(sl).backgroundImage)) : null;
  return { ring, row: rows[0] || null, n: rows.length, pos };
});

const CASES = [
  ['offen', { state: 'open', attributes: { current_position: 100 } }, 'cover_open'],
  ['30 %', { state: 'open', attributes: { current_position: 30 } }, 'cover_40'],
  ['50 %', { state: 'open', attributes: { current_position: 50 } }, 'cover_60'],
  ['70 %', { state: 'open', attributes: { current_position: 70 } }, 'cover_80'],
  ['zu', { state: 'closed', attributes: { current_position: 0 } }, 'cover_closed'],
];
for (const [vp, url] of [
  ['Desktop', dash.url + '/' + (dview.path || dash.config.views.indexOf(dview))],
  ['Handy', dash.phone.url + '/' + (pview.path || dash.phone.config.views.indexOf(pview))],
]) {
  const phone = vp === 'Handy';
  const { page } = await open(phone ? { width: 393, height: 852, dark: false, theme: 'Casora', mobile: true, safari: true }
    : { width: 1440, height: 900, dark: false, theme: 'Casora', scale: 1 });
  usePage(page);
  await dashboard(page, url, 3);
  const ids = await find(page);
  await need(`${vp}: Jalousie-Kachel sichtbar`, ids, url);
  for (const [k, st, want] of CASES) {
    await fakeStates(page, Object.fromEntries(ids.map((i) => [i, st])), { sticky: true });
    const t = await pick(page, ids[0]);
    await need(`${vp}: Jalousie-Kachel sichtbar`, t, t);
    await check(`${vp} ${k}: Kachel zeigt ${want}`, t.tile === want, t);
    // Popup öffnen; unter Last kommt es manchmal erst beim zweiten Tippen.
    let p = null;
    for (let a = 0; a < 2 && !(p && p.n); a++) {
      const t2 = (await pick(page, ids[0])) || t;
      await page.mouse.click(t2.x, t2.y);
      for (let w = 0; w < 12 && !(p && p.n && p.ring); w++) { await page.waitForTimeout(400); p = await popup(page); }
    }
    await check(`${vp} ${k}: Zeile zeigt ${want}`, p.row === want, p);
    await check(`${vp} ${k}: Ring im Popup-Kopf wie die Zeile`, p.ring === want && p.ring === p.row, p);
    await check(`${vp} ${k}: Position zeigt ${want}`, p.pos === want, p);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    await dashboard(page, url, 3);
  }
  await page.context().browser().close().catch(() => {});
}
await finish();
