// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026): Am Handy hat jedes Bedienelement in den Popups eine Trefferfläche von
// mindestens 44 × 44 px (Apple-Empfehlung) – bei gleicher Optik: Schalter in Licht-Zeilen (sichtbar
// 44×26), Szenen-Chips (36 hoch), Lichtfarben-/Quellen-Pillen (37 hoch), Farbkreise (38), Kamera-
// Vollbild (32) bekommen einen unsichtbaren Rand (::before bzw. durchsichtiger Rahmen). Benachbarte
// Trefferflächen dürfen sich nicht überlappen. Gemessen im Casora-Look, Handy 390×844 und 375×667.
import { open, usePage, dashboard, casoraDashboards, check, need, finish } from './lib.mjs';

const phone = (await casoraDashboards()).find((d) => d.mobile);
await need('Handy-Dashboard', phone);
const SEL = '.lps-sw, .lps-chip, .lps-sg, .lps-off, .cam-fs, .hl-c, .hl-b, .hui-sg, [data-casora-svc]';
const CASES = [['Licht (Raum)', 'casora_badge_light_group'], ['Licht', 'casora_light'], ['Kamera', 'casora_camera']];
for (const [W, H] of [[390, 844], [375, 667]]) {
  const { page } = await open({ width: W, height: H, mobile: true, safari: true, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
  const opts = await page.evaluate(() => document.querySelector('home-assistant').hass.states['input_select.casora_mobile_filter']?.attributes?.options || ['all']);
  let measured = 0;
  for (const [name, tpl] of CASES) {
    let open_ = false;
    for (const f of opts) {
      await page.evaluate((f) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: f } })), f);
      await page.waitForTimeout(1800);
      const at = await page.evaluate((tpl) => {
        const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 10 && (!b.checkVisibility || b.checkVisibility({ opacityProperty: true, visibilityProperty: true })); };
        const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(tpl) && vis(x));
        if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); return true; }, tpl);
      if (!at) continue;
      await page.waitForTimeout(700);
      const p = await page.evaluate((tpl) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(tpl)
        && x.getBoundingClientRect().width > 10 && (!x.checkVisibility || x.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
        const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, tpl);
      await page.touchscreen.tap(p.x, p.y);
      await page.waitForTimeout(2200);
      if (await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface))) { open_ = true; break; }
    }
    if (!open_) { console.log(`  info   ${W}: ${name} – kein Popup am Handy erreichbar`); continue; }
    await page.waitForTimeout(1200);
    const m = await page.evaluate((SEL) => {
      const s = window.casoraPopup.surface; const res = [];
      for (const e of window.__pierce(SEL, s)) {
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        let L = r.left, T = r.top, R = r.right, B = r.bottom;
        for (const pe of ['::before', '::after']) { const q = getComputedStyle(e, pe); if (q.content === 'none' || q.position !== 'absolute') continue;
          const v = (k) => Math.max(0, -(parseFloat(q[k]) || 0)); L = Math.min(L, r.left - v('left')); R = Math.max(R, r.right + v('right')); T = Math.min(T, r.top - v('top')); B = Math.max(B, r.bottom + v('bottom')); }
        res.push({ n: (typeof e.className === 'string' && e.className.split(' ')[0]) || e.tagName, t: (e.textContent || '').trim().slice(0, 16), b: [L, T, R, B], el: e });
      }
      // verschachtelte Elemente (Knopf in Knopf) zählen nicht als Überlappung
      const ov = [];
      for (let i = 0; i < res.length; i++) for (let j = i + 1; j < res.length; j++) {
        if (res[i].el.contains(res[j].el) || res[j].el.contains(res[i].el)) continue;
        const a = res[i].b, c = res[j].b; const w = Math.min(a[2], c[2]) - Math.max(a[0], c[0]), h = Math.min(a[3], c[3]) - Math.max(a[1], c[1]);
        if (w > 1 && h > 1) ov.push(`${res[i].n}/${res[i].t} × ${res[j].n}/${res[j].t}`);
      }
      return { n: res.length, small: res.filter((x) => x.b[2] - x.b[0] < 43.5 || x.b[3] - x.b[1] < 43.5).map((x) => `${x.n}/${x.t} ${Math.round(x.b[2] - x.b[0])}×${Math.round(x.b[3] - x.b[1])}`), ov };
    }, SEL);
    measured++;
    await check(`${W}: ${name} – alle ${m.n} Bedienelemente mit Trefferfläche ≥ 44 px`, m.small.length === 0, m.small);
    await check(`${W}: ${name} – Trefferflächen überlappen nicht`, m.ov.length === 0, m.ov);
    await page.evaluate(() => window.casoraPopup.close());
    await page.waitForTimeout(1200);
  }
  await check(`${W}: mindestens zwei Popups gemessen`, measured >= 2, measured);
}
await finish();
