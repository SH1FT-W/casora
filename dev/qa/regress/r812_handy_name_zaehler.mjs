// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#casoraStateFit dashboards/casora/button_card_templates.json#casora_entity,casora_trash
// V12 (owner, 14.11.2026), two things on the narrow phone tile (393, WebKit):
// 1. Waste tile with several bins on one day: the short form „In 2 d · Organic +1“ was cut as one text, the ellipsis
//    ate the counter („Organi…“). Expected: the counter is its own pill that stays whole; only the bin name is cut.
// 2. Long tile names were cut 10px before the tile's edge (the inner padding), "Geschirrspüler" lost three letters
//    for 2px. Expected: the name runs to 4px before the edge, without touching the symbol or the state line.
// Nothing is saved: tiles are built in the browser next to the test house's own ones.
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, dark: true });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);

// A copy of an existing tile with its own config tweaks, in the same grid (same column width).
const clone = (pick, patch, tag) => page.evaluate(async ({ pick, patch, tag }) => {
  const ha = document.querySelector('home-assistant');
  const ok = (b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 250 && r.height > 40 && b.shadowRoot && b.shadowRoot.querySelector('#img-cell'); };
  const all = window.__pierce('button-card').filter(ok);
  const src = pick === 'trash' ? all.find((b) => [].concat((b._config || {}).template || []).includes('casora_trash'))
    : all.find((b) => b.shadowRoot.querySelector('#name') && b.shadowRoot.querySelector('#state')
      && !/trash|scene/.test([].concat((b._config || {}).template || []).join()));
  if (!src) return null;
  const el = document.createElement('button-card');
  el.setConfig(Object.assign({}, src._config, patch));
  el.hass = ha.hass;
  el.setAttribute('data-qa', tag);
  src.parentNode.insertBefore(el, src);
  return true;
}, { pick, patch, tag });

// 1. Waste: the finder reports two bins in two days with a long first name.
await page.evaluate(() => {
  const D = window.casoraDevice, orig = D.waste;
  D.waste = function () {
    const W = orig.apply(this, arguments);
    if (!W) return W;
    return Object.assign({}, W, { days: 2, duty: true, next: Object.assign({ tint: 'transparent', color: '#888' }, W.next || {},
      { label: 'Bioabfall Biotonne + Papiertonne', first: 'Bioabfall Biotonne', count: 2 }) });
  };
});
await need('Abfall-Kachel als Vorlage', await clone('trash', {}, 'qa-trash'));
let w = null;
for (let i = 0; i < 20 && !(w && w.shown); i++) {
  await page.waitForTimeout(250);
  w = await page.evaluate(() => {
    const b = window.__pierce('button-card[data-qa="qa-trash"]')[0];
    const sf = b && b.shadowRoot.querySelector('casora-statefit');
    const s = sf && sf.querySelector('.sf-s');
    if (!s) return { found: !!b, sf: !!sf };
    const r = (n) => { const q = n.getBoundingClientRect(); return { l: q.left, r: q.right, w: q.width }; };
    const parts = [...s.children];
    const txt = parts[0], pill = parts[1];
    return { shown: getComputedStyle(s).display !== 'none', text: s.textContent, box: r(sf), card: r(b.shadowRoot.querySelector('ha-card')),
      name: txt ? { t: txt.textContent, sw: txt.scrollWidth, cw: txt.clientWidth } : null,
      pill: pill ? Object.assign(r(pill), { t: pill.textContent }) : null };
  });
}
await need('Abfall: Kurzform gezeigt (Name passt nicht)', w && w.shown, w);
await check('Abfall: Zähler „+1“ als eigene Pille', !!(w.pill && w.pill.t === '+1'), w);
await check('Abfall: Pille ganz sichtbar (nicht abgeschnitten)', !!(w.pill && w.pill.w > 10 && w.pill.r <= w.box.r + 0.5 && w.pill.r <= w.card.r), w);
await check('Abfall: nur der Tonnenname wird gekürzt', !!(w.name && /^In 2 T\. · Bioabfall/.test(w.name.t) && !/\+1/.test(w.name.t) && w.name.sw > w.name.cw), w);

// 2. Long name on a small tile.
await need('Kleine Kachel als Vorlage', await clone('entity', { name: 'Geschirrspüler Küche links unten' }, 'qa-name'));
await page.waitForTimeout(1200);
const n = await page.evaluate(() => {
  const b = window.__pierce('button-card[data-qa="qa-name"]')[0];
  const sr = b && b.shadowRoot;
  if (!sr) return null;
  const r = (s) => { const e = sr.querySelector(s); const q = e && e.getBoundingClientRect(); return q ? { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width } : null; };
  const nm = sr.querySelector('#name');
  return { card: r('ha-card'), name: r('#name'), img: r('#img-cell'), state: r('#state'), sw: nm.scrollWidth, cw: nm.clientWidth };
});
await need('Name gemessen', n && n.card && n.name && n.img, n);
await check('Name zu lang (wird gekürzt)', n.sw > n.cw, n);
await check('Name läuft bis 4 px vor den Kachelrand', Math.abs(n.card.r - 4 - n.name.r) <= 1.5, n);
await check('Name liegt rechts vom Symbol', n.name.l >= n.img.r, n);
await check('Name überdeckt die Zustandszeile nicht', !n.state || n.name.b <= n.state.t + 2.5, n);
await finish();
