// Display diagnosis on the affected device (scripts/local/41-display-diag.js, issue #123): the pure collector and the
// text it formats. Expected: viewport, visual viewport, screen, pixel ratio and media queries from a window-like
// object; the text zoom factor from the 100px test box (Android font scale / Fully Kiosk text zoom); Fully Kiosk from
// its user agent or window.fully, the Android WebView version; the hero fit and measured heights; overlap of badge
// rows and tiles named; nothing private (names, entity ids, URLs) in the text – unknown values become "?".
//   node dev/unit/display_diag.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/41-display-diag.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
new Function(src)();
const D = window._casoraDisplayDiag;
assert.ok(D && typeof D.collect === 'function' && typeof D.format === 'function', 'module loaded without a DOM');

// A window-like object: the media queries are answered from a small table, as a 9.7" Android tablet would.
const mq = (on) => (q) => ({ matches: on.some((x) => q === x || q.includes(x)) });
const UA_FULLY = 'Mozilla/5.0 (Linux; Android 11; T10 Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Version/4.0 Chrome/120.0.6099.230 Safari/537.36 FullyKiosk/1.55.2';
const tablet = {
  navigator: { userAgent: UA_FULLY, maxTouchPoints: 10 },
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1.5,
  visualViewport: { width: 1280, height: 800, scale: 1 },
  screen: { width: 1280, height: 800, availWidth: 1280, availHeight: 752, orientation: { type: 'landscape-primary' } },
  matchMedia: mq(['(pointer: coarse)', '(hover: none) and (pointer: coarse) and (min-width: 600px)', '(any-pointer: coarse)',
    '(min-width: 768px) and (max-width: 1400px) and (min-height: 501px) and (pointer: coarse)', '(max-height: 900px) and (min-width: 601px)']),
};
const probe = {
  date: '2026-11-04', casora: '26.11.12', stamp: '1762250000', ha: '2026.11.0', language: 'de', theme: 'Casora', dark: true,
  textPx: 130, adjustPx: 130, rootPx: 20.8, safe: { t: 0, r: 0, b: 0, l: 0 }, header: 'hidden', sidebar: 'hidden',
  layout: { dashboard: 'desktop', nav: 'tablet', page: 'home', heroTop: 140, titlePx: 64,
    heroFit: { shift: 22, size: 52.5, size0: 64, need: 40 } },
  heights: { head: 190, title: 77, badges: 46, sub: [{ k: 'climate', h: 44 }, { k: 'sensor.secret_room', h: 1 }],
    tiles: 128, tileCount: 4, gap: -12, overlap: 12, overlapWhat: 'sub_badges_over_tiles' },
};
const d = D.collect(tablet, probe);

// Viewport and device.
assert.deepEqual(d.viewport, { w: 1280, h: 800 });
assert.deepEqual(d.visual, { w: 1280, h: 800, scale: 1 });
assert.equal(d.screen.avH, 752);
assert.equal(d.dpr, 1.5);
assert.equal(d.orientation, 'landscape-primary');
assert.equal(d.pointer, 'coarse');
assert.equal(d.hover, false);
assert.equal(d.media.touch_tablet, true, 'tablet rules of the templates on');
assert.equal(d.media.tablet_nav, true);
assert.equal(d.media.phone, false);
assert.equal(d.media.short_900, true);

// Text zoom: 100px drawn as 130px = factor 1.30; the root font size is reported as it is.
assert.equal(d.textZoom, 1.3, 'text zoom factor from the 100px box');
assert.equal(d.rootPx, 20.8);
assert.equal(D.collect(tablet, { ...probe, textPx: 100, rootPx: 16 }).textZoom, 1, 'no zoom: 1');
assert.equal(D.collect(tablet, { ...probe, textPx: undefined }).textZoom, null, 'not measured: unknown');

// Fully Kiosk: from the user agent, and from window.fully with a plain WebView user agent.
assert.equal(d.env.app, 'Fully Kiosk');
assert.equal(d.env.os, 'android');
assert.equal(d.env.osVersion, '11');
assert.equal(d.env.webview, '120.0.6099.230', 'Android WebView version');
assert.match(d.env.browser, /^chrome 120/);
const plainWv = UA_FULLY.replace(' FullyKiosk/1.55.2', '');
assert.equal(D.collect({ ...tablet, navigator: { userAgent: plainWv } }, probe).env.app, 'browser');
assert.equal(D.collect({ ...tablet, navigator: { userAgent: plainWv }, fully: {} }, probe).env.app, 'Fully Kiosk', 'window.fully counts');
// Other apps and browsers.
const env = (ua, w) => D.envOf(ua, w);
assert.equal(env('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2026.10 (io.robbie.HomeAssistant; build:1; iOS 18.5.0)').app, 'Companion app');
assert.equal(env('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148').osVersion, '18.5');
assert.match(env('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68').browser, /^edge 130/);
assert.match(env('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15').browser, /^safari 18\.1/);
assert.match(env('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0').browser, /^firefox 132/);
assert.equal(env(UA_FULLY.replace('; wv', '')).webview, null, 'no "; wv)": not a WebView');

