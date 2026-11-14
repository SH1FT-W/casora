// Small text buttons in popups reach 44 px on the phone (design-regeln §12, richtlinien §12; design audit 14.11.2026):
// popup-geo „treffer“ measured „Details ›“ in the fan and air purifier popups at 67×16 and „Erledigt“ (washer, dryer
// maintenance) at 79×36. The battery popup already had an invisible ::before around its „Details ›“; the templates
// (fan, air purifier, plant) and „Erledigt“ did not. Renders each link with the CSS that ships with it in Chromium and
// measures link + ::before.
//   node dev/unit/popup_small_links_hit_area.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const dev = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
const kompakt = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/08-weich-kompakt.js', import.meta.url), 'utf8');

// Every source string that writes a „Details ›“ link (class hp-det), with the <style> blocks in that same string.
const sources = [];
(function walk(o, where) {
  if (typeof o === 'string') { if (o.includes('class=\\"hp-det\\"') || o.includes('class="hp-det"')) sources.push({ where, text: o }); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, where ? where + '/' + k : k);
})(tpl, '');
sources.push({ where: '08-weich-kompakt.js', text: kompakt });
assert.ok(sources.length >= 4, 'hp-det sources found: ' + sources.length);
const styleOf = (text) => [...text.replace(/\\"/g, '"').matchAll(/<style>([^<]*)<\/style>/g)].map((m) => m[1]).join('\n');

// „Erledigt“: the CSS of L.wrap in 02-devices.js.
const w0 = dev.indexOf("L.wrap = function (html) {");
assert.ok(w0 > 0, 'L.wrap found');
const w1 = dev.indexOf("+ '</style>'", w0);
const doneCss = new Function('return ' + dev.slice(dev.indexOf("'<style>", w0), w1))().replace(/^<style>/, '');

const pw = (() => {
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs'); if (fs.existsSync(f)) return f; }
  return 'playwright';
})();
let chromium;
try { ({ chromium } = await import(pw)); } catch (e) { console.log('übersprungen: kein Playwright'); process.exit(0); }

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 393, height: 600 }, isMobile: true, hasTouch: true });
// Height of the element plus its ::before / ::after (the hit area a finger meets).
const measure = async (css, html, sel) => {
  await pg.setContent('<style>body{margin:80px 40px;font-family:sans-serif;font-size:15px;}' + css + '</style>' + html);
  return pg.evaluate((sel) => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect();
    let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
    for (const ps of ['::before', '::after']) {
      const s = getComputedStyle(el, ps);
      if (s.content === 'none' || s.position !== 'absolute') continue;
      const px = (v) => (v === 'auto' ? null : parseFloat(v));
      const t = px(s.top), b = px(s.bottom), l = px(s.left), rr = px(s.right);
      if (t != null && b != null) { top = Math.min(top, r.top + t); bottom = Math.max(bottom, r.bottom - b); }
      if (l != null && rr != null) { left = Math.min(left, r.left + l); right = Math.max(right, r.right - rr); }
    }
    return { w: Math.round(right - left), h: Math.round(bottom - top) };
  }, sel);
};

const fails = [];
for (const s of sources) {
  const css = styleOf(s.text);
  const box = await measure(css, '<div class="hp-ct" style="display:flex;align-items:baseline;gap:12px;"><span style="flex:1">Temperatur</span>'
    + '<span class="hp-det" role="button" style="font-size:13px;font-weight:700;white-space:nowrap;"><span>Details</span> ›</span></div>', '.hp-det');
  if (box.h < 40) fails.push(`${s.where}: „Details ›“ hit area ${box.w}×${box.h} < 40`);
}
const done = await measure(doneCss, '<div style="display:flex;align-items:center;min-height:60px;"><span class="hw-done">Erledigt</span></div>', '.hw-done');
if (done.h < 40) fails.push(`02-devices.js L.wrap: „Erledigt“ hit area ${done.w}×${done.h} < 40`);
await br.close();
if (fails.length) { console.error('FEHLER\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('popup_small_links_hit_area: ok');
