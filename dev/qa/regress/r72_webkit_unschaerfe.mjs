// @zustand: arbeit
// HA 2026.10 hat bei ha-card, ha-dialog und dem Bottom-Sheet -webkit-backdrop-filter gestrichen; Safari
// bis iOS 17 kennt nur diese Schreibweise. Erwartet in WebKit (Theme „Casora“): jede ha-card trägt Casoras
// Zusatzstil mit -webkit-backdrop-filter: var(--ha-card-backdrop-filter), und Kacheln haben dort Unschärfe.
import { open, casoraDashboards, dashboard, check, finish } from './lib.mjs';
const dash = (await casoraDashboards()).find((d) => !d.mobile);
const { page } = await open({ safari: true, theme: 'Casora', dark: false });
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const all = []; (function w(root){ root.querySelectorAll('*').forEach((e)=>{ if (e.localName==='ha-card') all.push(e); if (e.shadowRoot) w(e.shadowRoot); }); })(document);
  const sh = (window.__casoraWebkitSheets || {})['ha-card'];
  return { webkit: /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent), cards: all.length, rule: sh && sh.cssRules[0] && sh.cssRules[0].cssText,
    withSheet: all.filter((c) => c.shadowRoot && sh && c.shadowRoot.adoptedStyleSheets.includes(sh)).length,
    blurred: all.filter((c) => /blur/.test(getComputedStyle(c).getPropertyValue('-webkit-backdrop-filter'))).length,
    tags: Object.keys(window.__casoraWebkitSheets || {}) };
});

await check('WebKit: Zusatzstil an allen ha-card', r.webkit && r.cards > 0 && r.withSheet === r.cards, r);
await check('WebKit: Regel mit -webkit-backdrop-filter', /-webkit-backdrop-filter: var\(--ha-card-backdrop-filter/.test(r.rule || ''), r.rule);
await check('WebKit: Kacheln mit Unschärfe', r.blurred > 0, r);
await check('Stil auch für Dialog und Bottom-Sheet', ['ha-card', 'ha-dialog', 'ha-bottom-sheet'].every((t) => r.tags.includes(t)), r.tags);
await finish();
