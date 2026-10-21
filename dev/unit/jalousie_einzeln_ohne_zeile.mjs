// #35: The popup of a single cover (also the drill-in from the group popup) listed that same cover
// as its only row, with a › that reopened the very popup. Expected: one cover gets no row; the
// automation, if set, stays on the right, otherwise one centered column. Groups keep their rows.
//   node dev/unit/jalousie_einzeln_ohne_zeile.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));

const cover = (state, pos) => ({ state, attributes: { current_position: pos, friendly_name: 'Cover' } });
const run = (key, covers, auto) => {
  const body = tpl[key].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const groups = [];
  let std = null;
  const window = {
    innerWidth: 1200,
    casoraIconUrl: (n) => '/casora_assets/icons/' + n + '.svg',
    _casoraUI: {
      group: (rows, label) => { groups.push({ rows, label }); return '<group>'; },
      slider: () => '<slider>', segments: () => '<segments>', label: (t) => t,
      soft: () => true, tokens: {},
    },
    _casoraStd: (ui, o) => { std = o; return ui; },
  };
  const states = {};
  covers.forEach((id, i) => { states[id] = cover(i ? 'closed' : 'open', i ? 0 : 100); });
  if (auto) states['switch.shade_auto'] = { state: 'on', attributes: {} };
  const variables = { covers, smart_automation_entity: auto ? 'switch.shade_auto' : null };
  const card = new Function('window', 'states', 'hass', 'entity', 'variables', 'user', body)(
    window, states, { entities: {} }, states[covers[0]] && { entity_id: covers[0], ...states[covers[0]] }, variables, {});
  const fields = card.cards[0].custom_fields;
  return { groups, std, fields };
};

for (const key of ['casora_cover', 'casora_popup_cover']) {
  let r = run(key, ['cover.a']);
  assert.equal(r.fields.k0, undefined, key + ': single cover lists itself');
  assert.ok(!r.groups.some(g => g.rows.some(x => x.entity === 'cover.a')), key + ': row for the cover itself');
  assert.equal(r.std.single, true, key + ': single cover without automation is one column');

  r = run(key, ['cover.a'], true);
  assert.equal(r.fields.k0, undefined, key + ': single cover with automation lists itself');
  assert.deepEqual(r.std.right, ['auto'], key + ': automation stays on the right');
  assert.ok(r.fields.auto, key + ': automation missing');

  r = run(key, ['cover.a', 'cover.b']);
  assert.ok(r.fields.k0, key + ': group lost its list');
  assert.deepEqual(r.groups[0].rows.map(x => x.entity), ['cover.a', 'cover.b'], key + ': group rows');
}
console.log('ok jalousie_einzeln_ohne_zeile');
