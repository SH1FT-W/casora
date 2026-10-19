// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-types.js dev/casora_mock/haustier.py
// Haustier-Karte (#25): Eine neue Kachel „Haustier-Tracker“ findet den Tractive-Tracker selbst (sicherer Treffer,
// statt „Gerät fehlt“), das Feld „Tier“ listet nur Tractive-Tracker statt aller Handys, Platzhalter „Tier wählen“.
// Testhund aus dev/casora_mock/haustier.py; nichts wird gespeichert.
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
const { page } = await open({ width: 1440, height: 1000 });
await studio(page, dash);
const r = await page.evaluate(() => {
  const p = window.__panel(), h = p._hass;
  window.casoraCommunityOn = new Set([...(window.casoraCommunityOn || []), 'casora_pet']);
  const type = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_pet');
  const room = p._state.compact.rooms[0];
  const cands = type ? p._tileCandidates(type, room) : [];
  const phones = Object.keys(h.states).filter((e) => e.startsWith('device_tracker.') && e !== 'device_tracker.testhund').length;
  return { type: !!type, first: cands[0] || null, n: cands.length, phones, placeholder: type && type.entityPlaceholder,
    has: !!h.states['device_tracker.testhund'] };
});
await need('Testhund im Testhaus (Mock)', r.has);
await need('Kachelart Haustier-Tracker', r.type);
await check('neue Kachel findet den Tracker selbst (sicher)', r.first && r.first.id === 'device_tracker.testhund' && r.first.sure, r.first);
await check('nur Tractive-Tracker vorgeschlagen', r.n === 1, { n: r.n, andereTracker: r.phones });
await check('Platzhalter nennt das Tier', r.placeholder === 'Choose your pet', r.placeholder);
await finish();
