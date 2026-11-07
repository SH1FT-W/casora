// Mealie as a second source of the recipe tile and popup (issue #140, 03-popups.js window._casoraRecipe):
//  - found by registry platform „mealie“ + translation_key (calendars per meal type, todo shopping_list), never by id;
//  - tile „Heute · <short name>“ with time · servings · first tag where it fits (casoraStateFit short form), loading,
//    unavailable, nothing planned, the next planned day;
//  - popup: status line, stage (image, meal type, name, time · servings, tags, description), right the week (7 days,
//    meal types, notes, empty days), ingredients (12, rest behind „Alle (n) anzeigen“), steps (4, rest behind it) and
//    Mealie's shopping lists; a note without recipe has no ingredients or steps; no Cookidoo wording;
//  - without Mealie the Cookidoo path is exactly as before (tile, layout, lists).
//   node dev/unit/mealie_recipe.mjs
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraRecipe,R.tile,R.popup,R.sec,R.loadTodo
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/03-popups.js', 'utf8');
const a = src.indexOf('// ── Küche: Rezept der Woche');
const b = src.indexOf('\n})();', a);
assert.ok(a > -1 && b > a, 'recipe module found');

const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const IMG = '/api/casora/mealie/image/a68bf58d-6700-4d10-9ca5-03cbde2cebed?v=GApZ&authSig=x';
const ING = Array.from({ length: 14 }, (_, i) => ({ text: (i + 1) + ' g Zutat ' + (i + 1) }));
ING.splice(3, 0, { title: 'Für die Soße' });
const SOUP = { type: 'dinner', note: false, name: 'Kürbissuppe mit Ingwer', recipe_id: 'a68bf58d-6700-4d10-9ca5-03cbde2cebed', slug: 'kurbissuppe-mit-ingwer',
  minutes: 40, time_text: null, servings: 4, yield_text: null, tags: ['Vegetarisch', 'Herbst'], image: IMG };
const PLAN = (feat) => ({ state: 'ok', today: iso(0), featured: feat, days: [
  { date: iso(0), meals: [{ type: 'breakfast', note: false, name: 'Overnight Oats', minutes: 10, servings: 1, tags: [] }, SOUP] },
  { date: iso(1), meals: [{ type: 'dinner', note: false, name: 'Spaghetti mit Tomatensoße', minutes: 25, servings: 2, tags: [] }] },
  { date: iso(2), meals: [] },
  { date: iso(3), meals: [{ type: 'dinner', note: true, name: 'Reste essen', text: 'Was vom Wochenende übrig ist' }] },
  { date: iso(4), meals: [] }, { date: iso(5), meals: [] }, { date: iso(6), meals: [] },
] });
const DETAIL = { description: 'Cremige Suppe aus Hokkaido-Kürbis.', ingredients: ING,
  steps: Array.from({ length: 6 }, (_, i) => ({ title: i === 0 ? 'Vorbereiten' : null, text: 'Schritt ' + (i + 1) + '.' })) };

