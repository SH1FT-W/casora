// HTML escaping (HACS review, hacs/default#12143 point 4): entity names and config strings went into innerHTML and
// button-card's HTML fields unescaped, several local esc() helpers replaced only some characters.
//   node dev/unit/html_escape.mjs
// Checks:
//   1. the canonical block (casoraEsc / casoraEscJs / casoraSafeUrl) is the same in every file and escapes fully,
//   2. tools/html-escape-check.mjs: its rules on small samples, then the whole codebase is clean (no unescaped
//      value in an HTML string, every escaper definition full, no stale allow entry, no escaper used before its
//      var in the same function or without any declaration in reach),
//   3. runtime: every card template is rendered like button-card does (variables, name/label/state_display,
//      custom_fields, popup content, nested button-cards) against a house where every name, state, area, floor,
//      device, calendar event, media title and text variable is hostile markup; no output may contain the markup raw,
//   4. the dashboard translator still translates escaped text ("Saugt &amp; wischt").
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as CHK from '../../tools/html-escape-check.mjs';

const { lex, safeOperand, run, isHtmlText } = CHK;

const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');

// ── 1. Canonical block ────────────────────────────────────────────────────────────────────────────────────────────
const BLOCK_FILES = ['custom_components/casora/scripts/casora-core.js', 'custom_components/casora/scripts/casora-local.js',
  'custom_components/casora/scripts/casora-chart.js', 'custom_components/casora/panel/casora-panel.js'];
