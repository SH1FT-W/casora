// @zustand: arbeit
// @parallel: ui
// Owner (03.11.2026): the Pulse status page's history looked cheap – a step chart whose bar height grew with the
// severity, hard blocks, a single-state day one flat block. Handbook §7.6 state ribbon; owner 04.11.2026 option B:
// one continuous 14 px bar rounded only at its ends, the states one gradient in time order with soft borders, short
// states at least 1.2 % wide, no glow, read out by an aria-label from the legend durations; the legend only from
// two states up. Made-up Pulse entity and history, only in the browser; desktop and phone.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const id = 'sensor.qa_pulse_status', H = 3600e3;
const CASES = {
  viele: { state: 'check', rows: [['ok', -24 * H], ['watch', -20 * H], ['check', -15 * H], ['failed', -7 * H], ['watch', -2 * H], ['check', -0.3 * H]] },
  zwei: { state: 'ok', rows: [['watch', -24 * H], ['ok', -5 * H]] },
  eins: { state: 'failed', rows: [['failed', -24 * H]] },
  // A one-minute state in a day (0.07 % of the bar) must stay visible.
  kurz: { state: 'ok', rows: [['ok', -24 * H], ['failed', -10 * H], ['ok', -10 * H + 60e3]] },
};
// Widths (%) of the parts from the gradient stops: each part has a start stop (0% or calc(a% + …)) and an end stop.
const widths = (g) => {
  const pos = [...g.matchAll(/ (0%|100%|calc\(([\d.]+)% [+-] min)/g)].map((m) => m[2] != null ? parseFloat(m[2]) : parseFloat(m[1]));
  const out = [];
  for (let i = 0; i + 1 < pos.length; i += 2) out.push(pos[i + 1] - pos[i]);
  return out;
};
for (const [label, size] of [['Desktop', { width: 1440, height: 1000 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  for (const [name, c] of Object.entries(CASES)) {
    await fakeStates(page, { [id]: { state: c.state, attributes: { friendly_name: 'Pulse-Status', device_class: 'enum' } } }, { sticky: true });
    const r = await page.evaluate(async ({ id, c }) => {
      const ha = document.querySelector('home-assistant');
      const ents = { ...ha.hass.entities }; ents[id] = { ...(ents[id] || {}), entity_id: id, platform: 'pulse' };
      ha._updateHass({ entities: ents });
      const Z = window._casoraZiele;
      if (!Z || !window._casoraPulse) return { err: 'no Pulse module' };
      if (!Z.__qaOrig) Z.__qaOrig = Z.history;
      Z.history = function (h, eid) { return eid === id ? c.rows.map(([s, t]) => ({ s, t: Date.now() + t })) : Z.__qaOrig.apply(this, arguments); };
      if (!Z.openMeasure(id, '24h', null)) return { err: 'open failed' };
      await new Promise((res) => setTimeout(res, 2500));
      const band = window.__pierce('.cz-band', window.casoraPopup.surface)[0];
      if (!band) return { err: 'no band' };
      const cs = getComputedStyle(band), bb = band.getBoundingClientRect(), raw = band.getAttribute('style') || '';
      // The legend dots carry the same colour strings as the gradient stops: word -> colour.
      const leg = window.__pierce('.cz-leg', window.casoraPopup.surface);
      const dots = leg[0] ? [...leg[0].querySelectorAll('.cz-dot')].map((d) => ({ word: d.parentElement.textContent.trim(), c: ((d.getAttribute('style') || '').match(/background:([^;]*);/) || [])[1] || '' })) : [];
      const ok = raw.match(/--cz-rib:\s*(.*?);?\s*$/);
      return { ribbon: band.classList.contains('st'), h: Math.round(bb.height), w: bb.width, r: parseFloat(cs.borderTopLeftRadius),
        rr: parseFloat(cs.borderBottomRightRadius), overflow: cs.overflow, shadow: cs.boxShadow, kids: band.children.length,
        img: cs.backgroundImage, oklab: CSS.supports('background', 'linear-gradient(in oklab to right, red, blue)'), grad: ok ? ok[1] : '', role: band.getAttribute('role'), aria: band.getAttribute('aria-label') || '',
        legend: leg.length, legText: leg[0] ? [...leg[0].children].map((s) => s.textContent.trim()) : [], dots };
    }, { id, c });
    await need(`${label} ${name}: Pulse-Seite mit Band`, r && !r.err, r);
    await check(`${label} ${name}: ein durchgehender Balken (ein Element, keine Abschnitte, kein Leuchten)`,
      r.ribbon && r.kids === 0 && r.shadow === 'none' && /linear-gradient/.test(r.img), { kids: r.kids, shadow: r.shadow, img: r.img.slice(0, 80) });
    await check(`${label} ${name}: 14 px hoch, nur an den Enden gerundet, overflow hidden`,
      r.h === 14 && r.r === 7 && r.rr === 7 && r.overflow === 'hidden', { h: r.h, r: r.r, rr: r.rr, overflow: r.overflow });
    await check(`${label} ${name}: Verlauf mit weichen Übergängen (in oklab)`, !!r.grad && (c.rows.length < 2 || /min\(4px, /.test(r.grad)) && r.oklab, { grad: r.grad.slice(0, 160), oklab: r.oklab });
    const ws = widths(r.grad);
    // Expected colour order: the states in time order (neighbours with the same state merged).
    const seq = c.rows.map((x) => x[0]).filter((s, i, a) => s !== a[i - 1]);
    await check(`${label} ${name}: ein Teil je Abschnitt, zusammen 100 %`, ws.length === seq.length && Math.abs(ws.reduce((a, b) => a + b, 0) - 100) < 0.05, ws);
    await check(`${label} ${name}: kurze Abschnitte mindestens 1,2 % breit`, ws.every((x) => x >= 1.19), ws);
    await check(`${label} ${name}: Rolle img, aria-label nennt den Verlauf`, r.role === 'img' && /^Verlauf/.test(r.aria) && r.legText.every((t) => r.aria.includes(t.replace(/\s+/g, ' '))), { aria: r.aria, leg: r.legText });
    if (name === 'eins') {
      await check(`${label}: ein Zustand = eine Farbe über die ganze Breite, keine Legende`, ws.length === 1 && ws[0] === 100 && !r.legend, { ws, legend: r.legend });
    } else {
      await check(`${label} ${name}: Legende ab zwei Zuständen`, r.legend === 1, r.legend);
      // Map each gradient part to the legend word with the same colour, compare with the states' order.
      const WORD = { ok: 'Gut', watch: 'Beobachten', check: 'Prüfen', failed: 'Ausgefallen' };
      const parts = r.grad.split(/, (?=color-mix\()/).filter((_, i) => i % 2 === 0)
        .map((p) => (r.dots.find((d) => p.startsWith(d.c)) || {}).word || '?');
      await check(`${label} ${name}: Farben in der richtigen Reihenfolge`, parts.length === seq.length && parts.every((w, i) => w.startsWith(WORD[seq[i]])), { parts, seq });
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  }
  await page.context().close();
}
await finish();