// Hero fit and heights; a sub row key that is not a plain word is dropped.
assert.deepEqual(d.heroFit, { shift: 22, size: 52.5, size0: 64, need: 40 });
assert.deepEqual(d.heights.sub, [{ k: 'climate', h: 44 }]);
assert.equal(d.heights.overlap, 12);

// Unknown or odd values become "?" / other.
const odd = D.collect(tablet, { ...probe, casora: '<b>x</b>', ha: 'http://10.0.0.2', language: 'Kitchen panel', theme: 'My Theme', date: 'today' });
assert.equal(odd.casora, '?');
assert.equal(odd.ha, '?');
assert.equal(odd.language, '?');
assert.equal(odd.theme, 'other', 'a user theme is not named');
assert.equal(D.collect(tablet, { ...probe, theme: 'Casora Nebel' }).theme, 'Casora Nebel', 'Casora designs by name');
assert.equal(odd.date, '?');

// The text: one "key: value" per line, English keys, the values above.
const text = D.format(d);
const lines = text.split('\n');
assert.ok(lines.every((l) => /^[a-z_]+: /.test(l)), 'every line is "key: value"');
const keys = lines.map((l) => l.split(':')[0]);
for (const k of ['casora_display_diagnosis', 'casora', 'home_assistant', 'language', 'dashboard', 'layout_rules', 'hero_fit',
  'viewport', 'visual_viewport', 'screen', 'device_pixel_ratio', 'orientation', 'pointer', 'text_zoom', 'root_font',
  'text_size_adjust', 'reduced_motion', 'color_scheme', 'theme', 'ha_header', 'safe_area', 'app', 'user_agent',
  'height_head', 'height_badges', 'height_sub_badges', 'height_tiles', 'gap_badges_tiles', 'overlap']) {
  assert.ok(keys.includes(k), 'key ' + k);
}
const line = (k) => lines.find((l) => l.startsWith(k + ': '));
assert.equal(line('viewport'), 'viewport: 1280x800');
assert.equal(line('visual_viewport'), 'visual_viewport: 1280x800 · scale 1');
assert.match(line('text_zoom'), /^text_zoom: 1\.30 \(100px test → 130px\) · ENLARGED TEXT$/);
assert.match(line('dashboard'), /desktop · nav tablet · page home/);
assert.match(line('layout_rules'), /touch_tablet/);
assert.match(line('hero_fit'), /shift 22px · title 64px → 52\.5px/);
assert.match(line('app'), /Fully Kiosk · chrome 120.* · android 11 · Android WebView 120/);
assert.equal(line('overlap'), 'overlap: sub_badges_over_tiles 12px');
assert.equal(line('height_sub_badges'), 'height_sub_badges: climate 44px');
assert.equal(line('casora'), 'casora: 26.11.12 (scripts 1762250000)');
assert.doesNotMatch(text, /sensor\.|light\.|secret|http|Kitchen/, 'nothing private in the text');
// Unzoomed text has no warning.
assert.doesNotMatch(D.format(D.collect(tablet, { ...probe, textPx: 100 })), /ENLARGED/);

// The user agent: printable ASCII, at most 300 characters.
const long = D.collect({ ...tablet, navigator: { userAgent: 'A\u0000bä'.repeat(200) } }, probe);
assert.ok(long.ua.length <= 300 && /^[\x20-\x7e]+$/.test(long.ua));

// Triggers: the URL parameter (alone, first or later, with a value) and five quick taps.
assert.ok(D.wanted('?casora_diag'));
assert.ok(D.wanted('?x=1&casora_diag'));
assert.ok(D.wanted('?casora_diag=1&x=2'));
assert.ok(!D.wanted('?casora_diagnose'));
assert.ok(!D.wanted(''));
let fired = 0;
for (let i = 0; i < 5; i++) fired += D.tap(10000 + i * 300) ? 1 : 0;
assert.equal(fired, 1, 'five taps 0.3 s apart open it once');
fired = 0;
for (let i = 0; i < 5; i++) fired += D.tap(50000 + i * 900) ? 1 : 0;
assert.equal(fired, 0, 'taps 0.9 s apart do not');
fired = 0;
for (let i = 0; i < 4; i++) fired += D.tap(90000 + i * 300) ? 1 : 0;
assert.equal(fired, 0, 'four taps do not');
// The title is the room card's or the phone head's #name / #n, nothing else.
const node = (id, tpl) => ({ nodeType: 1, id, getRootNode: () => ({ host: { _config: { template: tpl } } }) });
assert.ok(D.isTitle([node('name', ['casora_room'])]));
assert.ok(D.isTitle([node('n', 'casora_room')]));
assert.ok(D.isTitle([node('name', 'casora_mobile_weather')]));
assert.ok(!D.isTitle([node('name', 'casora_light')]), 'a tile name is not the title');
assert.ok(!D.isTitle([node('badges', 'casora_room')]));

console.log('display_diag: ok');
