// Recipe popup v3 (prod test 01.11.2026, 03-popups.js window._casoraRecipe):
//  - the stage is today's dish from the meal plan, else the idea of the week: the full name (no hard cut), wrapping in
//    up to 3 lines with „…“ (white-space normal, line-clamp 3, issue #3), time, reason and the idea's pills;
//  - the status line is a short word, never the recipe's name again;
//  - the right column holds only the meal plan and the shopping list (nothing twice), the head reads „Küche“ / „Rezepte“;
//  - the stage ends with „Cookidoo-App öffnen“ in Cookidoo green, the app link per market and platform.
//   node dev/unit/rezept_v3.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/03-popups.js', 'utf8');
const a = src.indexOf('// ── Küche: Rezept der Woche');
const b = src.indexOf('\n})();', a);
assert.ok(a > -1 && b > a, 'recipe module found');
const NAME = 'Wirsing-Hackfleisch-Pfanne mit Kartoffeln und Schmand';
const states = { 'sensor.casora_rezept_der_woche': { state: NAME, attributes: { minuten: 40, warum: 'Herbstgemüse.', zutaten: ['Wirsing'] } } };
const win = {
  addEventListener() {}, casoraSvc: (s) => ({ domain: 'script', service: s }),
  _casoraUI: { v3: () => true, esc: String,
    stage: (t, o) => '<STAGE ' + t + '>' + o.html, line: (m, r) => '<LINE>' + m + (r.length ? ' · ' + r.join(' · ') : '') },
  _casoraHH: { on: () => true, label: (t) => '<L>' + t, layout: (o) => o },
};
const box = { window: win, document: { querySelector: () => null }, setTimeout, console, Date, JSON, Math };
vm.createContext(box);
vm.runInContext(src.slice(a, b + 6), box);
const R = win._casoraRecipe;

// Idea of the week: full name, wraps (3 lines), time, reason, both pills; no shortened name.
let st = R.stageHtml(states);
assert.match(st, /^<STAGE content>/, 'S8 plate');
assert.ok(st.indexOf('>' + NAME + '<') > -1, 'full name on the stage');
assert.match(st, /-webkit-line-clamp:3/); assert.match(st, /\.hrs-n\{[^}]*white-space:normal/);
assert.match(st, /40 Min\. · Thermomix/); assert.match(st, /Herbstgemüse\./);
assert.match(st, /Auf die Einkaufsliste/); assert.match(st, /Andere Idee/);
assert.equal(R.lineHtml(states), '<LINE>Idee der Woche', 'status line is a word, not the name');

// Today's dish from the meal plan wins over the idea.
const now = new Date(); const t = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' 12:00:00';
R.cal.list = [{ name: 'Kürbissuppe', when: new Date(t.replace(' ', 'T')), min: 30 }];
st = R.stageHtml(states);
assert.ok(!/Heute geplant/.test(st), 'the status line says it, not the stage'); assert.match(st, /Speiseplan/); assert.match(st, /Kürbissuppe/); assert.match(st, /30 Min\. · Thermomix/); assert.ok(st.indexOf(NAME) < 0, 'no idea beside today\'s dish');
assert.equal(R.lineHtml(states), '<LINE>Heute geplant');
R.cal.list = [];

// Cookidoo app button (owner 04.11.2026): on both stages, the market and locale of the idea's link, else HA's country.
const IDEA_LINK = { 'sensor.casora_rezept_der_woche': { state: NAME, attributes: Object.assign({}, states['sensor.casora_rezept_der_woche'].attributes, { link: 'https://cookidoo.at/recipes/recipe/de-AT/r123' }) } };
const ck = (html) => (/<div class="hui-st-act hrs-ck"[^>]*data-casora-link="([^"]+)"[^>]*>.*?Cookidoo-App öffnen/.exec(html) || [])[1];
assert.equal(ck(R.stageHtml(states)), 'https://cookidoo.de/shopping/de-DE', 'button on the idea stage, German default');
assert.equal(ck(R.stageHtml(IDEA_LINK)), 'https://cookidoo.at/shopping/de-AT', 'market and locale from the idea link');
assert.match(R.stageHtml(states), /\.hrs-ck\{[^}]*background:var\(--casora-brand-cookidoo[^}]*color:#fff/, 'Cookidoo green, white word');
R.cal.list = [{ name: 'Kürbissuppe', when: new Date(t.replace(' ', 'T')), min: 30 }];
assert.ok(ck(R.stageHtml(states)), 'button also beside today\'s dish');
R.cal.list = [];
const W = (country, language) => R.ckWeb({}, { config: { country }, language });
assert.equal(W('GB', 'en'), 'https://cookidoo.co.uk/shopping/en-GB');
assert.equal(W('CH', 'fr'), 'https://cookidoo.ch/shopping/fr-CH');
assert.equal(W('BE', 'nl'), 'https://cookidoo.be/shopping/nl-BE');
assert.equal(W(null, 'it'), 'https://cookidoo.it/shopping/it-IT');
assert.equal(W('JP', 'ja'), 'https://cookidoo.international/shopping/en');
// Per platform: iOS and desktop the https Universal Link in a new window, Android the app via app:// (HA app) or intent:.
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2026.10';
const AND = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const WEB = 'https://cookidoo.de/shopping/de-DE';
assert.deepEqual({ ...R.ckTarget(WEB, IOS, false) }, { url: WEB, how: 'open' });
assert.deepEqual({ ...R.ckTarget(WEB, MAC, false) }, { url: WEB, how: 'open' });
assert.deepEqual({ ...R.ckTarget(WEB, AND, true) }, { url: 'app://com.vorwerk.cookidoo', how: 'assign' });
assert.deepEqual({ ...R.ckTarget(WEB, AND, false) }, { url: 'intent://cookidoo.de/shopping/de-DE#Intent;scheme=https;package=com.vorwerk.cookidoo;S.browser_fallback_url=' + encodeURIComponent(WEB) + ';end', how: 'assign' });
assert.equal(R.ckTarget('https://cookidoo.com/shopping/en-US', AND, true).url, 'app://com.vorwerk.cookidoo.us');

// Layout: status line on top, the stage left, right only the meal plan and the shopping list.
const lay = R.popup({ entity_id: 'sensor.casora_rezept_der_woche' }, {}, states, null);
assert.deepEqual(JSON.parse(JSON.stringify(lay.top)), ['line']);
assert.equal(lay.stage, 'stage');
assert.deepEqual(JSON.parse(JSON.stringify(lay.left)), []);
assert.deepEqual(JSON.parse(JSON.stringify(lay.right)), ['cal', 'todo']);

// Head: label „Küche“, title „Rezepte“ (not „Küche · Rezepte“) in tap and hold.
const T = JSON.parse(fs.readFileSync(ROOT + 'dashboards/casora/button_card_templates.json', 'utf8'));
for (const k of ['tap_action', 'icon_tap_action']) {
  const cp = T.casora_popup_recipe[k].casora_popup;
  assert.match(cp.title, /return "Rezepte";/, k + ' title');
  assert.ok(!/Küche · Rezepte/.test(cp.title), k + ' no joined title');
  const eb = new Function('variables', 'window', cp.eyebrow.replace(/^\[\[\[|\]\]\]\s*$/g, ''));
  assert.equal(eb({}, {}), 'Küche', k + ' label');
}
console.log('ok rezept_v3');
