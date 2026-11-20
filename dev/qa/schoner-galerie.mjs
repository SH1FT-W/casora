// Screensaver gallery: every screensaver of 46-screensaver.js as a picture, without Home Assistant.
//   node dev/qa/schoner-galerie.mjs [--root <checkout>] [--out <dir>] [--size 1280x800] [--nur <regex>] [--lang de]
// Draws each kind with the module's own examples (S.sample) at a fixed day and night time into <out>/<kind>-<tag>.png
// and the ten landscapes into land-<scene>.png. --root takes the module from another checkout (before / after).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../e2e/harness.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(arg('root', here));
const out = path.resolve(arg('out', '/tmp/casora-qa/schoner'));
const [W, H] = arg('size', '1280x800').split('x').map(Number);
const only = arg('nur', '') ? new RegExp(arg('nur', '')) : null;
const lang = arg('lang', 'de');
fs.mkdirSync(out, { recursive: true });

const comp = path.join(root, 'custom_components/casora');
const mime = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face{font-family:"Inter";src:url('/casora_assets/fonts/inter-4.1-latin-var.woff2') format('woff2');font-weight:100 900;}
html,body{margin:0;height:100%;background:#000;}
:root{--primary-font-family:"Inter",-apple-system,system-ui,sans-serif;}
#box{position:fixed;inset:0;container-type:size;overflow:hidden;}
*{animation-play-state:paused !important;}
</style></head><body><div id="box"></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
  let f = null;
  if (u.pathname.startsWith('/casora_assets/')) f = path.join(comp, 'assets', decodeURIComponent(u.pathname.slice(15)));
  else if (u.pathname.startsWith('/scripts/')) f = path.join(comp, decodeURIComponent(u.pathname.slice(1)));
  if (f && fs.existsSync(f)) return route.fulfill({ contentType: mime[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  return route.fulfill({ status: 404, body: '' });
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://casora.test/');
// The translations of the dashboard, so another language than German shows its own words.
const i18n = path.join(comp, 'scripts/i18n', lang + '.json');
const dict = lang !== 'de' && fs.existsSync(i18n) ? JSON.parse(fs.readFileSync(i18n, 'utf8')) : null;
await page.evaluate(({ lang, dict }) => {
  const loc = { de: 'de-DE', en: 'en-GB', nl: 'nl-NL', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', nb: 'nb-NO' }[lang] || 'de-DE';
  window.casoraLocale = () => loc;
  const exact = (dict && (dict.exact || dict)) || {};
  window.casoraTr = (t) => exact[t] || t;
}, { lang, dict });
for (const f of ['scripts/local/06-kalender.js', 'scripts/local/46-screensaver.js']) {
  if (fs.existsSync(path.join(comp, f))) await page.addScriptTag({ url: '/' + f }).catch((e) => errors.push(f + ': ' + e));
}
const kinds = await page.evaluate(() => window._casoraSaver.KINDS.map((k) => k.id));
const scenes = await page.evaluate(() => window._casoraSaver.SCENES.map((s) => s.id));
const TIMES = { tag: '2026-11-20T13:42:00', abend: '2026-11-20T16:18:00', nacht: '2026-11-20T21:42:00' };
const rooms = ['living', 'kitchen', 'bedroom', 'dining'].filter((r) => fs.existsSync(path.join(comp, 'assets/rooms', r + '-demo.jpg')));

const shoot = async (name, kind, at, extra) => {
  if (only && !only.test(name)) return;
  await page.evaluate(({ kind, at, rooms, extra }) => {
    const S = window._casoraSaver, box = document.getElementById('box');
    if (window.__m) window.__m.destroy();
    const now = new Date(at), day = at.slice(0, 10);
    const night = now.getHours() >= 17 || now.getHours() < 7;
    const base = { now, hass: { states: {}, themes: { darkMode: false }, locale: { language: document.documentElement.lang } },
      vars: Object.assign({ weather_entity: '' }, extra && extra.vars), sun: { rise: +new Date(day + 'T07:41:00'), set: +new Date(day + 'T16:34:00') },
      rooms: rooms.map((r) => ({ name: { living: 'Wohnzimmer', kitchen: 'Küche', bedroom: 'Schlafzimmer', dining: 'Esszimmer' }[r], url: '/casora_assets/rooms/' + r + '-demo' + (night ? '-night' : '') + '.jpg', ref: r })),
      wx: undefined, events: [], hourly: [], daily: [], bins: extra && extra.bins ? extra.bins : [], media: undefined, energy: undefined, cams: [], bell: [], people: extra && extra.people ? extra.people : [] };
    if (extra && extra.scene != null) { const D = Date; base.now = new D(+now); }
    window.__m = S.mount(box, kind, { context: () => base, sample: true, every: 3600000 });
  }, { kind, at: TIMES[at], rooms, extra: extra || null });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log(name);
};

for (const k of kinds) for (const t of k === 'himmel' ? ['tag', 'abend', 'nacht'] : ['tag', 'nacht']) await shoot(k + '-' + t, k, t);
// Every landscape, drawn directly (the screensaver shows one after the other by the clock).
for (const id of scenes) {
  if (only && !only.test('land-' + id)) continue;
  await page.evaluate(({ id }) => {
    const S = window._casoraSaver, box = document.getElementById('box');
    if (window.__m) { window.__m.destroy(); window.__m = null; }
    box.innerHTML = S.landSvg(S.SCENES.find((s) => s.id === id), 1312, 820).replace('<svg ', '<svg style="position:absolute;inset:0;width:100%;height:100%" ');
  }, { id });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'land-' + id + '.png') });
  console.log('land-' + id);
}
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
await browser.close();
