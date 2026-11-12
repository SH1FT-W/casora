// "New in Casora": an entry can carry a picture under its text (a file in assets/news, served under /casora_assets/news).
//   node dev/unit/welcome_news_pictures.mjs
// @deckt: custom_components/casora/panel/casora-panel-welcome.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const src = fs.readFileSync(new URL('custom_components/casora/panel/casora-panel-welcome.js', root), 'utf8');
const a = src.indexOf('const WHATS_NEW = [');
const list = src.slice(a, src.indexOf('];', a));
const pics = [...list.matchAll(/\["mdi:[^"]+", "\w+", "\w+", "([^"]+)"\]/g)].map((m) => m[1]);
assert.ok(pics.length >= 1, 'at least one entry with a picture');
for (const p of pics) {
  const f = new URL('custom_components/casora/assets/news/' + p, root);
  assert.ok(fs.existsSync(f), 'picture shipped: assets/news/' + p);
  assert.ok(fs.statSync(f).size < 150 * 1024, p + ' stays small (< 150 KB)');
}

// Render the sheet: the picture sits under the text, entries without one stay as before.
const body = { children: [], appendChild(n) { this.children.push(n); } };
const mkEl = () => ({ setAttribute() {}, remove() {}, attachShadow() { const r = { innerHTML: '', querySelector: () => ({ addEventListener() {} }) }; this.shadow = r; return r; } });
const win = {};
const doc = { querySelector: () => null, createElement: mkEl, body, addEventListener() {}, removeEventListener() {} };
const run = new Function('window', 'document', 'localStorage', 'setTimeout',
  src.replace(/import\.meta\.url/g, JSON.stringify('http://x/casora-panel-welcome.js?v=26.11.26.123')));
run(win, doc, { getItem: () => '26.11.25', setItem() {} }, () => 0);
win.casoraWelcomeShow('whatsNew');
const html = body.children[0].shadow.innerHTML;
for (const p of pics) assert.ok(html.includes(`<img class="cw-pic" src="/casora_assets/news/${p}?v=26.11.26"`), 'sheet shows ' + p);
const items = html.split('<li>').slice(1);
assert.equal(items.filter((li) => li.includes('cw-pic')).length, pics.length, 'only entries with a picture get one');
// The updates page takes the news as text: no picture there.
assert.ok(win.casoraWhatsNew('de').items.every((it) => it.length === 2 && !/<img/.test(it.join(''))), 'text list without pictures');
console.log('welcome_news_pictures: ok');