const blockOf = (src) => {
  const a = src.indexOf('// casora-esc:begin'), b = src.indexOf('// casora-esc:end');
  assert.ok(a >= 0 && b > a, 'casora-esc block present');
  return src.slice(a, b);
};
const blocks = BLOCK_FILES.map((f) => blockOf(read(f)));
blocks.forEach((b, i) => assert.equal(b, blocks[0], BLOCK_FILES[i] + ': casora-esc block differs from casora-core.js'));
{
  const w = {};
  new Function('window', blocks[0])(w);
  assert.equal(w.casoraEsc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.equal(w.casoraEsc(null), '');
  assert.equal(w.casoraEsc(0), '0');
  // JS string inside an attribute: no quote, no tag, no entity survives HTML decoding as such.
  const js = w.casoraEscJs("a'b\"c</script>\\d\n");
  assert.ok(!/['"<>&\n]/.test(js.replace(/&#39;|&quot;|&lt;|&gt;|&amp;/g, '')), 'escJs: ' + js);
  const decoded = js.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  assert.equal(new Function("return '" + decoded + "';")(), "a'b\"c</script>\\d\n", 'escJs round trip through HTML + JS');
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\nscript:alert(1)', 'vbscript:x', 'data:text/html,<b>x</b>', '\u0001javascript:x']) {
    assert.equal(w.casoraSafeUrl(bad), '', 'safeUrl rejects ' + JSON.stringify(bad));
  }
  assert.equal(w.casoraSafeUrl('/api/camera_proxy/camera.x?token=a&b="'), '/api/camera_proxy/camera.x?token=a&amp;b=&quot;');
  assert.equal(w.casoraSafeUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
  assert.equal(w.casoraSafeUrl('https://example.org/a.png'), 'https://example.org/a.png');
}

// ── 1b. button-card's plain names/labels/states on Casora cards (casora-core.js) ───────────────────────────────────
{
  const core = read('custom_components/casora/scripts/casora-core.js');
  const a = core.indexOf('// button-card renders a plain name');
  const b = core.indexOf('\n})();\n', a) + 6;
  assert.ok(a > 0 && b > a, 'plain-name guard in casora-core.js');
  class Card {
    _buildName(st, cs) { return (cs && cs.name) ? cs.name : this._config.name ? (/\[\[\[/.test(this._config.name) ? '<b>' + st.n + '</b>' : this._config.name) : st.attributes.friendly_name; }
    _buildLabel() { return this._config.label; }
    _buildStateString(st) { return st.state; }
  }
  const w = {};
  new Function('window', blocks[0])(w);
  let ready;
  w.customElements = { get: () => Card, whenDefined: () => ({ then: (f) => { ready = f; } }) };
  new Function('window', 'customElements', core.slice(a, b))(w, w.customElements);
  ready();
  const st = { n: 'x', state: '<i>on</i>', attributes: { friendly_name: 'Lamp <img src=x onerror=a()>' } };
  const card = (cfg) => Object.assign(new Card(), { _config: cfg });
  assert.equal(card({ template: 'casora_room', name: 'Wohnzimmer <b>' })._buildName(st), 'Wohnzimmer &lt;b&gt;', 'static room name escaped');
  assert.equal(card({ template: ['casora_light'] })._buildName(st), 'Lamp &lt;img src=x onerror=a()&gt;', 'friendly_name fallback escaped');
  assert.equal(card({ template: 'casora_light', name: 'A &amp; B' })._buildName(st), 'A &amp; B', 'already escaped stays');
  assert.equal(card({ template: 'casora_light', name: '[[[ return x ]]]' })._buildName(st), '<b>x</b>', 'template result untouched');
  assert.equal(card({ template: 'casora_light', label: '"x"' })._buildLabel(st), '&quot;x&quot;');
  assert.equal(card({ template: 'casora_light' })._buildStateString(st), '&lt;i&gt;on&lt;/i&gt;', 'default state text escaped');
  assert.equal(card({ template: 'other' })._buildName(st), st.attributes.friendly_name, "other dashboards' cards untouched");
}

// ── 2. Static checker ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const flagged = (code) => {
    const out = [];
    CHK.checkSource('sample.js', code, [], out);
    return out.map((o) => o.expr);
  };
  assert.deepEqual(flagged("el.innerHTML = '<b>' + name + '</b>';"), ['name']);
  assert.deepEqual(flagged("el.innerHTML = '<b>' + esc(name) + '</b>';"), []);
  assert.deepEqual(flagged('x = `<div title="${a.b}">${UI.esc(c)}</div>`;'), ['a.b']);
  assert.deepEqual(flagged("h = '<i style=\"width:' + Math.round(p * 100) + '%\">' + (on ? '<b>' : '') + '</i>';"), []);
  assert.deepEqual(flagged("h = '<i>' + (on ? esc(a) : b) + '</i>';"), ['(on ? esc(a) : b)']);
  assert.deepEqual(flagged("var s = '<ul>'; s += item.name; s += '</ul>';"), ['item.name']);
  assert.deepEqual(flagged('el.innerHTML = label;'), ['label']);
  assert.deepEqual(flagged("el.insertAdjacentHTML('beforeend', row);"), ['row']);
  assert.deepEqual(flagged("h = '<span>' + T.ink + rowHtml + '</span>';"), [], 'constants and …Html names pass');
  assert.deepEqual(flagged("h = '<a onclick=\"f(\\'' + window.casoraEscJs(id) + '\\')\">';"), []);
  assert.ok(isHtmlText('" style="color:') && isHtmlText('<div>') && !isHtmlText('Hallo Welt'));
  assert.ok(safeOperand(lex('x.toFixed(1)').toks) && !safeOperand(lex('x.name').toks));
  // A partial escaper is reported.
  const out = [];
  CHK.checkEscapers('sample.js', "const esc = (t) => String(t).replace(/\"/g, '&quot;');", [], out);
  assert.equal(out.length, 1, 'quotes-only esc is reported');
  const ok = [];
  CHK.checkEscapers('sample.js', "var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); };", [], ok);
  assert.equal(ok.length, 0, 'the standard local esc passes');
  // An escaper redeclared further down in the same function is undefined above it (hoisting).
  const hoist = [];
  CHK.checkHoist('sample.js', "var esc = window.casoraEsc; function f(x) { var a = '<b>' + esc(x) + '</b>'; var esc = UI.esc; return a; }", hoist);
  assert.equal(hoist.length, 1, 'esc used before its var in the same function is reported');
  const noHoist = [];
  CHK.checkHoist('sample.js', "function f(x) { const g = (t) => esc(t); const esc = window.casoraEsc; var h = function () { return esc(x); }; return { esc: 1 }.esc + g(x) + h(); }", noHoist);
  assert.equal(noHoist.length, 0, 'uses in nested functions and property names are fine');
  // An escaper used in a module that never declares it (copied code from another IIFE) is a ReferenceError.
  const undef = [];
  CHK.checkHoist('sample.js', "(function () { var esc = window.casoraEsc; })(); (function () { return '<b>' + esc(x) + '</b>'; })();", undef);
  assert.equal(undef.length, 1, 'esc without a declaration in reach is reported');
  const params = [];
  CHK.checkHoist('sample.js', "function f(esc, x) { return esc(x); } var g = (escJs) => escJs(1); var h = esc2 => esc2(1); try { } catch (esc3) { esc3(); }", params);
  assert.equal(params.length, 0, 'parameters and catch bindings count as declarations');

  const { out: all, unused } = run();
  if (all.length) console.log(all.slice(0, 40).map((o) => `${o.file}:${o.line}${o.where ? ' [' + o.where + ']' : ''}: ${o.expr}`).join('\n'));
  assert.equal(all.length, 0, all.length + ' unescaped value(s) in HTML strings (node tools/html-escape-check.mjs)');
  assert.deepEqual(unused.map((a) => a.f + ' | ' + a.expr), [], 'stale entries in tools/html-escape-allow/');
}

// ── 3. Runtime: templates against a hostile house ─────────────────────────────────────────────────────────────────
let STATS = '';
const H = 'Q<xss-a>" xss-e="1\' xss-f=\'1&amp;';
const leaked = (s) => /<xss-|" xss-e=|' xss-f=/.test(s);
{
  const noop = () => {};
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? () => stub() : stub()),
    apply: () => stub(), construct: () => stub(),
  });
  const G = globalThis;
  G.window = G;
  G.document = stub();
  G.customElements = { get: () => null, define: noop, whenDefined: () => new Promise(noop) };
  G.HTMLElement = class {};
  G.location = { pathname: '/casora/home', search: '', hash: '' };
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
  Object.defineProperty(G, 'navigator', { value: { userAgent: 'node', language: 'de' }, configurable: true });
  G.fetch = () => Promise.reject(new Error('offline'));
  const info = console.info, warn = console.warn, log = console.log, error = console.error;
  console.info = console.warn = console.log = console.error = noop;
  const files = ['custom_components/casora/scripts/casora-core.js', 'custom_components/casora/scripts/casora-chart.js'];
  for (const f of fs.readdirSync(new URL('custom_components/casora/scripts/local/', ROOT)).sort()) files.push('custom_components/casora/scripts/local/' + f);
  const failed = [];
  for (const f of files) { try { new Function(read(f))(); } catch (e) { failed.push(f + ': ' + e.message); } }
  console.info = info; console.warn = warn; console.log = log; console.error = error;
  assert.deepEqual(failed, [], 'dashboard scripts load');
  assert.equal(typeof window.casoraEsc, 'function');

  // The house: one entity per domain, everything named with markup.
  const states = {}, entities = {}, devices = {}, areas = {}, floors = {};
  floors.f1 = { floor_id: 'f1', name: H + ' floor', level: 0 };
  areas.a1 = { area_id: 'a1', name: H + ' room', floor_id: 'f1', icon: 'mdi:sofa' };
  areas.a2 = { area_id: 'a2', name: H + ' room 2', floor_id: 'f1', icon: null };
  devices.d1 = { id: 'd1', name: H + ' device', name_by_user: H + ' my device', area_id: 'a1', manufacturer: H, model: H };
  const add = (id, state, attrs = {}) => {
    states[id] = { entity_id: id, state, attributes: { friendly_name: H + ' ' + id.split('.')[0], ...attrs },
      last_changed: '2026-10-24T08:00:00Z', last_updated: '2026-10-24T08:00:00Z', context: {} };
    entities[id] = { entity_id: id, device_id: 'd1', area_id: 'a1', platform: 'demo', name: H, labels: [] };
  };
  add('light.x', 'on', { brightness: 128, supported_color_modes: ['brightness'], color_mode: 'brightness', entity_id: ['light.y'] });
  add('light.y', 'on', { brightness: 255, supported_color_modes: ['brightness'], color_mode: 'brightness' });
  add('switch.x', 'on');
  add('sensor.text', H);
  add('sensor.temperature', '21.5', { device_class: 'temperature', unit_of_measurement: '°C' });
  add('sensor.humidity', '48', { device_class: 'humidity', unit_of_measurement: '%' });
  add('sensor.power', '120', { device_class: 'power', unit_of_measurement: 'W' });
  add('sensor.battery', '15', { device_class: 'battery', unit_of_measurement: '%' });
  add('binary_sensor.door', 'on', { device_class: 'door' });
  add('binary_sensor.window', 'on', { device_class: 'window' });
  add('binary_sensor.motion', 'on', { device_class: 'motion' });
  add('person.x', 'home', { entity_picture: 'javascript:alert(1)', source: 'device_tracker.x' });
  add('device_tracker.x', 'home', { source_type: 'gps', battery_level: 50 });
  add('media_player.x', 'playing', { media_title: H, media_artist: H, media_album_name: H, app_name: H, source: H,
    entity_picture: '/api/media_player_proxy/media_player.x?token=1', volume_level: 0.4, source_list: [H] });
  add('climate.x', 'heat', { current_temperature: 20, temperature: 21, hvac_modes: ['off', 'heat'], hvac_action: 'heating', preset_mode: H, preset_modes: [H] });
  add('cover.x', 'open', { current_position: 40, device_class: 'blind' });
  add('lock.x', 'unlocked');
  add('camera.x', 'idle', { entity_picture: '/api/camera_proxy/camera.x?token=1' });
  add('calendar.x', 'on', { message: H, description: H, location: H, start_time: '2026-10-24 10:00:00', end_time: '2026-10-24 11:00:00', all_day: false });
  add('weather.x', 'rainy', { temperature: 12, humidity: 80, forecast: [] });
  add('vacuum.x', 'cleaning', { battery_level: 50, status: H, fan_speed: H, fan_speed_list: [H] });
  add('scene.x', '2026-10-24T08:00:00Z', { icon: 'mdi:palette' });
  add('script.x', 'off');
  add('alarm_control_panel.x', 'disarmed', { code_format: null });
  add('update.x', 'on', { title: H, installed_version: '1.0', latest_version: '2.0', release_summary: H, release_url: 'javascript:alert(1)' });
  add('fan.x', 'on', { percentage: 50, preset_mode: H, preset_modes: [H] });
  add('input_boolean.x', 'on');
  add('input_select.x', H, { options: [H, 'b'] });
  add('todo.x', '2');
  add('lawn_mower.x', 'mowing');
  add('humidifier.x', 'on', { humidity: 50, mode: H, available_modes: [H] });
  add('water_heater.x', 'eco', { temperature: 50, operation_mode: H, operation_list: [H] });
  add('select.x', H, { options: [H] });
  add('event.x', '2026-10-24T08:00:00Z', { event_type: H });
  const hass = {
    states, entities, devices, areas, floors, user: { id: 'u1', name: H, is_admin: true },
    language: 'de', locale: { language: 'de', number_format: 'language', time_format: '24' },
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'Europe/Berlin', components: [] },
    themes: { darkMode: true }, connection: { subscribeMessage: () => Promise.resolve(noop), subscribeEvents: () => Promise.resolve(noop) },
    callWS: () => Promise.resolve([]), callService: () => Promise.resolve(), callApi: () => Promise.resolve([]),
    formatEntityState: (st) => String(st && st.state), formatEntityAttributeValue: (st, a) => String(st && st.attributes && st.attributes[a]),
    formatEntityAttributeName: (st, a) => a, localize: (k) => k, hassUrl: (p) => p,
  };
  window.document = Object.assign(stub(), {});
  window.casoraHass = hass;

  const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
  const js = (s) => s.trim().slice(3, -3);
  const isTpl = (v) => typeof v === 'string' && v.trim().startsWith('[[[') && v.trim().endsWith(']]]');
  const deepMerge = (a, b) => {
    if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
    const o = Object.assign({}, a && typeof a === 'object' && !Array.isArray(a) ? a : {});
    for (const [k, v] of Object.entries(b)) o[k] = k in o ? deepMerge(o[k], v) : v;
    return o;
  };
  const resolve = (cfg, depth = 0) => {
    if (!cfg || depth > 12) return cfg || {};
    const names = cfg.template ? (Array.isArray(cfg.template) ? cfg.template : [cfg.template]) : [];
    let base = {};
    for (const n of names) if (T[n]) base = deepMerge(base, resolve(T[n], depth + 1));
    const own = Object.assign({}, cfg); delete own.template;
    return deepMerge(base, own);
  };
  const DOMAIN_HINTS = [[/light|licht|lamp/, 'light.x'], [/climate|thermo|heiz|fbh|klima/, 'climate.x'], [/media|tv|speaker|music|wiedergabe/, 'media_player.x'],
    [/presence|person|people/, 'person.x'], [/lock|schloss/, 'lock.x'], [/cover|blind|jalous|shutter/, 'cover.x'], [/camera|kamera|frigate|klingel|doorbell/, 'camera.x'],
    [/calendar|kalender|abfall|trash/, 'calendar.x'], [/weather|wetter/, 'weather.x'], [/vacuum|sauger/, 'vacuum.x'], [/scene|szene/, 'scene.x'],
    [/security|contact|window|door|fenster/, 'binary_sensor.window'], [/temp/, 'sensor.temperature'], [/humid|feucht/, 'sensor.humidity'],
    [/energy|power|strom/, 'sensor.power'], [/battery|akku/, 'sensor.battery'], [/update/, 'update.x'], [/fan|luft/, 'fan.x'], [/alarm/, 'alarm_control_panel.x'],
    [/motion|bewegung/, 'binary_sensor.motion'], [/maeher|mower/, 'lawn_mower.x'], [/switch|schalter/, 'switch.x'], [/todo/, 'todo.x']];
  const guess = (name) => { const n = String(name).toLowerCase(); const h = DOMAIN_HINTS.find(([re]) => re.test(n)); return h ? h[1] : 'sensor.text'; };
  const TEXT_KEY = /(?:^|_)(?:title|name|names|label|labels|text|subtitle|sub|caption|heading|room|room_name|greeting|hint|note|message|sublabel)$/;

  const outputs = [];
  let evaluated = 0, threw = 0;
  const ARGS = ['states', 'entity', 'user', 'hass', 'variables', 'html'];
  const card = { _config: {}, hass, shadowRoot: stub(), isConnected: true, requestUpdate: noop, querySelector: () => null, getRootNode: () => stub(), style: {}, dataset: {} };
  const evalTpl = (src, entity, variables) => {
    evaluated++;
    try { return new Function(...ARGS, js(src)).call(card, states, entity, hass.user, hass, variables, (s) => String(s)); } catch (e) { threw++; return undefined; }
  };
  const SINK_KEYS = new Set(['name', 'label', 'state_display']);
  const collect = (val, where, entity, variables, depth) => {
    if (typeof val === 'string') { outputs.push({ where, s: val }); return; }
    if (!val || typeof val !== 'object' || depth > 4) return;
    if (Array.isArray(val)) { val.forEach((x, i) => collect(x, where + '[' + i + ']', entity, variables, depth)); return; }
    // A nested card: a nested button-card renders its own name/label/state/custom_fields as HTML.
    if (typeof val.type === 'string' && /button-card/.test(val.type)) { renderCard(val, where + '>', depth + 1); return; }
    for (const [k, v] of Object.entries(val)) {
      if (k === 'card' || k === 'cards' || k === 'content' || k === 'card_mod' && false) collect(v, where + '.' + k, entity, variables, depth);
      else if (v && typeof v === 'object') collect(v, where + '.' + k, entity, variables, depth + 1);
    }
  };
  const renderCard = (cfg0, where, depth = 0) => {
    const cfg = resolve(cfg0);
    const entityId = cfg.entity && !isTpl(cfg.entity) ? cfg.entity : guess(where);
    const entity = states[entityId] || states['sensor.text'];
    // Variables: defaults, hostile text for text-like keys, entities for empty entity slots; templates in order.
    const variables = {};
    for (const [k, v] of Object.entries(cfg.variables || {})) {
      if (TEXT_KEY.test(k) && (v === '' || v == null || typeof v === 'string') && !isTpl(v)) variables[k] = H;
      else if (/entity/.test(k) && (v === '' || v == null)) variables[k] = guess(k + ' ' + where);
      else variables[k] = v;
    }
    for (const [k, v] of Object.entries(variables)) if (isTpl(v)) variables[k] = evalTpl(v, entity, variables);
    for (const key of ['name', 'label', 'state_display']) {
      const v = cfg[key];
      if (isTpl(v)) collect(evalTpl(v, entity, variables), where + '.' + key, entity, variables, depth);
      else if (typeof v === 'string' && depth > 0) outputs.push({ where: where + '.' + key, s: v });
    }
    for (const [k, v] of Object.entries(cfg.custom_fields || {})) {
      if (isTpl(v)) collect(evalTpl(v, entity, variables), where + '.custom_fields.' + k, entity, variables, depth);
      else if (v && typeof v === 'object' && v.card) collect(v.card, where + '.custom_fields.' + k, entity, variables, depth);
    }
    for (const act of ['tap_action', 'hold_action', 'double_tap_action', 'icon_tap_action']) {
      const a = cfg[act];
      const p = a && a.casora_popup;
      if (p && depth < 3) {
        for (const pk of ['content']) { // the popup title is set as textContent
          if (isTpl(p[pk])) collect(evalTpl(p[pk], entity, variables), where + '.' + act + '.' + pk, entity, variables, depth + 1);
          else if (p[pk] && typeof p[pk] === 'object') collect(p[pk], where + '.' + act + '.' + pk, entity, variables, depth + 1);
        }
      }
    }
  };
  const SKIP = new Set(Object.keys(T).filter((n) => !T[n] || typeof T[n] !== 'object'));
  for (const name of Object.keys(T)) if (!SKIP.has(name)) renderCard({ type: 'custom:button-card', template: name }, name);

  assert.ok(evaluated > 800, 'templates evaluated: ' + evaluated);
  assert.ok(outputs.length > 400, 'outputs collected: ' + outputs.length + ' (threw ' + threw + ')');
  // The hostile text reaches the output (else the test proves nothing), escaped.
  const reached = outputs.filter((o) => o.s.includes('Q&lt;xss-a&gt;'));
  STATS = `${evaluated} template expressions, ${outputs.length} outputs, ${reached.length} with an escaped hostile name`;
  assert.ok(reached.length > 50, 'hostile names rendered escaped in ' + reached.length + ' outputs');
  for (const must of ['casora_badge_presence.name', 'casora_presence.name', 'casora_room.custom_fields.n']) {
    assert.ok(outputs.some((o) => o.where === must), must + ' rendered');
  }
  // Escaped twice: the reader would see "&lt;xss-a&gt;" instead of the name.
  const twice = outputs.filter((o) => /&amp;lt;xss-a|&amp;quot; xss-e/.test(o.s));
  twice.slice(0, 10).forEach((o) => console.log('TWICE ' + o.where + ': …' + o.s.slice(Math.max(0, o.s.indexOf('&amp;lt;xss') - 80), o.s.indexOf('&amp;lt;xss') + 40) + '…'));
  assert.equal(twice.length, 0, twice.length + ' template output(s) escape a name twice');
  const bad = outputs.filter((o) => leaked(o.s));
  if (bad.length) {
    for (const o of bad.slice(0, 30)) {
      const i = o.s.search(/<xss-|" xss-e=|' xss-f=/);
      console.log('LEAK ' + o.where + ': …' + o.s.slice(Math.max(0, i - 120), i + 60).replace(/\s+/g, ' ') + '…');
    }
  }
  assert.equal(bad.length, 0, bad.length + ' template output(s) with raw markup from names/config');
}

// ── 4. Translator and escaped text ────────────────────────────────────────────────────────────────────────────────
{
  const w = { document: { querySelector: (q) => (q === 'home-assistant' ? { hass: { language: 'en', locale: { language: 'en' } } } : null) } };
  const src = read('custom_components/casora/scripts/casora-i18n.js');
  new Function('window', 'document', 'customElements', 'setTimeout', src)(w, w.document, undefined, () => 0);
  const tr = w.casoraTr;
  assert.equal(typeof tr, 'function');
  assert.equal(tr('Gerät fehlt'), 'Device missing', 'plain phrase');
  assert.equal(tr('<span>' + window.casoraEsc('Gerät fehlt') + '</span>'), '<span>Device missing</span>', 'escaped value in markup');
  assert.equal(tr('Saugt &amp; wischt'), 'Vacuuming &amp; mopping', 'escaped "&" still translates, stays escaped');
  assert.equal(tr('<b>Saugt &amp; wischt</b>'), '<b>Vacuuming &amp; mopping</b>');
  assert.equal(tr(window.casoraEsc(H)), window.casoraEsc(H), 'hostile text passes unchanged');
}

console.log('ok html_escape (' + STATS + ')');
