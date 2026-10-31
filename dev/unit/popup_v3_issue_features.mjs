// Popup v3 is clean (popup-richtlinien-v3.md §8), with one exception: what users asked for in an issue is content, not a
// setting – it stays as a row, section or subpage. This test pins each of those features in the v3 popup, so a later
// clean-up cannot drop one silently again.   node dev/unit/popup_v3_issue_features.mjs
//   #98 network: section „Internet“ (provider, also from an attribute; public IPv4/IPv6; latency per target)
//   #81 covers: the shade automation switch (and „Automatik heute“) as the last row of the cover list, redrawn live;
//       the Studio offers its fields again
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const load = (p) => new Function(rd('custom_components/casora/scripts/local/' + p))();
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.innerWidth = 1200;
// Stand-in for casora-core's _casoraUI in v3: UI.more without keep yields nothing (as in casora-core.js).
const UI = window._casoraUI = {
  esc, v3: () => true,
  more: (id, html, o) => (o && o.keep ? html : ''),
  settings: () => '', settingsRow: () => '',
  stage: (type, o) => '<div class="stage" data-type="' + type + '">' + esc(o.text || '') + '</div>',
  group: (rows, label) => '<div class="g"><h3>' + esc(label || '') + '</h3>' + rows.map((r) => '<div class="r" data-casora-live="text" data-casora-ent="'
    + esc(r.entity || '') + '">' + esc(r.label) + '|' + esc(r.value || '') + '|' + esc([].concat(r.sub || []).join(' ; ')) + '</div>').join('') + '</div>',
};
// Runs a section card the way button-card does: its custom field is `[[[ return window.X.sec(…) ]]]`.
const runCard = (card, states, hass) => new Function('states', 'hass', card.custom_fields.c.replace(/^\[\[\[\n?|\n?\]\]\]$/g, ''))(states, hass);

