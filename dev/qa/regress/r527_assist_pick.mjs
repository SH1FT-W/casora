// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-assist.js
// Owner 03.11.2026: the device assistant built every suggestion at once ("79 Kacheln einbauen"). Now each device has a
// tick, rooms are folding groups "Room · x of y" with All/None, kind chips and a search narrow the view, and the button
// counts and builds only ticked devices. Desktop 1440 and phone 393; nothing saved (_save stubbed).
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = process.env.CASORA_QA_DASH || await studioDashboard();
await need('ein Dashboard für das Studio', dash);

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false });
  usePage(page);
  await studio(page, dash);
  const n0 = await page.evaluate(() => { const p = window.__panel(); const I = window.__casoraPanelInternals;
    return window.casoraAssist.suggest(p._hass, p._state.compact.rooms, I.TILE_TYPES.filter((t) => !t.hidden && (!t.onlyIf || t.onlyIf(p._hass)))).length; });
  await need(label + ': mindestens 3 Vorschläge', n0 >= 3, n0);
  await page.evaluate(() => window.__panel()._casoraAssist());
  await page.waitForTimeout(1200);
  const read = () => page.evaluate(() => {
    const rows = window.__pierce('.frow.casora-arow').filter((r) => r.getBoundingClientRect().width > 0);
    const checks = rows.map((r) => r.querySelector('.casora-acheck'));
    const btn = window.__pierce('button').find((b) => b.offsetParent && /Kachel|tile/i.test(b.textContent) && /\d/.test(b.textContent));
    return { rows: rows.length, on: checks.filter((c) => c && c.getAttribute('aria-checked') === 'true').length,
      btn: btn ? btn.textContent.trim() : null, disabled: btn ? btn.disabled : null,
      heads: window.__pierce('.casora-ahead').map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
      chips: window.__pierce('.casora-chip').map((c) => c.textContent.trim()) };
  });
  const btnN = (t) => Number((String(t || '').match(/\d+/) || [])[0]);
  // On opening: only rooms with a ticked device are expanded; a device without a room cannot be ticked.
  const open0 = await page.evaluate(() => window.__pierce('.casora-ahead').map((h) => {
    const f = h.querySelector('.casora-afold'); const m = h.textContent.match(/(\d+)\s*(von|of)\s*(\d+)/);
    return { exp: f && f.getAttribute('aria-expanded') === 'true', on: m ? Number(m[1]) : -1 };
  }));
  await check(label + ': nur Räume mit angehakten Geräten sind aufgeklappt', open0.length > 0 && open0.every((g) => g.exp === (g.on > 0)), open0);
  const noRoom = await page.evaluate(async () => {
    const h = window.__pierce('.casora-ahead').find((x) => !x.querySelector('.casora-aall'));
    if (!h) return null;
    const f = h.querySelector('.casora-afold'); if (f.getAttribute('aria-expanded') === 'false') f.click();
    await new Promise((r) => setTimeout(r, 300));
    const h2 = window.__pierce('.casora-ahead').find((x) => !x.querySelector('.casora-aall'));
    let el = h2.nextElementSibling; const c = el && el.querySelector('.casora-acheck');
    if (!c) return null; c.click();
    await new Promise((r) => setTimeout(r, 300));
    const h3 = window.__pierce('.casora-ahead').find((x) => !x.querySelector('.casora-aall'));
    const c2 = h3.nextElementSibling.querySelector('.casora-acheck');
    return c2.getAttribute('aria-checked');
  });
  if (noRoom !== null) await check(label + ': Gerät ohne Raum bleibt abgehakt, bis ein Raum gewählt ist', noRoom === 'false', noRoom);
  else console.log('  info   ' + label + ': keine Geräte ohne Raum – übersprungen');
  // Open every group for the checks below.
  await page.evaluate(() => window.__pierce('.casora-afold').forEach((f) => { if (f.getAttribute('aria-expanded') === 'false') f.click(); }));
  await page.evaluate(async () => { for (let i = 0; i < 20; i++) { const f = window.__pierce('.casora-afold').find((x) => x.getAttribute('aria-expanded') === 'false'); if (!f) break; f.click(); await new Promise((r) => setTimeout(r, 120)); } });
  await page.waitForTimeout(300);
  const s0 = await read();
  await check(label + ': jede Zeile hat ein Häkchen', s0.rows >= 3 && s0.rows === (await page.evaluate(() => window.__pierce('.frow.casora-arow .casora-acheck').length)), s0);
  await check(label + ': Raumgruppen zeigen „x von y“', s0.heads.length > 0 && s0.heads.every((h) => /\d+ (von|of) \d+/.test(h)), s0.heads);
  await check(label + ': Knopf zählt die angehakten', btnN(s0.btn) === s0.on, s0);
  // Untick the first ticked device.
  await page.evaluate(() => { const c = window.__pierce('.frow.casora-arow .casora-acheck').find((x) => x.getAttribute('aria-checked') === 'true'); c.click(); });
  await page.waitForTimeout(300);
  const s1 = await read();
  await check(label + ': Abhaken zählt einen weniger', s1.on === s0.on - 1 && btnN(s1.btn) === s0.on - 1, { s0: s0.on, s1 });
  // "Keine" in the first room group, then "Alle" again.
  const g = await page.evaluate(() => { const b = window.__pierce('.casora-aall')[0]; if (!b) return null; const t0 = b.textContent; b.click(); return t0; });
  await page.waitForTimeout(300);
  const s2 = await read();
  await check(label + ': Alle/Keine in einer Raumgruppe ändert die Zahl', g !== null && s2.on !== s1.on, { g, s1: s1.on, s2: s2.on });
  // Kind chip: only that kind is shown, the count of the build button is not narrowed by the filter.
  const chip = await page.evaluate(() => { const c = window.__pierce('.casora-chip')[1]; if (!c) return null; const t = c.textContent; c.click(); return t; });
  await page.waitForTimeout(400);
  const s3 = await read();
  const want = Number((String(chip || '').match(/(\d+)\s*$/) || [])[1]);
  await check(label + ': Art-Filter zeigt nur diese Art', chip && s3.rows === want, { chip, rows: s3.rows });
  await check(label + ': Filter ändert nicht, was eingebaut wird', btnN(s3.btn) === btnN(s2.btn), { s2: s2.btn, s3: s3.btn });
  await page.evaluate(() => window.__pierce('.casora-chip')[0].click());
  // Search narrows to matching names.
  await page.evaluate(() => { const i = window.__pierce('.flowin input.fin').find((x) => /Name|entit/i.test(x.placeholder || '')); i.value = 'zzqqxx'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const s4 = await read();
  await check(label + ': Suche ohne Treffer zeigt keine Zeile', s4.rows === 0, s4);
  await page.evaluate(() => { const i = window.__pierce('.flowin input.fin').find((x) => /Name|entit/i.test(x.placeholder || '')); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  // Build: exactly the ticked ones are added (save stubbed, nothing stored).
  const r = await page.evaluate(async () => {
    const p = window.__panel();
    p._save = async () => true;
    const before = p._state.compact.rooms.reduce((n, r) => n + r.tiles.length, 0);
    const btn = window.__pierce('button').find((b) => b.offsetParent && /Kachel|tile/i.test(b.textContent) && /\d/.test(b.textContent));
    const want = Number((btn.textContent.match(/\d+/) || [])[0]);
    btn.click();
    await new Promise((res) => setTimeout(res, 800));
    const after = p._state.compact.rooms.reduce((n, r) => n + r.tiles.length, 0);
    return { want, added: after - before };
  });
  await check(label + ': nur die angehakten Geräte werden eingebaut', r.want > 0 && r.added === r.want, r);
  await page.context().close();
}
await finish();
