// No text from Home Assistant or the user is evaluated as a button-card template (HACS review 5, point 2).
//   node dev/unit/no_eval.mjs
// button-card runs every config string that is exactly "[[[ … ]]]" (after trim) as JavaScript: name, label, variables
// (deeply), action configs and the strings of a nested card unless its custom field says do_not_eval. A media title,
// friendly_name or template result of that shape ran in the viewer's session. Checks:
//   1. the casora-noeval block (casoraNoEval) is the same in every file and guards only "[[[" texts,
//   2. tools/noeval-check.mjs: its rules on samples, then the whole codebase is clean and no allow entry is stale,
//   3. the paths of the review with "[[[ window.__pwned = 1 ]]]" as media title / friendly_name / camera name / chart
//      series name / template result: now playing (phone tap and the cards), the hidden card that opens a popup,
//      own() of the soft kit, Frigate and doorbell camera names, free tile and fridge charts, own badges,
//   4. every card template rendered like button-card 7 does (variables, fields, nested cards with and without
//      do_not_eval, actions, popup content) against a house where every name, state, title and area is such a
//      template: none of them runs, and no do_not_eval card holds a template it would have needed the parent for.
// @deckt: casora-core.js#casoraNoEval,_casoraNPRef,_casoraNPRec, 09-weich-wiedergabe.js#open, 01-basis.js#openViaCard,casoraPopupTitle, 05-weich-mehr.js#own,layout, 02-devices.js#own, 23-frigate.js, 24-klingel.js, 28-free-tile.js, 29-eigene-badges.js#cardConfig, 30-fridge.js, casora-chart.js
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as CHK from '../../tools/noeval-check.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');

// ── 1. casora-noeval block ────────────────────────────────────────────────────────────────────────────────────────
const BLOCK_FILES = ['custom_components/casora/scripts/casora-core.js', 'custom_components/casora/scripts/casora-local.js',
  'custom_components/casora/panel/casora-panel.js'];
const blockOf = (src) => {
  const a = src.indexOf('// casora-noeval:begin'), b = src.indexOf('// casora-noeval:end');
  assert.ok(a >= 0 && b > a, 'casora-noeval block present');
  return src.slice(a, b);
};
const blocks = BLOCK_FILES.map((f) => blockOf(read(f)));
blocks.forEach((b, i) => assert.equal(b, blocks[0], BLOCK_FILES[i] + ': casora-noeval block differs from casora-core.js'));
// button-card 7.0.1, _getTemplateOrValue: the test of a string for a template.
const BC_RE = /^(\[{3,})(.*?)(\]{3,})$/s;
const bcIsTpl = (v) => { if (typeof v !== 'string') return false; const r = v.trim().match(BC_RE); return !!(r && r[1].length === 3 && r[3].length === 3); };
{
  const w = {};
  new Function('window', blocks[0])(w);
  const g = w.casoraNoEval;
  assert.equal(typeof g, 'function');
  for (const bad of ['[[[ window.__pwned = 1 ]]]', '  [[[x]]]  ', '\n[[[return 1]]]']) {
    assert.ok(bcIsTpl(bad), 'sample is a template: ' + bad);
    assert.ok(!bcIsTpl(g(bad)), 'guarded: ' + bad);
    assert.equal(g(bad).replace(/​/g, ''), bad, 'shown the same');
  }
  for (const ok of ['Wohnzimmer', '[Beta] Lampe', 'a [[[x]]]', '', 'Küche & Bad']) assert.equal(g(ok), ok, 'unchanged: ' + ok);
  assert.equal(g(null), null); assert.equal(g(5), 5);
  const o = g({ a: '[[[x]]]', b: ['[[[y]]]', 'z'], c: { d: '[[[q]]]' }, n: 1 });
  assert.ok(!bcIsTpl(o.a) && !bcIsTpl(o.b[0]) && o.b[1] === 'z' && !bcIsTpl(o.c.d) && o.n === 1, 'objects guarded deeply');
  // The local stand-ins (a module or template may run before casora-core): every noEval helper of the scripts and the
  // inline form of the templates guard the same way.
  const probe = (f, where) => {
    assert.ok(!bcIsTpl(f('[[[ window.__pwned = 1 ]]]')), where + ': guards');
    assert.equal(f('Wohnzimmer'), 'Wohnzimmer', where + ': leaves names');
  };
  for (const file of CHK.listScripts()) {
    const src = read(file);
    for (const m of src.matchAll(/(?:var|const|let)\s+noEval\s*=\s*([^\n]+);\n/g)) {
      probe(new Function('window', 'return (' + m[1] + ');')({}), file + ' noEval');
      probe(new Function('window', 'return (' + m[1] + ');')({ casoraNoEval: g }), file + ' noEval (core loaded)');
    }
  }
  const tplSrc = read('dashboards/casora/button_card_templates.json');
  const INLINE = "(window.casoraNoEval || ((v) => (typeof v === 'string' && /^\\\\s*\\\\[\\\\[\\\\[/.test(v) ? '\\\\u200b' + v : v)))(";
  const inl = tplSrc.split('(window.casoraNoEval ||').length - 1;
  assert.ok(inl > 5, 'templates use the inline guard');
  assert.equal(tplSrc.split(INLINE).length - 1, inl, 'every inline guard in the templates is the same text');
  probe(new Function('window', 'return ' + JSON.parse('"' + INLINE.slice(0, -1) + '"') + ';')({}), 'inline guard');
}

