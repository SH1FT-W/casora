// Popup content inventory (archiv/popup-rework-v3-auftrag.md §0.3): opens popups like popup-raender.mjs, walks all
// shadow DOMs and writes every control and live value as a sorted list – services (data-casora-svc), more-info
// (data-casora-mi), sub pages (data-casora-page), routes (data-casora-go), switches, sliders, live values, the
// light module's own taps (data-lps-tap/-bar) and the header switch. „Mehr“ is expanded, sub pages (›) are
// opened one by one and counted under „page:<name>/…“. The keys are normalised so that the same service shows
// the same key no matter which piece draws it (lps toggle = svc light.toggle …).
//
//   CASORA_URL=http://localhost:8124 node dev/qa/popup-inhalt.mjs --nur '<regex>' --variante a|v3 [Optionen]
//     --dash <url_path>       Desktop-Dashboard (Standard: erstes Casora-Dashboard); Handy: <url>-mobile, falls da
//     --views desktop,handy   Ansichten (Standard beide)
//     --variante <name>       Name der Liste (.qa/v3/inhalt/<popup>.<name>.json); setzt localStorage
//                             casora_popup_variant (a = heutiger Aufbau; sonst nichts gesetzt)
//     --liste                 nur die Popup-Schlüssel der Kacheln ausgeben
//   node dev/qa/popup-inhalt.mjs --vergleich a v3 [--nur '<regex>']
//     vergleicht je Popup und Ansicht: fehlt / neu / gleich. Rückgabe 1 bei „fehlt“ außerhalb der Erlaubt-Liste
//     .qa/v3/inhalt/<popup>.erlaubt.json (["key", …] – nur, was Auftrag §0.4 erlaubt, mit Grund im nachher.md).
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.resolve(new URL('../../', import.meta.url).pathname, '.qa/v3/inhalt');
fs.mkdirSync(DIR, { recursive: true });
const only = arg('nur') ? new RegExp(arg('nur')) : null;
const fileKey = (k) => k.replace(/[^\w-]+/g, '_').slice(0, 90);

// ── compare ───────────────────────────────────────────────────────────────────
const vi = process.argv.indexOf('--vergleich');
if (vi > 0) {
  const [va, vb] = [process.argv[vi + 1], process.argv[vi + 2]];
  let bad = 0;
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.' + va + '.json'));
  for (const f of files) {
    const base = f.slice(0, -('.' + va + '.json').length);
    if (only && !only.test(base)) continue;
    const fb = path.join(DIR, base + '.' + vb + '.json');
    if (!fs.existsSync(fb)) { console.log(`  ?      ${base}: keine Liste „${vb}“`); continue; }
    const A = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
    const ef = path.join(DIR, base + '.erlaubt.json');
    const ok = new Set(fs.existsSync(ef) ? JSON.parse(fs.readFileSync(ef, 'utf8')) : []);
    for (const view of Object.keys(A)) {
      const a = new Set(A[view] || []), b = new Set(B[view] || []);
      const miss = [...a].filter((x) => !b.has(x)), add = [...b].filter((x) => !a.has(x)), same = [...a].filter((x) => b.has(x));
      const hard = miss.filter((x) => !ok.has(x));
      bad += hard.length;
      console.log(`  ${hard.length ? 'FEHLT ' : 'ok    '} ${base} ${view}: ${same.length} gleich, ${miss.length} fehlt (${miss.length - hard.length} erlaubt), ${add.length} neu`);
      for (const x of miss) console.log(`           − ${x}${ok.has(x) ? '  (erlaubt)' : ''}`);
      for (const x of add) console.log(`           + ${x}`);
    }
  }
  console.log(`${bad ? 'FAIL' : 'PASS'} popup-inhalt – ${bad} fehlende Stellen`);
  process.exit(bad ? 1 : 0);
}

// ── collect ───────────────────────────────────────────────────────────────────
const { tokens, ws } = await import('./ws.mjs');
await tokens();
const H = await import('../e2e/harness.mjs');
const VIEWS = {
  handy: { width: 393, height: 852, mobile: true, safari: true, scale: 3, phone: true },
  desktop: { width: 1440, height: 900 },
};
const views = arg('views', 'desktop,handy').split(',').filter((v) => VIEWS[v]);
const variant = arg('variante', 'v3');

const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
const cfgs = {};
for (const d of list.filter((x) => x.mode === 'storage' && !/^dashboard-hemma/.test(x.url_path))) {
  try { cfgs[d.url_path] = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }); } catch (e) { /* none */ }
}
c.close();
const isCasora = (u) => cfgs[u] && /casora_room|casora_mobile/.test(JSON.stringify(cfgs[u]));
const desk = arg('dash') || Object.keys(cfgs).find((u) => !/-mobile$/.test(u) && isCasora(u));
if (!desk) { console.log('FAIL popup-inhalt – kein Casora-Dashboard'); process.exit(1); }
const phoneDash = cfgs[desk + '-mobile'] ? desk + '-mobile' : desk;
const viewPaths = (u) => (cfgs[u].views || []).map((v, i) => v.path || String(i));
const SKIP = /^casora_(scene|script|button|toggle|switch_tap|favorite|room|menu_icon|settings_button|nav|chip|mobile_(nav|room|filter))/;
const popupKey = (t) => t.filter((x) => /^casora_/.test(x) && x !== 'casora_entity' && x !== 'casora_default').join('+');

