// Names people chose are not translated (owner 14.11.2026, V24): a scene „Guten Morgen“ stays „Guten Morgen“ in the
// English UI – on its tile in the scenes popup, as a chip in the light popup and inside „Last … 49 d ago“ – while the
// sentence around it is translated. Mechanism: <span data-no-i18n> (UI.line/hero option lit → core litWrap).
//   node dev/unit/i18n_scene_names_literal.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#litWrap,softLine,hero, custom_components/casora/scripts/local/08-weich-szenen.js, custom_components/casora/scripts/local/03-popups.js
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const CC = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, CC), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

// The dashboard translator in English.
async function dash(language) {
  const H = { hass: { locale: { language } } };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? H : /casora-i18n\.js/.test(q) ? { src: 'http://ha.local/casora_scripts/casora-i18n.js?v=1' } : null), addEventListener() {} };
  const fetchStub = (url) => { const m = /\/i18n\/([a-z]+)\.json/.exec(url); return Promise.resolve(m ? { ok: true, text: async () => read('scripts/i18n/' + m[1] + '.json') } : { ok: false }); };
  const store = new Map();
  const win = { dispatchEvent() {}, addEventListener() {} };
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', 'fetch', 'localStorage', 'location', 'navigator', read('scripts/casora-i18n.js'))(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }, fetchStub,
      { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, { href: 'http://ha.local/x' }, { language: 'de-DE' });
  } catch (e) { /* no browser */ }
  win.casoraTr('Heute');
  await tick(); await tick(); await tick();
  return win.casoraTr;
}
const tr = await dash('en');
assert.equal(tr('Guten Morgen'), 'Good morning', 'the phrase exists – a scene of that name was translated');

// litWrap from the core, with the core's esc.
const core = read('scripts/casora-core.js');
const cut = (name) => { const a = core.indexOf('  function ' + name + '('); assert.ok(a > 0, name); return core.slice(a, core.indexOf('\n  }\n', a) + 4); };
const litWrap = new Function('var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"\']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;", "\'": "&#39;" }[c]; }); };\n'
  + cut('litWrap') + ' return litWrap;')();
assert.equal(litWrap('<span>Zuletzt Guten Morgen vor 49 T.</span>', ['Guten Morgen']), '<span>Zuletzt <span data-no-i18n>Guten Morgen</span> vor 49 T.</span>');
assert.equal(litWrap('<i title="Guten Morgen">Guten Morgenrot</i>', ['Guten Morgen']), '<i title="Guten Morgen">Guten Morgenrot</i>', 'never in attributes or inside a word');
assert.match(core, /if \(o\.lit\) return litWrap\(softLine\(/, 'UI.line takes lit');
assert.match(core, /if \(o\.lit\) return litWrap\(hero\(/, 'UI.hero takes lit');

// The scenes popup (v3) with a status line that applies lit like the core.
const UI = {
  line: (main, rest, o) => litWrap('<div class="hui-line"><span>' + main + '</span>' + (rest || []).map((r) => ' · <span>' + r + '</span>').join('') + '</div>', o && o.lit),
  hero: (o) => litWrap('<div>' + o.value + '|' + (o.sub || '') + '</div>', o.lit),
  stage: (k, o) => o.html || '', more: () => '', label: (t) => t, note: (t) => t,
};
const states = { 'scene.morgen': { entity_id: 'scene.morgen', state: new Date(Date.now() - 49 * 864e5).toISOString(), attributes: { friendly_name: 'Guten Morgen' } } };
const box = { window: { _casoraUI: UI, _casoraSC: { activeList: () => [], lastActive: (id) => Date.parse(states[id].state) } }, document: { querySelector: () => null }, console, Date };
vm.createContext(box);
vm.runInContext(read('scripts/local/08-weich-szenen.js'), box);
const Z = box.window._casoraScenesSoft;
const V = { ids: ['scene.morgen'] };
const head = Z.v3sec('hero', V, states);
assert.match(head, /Zuletzt <span data-no-i18n>Guten Morgen<\/span> vor 49 T\./, 'status line: name literal');
assert.equal(tr(head).replace(/<[^>]+>/g, ''), 'No scene active · Last Guten Morgen 49 d ago', 'English sentence, German name');
const stage = Z.v3sec('stage', V, states);
assert.match(stage, /<b><span data-no-i18n>Guten Morgen<\/span><\/b>/, 'tile name literal');
assert.match(stage, /class="zs-t" role="button" data-no-i18n aria-pressed/, 'tile aria-label not translated either');
assert.ok(!/Good morning/.test(tr(stage)), 'tile stays „Guten Morgen“');
assert.match(Z.sec('hero', V, states), /Zuletzt <span data-no-i18n>Guten Morgen<\/span> · vor 49 T\./, 'soft hero too');

// Light popup scene chips and the updates card's last update keep their names as well.
const pop = read('scripts/local/03-popups.js');
assert.match(pop, /'<span data-no-i18n>' \+ esc\(short\(nameOf\(id, states\), room\)\) \+ '<\/span><\/div>'/, 'light popup scene chip');
assert.match(pop, /'Zuletzt <span data-no-i18n>' \+ esc\(nameOf\(states, u\.id\)\) \+ '<\/span> '/, 'updates card: last update name');
console.log('i18n_scene_names_literal: ok');
