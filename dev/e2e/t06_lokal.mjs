// Lokaler Abgleich (ohne KI) mit typischen Sätzen.
import { open, ready } from './harness.mjs';
import { check, ende } from './ergebnis.mjs';
const { browser, page } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
await page.evaluate(async () => { const p = window.__panel(); p._setDash('test-neu'); await p._load(); });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const p = window.__panel(); const I = window.__casoraPanelInternals; const A = window.casoraAssist;
  const types = I.TILE_TYPES.filter((t) => !t.hidden);
  const items = A.suggest(p._hass, p._state.compact.rooms, types);
  /* Erwartung je Satz: passende Kachelart. Gibt es kein offenes Gerät dieser Art, muss „nichts“
     herauskommen (keine falschen Treffer), sonst nur Geräte dieser Art. */
  const WANT = [/dish|spuel|geschirr/i, /purif|luftrein|air/i, /vac|saug/i, /print|druck/i, /cover|jalou|blind|shutter/i, /^light$/, null];
  const checks = [];
  return { checks, zeilen: ['Ich habe die Spülmaschine in der Küche neu, bau sie ein', 'Bau den Luftreiniger im Schlafzimmer ein',
    'neuer Saugroboter in der Waschküche', 'den Drucker ins Büro', 'Jalousie Wohnzimmer links', 'Licht auf der Terrasse', 'irgendwas Unbekanntes']
    .map((t, i) => { const m = A.localMatch(t, items, p._state.compact.rooms, types);
      const re = WANT[i], types0 = m ? m.ids.map((id) => (items.find((x) => x.id === id) || {}).type) : [];
      const da = re && items.some((x) => re.test(String(x.type)));
      checks.push([t, da ? !!m && types0.every((ty) => re.test(String(ty))) : !m, { offen: !!da, treffer: types0 }]);
      return t + '  →  ' + (m ? m.ids.map((id) => { const it = items.find((x) => x.id === id); return it.name + ' [' + it.type + ']'; }).join(', ') + ' | Raum: ' + (m.room || '-') : 'nichts'); }) };
});
out.zeilen.forEach((l) => console.log(l));
out.checks.forEach(([t, ok, info]) => check(t, ok, info));
await browser.close();
ende();
