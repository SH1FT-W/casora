// @zustand: arbeit
// Settings rework: the gear in a popup's head. Admins only, next to the close button, the head keeps its height; not on
// sub pages. From a tile it opens that tile's Popup tab in the Studio; without a tile the matching settings section.
import { open, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard', dash);
const m = await open({ width: 1440, height: 900 });
await dashboard(m.page, dash.url, 0);
await m.page.waitForTimeout(2500);
const E = (src, arg) => m.page.evaluate(([src, arg]) => new Function('arg', 'return (async () => {' + src + '})()')(arg), [src, arg]);

const tile = await E(`const h = document.querySelector('home-assistant').hass;
  const c = await h.callWS({ type: 'lovelace/config', url_path: arg });
  const s = JSON.stringify(c); const x = s.match(/"entity":"(cover\\.[a-z0-9_]+)"/); return x && x[1];`, dash.url);
await need('a blinds tile on the dashboard', tile);

const HEAD = `const P = window.__casoraPopupEl = window.__casoraPopupEl || (() => { const f = (r) => { for (const e of r.querySelectorAll('*')) { if (e.shadowRoot) { if (e.shadowRoot.querySelector('.header-gear')) return e; const x = f(e.shadowRoot); if (x) return x; } } return null; }; return f(document); })();
  const R = P.shadowRoot; const g = R.querySelector('.header-gear'), c = R.querySelector('.header-close'), h = R.querySelector('.header-bar');
  const gr = g.getClientRects().length ? g.getBoundingClientRect() : null, cr = c.getBoundingClientRect();
  return { shown: !!gr, h: Math.round(h.getBoundingClientRect().height), left: gr ? gr.right <= cr.left + 1 : null, mid: gr ? Math.abs((gr.top + gr.height / 2) - (cr.top + cr.height / 2)) < 2 : null, w: gr ? Math.round(gr.width) : 0 };`;
const pop = async (extra) => { await E(`window.casoraPopup.open(Object.assign({ title: 'Test', variant: 'v3', content: { type: 'vertical-stack', cards: [] } }, arg));`, extra); await m.page.waitForTimeout(900); };

await pop({ _entity: tile });
const a = await E(HEAD);
await check('admin: gear beside the close button, 40 px wide', a.shown && a.left && a.mid && a.w === 40, a);
await E(`window.casoraPopup.sub({ title: 'Unterseite', content: { type: 'vertical-stack', cards: [] } });`);
await m.page.waitForTimeout(700);
const sub = await E(HEAD);
await check('sub page: no gear', !sub.shown, sub);
await E(`window.casoraPopup.close(); window.__admin = window.casoraIsAdmin; window.casoraIsAdmin = () => false;`);
await m.page.waitForTimeout(500);
await pop({ _entity: tile });
const b = await E(HEAD);
await check('not an admin: no gear', !b.shown, b);
await check('the head keeps its height with the gear', a.h === b.h, { admin: a.h, user: b.h });
await E(`window.casoraPopup.close(); window.casoraIsAdmin = window.__admin;`);
await m.page.waitForTimeout(500);

await pop({ _entity: tile });
await E(`window.__casoraPopupEl.shadowRoot.querySelector('.header-gear').click();`);
await m.page.waitForFunction(() => location.pathname.startsWith('/casora-studio'), null, { timeout: 15000 }).catch(() => {});
await m.page.waitForTimeout(9000);
const panel = `const f = (r) => { for (const e of r.querySelectorAll('*')) { if (e._state && e._state.compact) return e; if (e.shadowRoot) { const x = f(e.shadowRoot); if (x) return x; } } return null; }; const p = f(document);`;
const st = await E(panel + `const on = [...p.shadowRoot.querySelectorAll('.tiletabs button[aria-selected=true]')].find((x) => x.getClientRects().length);
  const pane = [...p.shadowRoot.querySelectorAll('.tilepane .adv .advbody')].find((x) => x.getClientRects().length);
  return { path: location.pathname, search: location.search, tab: on && on.dataset.tab, fields: !!pane && /Beschatten/.test(pane.textContent) };`);
await check('from a tile: Studio on its Popup tab', /casora-studio/.test(st.path) && st.tab === 'popup' && st.fields && !/tab=/.test(st.search), st);

await dashboard(m.page, dash.url, 0);
await m.page.waitForTimeout(2500);
await E(`delete window.__casoraPopupEl;`);
await pop({ content: { type: 'custom:button-card', template: 'casora_popup_contacts' } });
await E(HEAD);
await E(`window.__casoraPopupEl.shadowRoot.querySelector('.header-gear').click();`);
await m.page.waitForFunction(() => location.pathname.startsWith('/casora-studio'), null, { timeout: 15000 }).catch(() => {});
await m.page.waitForTimeout(9000);
const set = await E(panel + `const b = p.shadowRoot.querySelector('[data-pkey="nb-contacts"]'); return { page: p._csPage, open: !!(b && b.classList.contains('open')), search: location.search };`);
await check('without a tile: its section of the settings', set.page === 'n-house' && set.open && !/settings=/.test(set.search), set);
await finish();
