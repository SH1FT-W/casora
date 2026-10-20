// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-types.js custom_components/casora/panel/casora-panel-b-ux.js dev/casora_mock/haustier.py
// Pet card (#25): a new "Pet tracker" tile finds the Tractive tracker itself (sure hit instead of "Device missing"),
// the "Pet" field lists only Tractive trackers instead of every phone, placeholder "Choose your pet".
// As in HA the tracker sits on the tracker hardware ("Tracker QXKZ7PLM"), the pet's name only on the pet device behind
// it: suggestion, field and "What should go on the dashboard?" say "Testhund", and searching for it finds the tracker.
// Test dog from dev/casora_mock/haustier.py; nothing is saved.
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const ID = 'device_tracker.tracker_qxkz7plm';
const dash = await studioDashboard();
const { page } = await open({ width: 1440, height: 1000 });
await studio(page, dash);
const r = await page.evaluate((ID) => {
  const p = window.__panel(), h = p._hass;
  window.casoraCommunityOn = new Set([...(window.casoraCommunityOn || []), 'casora_pet']);
  const type = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_pet');
  const room = p._state.compact.rooms[0];
  const cands = type ? p._tileCandidates(type, room) : [];
  const phones = Object.keys(h.states).filter((e) => e.startsWith('device_tracker.') && e !== ID).length;
  const ux = p._uxDevices ? p._uxDevices().find((x) => x.entity === ID) : null;
  return { type: !!type, first: cands[0] || null, n: cands.length, phones, placeholder: type && type.entityPlaceholder,
    has: !!h.states[ID], meta: p._entMeta(ID), ux: ux && { name: ux.name, type: ux.type } };
}, ID);
await need('test dog in the test house (mock)', r.has);
await need('tile type pet tracker', r.type);
await check('new tile finds the tracker itself (sure)', r.first && r.first.id === ID && r.first.sure, r.first);
await check('suggestion is named like the pet', r.first && r.first.name === 'Testhund', r.first && r.first.name);
await check('only Tractive trackers suggested', r.n === 1, { n: r.n, otherTrackers: r.phones });
await check('placeholder names the pet', r.placeholder === 'Choose your pet', r.placeholder);
await check('field shows the pet, the tracker below', r.meta.short === 'Testhund' && /Tracker QXKZ7PLM/.test(r.meta.ctx), r.meta);
await check('device list: pet as pet tracker', r.ux && r.ux.name === 'Testhund' && r.ux.type === 'casora_pet', r.ux);
await finish();
