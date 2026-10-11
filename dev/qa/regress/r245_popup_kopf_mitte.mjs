// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/12-tanken.js
// Kopfmitte (Casora 1.3, Rückmeldung 11.10.2026): In Kopfzeile A (Theme „Casora“) steht die Symbol-Kachel
// senkrecht mittig zum ganzen Textblock links daneben (Raum-Etikett, Titel, Statuszeile) – egal, welche
// Teile da sind. Vorher hing die Kachel an drei festen Rasterzeilen: ohne Etikett (Sammel-Popups wie
// Batterien, Raum im Titel) blieb die erste Zeile trotzdem ~16 px hoch, die Kachel stand ~8 px zu hoch.
// Geprüft (Desktop 1440 Chromium, Handy 393 WebKit, hell):
//  - echte Popups: Licht im Raum (Etikett + Titel + Status), Batterien (Titel + Status, ohne Raum);
//  - im selben Popup alle Kombinationen Etikett ja/nein × Titel ein-/zweizeilig × Statuszeile ja/nein;
//  - X (und Hauptschalter, falls da) stehen auf derselben Mitte wie die Kachel.
// Mittig = Mitte Kachel − Mitte Textbox (oberste Box oben … unterste unten) ≤ 1 px.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

process.env.CASORA_THEME = 'Casora';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

const VIEWS = [
  { name: 'Desktop', url: dash.url, view: (dash.config.views[0] || {}).path || '0', o: { width: 1440, height: 900 } },
  { name: 'Handy', url: (dash.phone || dash).url, view: ((dash.phone || dash).config.views[0] || {}).path || '0', o: { width: 393, height: 852, mobile: true, safari: true, scale: 3 } },
];
const LONG = 'Wohnzimmer/​Küche Fußbodenheizung';

const openPop = (page, id, cfg) => page.evaluate(([id, cfg]) => new Promise((res) => {
  if (window.casoraPopup) window.casoraPopup.close();
  setTimeout(() => window._casoraNotifyOpenViaCard(id, res, cfg), 400);
}), [id, cfg]).catch(() => false);
const settle = async (page) => {
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; const r = s && s.getBoundingClientRect(); return r && r.height > 100; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2200);
};

// Misst den Kopf; mit `v` werden Etikett/Titel/Statuszeile vorher gesetzt (alles in einem Schritt,
// danach zurück – der Statuszeilen-Spiegel kommt so nicht dazwischen).
const MESS = (v) => {
  const el = window.casoraPopup && window.casoraPopup.element; if (!el) return null;
  const sr = el.shadowRoot;
  const eb = sr.querySelector('.header-eyebrow'), ti = sr.querySelector('.header-title'), st = sr.querySelector('.header-status');
  const keep = [eb.textContent, ti.textContent, st.innerHTML, st.hidden];
  if (v) {
    eb.textContent = v.e ? 'WOHNZIMMER' : '';
    ti.textContent = v.t;
    if (v.s) { st.innerHTML = '<b>An</b> · 3 von 5 Lampen'; st.hidden = false; } else st.hidden = true;
  }
  const vis = (n) => n && !n.hidden && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0 && n.textContent.trim();
  const R = (n) => n.getBoundingClientRect();
  const parts = [eb, ti, st].filter(vis).map(R);
  const ring = sr.querySelector('.header-ring');
  const out = { soft: el.hasAttribute('soft') };
  if (parts.length && ring && R(ring).height) {
    const top = Math.min(...parts.map((r) => r.top)), bot = Math.max(...parts.map((r) => r.bottom));
    const rr = R(ring), rc = rr.top + rr.height / 2;
    const lh = parseFloat(getComputedStyle(ti).lineHeight) || 30;
    const mid = (q) => { const n = sr.querySelector(q); if (!n || n.hidden || !R(n).height) return null; const r = R(n); return Math.round((r.top + r.height / 2 - rc) * 10) / 10; };
    Object.assign(out, { d: Math.round((rc - (top + bot) / 2) * 10) / 10, lines: Math.round(R(ti).height / lh), eyebrow: vis(eb) ? 1 : 0, status: vis(st) ? 1 : 0,
      x: mid('.header-close'), sw: mid('.header-switch') });
  }
  if (v) { eb.textContent = keep[0]; ti.textContent = keep[1]; st.innerHTML = keep[2]; st.hidden = keep[3]; }
  return out;
};