// In the browser: every control/value of the open popup as normalised keys.
const COLLECT = (prefix) => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const out = new Set();
  const ids = (x) => [].concat(x || []).filter(Boolean).slice().sort().join(',');
  const J = (s0) => { try { return JSON.parse(s0); } catch (e) { return null; } };
  const keyData = (d) => { if (!d) return ''; const k = Object.keys(d).filter((x) => x !== 'entity_id').sort(); return k.length ? '|' + JSON.stringify(k.reduce((o, x) => (o[x] = d[x], o), {})) : ''; };
  const svcKey = (sp) => sp && sp.domain ? 'svc:' + sp.domain + '.' + sp.service + '|' + ids((sp.target && sp.target.entity_id) || (sp.data && sp.data.entity_id)) + keyData(sp.data) : null;
  const rowText = (e) => { const r = e.closest && e.closest('.hui-row, .hui-srow, .lps-row, [class*="row"]'); const b = r && r.querySelector('b, .hui-rl, .lps-tx b'); return ((b && b.textContent) || (r && r.textContent) || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40); };
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && (!e.checkVisibility || e.checkVisibility({ checkVisibilityCSS: true })); };
  const all = [];
  (function walk(n) { for (const ch of n.children || []) { all.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } })(s);
  for (const e of all) {
    // Live values count even while drawn 0 high (a fill at 0 %); everything else only when visible.
    if (!e.getAttribute || (!e.hasAttribute('data-casora-live') && !visible(e))) continue;
    const a = (n) => e.getAttribute(n);
    if (a('data-casora-svc')) { const k = svcKey(J(a('data-casora-svc'))); if (k) out.add(k); }
    if (a('data-casora-cf')) { const k = svcKey(J(a('data-casora-cf'))); if (k) out.add(k); }
    if (a('data-casora-mi')) out.add('mi:' + a('data-casora-mi'));
    if (a('data-casora-page')) out.add('page:' + a('data-casora-page'));
    if (a('data-casora-go')) out.add('go:' + a('data-casora-go'));
    if (a('data-casora-slider') != null) { const sp = J(a('data-casora-slider')) || {}; out.add('slider:' + sp.domain + '.' + (sp.field || 'position') + '|' + ids(sp.target && sp.target.entity_id)); }
    if (a('data-casora-live')) out.add('live:' + a('data-casora-live') + ':' + (a('data-casora-ent') || ids(J(a('data-casora-ents') || '[]'))) + ':' + (a('data-casora-attr') || ''));
    if (a('data-lps-bar')) { const d = J(a('data-lps-bar')) || {}; out.add('slider:light.brightness_pct|' + ids(d.ids)); }
    if (a('data-lps-tap')) {
      const d = J(a('data-lps-tap')) || {};
      if (d.a === 'toggle') out.add('svc:light.toggle|' + d.id);
      else if (d.a === 'scene') out.add('svc:scene.turn_on|' + d.id);
      else if (d.a === 'ct') out.add('svc:light.turn_on|' + ids(d.ids) + '|' + JSON.stringify({ color_temp_kelvin: d.k }));
      else if (d.a === 'mi') out.add('mi:' + d.id);
      else out.add('lps:' + d.a + ':' + (d.id || ids(d.ids) || (d.gid + ':' + d.idx)));
    }
    for (const n of e.getAttributeNames()) if (/^data-(fbh|cv|cov|hp)-[\w-]+$/.test(n)) out.add(n.slice(5) + ':' + String(a(n)).slice(0, 120));
    const role = a('role');
    if (role === 'switch' && !e.classList.contains('header-switch')) out.add('switch:' + rowText(e));
    if (role === 'slider' && a('data-casora-slider') == null && !a('data-lps-bar')) out.add('slider-ui:' + (a('aria-label') || rowText(e)));
  }
  const hs = s.querySelector('.header-switch');
  if (hs && !hs.hidden) out.add('head-switch');
  return [...out].map((x) => prefix + x);
};
const MORE_OPEN = () => {
  const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return 0;
  let n = 0;
  (function walk(r) { r.querySelectorAll('.hui-more:not(.open) .hui-mhd, .hui-more:not(.open) > [role="button"]').forEach((h) => { h.click(); n++; }); r.querySelectorAll('*').forEach((x) => x.shadowRoot && walk(x.shadowRoot)); })(s);
  return n;
};
const PAGES = () => {
  const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
  const out = [];
  (function walk(r) { r.querySelectorAll('[data-casora-page]').forEach((e) => out.push(e.getAttribute('data-casora-page'))); r.querySelectorAll('*').forEach((x) => x.shadowRoot && walk(x.shadowRoot)); })(s);
  return [...new Set(out)];
};
const OPEN_PAGE = (pg) => {
  const s = window.casoraPopup && window.casoraPopup.surface; let hit = null;
  (function walk(r) { if (hit) return; r.querySelectorAll('[data-casora-page]').forEach((e) => { if (!hit && e.getAttribute('data-casora-page') === pg) hit = e; }); r.querySelectorAll('*').forEach((x) => x.shadowRoot && walk(x.shadowRoot)); })(s);
  if (hit) hit.click();
  return !!hit;
};

