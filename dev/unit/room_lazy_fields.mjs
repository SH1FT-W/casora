// Desktop room cards build hidden fields only when needed (w02-03).  node dev/unit/room_lazy_fields.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#__casoraLazyFields
// Found in the 26.11.26 review: every casora_room carried its own hidden "Now playing" and all collapsed sub-badge rows;
// with Home Assistant keeping visited views, 31 rooms held 640,000 nodes and 230 MB. Expected: a lazy field gets a
// stand-in card until its display is not "none" and (sub-badge rows) its row is the expanded one; once built it stays.
// Checked on a stand-in for button-card's prototype (_buildCustomFields reads _config.custom_fields).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('// Room card lazy fields (w02-03)');
const b = core.indexOf('\n})();\n', a) + 6;
assert.ok(a > 0 && b > a, 'lazy fields block in casora-core.js');

let ready;
class Card {
  constructor(cfg, states) { this._config = cfg; this._hass = { states }; this.built = []; }
  // Like button-card: every field with a card gets one, typed from the (evaluated) config it sees right now.
  _buildCustomFields() {
    const cf = this._config.custom_fields;
    const out = {};
    for (const k of Object.keys(cf)) if (cf[k].card) out[k] = cf[k].card.type;
    this.built.push(out);
    return out;
  }
  _getTemplateOrValue(st, v) { return typeof v === 'function' ? v(this) : v; }
}
const w = {};
w.customElements = { get: () => Card, whenDefined: () => ({ then: (f) => { ready = f; } }) };
new Function('window', 'customElements', core.slice(a, b))(w, w.customElements);
ready();

const field = (type) => ({ card: { type } });
const cfg = (more = {}) => ({
  template: ['casora_room'],
  custom_fields: { badges: field('custom:layout-card'), now_playing: field('custom:button-card'),
    badges_lights: field('custom:layout-card'), badges_climate: field('custom:layout-card') },
  styles: { custom_fields: {
    now_playing: [{ 'grid-area': 'now_playing' }, { display: (c) => (c.npOn ? 'block' : 'none') }],
    badges_lights: [{ display: 'block' }],
    badges_climate: [{ display: 'none' }],
  } },
  ...more,
});
const ex = (v) => ({ 'input_select.casora_expanded_row': { state: v } });
const STUB = 'custom:casora-lazy-field';

// Nothing expanded, now playing off: only the visible badge row is real.
const c = new Card(cfg(), ex('none'));
let out = c._buildCustomFields({});
assert.equal(out.badges, 'custom:layout-card', 'the badge row itself is built');
assert.equal(out.now_playing, STUB, 'hidden now playing is a stand-in');
assert.equal(out.badges_lights, STUB, 'collapsed lights row is a stand-in');
assert.equal(out.badges_climate, STUB);
assert.equal(c._config.custom_fields.now_playing.card.type, 'custom:button-card', 'the card config is left as it was');

// The lights row is expanded: built; climate (display none) stays a stand-in even when expanded.
c._hass = { states: ex('lights') };
out = c._buildCustomFields({});
assert.equal(out.badges_lights, 'custom:layout-card', 'expanded row is built');
assert.equal(out.badges_climate, STUB);
// Collapsed again: the real card stays (no rebuild on every toggle).
c._hass = { states: ex('none') };
out = c._buildCustomFields({});
assert.equal(out.badges_lights, 'custom:layout-card', 'a built row stays built');
c._hass = { states: ex('climate') };
assert.equal(c._buildCustomFields({}).badges_climate, STUB, 'a row with display none is never built');

// Now playing shows up later (display turns block): built from then on.
c.npOn = true;
assert.equal(c._buildCustomFields({}).now_playing, 'custom:button-card');

// Other cards are not touched.
const other = new Card({ ...cfg(), template: ['casora_light'] }, ex('none'));
assert.equal(other._buildCustomFields({}).now_playing, 'custom:button-card', 'only casora_room is lazy');
console.log('room_lazy_fields: ok');
