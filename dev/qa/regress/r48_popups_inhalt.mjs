// @zustand: arbeit
// @parallel: ui
// Sammelprüfung Popups (T-05, 06.10.2026): 17 von 25 Popup-Vorlagen hatten keinen gezielten Test.
// Je Kachel-Art (Vorlage) auf allen Raum-Ansichten des Desktop-Dashboards eine Kachel antippen,
// das Popup öffnen und den sichtbaren Text prüfen: kein „undefined“/„NaN“/„[object Object]“/„null“,
// keine rohen englischen Zustände (unavailable/unknown). Antippen öffnet bei Casora-Kacheln nur
// das Popup; Kacheln, die schalten würden, bleiben außen vor.
import { open, casoraDashboard, dashboard, check, need, finish, stable, BASE } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1600, height: 1000 });
// Kachel-Arten, deren Antippen schaltet statt ein Popup zu öffnen.
const SKIP = /^casora_(scene|script|button|toggle|switch_tap|favorite)/;
const views = (dash.config.views || []).map((v, i) => v.path || String(i));
const seen = new Map();
const BAD = /\bundefined\b|\bNaN\b|\[object Object\]|(^|[\s(·:])null([\s)·]|$)|\bunavailable\b|\bunknown\b/;

const POP = () => {
  const pop = window.__pierce('casora-popup, ha-dialog, ha-adaptive-dialog').find((p) => { const r = p.getBoundingClientRect(); return r.width > 50 && r.height > 50; });
  if (!pop) return null;
  const root = pop.shadowRoot || pop;
  const texts = [];
  const walk = (n) => { if (!n) return; if (n.nodeType === 3) { if (n.parentElement && n.parentElement.closest('style,script')) return; texts.push(n.textContent); return; }
    if (n.shadowRoot) walk(n.shadowRoot); for (const c of n.childNodes || []) walk(c); };
  walk(root);
  return texts.join(' ').replace(/\s+/g, ' ').trim();
};
const popupText = () => page.evaluate(POP);

for (const v of views) {
  await dashboard(page, dash.url + '/' + v, 3);
  const tiles = await page.evaluate(() => window.__pierce('button-card').map((b, i) => {
    const t = [].concat((b._config || {}).template || []).find((x) => /^casora_/.test(x)) || '';
    const r = b.getBoundingClientRect();
    return { i, t, w: r.width, h: r.height };
  }).filter((c) => c.t && c.w > 80 && c.h > 40));
  for (const tile of tiles) {
    if (seen.has(tile.t) || SKIP.test(tile.t) || /^casora_(room|shared|mobile|popup|badge|nav|chip)/.test(tile.t)) continue;
    // Kacheln in einer seitlich scrollenden Reihe erst in den Blick holen.
    const at = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; if (!b) return null;
      b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, tile.i);
    if (!at) continue;
    await page.waitForTimeout(400);
    await page.mouse.click(at.x, at.y);
    const txt = await stable(page, POP, null, { max: 4000, quiet: 600 });
    if (!txt) { seen.set(tile.t, { view: v, popup: false }); continue; }
    const m = txt.match(BAD);
    seen.set(tile.t, { view: v, popup: true, bad: m ? txt.slice(Math.max(0, m.index - 60), m.index + 60) : null });
    await page.keyboard.press('Escape');
    // Warten, bis das Popup zu ist.
    for (const t0 = Date.now(); Date.now() - t0 < 4000 && await popupText(); ) await page.waitForTimeout(200);
  }
}
const withPopup = [...seen].filter(([, s]) => s.popup);
console.log('  info   Kachel-Arten:', [...seen].map(([t, s]) => t.replace('casora_', '') + (s.popup ? '' : '(ohne Popup)')).join(', '));
await check('mindestens 8 Popups geöffnet', withPopup.length >= 8, withPopup.length);
for (const [t, s] of withPopup) await check(`${t} (${s.view}): Popup ohne undefined/NaN/rohe Zustände`, !s.bad, s.bad);
await finish();