// ── 2. Static checker ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const flagged = (code) => { const out = []; CHK.checkSource('sample.js', code, [], out); return out.map((o) => o.expr); };
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', name: st.attributes.friendly_name };"), ['name: st.attributes.friendly_name']);
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', entity: id, name: '[[[ return entity.attributes.friendly_name ]]]' };"), []);
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', template: 'casora_x', variables: { src: rec } };"), ['src: rec']);
  assert.deepEqual(flagged("var c = { template: 'casora_x', variables: { src_ref: window._casoraNPRef(rec), n: list.length } };"), []);
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', name: window.casoraNoEval(nm) };"), []);
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', label: 'Akku ' + name };"), [], 'fixed text in front: never a whole template');
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', label: name + ' ' };"), ['label: name + \' \''], 'whitespace is trimmed away');
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', custom_fields: { c: '[[[ return f(' + JSON.stringify(x) + ') ]]]' } };"), []);
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', name: '[[[ return \"' + name + '\" ]]]' };"), ["name: '[[[ return \"' + name + '\" ]]]'"], 'data pasted into code');
  assert.deepEqual(flagged("var f = { card: { type: 'custom:casora-chart', series: [{ entity: e }] } };"), ['custom field card custom:casora-chart without do_not_eval: true']);
  assert.deepEqual(flagged("var f = { card: { type: 'custom:casora-chart', series: [{ entity: e }] }, do_not_eval: true };"), []);
  assert.deepEqual(flagged("var f = { card: { type: 'custom:button-card', template: 'casora_x' } };"), [], 'a nested button-card evaluates itself');
  assert.deepEqual(flagged("var c = { type: 'custom:casora-chart', series: list.map(function (z) { return { entity: z.id, name: z.label }; }) };"), ['name: z.label']);
  assert.deepEqual(flagged("cfg.name = st.attributes.friendly_name;"), ['cfg.name: st.attributes.friendly_name']);
  assert.deepEqual(flagged("var x = { type: 'lovelace/config', url_path: p, name: n };"), [], 'not a card');
  assert.deepEqual(flagged("var c = { type: 'custom:button-card', name: rec.source, label: st.attributes.preset_mode };"), ['name: rec.source', 'label: st.attributes.preset_mode'], 'source and modes are text');

  const { out, unused, over } = CHK.run();
  if (out.length) console.log(out.slice(0, 40).map((o) => `${o.file}:${o.line}${o.where ? ' [' + o.where + ']' : ''}: ${o.expr}`).join('\n'));
  assert.equal(out.length, 0, out.length + ' unguarded value(s) in card configs (node tools/noeval-check.mjs)');
  assert.deepEqual(unused.map((a) => a.f + ' | ' + a.expr), [], 'stale entries in tools/noeval-allow/');
  assert.deepEqual(over.map((a) => a.f + ' | ' + a.expr), [], 'allow entries cover more places than counted');
}

