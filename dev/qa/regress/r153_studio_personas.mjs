// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-b-ux.js custom_components/casora/panel/casora-panel-b-mehr.js custom_components/casora/panel/casora-panel-b-plus.js
// Gemeldet (Personas 10.10.2026), Studio – gespeichert wird nichts:
//   per-03 Tablet 1024 mit angedockter HA-Seitenleiste: „Kachel hinzufügen“ („Was soll auf das Dashboard?“)
//          lag halb unter der Seitenleiste. Erwartet: Kasten ganz rechts der Seitenleiste (auch die Suche ⌘K).
//   per-09 Nach „Raum umbenennen“ zeigte die Vorschau den alten Namen. Erwartet: sofort der neue.
//   per-08 Ungespeicherte Änderung, dann HA-Seitenleiste → Änderung ohne Rückfrage weg. Erwartet: Rückfrage;
//          „Abbrechen“ bleibt im Studio mit Änderung, „Verwerfen“ geht zur gewählten Seite.
//   per-04 Studio-Meldung (.btoast) im Dunkeln: Kontrast Schrift/Grund ≥ 4,5.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// ── Tablet 1024: Dialoge neben der Seitenleiste, Umbenennen, Verlassen ──
{
  const { page, context } = await open({ width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA, dark: false });
  usePage(page);
  await context.addInitScript(() => localStorage.setItem('dockedSidebar', JSON.stringify('docked')));
  await studio(page, dash);
  const sbRight = await page.evaluate(() => { const s = window.__pierce('ha-sidebar')[0]; const r = s && s.getBoundingClientRect(); return r && r.width > 0 ? Math.round(r.right) : 0; });
  await need('HA-Seitenleiste bei 1024 angedockt', sbRight > 0, sbRight);
  for (const [name, fn] of [['Kachel hinzufügen', '_uxAdd'], ['Suche', '_mSearch']]) {
    const box = await page.evaluate(async (fn) => {
      const p = window.__panel();
      if (typeof p[fn] !== 'function') return { missing: fn };
      p[fn]();
      await new Promise((r) => setTimeout(r, 500));
      const b = p.shadowRoot.querySelector('.msearch .mbox');
      const r = b && b.getBoundingClientRect();
      const out = r ? { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) } : null;
      p.shadowRoot.querySelectorAll('.msearch').forEach((x) => x.remove());
      return out;
    }, fn);
    await check(`per-03 ${name}: Kasten rechts der Seitenleiste (links ${box && box.l} ≥ ${sbRight}) und im Bild`,
      box && !box.missing && box.l >= sbRight && box.r <= 1024, box);
  }

  // per-09: Umbenennen → Vorschau zeigt den neuen Namen.
  const NEU = 'Qa Werkstatt';
  const ren = await page.evaluate(async (neu) => {
    const p = window.__panel(), I = window.__casoraPanelInternals;
    const rooms = p._state.compact.rooms;
    const ri = rooms.findIndex((r) => !I.isHomeRoom(r));
    if (ri < 0) return null;
    p._room = ri; p._sel = null; p._renderTabs(); p._renderForm(); p._rebuildPreview();
    await new Promise((r) => setTimeout(r, 1500));
    const ask = p._ask;
    p._ask = () => Promise.resolve(neu);
    try { await p._roomMenuAction('rename', ri); } finally { p._ask = ask; }
    await new Promise((r) => setTimeout(r, 1500));
    const deep = (n) => { let t = ''; const walk = (e) => { if (e.nodeType === 3) t += e.nodeValue + ' '; if (e.shadowRoot) walk(e.shadowRoot); (e.childNodes || []).forEach(walk); }; walk(n); return t; };
    const mount = p.$('mapmount');
    return { ri, text: mount ? deep(mount).replace(/\s+/g, ' ') : null, dirty: p._isDirty() };
  }, NEU);
  await need('Raum zum Umbenennen', ren);
  await check('per-09 Vorschau zeigt sofort „' + NEU + '“', ren.text && ren.text.includes(NEU), ren.text && ren.text.slice(0, 300));
  await check('per-09 Umbenennen ist eine ungespeicherte Änderung', ren.dirty, ren);

  // per-08: HA-Seitenleiste mit offener Änderung.
  const link = async () => page.evaluate(() => {
    const sb = window.__pierce('ha-sidebar')[0];
    const all = [];
    const walk = (e) => { if (!e) return; if (e.getAttribute && e.getAttribute('href')) all.push(e); if (e.shadowRoot) walk(e.shadowRoot); [...(e.children || [])].forEach(walk); };
    walk(sb);
    const a = all.find((e) => { const h = e.getAttribute('href'); const r = e.getBoundingClientRect();
      return /^\/(config|history|logbook|energy|map)/.test(h) && r.width > 0 && r.height > 0; });
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { href: a.getAttribute('href'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const askOpen = () => page.evaluate(() => { const p = window.__panel && window.__panel(); const c = p && p.shadowRoot.querySelector('.askpane .askcard');
    return c ? { title: (c.querySelector('h3') || {}).textContent, btns: [...c.querySelectorAll('.askacts button')].map((b) => b.className + ':' + b.textContent.trim()) } : null; });
  const l1 = await link();
  await need('Seitenleisten-Eintrag (z. B. Einstellungen)', l1);
  await page.mouse.click(l1.x, l1.y);
  await page.waitForTimeout(1200);
  const a1 = await askOpen();
  await check('per-08 Rückfrage statt stillem Verlassen (' + (a1 && a1.title) + ')', !!a1 && /casora-studio/.test(page.url()), { url: page.url(), a1 });
  if (a1) {
    await page.evaluate(() => window.__panel().shadowRoot.querySelector('.askpane .askacts button.ghost').click());
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => ({ url: location.pathname, dirty: window.__panel()._isDirty() }));
    await check('per-08 „Abbrechen“: im Studio, Änderung noch da', /casora-studio/.test(st.url) && st.dirty, st);
    const l2 = await link();
    await page.mouse.click(l2.x, l2.y);
    await page.waitForTimeout(1200);
    const a2 = await askOpen();
    if (a2) await page.evaluate(() => window.__panel().shadowRoot.querySelector('.askpane .askacts button.danger').click());
    await page.waitForTimeout(1500);
    await check('per-08 „Verwerfen“: geht zur gewählten Seite (' + l2.href + ')', !!a2 && new URL(page.url()).pathname.startsWith(l2.href), { url: page.url(), a2 });
  }
  await page.close();
}

// ── Desktop dunkel: Studio-Meldung lesbar ──
{
  const { page } = await open({ width: 1440, height: 900, dark: true });
  usePage(page);
  await studio(page, dash);
  const m = await page.evaluate(async () => {
    const p = window.__panel();
    if (typeof p._bToast !== 'function') return { missing: true };
    p._bToast('Change applied', { kind: 'ok' });
    await new Promise((r) => setTimeout(r, 600));
    const t = p.shadowRoot.querySelector('.btoast');
    if (!t) return null;
    const cs = getComputedStyle(t);
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const ground = rgb(getComputedStyle(p).backgroundColor);
    const bg = rgb(cs.backgroundColor), fg = rgb(cs.color);
    // Halbdurchsichtiger Grund über dem Studio-Grund (Näherung ohne Unschärfe).
    const a = bg.length > 3 ? bg[3] : 1;
    const mix = [0, 1, 2].map((i) => bg[i] * a + (ground[i] || 0) * (1 - a));
    const L = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const l1 = L(mix), l2 = L(fg.slice(0, 3));
    return { bg: cs.backgroundColor, fg: cs.color, ground, light: p.classList.contains('is-light'), ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10 };
  });
  await need('Studio dunkel, Meldung da', m && !m.missing && m.light === false, m);
  await check('per-04 Meldung im Dunkeln lesbar (Kontrast ' + m.ratio + ' ≥ 4,5)', m.ratio >= 4.5, m);
}

await finish();
