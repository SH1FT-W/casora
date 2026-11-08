// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js#casoraCoverControls,casoraCoverClosedView dashboards/casora/button_card_templates.json#casora_cover
// Issue #145 point 1: covers on the list read as percent closed in the popup, its rows and on the tile; what is sent to
// Home Assistant is still its own position, and the blinds count stays as it was.
import { open, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard', dash);
const m = await open({ width: 1440, height: 900 });
await dashboard(m.page, dash.url, 0);
await m.page.waitForTimeout(2500);
const E = (src, arg) => m.page.evaluate(([src, arg]) => new Function('arg', 'return (async () => {' + src + '})()')(arg), [src, arg]);
const cover = await E(`const h = document.querySelector('home-assistant').hass;
  return Object.keys(h.states).find((i) => i.startsWith('cover.') && (h.states[i].attributes.supported_features & 4) && !Array.isArray(h.states[i].attributes.entity_id));`);
await need('a cover that takes a position', cover);
const setPos = async (p) => { await E(`await document.querySelector('home-assistant').hass.callService('cover', 'set_cover_position', { position: arg.p }, { entity_id: arg.id });`, { id: cover, p }); await m.page.waitForTimeout(3500); };
const pos = () => E(`return document.querySelector('home-assistant').hass.states[arg].attributes.current_position;`, cover);
await setPos(40);
await need('the cover reports 40', (await pos()) === 40, await pos());

const before = await E(`return window.casoraCoverSummary(document.querySelector('home-assistant').hass.states, [arg]).open;`, cover);
await E(`window.CASORA_SETTINGS = Object.assign({}, window.CASORA_SETTINGS, { security: Object.assign({}, (window.CASORA_SETTINGS || {}).security, { percent_closed: [arg] }) });`, cover);
const after = await E(`return window.casoraCoverSummary(document.querySelector('home-assistant').hass.states, [arg]).open;`, cover);
await check('the open count does not change', before === after, { before, after });
await check('the tile text reads closed', await E(`const h = document.querySelector('home-assistant').hass; return window.casoraCoverSummaryText(window.casoraCoverSummary(h.states, [arg]), [arg]).full;`, cover) === '60 % geschlossen');

// The real popup template with this one cover.
const opened = await E(`const h = document.querySelector('home-assistant').hass;
  const T = (await h.callWS({ type: 'lovelace/config', url_path: arg.url })).button_card_templates || {};
  const t = T.casora_cover; if (!t) return false;
  const host = document.querySelector('home-assistant'); host.dispatchEvent(new CustomEvent('ll-custom', { bubbles: true, composed: true, detail: Object.assign({}, t.tap_action.casora_popup) }));
  return true;`, { url: dash.url });
await m.page.waitForTimeout(400);
await E(`window.casoraPopup.close();`);
// A tile of this cover on a throwaway card keeps the test on the template's real code.
const stage = await E(`const f = (r, q) => { for (const e of r.querySelectorAll('*')) { if (e.matches(q)) return e; if (e.shadowRoot) { const x = f(e.shadowRoot, q); if (x) return x; } } return null; };
  const C = window.casoraCoverControls(document.querySelector('home-assistant').hass.states, [arg], {});
  return { flip: C.flip, attr: C.attr, shown: C.shown(40), back: C.shown(60), word: C.closedWord };`, cover);
await check('controls read closed, 60 % closed is sent as 40', stage.flip && stage.attr === 'current_position|closed' && stage.shown === 60 && stage.back === 40 && stage.word === 'geschlossen', stage);
await check('the popup template sends the turned value', opened !== null && await E(`const h = document.querySelector('home-assistant').hass; const T = (await h.callWS({ type: 'lovelace/config', url_path: arg })).button_card_templates; const c = T ? T.casora_cover.tap_action.casora_popup.content : ''; return !T || (/flip: _cc\\.flip/.test(c) && /attr: _cc\\.attr/.test(c));`, dash.url));

await E(`const s = Object.assign({}, window.CASORA_SETTINGS.security); delete s.percent_closed; window.CASORA_SETTINGS.security = s;`);
const off = await E(`const C = window.casoraCoverControls(document.querySelector('home-assistant').hass.states, [arg], {}); return C.flip;`, cover);
await check('off the list: as before', off === false, off);
await setPos(100);
await finish();
