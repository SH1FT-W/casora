// u05-06 (review 26.11.2026): the cover popup offered Auf · Beschatten · Zu but no way to stop a moving blind; only the
// hold menu had „Stopp“. Now the dial carries a „Stopp“ moon (cover.stop_cover) for the covers that support stopping
// (supported_features & 8), in the group popup and the single blind's own copy. Popup evaluated with stand-ins.
//   node dev/unit/cover_popup_stop.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_popup_cover,casora_cover
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
globalThis.localStorage = { getItem: () => 'v3' };
for (const name of ['casora_popup_cover', 'casora_cover']) {
  const src = tpl[name].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  let stage = null;
  const any = () => '';
  const UI = new Proxy({ stage: (t, o) => { stage = o; return 'STAGE'; }, soft: () => true, segments: () => 'SEG',
    group: () => 'GROUP', label: (t) => t, popupNames: () => (x) => x }, { get: (o, k) => (k in o ? o[k] : any) });
  const window = { _casoraUI: UI, innerWidth: 1200,
    casoraCoverControls: (S, ids, v) => ({ shown: (x) => x, flip: false, attr: 'current_position', open: 'Auf', close: 'Zu',
      shade: v.shade === false ? null : 50, shadeText: 'Beschatten', scope: '', closedWord: '' }),
    casoraCoverRowWords: (W) => W, casoraCoverKind: () => ({ key: 'blind', label: 'Jalousien', open: 'a', closed: 'b' }) };
  const run = (states, variables, entity = null) => {
    stage = null;
    new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(window, states, { entities: {} }, variables, entity, {});
    return stage.moons;
  };
  const cover = (state, feats) => ({ state, attributes: { current_position: 40, supported_features: feats } });

  // A closing blind that can stop: Auf · Beschatten · Stopp · Zu.
  let m = run({ 'cover.qa_bad': cover('closing', 15) }, {}, { entity_id: 'cover.qa_bad' });
  assert.deepEqual(m.map((x) => x.text), ['Auf', 'Beschatten', 'Stopp', 'Zu'], name + ': a stop moon');
  const stop = m.find((x) => x.text === 'Stopp');
  assert.deepEqual(stop.svc, { domain: 'cover', service: 'stop_cover', target: { entity_id: ['cover.qa_bad'] } });
  assert.ok(!stop.active && stop.value == null, 'stop is never the chosen moon');
  assert.equal(stop.icon, 'mdi:stop');

  // Without a shade position: Auf · Stopp · Zu, like the hold menu.
  m = run({ 'cover.qa_bad': cover('open', 15) }, { shade: false }, { entity_id: 'cover.qa_bad' });
  assert.deepEqual(m.map((x) => x.text), ['Auf', 'Stopp', 'Zu'], name + ': without shade');

  // A cover that cannot stop (open/close/position only): no stop moon.
  m = run({ 'cover.qa_tor': cover('open', 1 | 2 | 4) }, {}, { entity_id: 'cover.qa_tor' });
  assert.ok(!m.some((x) => x.text === 'Stopp'), name + ': no stop without feature 8');

  // Several covers: stop only those that can.
  m = run({ 'cover.qa_a': cover('opening', 15), 'cover.qa_b': cover('opening', 7) }, { covers: ['cover.qa_a', 'cover.qa_b'] });
  assert.deepEqual(m.find((x) => x.text === 'Stopp').svc.target.entity_id, ['cover.qa_a'], name + ': only the covers that stop');
}
console.log('cover_popup_stop: ok');
