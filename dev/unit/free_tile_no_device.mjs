// GitHub issue 128: the Universal tile's popup said "Wähle im Studio ein Gerät oder ergänze …" (and "Kein Gerät gewählt")
// in the live dashboard whenever no device was chosen, although the device is optional. Live: no setup hint, no
// "Kein Gerät gewählt"; a tile with values, history or own cards shows them without a stage, a tile with nothing at all a
// calm "Noch nicht eingerichtet". The Studio preview keeps its hint. All devices invented.
//   node dev/unit/free_tile_no_device.mjs
// @deckt: 28-free-tile.js#F.sec, 28-free-tile.js#F.popup, 28-free-tile.js#F.plan
import assert from 'node:assert/strict';
import { freeTileEnv, stubKit, stubUI } from './lib/free_tile_env.mjs';

const { F, states, hass } = freeTileEnv();
stubKit();
const UI = stubUI();
UI.v3 = () => true;
const stages = [];
UI.stage = (t, o) => { stages.push([t, o]); return '<stage ' + t + '>' + JSON.stringify(o) + '</stage>'; };
const HINT = /Wähle im Studio|Im Studio kannst du|Kein Gerät gewählt/;
const VARIANTS = {
  values: { free_values: ['sensor.qa_temp'] },
  chart: { free_chart: true, free_chart_entity: 'sensor.qa_temp' },
  ownCards: { popup_extra_cards: [{ type: 'markdown', content: 'x' }] },
  ownEntities: { popup_extra_entities: ['sensor.qa_temp'] },
  nothing: {},
};
const sec = (part, vars) => F.sec(part, F.plan(null, states, hass, vars), states, hass);

// ── Live dashboard ──
delete window.casoraInStudio;
for (const [k, vars] of Object.entries(VARIANTS)) {
  for (const part of ['stage', 'line', 'hero']) {
    assert.doesNotMatch(sec(part, vars), HINT, 'live ' + part + ' (' + k + '): no setup hint');
  }
  const L = F.popup(null, states, hass, vars);
  if (k === 'nothing') {
    assert.ok(L.fields.stage, 'live, nothing at all: a stage, never an empty popup');
    stages.length = 0;
    sec('stage', vars);
    const o = stages[0][1];
    assert.ok(o.empty && !o.empty.studio && o.empty.text === 'Noch nicht eingerichtet', 'live, nothing at all: calm empty state ' + JSON.stringify(o));
    assert.match(sec('hero', vars), /Noch nicht eingerichtet/, 'v2 hero, nothing at all: calm line');
  } else {
    assert.ok(!L.fields.stage, 'live (' + k + '): no stage without a device, the content stands alone');
    assert.equal(sec('line', vars), '<line>|</line>', 'live (' + k + '): empty status line');
  }
}

// ── Studio preview: the admin still sees where to choose a device ──
window.casoraInStudio = () => true;
for (const [k, vars] of Object.entries(VARIANTS)) {
  assert.ok(F.popup(null, states, hass, vars).fields.stage, 'Studio (' + k + '): stage with the hint');
  stages.length = 0;
  sec('stage', vars);
  assert.ok(stages[0][1].empty && stages[0][1].empty.studio, 'Studio (' + k + '): hint plate to the Studio');
  assert.match(sec('hero', vars), /Wähle im Studio ein Gerät/, 'Studio hero (' + k + '): hint');
}
delete window.casoraInStudio;
console.log('free_tile_no_device: ok');