const COMBOS = [];
for (const e of [true, false]) for (const t of ['Licht', LONG]) for (const s of [true, false]) COMBOS.push({ e, t, s });

for (const V of VIEWS) {
  const { page } = await open({ ...V.o, dark: false, theme: 'Casora' });
  await dashboard(page, V.url + '/' + V.view, 3);
  const light = await page.evaluate(() => { const st = document.querySelector('home-assistant').hass.states;
    return Object.keys(st).find((i) => /^light\./.test(i) && window._casoraRoomOf && window._casoraRoomOf(i)); });
  const cases = [
    { name: 'Licht', id: light, cfg: null },
    { name: 'Batterien (ohne Raum)', id: null, cfg: { type: 'custom:button-card', template: ['casora_battery'], name: 'Batterien' } },
  ];
  for (const c of cases) {
    if (!c.id && !c.cfg) { console.log('  info   ' + V.name + ' ' + c.name + ': nicht im Haus'); continue; }
    const ok = await openPop(page, c.id, c.cfg);
    await settle(page);
    const m = await page.evaluate(MESS, null);
    await need(`${V.name} ${c.name}: Popup im Kopf A offen`, ok && m && m.soft && m.d != null, m);
    await check(`${V.name} ${c.name}: Kachel mittig zum Textblock (≤ 1 px)`, Math.abs(m.d) <= 1, m);
    await check(`${V.name} ${c.name}: X auf derselben Mitte (≤ 1 px)`, m.x != null && Math.abs(m.x) <= 1, m);
    if (m.sw != null) await check(`${V.name} ${c.name}: Hauptschalter auf derselben Mitte (≤ 1 px)`, Math.abs(m.sw) <= 1, m);
    if (c.cfg) {
      const bad = [];
      for (const v of COMBOS) {
        const r = await page.evaluate(MESS, v);
        if (!r || r.d == null || Math.abs(r.d) > 1 || (r.x != null && Math.abs(r.x) > 1)) bad.push({ ...v, t: v.t.length > 10 ? 'lang' : v.t, ...r });
        else if (v.t === LONG && V.name === 'Handy' && r.lines < 2) bad.push({ hinweis: 'langer Titel nicht zweizeilig', ...r });
      }
      await check(`${V.name}: alle ${COMBOS.length} Kombinationen Etikett/Titel 1–2 Zeilen/Status mittig (≤ 1 px)`, !bad.length, bad);
      // Alte Kopf-Regel einiger Vorlagen (Auto, E-Bike, Gerät …: nowrap !important): langer Titel bricht trotzdem um
      // bzw. endet mit „…“, statt hart abgeschnitten zu werden (Handy, 11.10.2026).
      if (V.name === 'Handy') {
        const t = await page.evaluate((long) => { const sr = window.casoraPopup.element.shadowRoot; const st = document.createElement('style');
          st.textContent = '.header-title { max-width: calc(100% + 56px) !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }';
          sr.appendChild(st); const ti = sr.querySelector('.header-title'), keep = ti.textContent; ti.textContent = 'Tiguan R-Line 2,0 l TDI SCR 4MOTION ' + long;
          const cs = getComputedStyle(ti), lines = Math.round(ti.getBoundingClientRect().height / (parseFloat(cs.lineHeight) || 30));
          const r = { ws: cs.whiteSpace, lines, clamp: cs.webkitLineClamp }; ti.textContent = keep; st.remove(); return r; }, LONG);
        await check('Handy: langer Titel trotz alter nowrap-Regel zweizeilig mit „…“', t.ws !== 'nowrap' && t.lines === 2 && String(t.clamp) === '2', t);
      }
    }
  }
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close());
}
await finish();
