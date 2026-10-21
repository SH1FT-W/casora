// Calendar tile in the Studio (issue #31): "Add a tile" offers it, its inspector jumps to
// Settings → Calendar, the calendars have their own Settings page.
//   node dev/unit/calendar_tile_type.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;

// ── Tile type ──────────────────────────────────────────────────────────────────────
globalThis.window = globalThis;
const typesSrc = read('custom_components/casora/panel/casora-panel-types.js');
new Function(typesSrc.slice(0, typesSrc.indexOf('// Symbole, die Casora mitliefert')))();
const cal = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_calendar');
assert.ok(cal, 'calendar is a tile type');
assert.equal(cal.template, 'casora_calendar');
assert.ok(JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_calendar, 'template exists');
assert.ok(cal.noEntity, 'no calendar of its own to pick: the calendars come from Settings');
assert.ok(!cal.hidden && !cal.onlyIf, 'offered in every home');
assert.equal((cal.fields.find((f) => f.settingsLink) || {}).settingsLink, 'calendars', 'link to the calendars');
assert.ok(!cal.fields.some((f) => f.key === 'icon'), 'no icon field: the icon shows the date');
[cal.label, ...cal.fields.flatMap((f) => [f.label, f.hint, f.placeholder])].filter(Boolean)
  .forEach((s) => assert.ok(de[s], 'German text for: ' + s));

// ── Wiring ─────────────────────────────────────────────────────────────────────────
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.ok(/const HOUSE_WIDE_TILES = new Set\(\[[^\]]*"casora_calendar"/.test(panel), 'not offered as "Fits <room>"');
assert.ok(/if \(f\.settingsLink\) \{\s*const go = [^\n]*this\._casoraSettingsLink\(f\)/.test(panel), 'inspector draws the link');
assert.ok(/"set-calendar": \["\w+", "var\(--casora-color-red/.test(panel), 'icon color of the Settings page');
const settings = read('custom_components/casora/panel/casora-panel-settings.js');
assert.ok(/\{ id: "calendar", label: "Calendar", icon: "calendar", tone: "set-calendar", personal: \["calendars"\],/.test(settings),
  'own Settings page');
assert.ok(/id: "home"[^}]*personal: \["waste", "contacts"/.test(settings), 'no longer under Home & Devices');
assert.ok(settings.indexOf('id: "calendar"') > settings.indexOf('id: "home"') && settings.indexOf('id: "calendar"') < settings.indexOf('id: "alerts"'),
  'right after Home & Devices');
assert.ok(/\["calendar", "Calendar", "calendar"\]/.test(read('custom_components/casora/panel/casora-panel-b.js')), 'Settings menu');
assert.ok(/\["calendar", "Calendar", "kalender [^"]*"\]/.test(read('custom_components/casora/panel/casora-panel-b-mehr.js')), 'search');
settings.match(/lede: "[^"]+"/g).forEach((l) => assert.ok(de[l.slice(7, -1)], 'German lede: ' + l));

// ── Inspector link (casora-panel-personal.js without a browser) ─────────────────────
const P = {};
const el = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
const win = { casoraI18n: { t: (s) => de[s] || s }, CASORA_SETTINGS: {} };
new Function('window', 'document', 'customElements', read('custom_components/casora/panel/casora-panel-personal.js'))(
  win, { createElement: el, getElementById: () => null },
  { whenDefined: () => ({ then: (cb) => cb() }), get: () => ({ prototype: P }) });
assert.equal(typeof P._casoraSettingsLink, 'function');

const stored = { calendars: [{ entity: 'calendar.example_a' }, { entity: 'calendar.example_b' }, { entity: '' }] };
const studio = Object.assign(Object.create(P), {
  _hass: { callWS: async () => ({ settings: stored }) },
  _csShow(page, focus) { this.shown = [page, focus]; },
});
const b = studio._casoraSettingsLink({ settingsLink: 'calendars' });
assert.equal(b.className, 'casora-plink');
assert.equal(b.textContent, 'Alle Kalender ›', 'before the settings are read');
await studio._casoraSettingsRead;
await new Promise((r) => setTimeout(r));
assert.equal(b.textContent, '2 Kalender ›', 'counts calendars with an entity');
b.onclick();
assert.deepEqual(studio.shown, ['calendar', 'calendars'], 'opens Settings → Calendar at the calendars');

stored.calendars = [{ entity: 'calendar.example_a' }];
const one = Object.assign(Object.create(P), { _hass: studio._hass });
one._casoraSettingsLink({ settingsLink: 'calendars' });
await one._casoraSettingsRead;
await new Promise((r) => setTimeout(r));
assert.equal(one._casoraSettingsLink({ settingsLink: 'calendars' }).textContent, '1 Kalender ›');
assert.equal(studio._casoraSettingsLink({ settingsLink: 'unknown' }), null, 'unknown group: no row');

// ── Without an entity of its own ─────────────────────────────────────────────────────
// Studio preview: the next event instead of "Not set".
const twAt = panel.indexOf('\nconst tileStateWord = ');
const twSrc = panel.slice(twAt, panel.indexOf('\n};\n', twAt) + 4);
assert.ok(/if \(kind === "casora_calendar" && !ent\)/.test(twSrc), 'preview handles the calendar without entity');
// Popup: anchors on the first calendar that exists (from Settings).
const cw = { casoraSettings: () => ({ calendars: [{ entity: 'calendar.gone' }, { entity: 'calendar.example_family', name: 'Family' }] }), addEventListener() {}, setTimeout: () => 0, setInterval: () => 0 };
const cdoc = { querySelector: () => null, addEventListener() {} };
// Its timers (midnight redraw) stay stubs, or the test would not end.
const noTimer = () => 0;
new Function('window', 'document', 'setTimeout', 'setInterval', read('custom_components/casora/scripts/local/06-kalender.js'))(cw, cdoc, noTimer, noTimer);
const K = cw._casoraCalendar;
assert.ok(K && K.popup, '06-kalender.js');
K.load = () => {};
const st = { 'calendar.example_family': { entity_id: 'calendar.example_family', state: 'off', attributes: {} } };
const pop = K.popup(undefined, { calendars: null }, st, {});
assert.equal(pop.type, 'custom:button-card', 'popup without the tile\'s own entity');
assert.equal(pop.entity, 'calendar.example_family', 'anchored on the first calendar that exists');
assert.equal(K.popup(undefined, {}, {}, {}).type, 'vertical-stack', 'no calendar at all: empty, no error');
assert.equal(K.popup({ entity_id: 'calendar.example_family' }, {}, st, {}).entity, 'calendar.example_family', 'older tiles with an entity');

console.log('ok calendar_tile_type');