// ── Browser-like environment with the dashboard scripts ───────────────────────────────────────────────────────────
const noop = () => {};
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? () => stub() : stub()),
  apply: () => stub(), construct: () => stub(),
});
const G = globalThis;
// An object whose missing members are stubs.
const withStub = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : stub()) });
G.window = G;
G.document = stub();
G.customElements = { get: () => null, define: noop, whenDefined: () => new Promise(noop) };
G.HTMLElement = class { attachShadow() { return stub(); } };
G.location = { pathname: '/casora/home', search: '', hash: '', origin: 'http://ha.local' };
G.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
G.addEventListener = noop; G.removeEventListener = noop;
G.setTimeout = () => 0; G.setInterval = () => 0; G.clearTimeout = noop; G.clearInterval = noop;
G.requestAnimationFrame = () => 0;
G.getComputedStyle = () => ({ getPropertyValue: () => '' });
G.MutationObserver = class { observe() {} disconnect() {} };
G.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
G.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
G.CustomEvent = class { constructor(t, d) { this.type = t; Object.assign(this, d); } };
G.innerWidth = 1400; G.innerHeight = 900;
Object.defineProperty(G, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
Object.defineProperty(G, 'navigator', { value: { userAgent: 'node', language: 'de', vibrate: noop }, configurable: true });
G.fetch = () => Promise.reject(new Error('offline'));
const quiet = (f) => {
  const k = ['info', 'warn', 'log', 'error', 'debug'], saved = k.map((x) => console[x]);
  k.forEach((x) => { console[x] = noop; });
  try { return f(); } finally { k.forEach((x, i) => { console[x] = saved[i]; }); }
};
{
  const files = ['custom_components/casora/scripts/casora-core.js', 'custom_components/casora/scripts/casora-chart.js'];
  for (const f of fs.readdirSync(new URL('custom_components/casora/scripts/local/', ROOT)).sort()) files.push('custom_components/casora/scripts/local/' + f);
  const failed = [];
  quiet(() => { for (const f of files) { try { new Function(read(f))(); } catch (e) { failed.push(f + ': ' + e.message); } } });
  assert.deepEqual(failed, [], 'dashboard scripts load');
}

// Every hit of a hostile template lands here (the payloads call it); the named paths use the plain one below.
const HITS = [];
const TAGS = [];
G.__casoraHit = (n) => { HITS.push({ tag: TAGS[n], where: CUR.join(' > ') }); return 'x'; };
const CUR = [];
const PWN = '[[[ window.__pwned = 1 ]]]';
// No quote or "&" in the payload: an HTML-escaped copy of a name is still the same template.
const hostile = (tag) => '[[[ return globalThis.__casoraHit(' + (TAGS.push(tag) - 1) + '); ]]]';

// ── The house ─────────────────────────────────────────────────────────────────────────────────────────────────────
const states = {}, entities = {}, devices = {}, areas = {}, floors = {};
const house = (N) => {
  for (const o of [states, entities, devices, areas, floors]) for (const k of Object.keys(o)) delete o[k];
  floors.f1 = { floor_id: 'f1', name: N('floor'), level: 0 };
  areas.a1 = { area_id: 'a1', name: N('area'), floor_id: 'f1', icon: 'mdi:sofa' };
  devices.d1 = { id: 'd1', name: N('device'), name_by_user: N('device_by_user'), area_id: 'a1', manufacturer: N('manufacturer'), model: N('model') };
  const add = (id, state, attrs = {}) => {
    states[id] = { entity_id: id, state, attributes: { friendly_name: N('friendly_name ' + id), ...attrs },
      last_changed: '2026-11-04T08:00:00Z', last_updated: '2026-11-04T08:00:00Z', context: {} };
    entities[id] = { entity_id: id, device_id: 'd1', area_id: 'a1', platform: 'demo', name: N('registry name ' + id), labels: [] };
  };
  add('light.x', 'on', { brightness: 128, supported_color_modes: ['brightness'], color_mode: 'brightness', entity_id: ['light.y'] });
  add('light.y', 'on', { brightness: 255, supported_color_modes: ['brightness'], color_mode: 'brightness' });
  add('switch.x', 'on');
  add('sensor.text', N('state sensor.text'));
  add('sensor.temperature', '21.5', { device_class: 'temperature', unit_of_measurement: '°C' });
  add('sensor.humidity', '48', { device_class: 'humidity', unit_of_measurement: '%' });
  add('sensor.power', '120', { device_class: 'power', unit_of_measurement: 'W' });
  add('sensor.battery', '15', { device_class: 'battery', unit_of_measurement: '%' });
  add('binary_sensor.door', 'on', { device_class: 'door' });
  add('binary_sensor.window', 'on', { device_class: 'window' });
  add('binary_sensor.motion', 'on', { device_class: 'motion' });
  add('person.x', 'home', { source: 'device_tracker.x' });
  add('device_tracker.x', 'home', { source_type: 'gps', battery_level: 50 });
  add('media_player.x', 'playing', { media_title: N('media_title'), media_artist: N('media_artist'), media_album_name: N('album'),
    app_name: N('app_name'), source: N('source'), volume_level: 0.4, source_list: [N('source_list')], supported_features: 49151,
    media_duration: 200, media_position: 20, media_position_updated_at: '2026-11-04T08:00:00Z' });
  add('climate.x', 'heat', { current_temperature: 20, temperature: 21, hvac_modes: ['off', 'heat'], hvac_action: 'heating', preset_mode: N('preset'), preset_modes: [N('preset')] });
  add('cover.x', 'open', { current_position: 40, device_class: 'blind' });
  add('lock.x', 'unlocked');
  add('camera.x', 'idle', { entity_picture: '/api/camera_proxy/camera.x?token=1' });
  add('camera.y', 'idle', { entity_picture: '/api/camera_proxy/camera.y?token=1' });
  add('calendar.x', 'on', { message: N('calendar message'), description: N('calendar description'), location: N('location'), start_time: '2026-11-04 10:00:00', end_time: '2026-11-04 11:00:00', all_day: false });
  add('weather.x', 'rainy', { temperature: 12, humidity: 80, forecast: [] });
  add('vacuum.x', 'cleaning', { battery_level: 50, status: N('vacuum status'), fan_speed: N('fan speed'), fan_speed_list: [N('fan speed')] });
  add('scene.x', '2026-11-04T08:00:00Z', { icon: 'mdi:palette' });
  add('script.x', 'off');
  add('alarm_control_panel.x', 'disarmed', { code_format: null });
  add('update.x', 'on', { title: N('update title'), installed_version: '1.0', latest_version: '2.0', release_summary: N('release summary') });
  add('fan.x', 'on', { percentage: 50, preset_mode: N('fan preset'), preset_modes: [N('fan preset')] });
  add('input_boolean.x', 'on');
  add('input_select.x', N('state input_select'), { options: [N('option'), 'b'] });
  add('todo.x', '2');
  add('lawn_mower.x', 'mowing');
  add('humidifier.x', 'on', { humidity: 50, mode: N('humidifier mode'), available_modes: [N('humidifier mode')] });
  add('water_heater.x', 'eco', { temperature: 50, operation_mode: N('operation'), operation_list: [N('operation')] });
  add('select.x', N('state select'), { options: [N('select option')] });
  add('event.x', '2026-11-04T08:00:00Z', { event_type: N('event type') });
  // Casora's own helpers, read by fixed id in the templates (states anyone with a service call can set).
  for (const id of ['input_text.casora_now_playing_pinned', 'input_select.casora_expanded_row', 'input_boolean.casora_now_playing_minimized',
    'sensor.casora_media_paused', 'sensor.casora_update_ki_analyse', 'input_select.casora_scene_menu']) add(id, N('state ' + id));
};
const hass = {
  states, entities, devices, areas, floors, user: { id: 'u1', name: 'u', is_admin: true },
  language: 'de', locale: { language: 'de', number_format: 'language', time_format: '24' },
  config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'Europe/Berlin', components: [] },
  themes: { darkMode: true }, connection: { subscribeMessage: () => Promise.resolve(noop), subscribeEvents: () => Promise.resolve(noop) },
  callWS: () => Promise.resolve([]), callService: () => Promise.resolve(), callApi: () => Promise.resolve([]),
  formatEntityState: (st) => String(st && st.state), formatEntityAttributeValue: (st, a) => String(st && st.attributes && st.attributes[a]),
  formatEntityAttributeName: (st, a) => a, localize: (k) => k, hassUrl: (p) => p,
};
G.casoraHass = hass;

