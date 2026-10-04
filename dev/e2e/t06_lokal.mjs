// Lokaler Abgleich (ohne KI) mit typischen Sätzen.
import { open, ready } from './harness.mjs';
const { browser, page } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
await page.evaluate(async () => { const p = window.__panel(); p._setDash('test-neu'); await p._load(); });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const p = window.__panel(); const I = window.__casoraPanelInternals; const A = window.casoraAssist;
  const types = I.TILE_TYPES.filter((t) => !t.hidden);
  const items = A.suggest(p._hass, p._state.compact.rooms, types);
  return ['Ich habe die Spülmaschine in der Küche neu, bau sie ein', 'Bau den Luftreiniger im Schlafzimmer ein',
    'neuer Saugroboter in der Waschküche', 'den Drucker ins Büro', 'Jalousie Wohnzimmer links', 'Licht auf der Terrasse', 'irgendwas Unbekanntes']
    .map((t) => { const m = A.localMatch(t, items, p._state.compact.rooms, types);
      return t + '  →  ' + (m ? m.ids.map((id) => { const it = items.find((x) => x.id === id); return it.name + ' [' + it.type + ']'; }).join(', ') + ' | Raum: ' + (m.room || '-') : 'nichts'); });
});
out.forEach((l) => console.log(l));
await browser.close();