const make = (entities, answer) => {
  const kicks = [];
  const states = {};
  Object.keys(entities).forEach((id) => { states[id] = { entity_id: id, state: '0', attributes: {}, last_updated: 'x' }; });
  states['sensor.casora_rezept_der_woche'] = { state: 'Linsencurry', attributes: { minuten: 30 } };
  const calls = [];
  const hass = { entities, states, callWS: (m) => { calls.push(m); return typeof answer === 'function' ? answer(m) : Promise.resolve(answer); } };
  const win = {
    addEventListener() {}, casoraSvc: (s) => ({ domain: 'script', service: s }),
    casoraSafeUrl: (u) => String(u).replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    casoraKickAll: (why, f) => kicks.push([why, f]),
    // keyAny as in 00-finder.js: first entity with this translation_key.
    casoraDevice: { keyAny: (h, key, dom) => Object.keys(h.entities).filter((e) => h.entities[e].translation_key === key && e.indexOf(dom + '.') === 0).sort()[0] || null },
    _casoraUI: { v3: () => true, esc: String, tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222' },
      stage: (t, o) => '<STAGE ' + t + '>' + o.html, line: (m, r) => '<LINE>' + m + (r.length ? ' · ' + r.join(' · ') : ''),
      more: (id, html, o) => '<MORE ' + id + ' ' + o.label + ' keep=' + !!o.keep + '>' + html + '</MORE>',
      group: () => '<GROUP>' },
    _casoraHH: { on: () => true, label: (t) => '<L>' + t + '</L>', layout: (o) => o },
  };
  const ha = { hass, shadowRoot: null };
  const box = { window: win, document: { querySelector: (s) => (s === 'home-assistant' ? ha : null) }, setTimeout: () => 0, clearTimeout() {}, console, Date, JSON, Math, Promise };
  vm.createContext(box);
  vm.runInContext(src.slice(a, b + 6), box);
  return { R: win._casoraRecipe, hass, states, kicks, calls, win };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

const MEALIE = {
  'calendar.mealie_abendessen': { entity_id: 'calendar.mealie_abendessen', platform: 'mealie', translation_key: 'dinner' },
  'calendar.mealie_fruehstueck': { entity_id: 'calendar.mealie_fruehstueck', platform: 'mealie', translation_key: 'breakfast' },
  'todo.mealie_einkauf': { entity_id: 'todo.mealie_einkauf', platform: 'mealie', translation_key: 'shopping_list' },
  'sensor.mealie_rezepte': { entity_id: 'sensor.mealie_rezepte', platform: 'mealie', translation_key: 'recipes' },
};
const COOKIDOO = {
  'calendar.ck_plan': { entity_id: 'calendar.ck_plan', platform: 'cookidoo', translation_key: 'meal_plan' },
  'todo.ck_list': { entity_id: 'todo.ck_list', platform: 'cookidoo', translation_key: 'ingredient_list' },
  'todo.ck_extra': { entity_id: 'todo.ck_extra', platform: 'cookidoo', translation_key: 'additional_item_list' },
};

// ── Without Mealie: the Cookidoo path as before ──────────────────────────────────────────────────────────────────
{
  const { R, states, calls, hass } = make(COOKIDOO, { state: 'none' });
  assert.equal(R.mealieOn(), false, 'no Mealie');
  assert.equal(R.tile({}, states), 'Linsencurry · 30 Min.', 'Cookidoo/idea tile unchanged');
  assert.equal(R.tileShort(), null, 'no short form without Mealie');
  const lay = R.popup({ entity_id: 'sensor.casora_rezept_der_woche' }, {}, states, hass);
  assert.deepEqual(JSON.parse(JSON.stringify(lay.right)), ['cal', 'todo'], 'Cookidoo layout');
  assert.equal(lay.stage, 'stage');
  assert.deepEqual(JSON.parse(JSON.stringify(R.todoIds(hass))), ['todo.ck_list', 'todo.ck_extra'], 'Cookidoo lists');
  assert.equal(calls.length, 0, 'no Mealie websocket call');
  assert.match(R.stageHtml(states), /Thermomix/, 'Cookidoo stage keeps its words');
}

// ── Mealie: tile ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const { R, states, kicks, calls, hass } = make({ ...COOKIDOO, ...MEALIE }, PLAN({ ...SOUP, date: iso(0), detail: DETAIL }));
  assert.equal(R.mealieOn(), true, 'Mealie found by platform + translation_key');
  assert.deepEqual(JSON.parse(JSON.stringify(R.mealieReg(hass))), { cals: ['calendar.mealie_abendessen', 'calendar.mealie_fruehstueck'], lists: ['todo.mealie_einkauf'] });
  assert.equal(R.tile({}, states), 'Wird geladen …', 'loading');
  await tick(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ type: 'casora/mealie/plan' }], 'one websocket call');
  assert.ok(kicks.length >= 1, 'recipe tiles kicked after the answer');
  const f = kicks[0][1];
  assert.equal(f({ _config: { state_display: '[[[ window._casoraRecipe.tile() ]]]' } }), true, 'kicks the recipe tile');
  assert.equal(f({ _config: { state_display: '[[[ other ]]]' } }), false, 'not other tiles');
  assert.equal(R.tile({}, states), 'Heute · Kürbissuppe · 40 Min. · 4 Portionen · Vegetarisch', 'details where they fit');
  assert.equal(R.tileShort(), 'Heute · Kürbissuppe', 'short form for small tiles');
  R.tile({}, states); await tick();
  assert.equal(calls.length, 1, 'kept five minutes');
  assert.deepEqual(JSON.parse(JSON.stringify(R.todoIds(hass))), ['todo.mealie_einkauf'], 'Mealie shopping list');

  // Popup layout and sections.
  const lay = R.popup({ entity_id: 'sensor.casora_rezept_der_woche' }, {}, states, hass);
  assert.deepEqual(JSON.parse(JSON.stringify(lay.top)), ['mline']);
  assert.equal(lay.stage, 'mstage');
  assert.deepEqual(JSON.parse(JSON.stringify(lay.right)), ['mweek', 'ming', 'msteps', 'todo']);
  assert.ok(['calendar.mealie_abendessen', 'todo.mealie_einkauf'].every((w) => lay.watch.includes(w)), 'watches Mealie entities');
  assert.equal(R.sec('mline', states, hass), '<div class="hr-mline"><LINE>Heute geplant</div>');
  const st = R.sec('mstage', states, hass);
  assert.match(st, /<STAGE content>/);
  assert.ok(st.includes('<img class="hrm-img" src="/api/casora/mealie/image/a68bf58d-6700-4d10-9ca5-03cbde2cebed?v=GApZ&amp;authSig=x"'), 'signed image');
  assert.match(st, /<span>Abendessen<\/span>/, 'meal type as caption');
  assert.match(st, /class="hrs-n">Kürbissuppe mit Ingwer</, 'full name on the stage');
  assert.match(st, /class="hrs-m">40 Min\. · 4 Portionen</);
  assert.match(st, /<span class="hrm-tag">Vegetarisch<\/span><span class="hrm-tag">Herbst<\/span>/, 'tags as chips');
  assert.match(st, /Cremige Suppe aus Hokkaido-Kürbis\./, 'description');
  const all = st + R.sec('mweek', states, hass) + R.sec('ming', states, hass) + R.sec('msteps', states, hass);
  assert.ok(!/Thermomix|Cookidoo|Claude/.test(all), 'no Cookidoo wording on the Mealie path');
  const wk = R.sec('mweek', states, hass);
  assert.equal((wk.match(/class="hrw-r hrm-day/g) || []).length, 7, 'seven days');
  assert.match(wk, /<L>Speiseplan<\/L>/);
  assert.match(wk, /hrw-r hrm-day now/, 'today highlighted');
  assert.match(wk, /Overnight Oats<\/div><div class="hrw-s">Frühstück · 10 Min\./);
  assert.match(wk, /Kürbissuppe mit Ingwer<\/div><div class="hrw-s">Abendessen · 40 Min\./);
  assert.match(wk, /Reste essen<\/div><div class="hrw-s">Abendessen</, 'note in the week');
  assert.equal((wk.match(/hrm-off">Nichts geplant/g) || []).length, 4, 'empty days');
  const ing = R.sec('ming', states, hass);
  assert.match(ing, /<L>Zutaten · 4 Portionen<\/L>/);
  assert.match(ing, /<li class="h">Für die Soße<\/li>/, 'section title');
  const [shown, more] = ing.split('<MORE ');
  assert.equal((shown.match(/<li>/g) || []).length, 12, 'first 12 ingredients');
  assert.match(more, /^mealie-ing Alle 14 anzeigen keep=true>/, 'rest behind „Alle 14 anzeigen“');
  const stp = R.sec('msteps', states, hass);
  assert.match(stp, /<L>Zubereitung<\/L>/);
  const [s4, srest] = stp.split('<MORE ');
  assert.equal((s4.match(/class="hrm-st"/g) || []).length, 4, 'first four steps');
  assert.match(s4, /<span class="hrm-no">1<\/span><div class="hrm-tx"><b>Vorbereiten<\/b>Schritt 1\./, 'numbered, step title');
  assert.match(srest, /^mealie-steps Alle 6 anzeigen keep=true>.*<span class="hrm-no">5<\/span>/, 'numbering goes on behind „Alle“');
}

// ── Mealie: next day, a note, nothing planned, unavailable ─────────────────────────────────────────────────────────
{
  const { R, states } = make(MEALIE, PLAN({ type: 'dinner', note: false, name: 'Spaghetti mit Tomatensoße', minutes: 25, servings: 2, tags: [], date: iso(1) }));
  R.tile({}, states); await tick(); await tick();
  assert.equal(R.tile({}, states), 'Morgen · Spaghetti · 25 Min. · 2 Portionen', 'next planned day');
  assert.equal(R.lineHtml ? R.mLineHtml() : '', '<LINE>Nächstes Gericht');
  assert.match(R.mStageHtml(), /<span>Abendessen · Morgen<\/span>/, 'caption names the day');
  assert.equal(R.mIngHtml(), '', 'no ingredients without details');
}
{
  const { R, states } = make(MEALIE, PLAN({ type: 'dinner', note: true, name: 'Reste essen', text: 'Was vom Wochenende übrig ist', date: iso(0) }));
  R.tile({}, states); await tick(); await tick();
  assert.equal(R.tile({}, states), 'Heute · Reste essen', 'note: name only');
  assert.equal(R.tileShort(), null);
  const st = R.mStageHtml();
  assert.match(st, /mdi:note-text-outline/); assert.match(st, /Was vom Wochenende übrig ist/, 'note text on the stage');
  assert.ok(!/class="hrm-img|class="hrs-m/.test(st), 'no image, no meta for a note');
  assert.equal(R.mIngHtml() + R.mStepsHtml(), '', 'no ingredients or steps for a note');
}
{
  const { R, states } = make(MEALIE, { state: 'ok', today: iso(0), featured: null, days: PLAN(null).days.map((d) => ({ date: d.date, meals: [] })) });
  R.tile({}, states); await tick(); await tick();
  assert.equal(R.tile({}, states), 'Nichts geplant');
  assert.match(R.mStageHtml(), /Nichts geplant<\/div><div class="hrs-w">In Mealie für die nächsten 7 Tage planen/);
  assert.equal(R.mLineHtml(), '<LINE>Nichts geplant');
}
{
  const { R, states } = make(MEALIE, { state: 'unavailable', days: [], featured: null });
  R.tile({}, states); await tick(); await tick();
  assert.equal(R.tile({}, states), 'Nicht verfügbar', 'Mealie unavailable');
  assert.match(R.mStageHtml(), /Mealie nicht erreichbar/);
  assert.match(R.mWeekHtml(), /Speiseplan nicht verfügbar/);
  assert.equal(R.mLineHtml(), '<LINE>Nicht erreichbar');
}
{
  const { R, states } = make(MEALIE, () => Promise.reject(new Error('ws failed')));
  R.tile({}, states); await tick(); await tick();
  assert.equal(R.tile({}, states), 'Nicht verfügbar', 'websocket failing');
}

// ── Template: the short form goes to casoraStateFit as its alternative ─────────────────────────────────────────────
{
  const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
  const sd = T.casora_recipe.state_display.trim().replace(/^\[\[\[|\]\]\]$/g, '');
  const run = (R) => {
    const got = [];
    const window = { _casoraRecipe: R, casoraStateFit: (t, w, alt) => { got.push([t, alt]); return 'FIT'; }, casoraEsc: String };
    // Template JS uses optional calls (?.), Function runs it as is.
    new Function('window', 'entity', 'states', sd)(window, { state: 'x' }, {});
    return got[0];
  };
  assert.deepEqual(run({ tile: () => 'Heute · A · 40 Min.', tileShort: () => 'Heute · A' }), ['Heute · A · 40 Min.', 'Heute · A']);
  assert.deepEqual(run({ tile: () => 'Linsencurry · 30 Min.', tileShort: () => null }), ['Linsencurry · 30 Min.', undefined], 'Cookidoo: plain fit, no alternative');
}
console.log('ok mealie_recipe');