// ── button-card 7.0.1, as far as evaluation goes ──────────────────────────────────────────────────────────────────
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const deepCopy = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v.map(deepCopy) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'function' ? x : deepCopy(x)]))) : v);
const deepMerge = (a, b) => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const o = Object.assign({}, a && typeof a === 'object' && !Array.isArray(a) ? a : {});
  for (const [k, v] of Object.entries(b)) o[k] = k in o ? deepMerge(o[k], v) : v;
  return o;
};
const resolve = (cfg, depth = 0) => {
  if (!cfg || depth > 12) return cfg || {};
  const names = cfg.template ? [].concat(cfg.template) : [];
  let base = {};
  for (const n of names) if (T[n]) base = deepMerge(base, resolve(T[n], depth + 1));
  const own = Object.assign({}, cfg); delete own.template;
  return deepMerge(base, own);
};
const STATS = { cards: 0, evals: 0, threw: 0, popups: 0, nested: 0, dne: 0 };
const NEED_PARENT = [];
let budget = 0;
class Card {
  constructor(cfg, path) {
    this._config = resolve(deepCopy(cfg));
    this._hass = hass; this.hass = hass; this.isConnected = true; this.style = { setProperty: noop, removeProperty: noop };
    this.dataset = {}; this.shadowRoot = stub(); this.path = path;
    const e = this._config.entity;
    this._stateObj = e && !bcIsTpl(e) ? states[e] : (bcIsTpl(e) ? states[this.tov(e)] : undefined);
    const vars = deepCopy(this._config.variables || {});
    const me = this, done = {};
    this._pVariables = new Proxy(vars, { get(t, k) {
      if (k in done) return done[k];
      if (!(k in t)) return undefined;
      done[k] = undefined;
      const o = t[k];
      done[k] = o && typeof o === 'object' && 'value' in o ? me.objEval(o.value) : me.objEval(o);
      return done[k];
    } });
  }
  evalTpl(body) {
    STATS.evals++;
    if (++budget > 400000) return undefined;
    try {
      return new Function('states', 'entity', 'user', 'hass', 'variables', 'html', 'helpers', "'use strict'; " + body)
        .call(this, states, this._stateObj, hass.user, hass, this._pVariables, (s) => String(s), {});
    } catch (e) { STATS.threw++; return undefined; }
  }
  // _getTemplateOrValue: objects in place, strings that are a template evaluated, results never again.
  tov(v) {
    if (['number', 'boolean', 'function'].includes(typeof v) || !v) return v;
    if (typeof v === 'object') { for (const k of Object.keys(v)) v[k] = this.tov(v[k]); return v; }
    const r = v.trim().match(BC_RE);
    if (r && r[1].length === 3 && r[3].length === 3) return this.evalTpl(r[2]);
    if (r && r[1].length === r[3].length) return v.trim().slice(1, -1);
    return v;
  }
  objEval(v) { return this.tov(deepCopy(v)); }
  render(depth) {
    STATS.cards++;
    const c = this._config;
    for (const k of Object.keys(c.variables || {})) void this._pVariables[k];
    for (const k of ['entity', 'name', 'label', 'state_display', 'icon', 'entity_picture', 'color', 'extra_styles', 'show_name', 'show_label', 'show_state', 'show_icon', 'tooltip']) if (k in c) this.tov(deepCopy(c[k]));
    if (c.styles) this.objEval(c.styles);
    if (Array.isArray(c.state)) this.objEval(c.state);
    for (const [k, f] of Object.entries(c.custom_fields || {})) {
      CUR.push('custom_fields.' + k);
      if (f && typeof f === 'object' && f.card) {
        STATS.nested++;
        let card;
        if (f.do_not_eval) { STATS.dne++; card = deepCopy(f.card); needParent(card, this.path + '.custom_fields.' + k); } else card = this.objEval(f.card);
        mountCard(card, this.path + '.custom_fields.' + k, depth + 1);
      } else this.tov(deepCopy(f));
      CUR.pop();
    }
    for (const a of ['tap_action', 'hold_action', 'double_tap_action', 'icon_tap_action', 'icon_hold_action']) if (c[a]) this.action(c[a], a, depth);
  }
  // _evalActions
  action(raw, which, depth) {
    CUR.push(which);
    let i = typeof raw === 'string' ? this.objEval(raw) : deepCopy(raw);
    const act = this.tov(i && i.action);
    if (act && act !== 'none') {
      if (act === 'perform-action' || act === 'call-service') { this.objEval(i.data); this.objEval(i.service_data); this.objEval(i.target); }
      else if (act === 'fire-dom-event' || act === 'javascript' || act === 'multi-actions' || act === 'toast' || i.casora_popup || i.browser_mod) {
        const ev = this.objEval(i);
        const p = ev && ev.casora_popup;
        if (p && p.content && depth < 4) { STATS.popups++; CUR.push('popup'); mountCard(p.content, this.path + '.' + which + '.popup', depth + 1); CUR.pop(); }
        const bm = ev && ev.browser_mod && ev.browser_mod.data;
        if (bm && bm.content && typeof bm.content === 'object' && depth < 4) { STATS.popups++; mountCard(bm.content, this.path + '.' + which + '.browser_mod', depth + 1); }
      }
    }
    CUR.pop();
  }
}
// A card config as HA would mount it: button-cards render themselves, stacks their cards, other cards evaluate nothing.
function mountCard(card, path, depth) {
  if (!card || typeof card !== 'object' || depth > 7) return;
  if (Array.isArray(card)) { card.forEach((c, i) => mountCard(c, path + '[' + i + ']', depth)); return; }
  if (card.type === 'custom:button-card' || (!card.type && card.template)) {
    CUR.push(path.split('.').slice(-2).join('.'));
    try { new Card(card, path).render(depth); } finally { CUR.pop(); }
    return;
  }
  for (const k of ['cards', 'card', 'elements']) if (card[k]) mountCard(card[k], path + '.' + k, depth);
}
// A do_not_eval card that is no button-card but holds templates: they would show as raw text.
function needParent(card, path) {
  const walk = (v, p) => {
    if (typeof v === 'string') { if (bcIsTpl(v)) NEED_PARENT.push(p); return; }
    if (!v || typeof v !== 'object') return;
    if (v.type === 'custom:button-card' || (!v.type && v.template)) return;
    for (const [k, x] of Object.entries(v)) walk(x, p + '.' + k);
  };
  walk(card, path);
}
const capture = () => {
  const got = [];
  const prevOpen = window.casoraPopup && window.casoraPopup.open;
  window.casoraPopup.open = (d) => { got.push(d); };
  return { got, done: () => { window.casoraPopup.open = prevOpen; } };
};

