// Popup head buttons (13.11.2026): the gear had no hover disc, only the X (and ‹) had one. Every round head
// button (X, gear, ‹) takes the same hover disc from one shared rule, on pointer devices only (hover: hover).
// Renders the real popup markup + BASE_CSS from casora-core.js in Chromium and hovers each button.
//   node dev/unit/popup_kopf_hover.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const BTNS = ['header-close', 'header-gear', 'header-back'];

// Static part (also without a browser): one hover rule names all three buttons, inside @media (hover: hover).
const a = core.indexOf('  var BASE_CSS = `'), b = core.indexOf('\n  `;', a);
assert.ok(a > 0 && b > a, 'BASE_CSS found');
const css = new Function('return `' + core.slice(a + '  var BASE_CSS = `'.length, b) + '\n`;')();
const hoverBlocks = [...css.matchAll(/@media \(hover: ?hover\) \{([\s\S]*?)\n    \}/g)].map((m) => m[1]);
const fails = [];
for (const c of BTNS) {
  if (!hoverBlocks.some((h) => new RegExp('\\.' + c + ':hover[^{]*::after[^{]*\\{[^}]*opacity: 0\\.1').test(h)))
    fails.push('.' + c + ': no hover disc inside @media (hover: hover)');
}

const pw = (() => {
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs'); if (fs.existsSync(f)) return f; }
  return 'playwright';
})();
let chromium;
try { ({ chromium } = await import(pw)); } catch (e) {
  if (fails.length) { console.error('FEHLER\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('übersprungen (Browser-Teil): kein Playwright'); process.exit(0);
}

// The popup's shadow markup as the constructor writes it.
const m0 = core.indexOf('root.innerHTML =', core.indexOf('class CasoraPopup extends HTMLElement'));
const m1 = core.indexOf("'</div>';", m0) + "'</div>'".length;
const markup = new Function('BASE_CSS', 'return (' + core.slice(m0 + 'root.innerHTML ='.length, m1) + ');')(css);

const br = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  for (const touch of [false, true]) {
    const ctx = await br.newContext({ colorScheme: scheme, hasTouch: touch, isMobile: touch, viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    await pg.setContent('<body style="margin:0"><div id="h"></div></body>');
    await pg.evaluate((html) => {
      const h = document.getElementById('h');
      h.setAttribute('soft', ''); h.setAttribute('data-casora-pv', 'v3'); h.setAttribute('has-back', '');
      h.style.display = 'block';
      const r = h.attachShadow({ mode: 'open' });
      r.innerHTML = html;
      for (const s of ['.header', '.header-gear', '.header-back']) r.querySelector(s).hidden = false;
    }, markup);
    const media = await pg.evaluate(() => matchMedia('(hover: hover)').matches);
    for (const c of BTNS) {
      const box = await pg.evaluate((c) => {
        const el = document.getElementById('h').shadowRoot.querySelector('.' + c), r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
      }, c);
      await pg.mouse.move(box.x, box.y);
      await pg.waitForTimeout(260);
      const op = await pg.evaluate(([c, x, y]) => {
        const r = document.getElementById('h').shadowRoot, el = r.querySelector('.' + c);
        const s = getComputedStyle(el, '::after'), e = r.elementFromPoint(x, y);
        return { op: s.opacity, bg: s.backgroundColor, ink: getComputedStyle(el).color, hit: !!(e && e.closest('.' + c)) };
      }, [c, box.x, box.y]);
      const want = media ? '0.1' : '0';
      if (box.w < 30 || !op.hit) fails.push(`${scheme}/${touch ? 'touch' : 'mouse'} .${c}: not under the pointer (${box.w}px)`);
      else if (op.op !== want) fails.push(`${scheme}/${touch ? 'touch' : 'mouse'} .${c}: ::after opacity ${op.op} on hover, want ${want}`);
      else if (op.bg !== op.ink) fails.push(`${scheme} .${c}: disc ${op.bg} is not the button ink ${op.ink}`);
      await pg.mouse.move(2, 790);
    }
    await ctx.close();
  }
}
await br.close();
if (fails.length) { console.error('FEHLER\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('ok: X, Zahnrad und ‹ mit derselben Hover-Scheibe (hell + dunkel), ohne Zeigegerät keine');
