// @zustand: arbeit
// @parallel: ui
// Issue #247: a card pasted through "Custom card (YAML)" is hosted by a casora_custom tile, yet it sat on the room
// photo without any surface while the Casora tiles next to it had theirs. casora_custom switched off its own
// background and the inner card's at the same time, so nothing drew one. Expected: the host draws the same surface,
// radius and shadow as a regular Casora tile beside it, and the inner card stays transparent (no second surface).
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('a Casora dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const ent = Object.keys(ha.hass.states).find((k) => k.startsWith('light.'))
    || Object.keys(ha.hass.states).find((k) => k.startsWith('sensor.'));
  const isEntityTile = (b) => [].concat((b._config || {}).template || []).some((t) => /^casora_(light|entity|switch|sensor)/.test(t));
  const ref = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect();
    return isEntityTile(b) && x.width > 120 && x.width < 420 && x.height > 60 && x.top > 100; });
  if (!ref) return { noRef: true };
  const mk = (cfg) => { const b = document.createElement('button-card');
    b.setConfig(Object.assign({ type: 'custom:button-card', name: 'QA r621' }, cfg)); b.hass = ha.hass;
    ref.parentNode.insertBefore(b, ref); return b; };
  const host = mk({ template: 'casora_custom', custom_fields: { card: { type: 'tile', entity: ent } } });
  // The neighbour may be active (raised shadow); the host has no entity and rests, like an idle entity tile.
  const idle = mk({ template: 'casora_entity' });
  for (let i = 0; i < 3; i++) { await new Promise((res) => setTimeout(res, 400)); host.hass = idle.hass = Object.assign({}, ha.hass); }
  await new Promise((res) => setTimeout(res, 800));
  const surface = (b) => { const c = b.shadowRoot && b.shadowRoot.querySelector('ha-card'); const s = c && getComputedStyle(c);
    return s ? { bg: s.backgroundColor, radius: s.borderTopLeftRadius, shadow: s.boxShadow } : null; };
  const find = (n, tag) => { for (const c of n.children || []) { if (c.localName === tag) return c; const x = find(c, tag); if (x) return x; }
    return n.shadowRoot ? find(n.shadowRoot, tag) : null; };
  const tile = find(host, 'hui-tile-card');
  const innerCard = tile && tile.shadowRoot && tile.shadowRoot.querySelector('ha-card');
  const out = { ref: surface(ref), host: surface(host), idle: surface(idle),
    inner: innerCard ? getComputedStyle(innerCard).backgroundColor : null, refTemplate: [].concat(ref._config.template) };
  host.remove(); idle.remove();
  return out;
});
await need('a regular Casora tile to compare with', !r.noRef, r);
const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
await check('host tile draws a surface', !clear(r.host && r.host.bg), r);
await check('host surface equals the neighbouring Casora tile', r.host && r.ref && r.host.bg === r.ref.bg, r);
await check('host radius equals the neighbouring tile', r.host && r.ref && r.host.radius === r.ref.radius,
  [r.host && r.host.radius, r.ref && r.ref.radius]);
await check('host shadow equals an idle Casora tile', r.host && r.idle && r.host.shadow !== 'none' && r.host.shadow === r.idle.shadow,
  [r.host && r.host.shadow, r.idle && r.idle.shadow]);
await check('inner tile card rendered', !!r.inner, r);
await check('inner card stays transparent (no second surface)', clear(r.inner), r);
await finish();
