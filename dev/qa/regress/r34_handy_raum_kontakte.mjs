// @zustand: arbeit
// Gemeldet (Issue #5, 04.10.2026): Am Handy standen Kontaktsensoren (Fenster/Türen) in keinem Raum
// als Badge, am Desktop schon im Raum-Kopf. Der Studio-Abgleich (syncRoomChips) übertrug nur Klima
// und Licht in room_chips, und casora_mobile_sensor_chips kannte keine Sicherheits-Badges je Raum.
// Erwartet: (1) Der Abgleich schreibt Kontakte (security_entity_N samt Beschriftung) und Schlösser
// des Raums in room_chips, (2) die Raumseite am Handy (WebKit 390×844) zeigt sie als Badges – seit
// 05.10.2026 wie der Raum-Kopf am Desktop (einzeln oder in der Sammel-Badge „Sicherheit“, r44).
// Es wird nichts gespeichert: Studio nur im Speicher, am Handy nur die Karte im Browser umgestellt.
import { open, usePage, studio, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

// ── (1) Studio-Abgleich ──────────────────────────────────────────────────────
const s = await open();
await studio(s.page, dash.url);
const sync = await s.page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const pair = p._pair;
  if (!pair || pair.safe === false) return { pair: false };
  const rooms = pair.desktop.compact.rooms;
  I.syncPairRooms(pair);
  I.syncRoomChips(pair);
  const link = pair.link.links.find((l) => {
    const V = (rooms[l.room] || {}).variables || {};
    return !l.overview && l.section !== null && V.show_security !== false
      && [1, 2, 3, 4, 5, 6, 7, 8].some((n) => /^binary_sensor\./.test(V['security_entity_' + n] || ''));
  });
  if (!link) return { pair: true, room: null };
  const V = rooms[link.room].variables;
  const n = [1, 2, 3, 4, 5, 6, 7, 8].find((k) => /^binary_sensor\./.test(V['security_entity_' + k] || ''));
  const sec = pair.mobile.compact.rooms[link.section];
  const cfg = I.expandMobileConfig(pair.mobile.compact, pair.mobile.scaffold, pair.mobile.extras, pair.mobile.templates, pair.mobile.chrome);
  const kids = cfg.views[0].cards[1].cards;
  const chipsCard = kids.find((c) => c && c.template === 'casora_mobile_sensor_chips');
  const ov = kids.find((c) => c && c.type === 'custom:casora-filter-overlay' && c.room === sec.name);
  const key = (ov && ov.filter_category) || 'room_' + String(sec.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return { pair: true, room: sec.name, key, slot: n, contact: V['security_entity_' + n],
    chips: (((chipsCard || {}).variables || {}).room_chips || {})[key] || null,
    allChips: ((chipsCard || {}).variables || {}).room_chips || {} };
});
await s.browser.close();
await need('Handy-Dashboard gekoppelt', sync.pair);
await need('Raum mit Kontaktsensor (security_entity_N) im Studio', sync.room, sync);
await check(`Abgleich: Kontakt von „${sync.room}“ steht in room_chips`, !!sync.chips && sync.chips['security_entity_' + sync.slot] === sync.contact,
  { room: sync.room, key: sync.key, chips: sync.chips });

// ── (2) Handy: Raumseite zeigt den Kontakt als Badge ─────────────────────────
const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);
const set = await page.evaluate(async (chips) => {
  const el = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  if (!el) return false;
  const cfg = JSON.parse(JSON.stringify(el._config));
  cfg.variables = { ...(cfg.variables || {}), room_chips: chips };
  el.setConfig(cfg);
  el.hass = document.querySelector('home-assistant').hass;
  return true;
}, sync.allChips);
await need('Karte casora_mobile_sensor_chips am Handy', set);
await page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), sync.key);
await page.waitForTimeout(3500);
// Seit 05.10.2026 wie der Raum-Kopf am Desktop: einzeln (show_security_inline) als eigene Badge,
// sonst in der Sammel-Badge „Sicherheit“ – Antippen klappt ihre Unter-Reihe mit dem Kontakt auf.
const look = (field, contact) => page.evaluate(([field, contact]) => {
  const chips = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  const row = chips && chips.shadowRoot && chips.shadowRoot.querySelector('#' + field);
  if (!row || getComputedStyle(row).display === 'none') return { row: false };
  const out = [];
  const walk = (root) => root.querySelectorAll('*').forEach((e) => {
    if (e.localName === 'button-card') {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ t: [].concat(e._config.template || []).join('+'), ent: e._config && e._config.entity });
      return;
    }
    if (e.shadowRoot) walk(e.shadowRoot);
  });
  walk(row);
  return { row: true, badges: out, hit: out.some((b) => b.ent === contact),
    group: out.some((b) => b.t.includes('casora_badge_security_group')) };
}, [field, contact]);
const seen = await look('rooms_row', sync.contact);
let sub = null;
if (!seen.hit && seen.group) {
  // Die Unter-Reihe hängt am gemeinsamen Helfer input_select.casora_expanded_row: Antippen schaltet um.
  // Stand er noch von einem anderen Test auf einer Reihe, klappte der Tipp zu statt auf (09.10.2026,
  // im Gate rot, einzeln grün) – darum vorher zuklappen und danach auf die Reihe warten statt fest 2 s.
  await page.evaluate(() => { const h = document.querySelector('home-assistant').hass, id = 'input_select.casora_expanded_row';
    const st = h.states[id];
    if (st && st.state !== 'none' && (st.attributes.options || []).includes('none')) return h.callService('input_select', 'select_option', { entity_id: id, option: 'none' }); });
  await page.waitForFunction(() => { const st = document.querySelector('home-assistant').hass.states['input_select.casora_expanded_row']; return !st || st.state === 'none'; }, null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const chips = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
    const g = window.__pierce('button-card', chips.shadowRoot.querySelector('#rooms_row'))
      .find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group') && b.getBoundingClientRect().width > 0);
    (g.shadowRoot.querySelector('ha-card') || g).click();
  });
  for (let t0 = Date.now(); Date.now() - t0 < 10000; await page.waitForTimeout(300)) {
    sub = await look('room_sub_security', sync.contact);
    if (sub && sub.hit) break;
  }
}
await check(`Raumseite „${sync.room}“ am Handy zeigt den Kontakt ${sync.contact} als Badge (einzeln oder in „Sicherheit“)`,
  seen.hit || !!(sub && sub.hit), { seen, sub });
await finish();