const popupOpen = (page) => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
const settle = async (page) => {
  const sig = () => { const s = window.casoraPopup && window.casoraPopup.surface; const c = s && s.querySelector('.content'); return c ? c.scrollHeight + ':' + s.getBoundingClientRect().height : ''; };
  let last = '', since = Date.now();
  for (const t0 = Date.now(); Date.now() - t0 < 6000; await page.waitForTimeout(150)) {
    const k = await page.evaluate(sig).catch(() => ''); if (k !== last) { last = k; since = Date.now(); } else if (Date.now() - since > 800) break;
  }
};
const closeAll = async (page) => {
  for (let i = 0; i < 3 && await popupOpen(page); i++) {
    await page.evaluate(() => window.casoraPopup && window.casoraPopup.close());
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }
};

const result = {};
for (const vn of views) {
  const V = VIEWS[vn];
  const o = await H.open({ ...V, dark: false });
  await o.context.addInitScript((v) => { window.CASORA_QA_NO_WELLE_AUTO = true; try { if (v === 'a') localStorage.setItem('casora_popup_variant', 'a'); else localStorage.removeItem('casora_popup_variant'); } catch (e) { /* none */ } }, variant);
  const page = o.page;
  const dash = V.phone ? phoneDash : desk;
  const done = new Set();
  for (const v of viewPaths(dash)) {
    await H.ready(page, '/' + dash + '/' + v, "() => window.__pierce('button-card').length >= 3", 60000).catch(() => {});
    await page.waitForTimeout(2500);
    const tiles = await page.evaluate(() => window.__pierce('button-card').map((b, i) => {
      const t = [].concat((b._config || {}).template || []); const r = b.getBoundingClientRect();
      return { i, t, e: (b._config || {}).entity || '', w: r.width, h: r.height };
    }).filter((x) => x.w > 20 && x.h > 20 && x.t.some((y) => /^casora_/.test(y))));
    for (const tile of tiles) {
      const k0 = popupKey(tile.t);
      if (!k0 || SKIP.test(k0)) continue;
      const key = k0 + (tile.e ? ':' + tile.e.split('.')[0] : '');
      if (process.argv.includes('--liste')) { if (!done.has(key)) { done.add(key); console.log('  ' + vn + ' ' + key); } continue; }
      if (done.has(key) || (only && !only.test(key))) continue;
      const at = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, tile.i);
      if (!at) continue;
      await page.waitForTimeout(300);
      if (V.phone) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      let opened = false;
      for (let t0 = Date.now(); Date.now() - t0 < 6000; await page.waitForTimeout(200)) if (await popupOpen(page)) { opened = true; break; }
      if (!opened) continue;
      done.add(key);
      await settle(page);
      if (await page.evaluate(MORE_OPEN).catch(() => 0)) await page.waitForTimeout(1200);
      const items = new Set(await page.evaluate(COLLECT, '').catch(() => []) || []);
      for (const pg of await page.evaluate(PAGES).catch(() => [])) {
        if (!await page.evaluate(OPEN_PAGE, pg).catch(() => false)) continue;
        await page.waitForTimeout(1500); await settle(page);
        (await page.evaluate(COLLECT, 'page:' + pg.split('|')[0] + '/').catch(() => []) || []).forEach((x) => items.add(x));
        await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; const b = s && s.querySelector('.header-back'); if (b && !b.hidden) b.click(); }).catch(() => {});
        await page.waitForTimeout(1200);
        if (!await popupOpen(page)) break;
      }
      const fk = fileKey(key);
      (result[fk] = result[fk] || {})[vn] = [...items].sort();
      console.log(`  ok     ${vn} ${key}: ${items.size} Stellen`);
      await closeAll(page);
    }
  }
  await o.browser.close();
}
if (process.argv.includes('--liste')) process.exit(0);
for (const [fk, byView] of Object.entries(result)) {
  const f = path.join(DIR, fk + '.' + variant + '.json');
  fs.writeFileSync(f, JSON.stringify(byView, null, 1) + '\n');
  console.log('  → ' + path.relative(process.cwd(), f));
}
console.log(`${Object.keys(result).length ? 'PASS' : 'FAIL'} popup-inhalt – ${Object.keys(result).length} Popups (${variant})`);
process.exit(Object.keys(result).length ? 0 : 1);