// ── #98 network: „Internet“ in the v3 popup ────────────────────────────────
{
  load('00-finder.js');
  load('05-weich-mehr.js');
  const st = (state, attributes = {}) => ({ state, attributes });
  const states = {
    'sensor.t_dl': st('512'), 'sensor.t_ul': st('48'), 'binary_sensor.t_wan': st('on'),
    'binary_sensor.t_link': st('on', { provider: 'Example Telecom GmbH', external_ip: '203.0.113.7', external_ipv6: '2001:db8::7' }),
    'sensor.t_ping_a': st('11.6'), 'sensor.t_ping_b': st('24.2'),
  };
  const hass = { states, entities: {}, devices: {}, locale: { language: 'de' } };
  const v = {
    entity_isp: 'binary_sensor.t_link', entity_isp_attribute: 'provider',
    entity_wan_ipv4: 'binary_sensor.t_link', entity_wan_ipv4_attribute: 'external_ip',
    entity_wan_ipv6: 'binary_sensor.t_link', entity_wan_ipv6_attribute: 'external_ipv6',
    latency_entities: [['sensor.t_ping_a', 'Ziel A'], ['sensor.t_ping_b', 'Ziel B']],
    network_devices: [], wlan_entities: [],
  };
  const out = window._casoraSoftNet.build({ states, hass, variables: v, ids: { dl: 'sensor.t_dl', ul: 'sensor.t_ul', status: 'binary_sensor.t_wan' } });
  const f = out.custom_fields || (out.o && out.o.fields) || {};
  const all = JSON.stringify(out);
  assert.ok(/_casoraSoftNet\.sec\(\\?"inet\\?"/.test(all), '#98: the v3 network popup has the section "Internet"');
  // Find the inet card wherever the layout put it and render it.
  const cards = [];
  (function walk(o) { if (!o || typeof o !== 'object') return; if (o.custom_fields && typeof o.custom_fields.c === 'string') cards.push(o); Object.values(o).forEach(walk); })(out);
  const inet = cards.find((c) => /"inet"/.test(c.custom_fields.c));
  assert.ok(inet, '#98: Internet card');
  const html = runCard(inet, states, hass);
  assert.match(html, /<h3>Internet<\/h3>/);
  assert.match(html, /Anbieter\|Example Telecom\|/, '#98: provider from the attribute, legal form trimmed');
  assert.match(html, /Öffentliche IP\|203\.0\.113\.7\|2001:db8::7/, '#98: public IPv4 and IPv6');
  assert.match(html, /Latenz\|12 ms \/ 24 ms\|Ziel A \/ Ziel B/, '#98: latency per target');
  assert.match(html, /data-hp-live-join="sensor\.t_ping_a,sensor\.t_ping_b"/, '#98: latency updates live');
  assert.ok(!/Speedtest\|/.test(html), 'v3 shows the speedtest in the stage, not as a row');
  assert.ok(inet.triggers_update.includes('binary_sensor.t_link'), '#98: the provider entity is watched');
  void f;
}

// ── #81 covers: shade automation as a live row of the cover list ───────────
{
  const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
  globalThis.localStorage = { getItem: () => null };
  globalThis.matchMedia = () => ({ matches: false });
  const doc0 = globalThis.document;
  globalThis.document = { getElementById: () => true, createElement: () => ({}), head: { appendChild() {} }, querySelector: () => null };
  window.casoraIconUrl = (n) => n;
  const saved = window._casoraUI;
  window._casoraUI = { esc, soft: () => true, v3: () => true, settings: () => '', hero: () => 'HERO', stage: () => 'STAGE',
    label: (t) => t, slider: () => 'SLIDER', segments: () => 'SEG', row: { toggle: (o) => ({ ...o, toggle: true }) },
    group: (rows, label) => 'GROUP[' + label + ']' + rows.map((r) => r.label + '=' + (r.toggle ? (r.on ? 'ON' : 'OFF') + '/' + (r.sub || '') : r.value)).join(';') };
  window._casoraStd = (c) => c;
  const st = (id, state, attributes = {}) => ({ entity_id: id, state, attributes });
  const states = { 'cover.t_a': st('cover.t_a', 'open', { current_position: 100, friendly_name: 'A' }),
    'cover.t_b': st('cover.t_b', 'closed', { current_position: 0, friendly_name: 'B' }),
    'switch.t_shade': st('switch.t_shade', 'on', { friendly_name: 'Shade' }), 'input_boolean.t_today': st('input_boolean.t_today', 'off') };
  const hass = { states, entities: {} };
  const popup = (name, variables, entity) => new Function('states', 'hass', 'variables', 'entity', 'user',
    T[name].tap_action.casora_popup.content.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, ''))(states, hass, variables, entity, {});
  const run = (tpl) => new Function('states', 'hass', tpl.replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(states, hass);
  const vars = { smart_automation_entity: 'switch.t_shade', smart_automation_today_entity: 'input_boolean.t_today' };

  // Group popup: the switch is the last row of the list, in the same section as the covers.
  const g = popup('casora_popup_cover', { covers: ['cover.t_a', 'cover.t_b'], ...vars }, null).cards[0].custom_fields;
  const list = Object.values(g).find((x) => typeof x === 'string' && x.includes('switch.t_shade'));
  assert.ok(list && list.startsWith('[[['), '#81: the cover list with the switch is a live template');
  assert.match(list, /states\["switch\.t_shade"\]/, '#81: button-card watches the switch (written out)');
  assert.match(list, /states\["input_boolean\.t_today"\]/, '#81: and „Automatik heute“');
  assert.equal(run(list), 'GROUP[Vorhänge]A=Geöffnet;B=Geschlossen;Shade=ON/Heute aus', '#81: covers, then the switch');
  states['switch.t_shade'] = st('switch.t_shade', 'off', { friendly_name: 'Shade' });
  assert.match(run(list), /Shade=OFF/, '#81: the row follows the helper at once');
  // One cover (tile popup): no list, the switch stands alone under „Automatik“.
  const one = popup('casora_cover', { ...vars }, { entity_id: 'cover.t_a' }).cards[0].custom_fields;
  const auto = Object.values(one).find((x) => typeof x === 'string' && x.includes('switch.t_shade'));
  assert.ok(auto, '#81: single cover popup has the switch');
  assert.equal(run(auto), 'GROUP[Automatik]Shade=OFF/Heute aus');
  // The Studio offers the fields again (cover tile and cover group).
  const panel = rd('custom_components/casora/panel/casora-panel.js');
  assert.match(panel, /key: "smart_automation_entity", label: "Shade automation"/);
  assert.match(panel, /key: "smart_automation_today_entity", label: "Automation today"/);
  assert.equal((panel.match(/\.\.\.COVER_AUTOMATION_FIELDS/g) || []).length, 2, '#81: cover and cover group');
  window._casoraUI = saved;
  globalThis.document = doc0;
}

console.log('popup_v3_issue_features: ok');
