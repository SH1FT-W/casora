// d03-11 (§6/§16): the recipe popup drew every meal-plan day and every shopping item as its own pill with a gap.
// Expected: one plate per section, rows without a gap and a hairline between them – the plate UI.group draws
// (softGroup: --casora-pv-stack-gap/-fill/-radius, --casora-pv-row-fill/-radius, --casora-pv-divider/-inset). The
// shopping rows stay the same tappable rows (data-casora-svc ticks the item, data-hr-done folds, repaint by id).
//   node dev/unit/rezept_eine_platte.mjs
// @deckt: 03-popups.js#R.calSoft,R.todoHtml,CAL_CSS,PLATE_RULES
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/03-popups.js', 'utf8');
const a = src.indexOf('// ── Küche: Rezept der Woche');
const b = src.indexOf('\n})();', a);
assert.ok(a > -1 && b > a, 'recipe module found');
const win = {
  addEventListener() {}, casoraSvc: (s) => ({ domain: 'script', service: s }),
  _casoraUI: { v3: () => true, esc: String, tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222' },
    group: () => '<GROUP>', stage: () => '', line: () => '' },
  _casoraHH: { on: () => true, label: (t) => '<L>' + t, layout: (o) => o },
};
const box = { window: win, document: { querySelector: () => null }, setTimeout, console, Date, JSON, Math };
vm.createContext(box);
vm.runInContext(src.slice(a, b + 6), box);
const R = win._casoraRecipe;

const rule = (css, sel) => {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'g');
  let m, out = ''; while ((m = re.exec(css))) out += m[1] + ';';
  return out;
};
const plate = (html, box0, row) => {
  const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('');
  const bx = rule(css, box0), rw = rule(css, row);
  assert.match(bx, /gap:var\(--casora-pv-stack-gap/, box0 + ': gap from the plate token (0 in v3)');
  assert.ok(!/gap:8px;/.test(bx.replace(/var\([^)]*\)/g, '')), box0 + ': no fixed gap');
  assert.match(bx, /background:var\(--casora-pv-stack-fill/, box0 + ': plate fill');
  assert.match(bx, /border-radius:var\(--casora-pv-stack-radius/, box0 + ': plate radius');
  assert.match(rw, /background:var\(--casora-pv-row-fill/, row + ': row fill from the token (transparent in v3)');
  assert.match(rw, /border-radius:var\(--casora-pv-row-radius/, row + ': row radius from the token');
  assert.match(rule(css, row + ' + ' + row + '::before'), /background:var\(--casora-pv-divider/, row + ': hairline between rows');
};

// Meal plan.
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x; };
R.cal.list = [{ name: 'Kürbissuppe', when: d(0), min: 30 }, { name: 'Lasagne', when: d(1) }, { name: 'Salat', when: d(3) }];
const cal = R.calSoft();
assert.equal((cal.match(/class="hrw-r/g) || []).length, 3, 'one row per day');
plate(cal, '.hrw', '.hrw-r');

// Shopping list: the same rows, still ticking.
R.todo.items = [
  { uid: 'a', summary: 'Milch', status: 'needs_action', _list: 'todo.einkauf' },
  { uid: 'b', summary: 'Tomaten', status: 'needs_action', _list: 'todo.einkauf' },
  { uid: 'c', summary: 'Mehl', status: 'completed', _list: 'todo.einkauf' },
];
const todo = R.todoHtml();
plate(todo, '.hrl', '.hrl-r');
assert.equal((todo.match(/class="hrl-r" data-casora-svc="/g) || []).length, 2, 'open items tick (update_item)');
assert.match(todo, /&quot;service&quot;:&quot;update_item&quot;|"service":"update_item"/, 'tick service');
assert.match(todo, /data-hr-done=""/, 'done items fold');
console.log('rezept_eine_platte: ok');