// ── 3. The paths of the review with a plain payload ───────────────────────────────────────────────────────────────
const pwned = () => { const p = G.__pwned; G.__pwned = 0; return p; };
house(() => PWN);
const failures = [];
const expectClean = (what, f) => {
  G.__pwned = 0;
  try { quiet(f); } catch (e) { failures.push(what + ': threw ' + e.message); return; }
  if (pwned()) failures.push(what + ': ran "' + PWN + '"');
};
// Now playing: records from the house, the cards that show them (phone row + rail, desktop stack, chip, controls).
const NPV = { pause_timeout_minutes: 10, show_media_player_1: true, media_player_1: 'media_player.x' };
expectClean('now playing: records hold the hostile title', () => {
  const list = window._casoraNP(states, NPV);
  assert.ok(list.length && list[0].mtitle === PWN, 'record carries the title');
});
expectClean('now playing: phone row (casora_mobile_now_playing)', () => mountCard({ type: 'custom:button-card', template: 'casora_mobile_now_playing', variables: { media_player_1: 'media_player.x' } }, 'np-phone', 0));
expectClean('now playing: desktop (casora_now_playing)', () => mountCard({ type: 'custom:button-card', template: 'casora_now_playing', variables: { media_player_1: 'media_player.x', show_media_player_1: true } }, 'np-desk', 0));
expectClean('now playing: phone tap on a row (09-weich-wiedergabe open)', () => {
  const rec = window._casoraNP(states, NPV)[0];
  let cfg = null;
  const prev = window._casoraNotifyOpenViaCard;
  window._casoraNotifyOpenViaCard = (id, done, c) => { cfg = c; };
  try { window._casoraNPSoft._open({ kind: 'phone', list: [rec], card: null }, rec.key); } finally { window._casoraNotifyOpenViaCard = prev; }
  assert.ok(cfg, 'a card config was built');
  const cap = capture();
  try { mountCard(cfg, 'np-tap', 0); } finally { cap.done(); }
  assert.ok(STATS.popups > 0, 'the popup content was rendered');
});
// The hidden card that opens a popup (bell, light group row): its config carries no name.
expectClean('hidden popup card (01-basis openViaCard)', () => {
  const made = [];
  const prevDoc = G.document;
  G.document = withStub({
    querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
    createElement: () => ({ setConfig(c) { made.push(c); }, addEventListener: noop, removeEventListener: noop, style: {}, remove: noop }),
    body: { appendChild: noop },
  });
  const prevCfg = window._casoraCfgOnce, prevGuard = window.casoraUserGuard, prevTap = window._casoraTapTile;
  window._casoraCfgOnce = () => ({ then: (f) => { f({ views: [], button_card_templates: { casora_light: {}, casora_media: {} } }); return { catch: noop }; } });
  window.casoraUserGuard = null; window._casoraTapTile = null;
  try {
    window._casoraNotifyOpenViaCard('light.y', noop);
    window._casoraNotifyOpenViaCard('media_player.x', noop);
  } finally { G.document = prevDoc; window._casoraCfgOnce = prevCfg; window.casoraUserGuard = prevGuard; window._casoraTapTile = prevTap; }
  assert.equal(made.length, 2, 'hidden cards built');
  for (const c of made) {
    assert.ok(!('name' in c), 'no name override on the hidden card: ' + JSON.stringify(c));
    mountCard(c, 'hidden', 0);
  }
});
// own(): every nested card of the soft kit's layout is left to itself.
expectClean('soft kit layout (05-weich-mehr own)', () => {
  const K = window._casoraSoftKit;
  const ui = K.layout({ fields: {
    chart: { card: { type: 'custom:casora-chart', series: [{ entity: 'sensor.temperature', name: PWN }] } },
    pic: { card: { type: 'picture-entity', entity: 'camera.x', name: PWN } },
    b: { card: { type: 'custom:button-card', entity: 'sensor.text' } },
  }, top: ['chart'], left: ['pic'], right: ['b'] });
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const f of Object.values(v.custom_fields || {})) if (f && typeof f === 'object' && f.card) { assert.equal(f.do_not_eval, true, 'do_not_eval on every nested card'); walk(f.card); }
  };
  walk(ui);
  mountCard(ui, 'layout', 0);
});
// Frigate clip and recordings, doorbell: no camera name in the config, the element looks it up.
expectClean('frigate camera name (23-frigate)', () => {
  const src = read('custom_components/casora/scripts/local/23-frigate.js');
  assert.ok(!/camName:\s*nm\b/.test(src), 'no camName in the Frigate card configs');
});
expectClean('doorbell second camera name (24-klingel)', () => {
  const KL = window._casoraKlingel;
  const cfg = KL.popup(states['camera.x'], states, hass, { camera2: 'camera.y' });
  const s = JSON.stringify(cfg);
  assert.ok(!/cam2Name/.test(s), 'no cam2Name in the doorbell config');
  mountCard(cfg, 'klingel', 0);
});
// Charts: series names are no config text; free tile and fridge popups through the kit.
expectClean('free tile chart series (28-free-tile)', () => {
  const src = read('custom_components/casora/scripts/local/28-free-tile.js');
  assert.ok(!/name:\s*nameOf\(/.test(src), 'free tile: no series name from the entity in the config');
});
expectClean('fridge chart series (30-fridge)', () => {
  const src = read('custom_components/casora/scripts/local/30-fridge.js');
  assert.ok(/do_not_eval:\s*true/.test(src) || /own\(/.test(src), 'fridge chart is left to itself');
  const FR = window._casoraFridge;
  if (FR && FR.popup) {
    const cfg = FR.popup(states['sensor.temperature'], states, hass, { entity_zone1_temp: 'sensor.temperature' });
    mountCard(cfg, 'fridge', 0);
  }
});
// Own badges: the render_template result is looked up, not put into variables.
expectClean('own badge value (29-eigene-badges)', () => {
  const CB = window._casoraCustomBadge;
  assert.ok(CB && typeof CB.cardConfig === 'function', 'cardConfig exposed');
  const cfg = CB.cardConfig({ template: '{{ states("sensor.text") }}', name: 'x' }, 0, 'room', PWN);
  assert.ok(!JSON.stringify(cfg).includes('__pwned'), 'value not in the config: ' + JSON.stringify(cfg.variables));
  mountCard(cfg, 'badge', 0);
});
if (failures.length) console.log(failures.join('\n'));
assert.deepEqual(failures, [], 'review paths');

// ── 4. All templates against a hostile house ──────────────────────────────────────────────────────────────────────
house(hostile);
NEED_PARENT.length = 0;
{
  const DOMAIN_HINTS = [[/light|licht|lamp/, 'light.x'], [/climate|thermo|heiz|fbh|klima/, 'climate.x'], [/media|tv|speaker|music|wiedergabe|now_playing/, 'media_player.x'],
    [/presence|person|people/, 'person.x'], [/lock|schloss/, 'lock.x'], [/cover|blind|jalous|shutter/, 'cover.x'], [/camera|kamera|frigate|klingel|doorbell/, 'camera.x'],
    [/calendar|kalender|abfall|trash/, 'calendar.x'], [/weather|wetter/, 'weather.x'], [/vacuum|sauger/, 'vacuum.x'], [/scene|szene/, 'scene.x'],
    [/security|contact|window|door|fenster/, 'binary_sensor.window'], [/temp/, 'sensor.temperature'], [/humid|feucht/, 'sensor.humidity'],
    [/energy|power|strom/, 'sensor.power'], [/battery|akku/, 'sensor.battery'], [/update/, 'update.x'], [/fan|luft/, 'fan.x'], [/alarm/, 'alarm_control_panel.x'],
    [/motion|bewegung/, 'binary_sensor.motion'], [/maeher|mower/, 'lawn_mower.x'], [/switch|schalter/, 'switch.x'], [/todo/, 'todo.x']];
  const guess = (name) => { const n = String(name).toLowerCase(); const h = DOMAIN_HINTS.find(([re]) => re.test(n)); return h ? h[1] : 'sensor.text'; };
  const SKIP = new Set(Object.keys(T).filter((n) => !T[n] || typeof T[n] !== 'object'));
  quiet(() => {
    for (const name of Object.keys(T)) {
      if (SKIP.has(name)) continue;
      const r = resolve({ template: name });
      const variables = {};
      for (const [k, v] of Object.entries(r.variables || {})) {
        if (v == null && /(?:^|_)(?:entity|entities|player|media_player_\d|camera|sensor)(?:_|$)|_entity$|^entity_/.test(k)) variables[k] = guess(k + ' ' + name);
      }
      const cap = capture();
      try { mountCard({ type: 'custom:button-card', template: name, entity: r.entity && !bcIsTpl(r.entity) ? r.entity : guess(name), variables }, name, 0); } finally { cap.done(); }
      // Popups opened by the scripts while rendering: their content as well.
      for (const d of cap.got) if (d && d.content) mountCard(d.content, name + '.casoraPopup', 1);
    }
    // Single devices next to the groups above (a lamp, not the light group; the hidden card of the bell).
    for (const [tpl, ent] of [['casora_light', 'light.y'], ['casora_media', 'media_player.x'], ['casora_cover', 'cover.x'], ['casora_lock', 'lock.x']]) {
      const cap = capture();
      try { mountCard({ type: 'custom:button-card', template: tpl, entity: ent, variables: { icon: 'light' } }, tpl + '(' + ent + ')', 0); } finally { cap.done(); }
    }
  });
  assert.ok(STATS.cards > 600, 'cards rendered: ' + STATS.cards);
  assert.ok(STATS.evals > 5000, 'template expressions evaluated: ' + STATS.evals);
  assert.ok(STATS.popups > 100, 'popups rendered: ' + STATS.popups);
  const byTag = {};
  for (const h of HITS) (byTag[h.tag + ' @ ' + h.where] = byTag[h.tag + ' @ ' + h.where] || 0, byTag[h.tag + ' @ ' + h.where]++);
  const keys = Object.keys(byTag);
  if (keys.length) console.log(keys.slice(0, 60).map((k) => 'RAN ' + k).join('\n'));
  assert.equal(keys.length, 0, keys.length + ' place(s) where a name/state/title from the house ran as a template');
  const np = [...new Set(NEED_PARENT)];
  if (np.length) console.log(np.slice(0, 30).map((p) => 'NEEDS PARENT ' + p).join('\n'));
  assert.equal(np.length, 0, np.length + ' do_not_eval card(s) holding templates only the parent card would evaluate');
}

console.log(`ok no_eval (${STATS.cards} cards, ${STATS.evals} template expressions, ${STATS.popups} popups, ${STATS.nested} nested cards, ${STATS.dne} with do_not_eval)`);
