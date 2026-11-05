// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/02-devices.js#_casoraPrint, custom_components/casora/scripts/local/00-finder.js#casoraDevice, dev/casora_mock/halten.py
// Owner 04.11.2026 (v3 popup of a Bambu Lab printer, screenshot: dial, camera, „Steuerung“ and „Druck“ only): „ein
// bisschen nackig, vielleicht ein bisschen mehr Infos“. Expected for the test house's printer (keys as ha-bambulab,
// states set here, nothing by name):
//  - printing: „Temperaturen“ (nozzle and bed now with their target, below the target „Heizt auf“, fans in one row),
//    „Filament“ (AMS slots, the one in use says so, the AMS air as one row with a word), „Druck“ with the cover image,
//    plate, objects and „Geschwindigkeit“ as a picker (sub page with the profiles); no „Mehr“
//  - at rest: „Zuletzt gedruckt“, „Temperaturen“ only while cooling down, „Filament“, „Drucker“ with the hours printed,
//    the firmware hint when an update is out
//  - desktop 1440 and phone 393: nothing sticks out of the sheet.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish, atFinish } from './lib.mjs';

const d = await casoraDashboard();
await need('ein Casora-Dashboard', d);

// The printer by its keys: a device with print status, stage, AMS slots and a cover image (sorted, the first).
const findPrinter = (page) => page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, R = h.entities;
  const ids = Object.keys(R).filter((x) => R[x].translation_key === 'stage' && h.states[x]).sort();
  for (const id of ids) {
    const c = window._casoraPrint && window._casoraPrint.auto(h.states[id], h);
    if (c && c.status && c.slots && c.slots.length && c.cover && c.amsIdx && c.nozT && c.bedT) return Object.assign({ stage: id }, c);
  }
  return null;
});

const openPrinter = (page, id) => page.evaluate((id) => {
  const ha = document.querySelector('home-assistant');
  const old = ha.shadowRoot.getElementById('qa-r567');
  if (old) old.remove();
  return window.loadCardHelpers().then((hp) => {
    const el = hp.createCardElement({ type: 'custom:button-card', template: 'casora_3d_printer', entity: id });
    el.id = 'qa-r567'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:20px;top:300px;width:200px;height:140px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
  });
}, id);
const tap = (page) => page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r567')
  ._handleAction({ detail: { action: 'tap' } }, { isIcon: false }));
const closePopup = async (page) => { await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* closed */ } }); await page.waitForTimeout(800); };

const info = (page) => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!pop) return null;
  const root = pop.shadowRoot || pop;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  const leaves = window.__pierce('*', root).filter((e) => e.children.length === 0 && vis(e));
  const surf = (window.casoraPopup.surface && window.casoraPopup.surface.getBoundingClientRect()) || pop.getBoundingClientRect();
  const rowsEl = window.__pierce('.hui-row', root).filter(vis);
  const out = rowsEl.map((r) => r.getBoundingClientRect()).filter((r) => r.right > Math.min(surf.right, innerWidth) + 1 || r.left < Math.max(surf.left, 0) - 1).length;
  const cut = leaves.filter((e) => { const cs = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(cs.overflowX)
    && cs.textOverflow !== 'ellipsis' && !(cs.webkitLineClamp > 0)
    // Text only for screen readers (the power chart's live reading, issue 130: clip rect, 1 px) is meant to be hidden.
    && !(cs.position === 'absolute' && /rect\(0/.test(cs.clip)); }).map(txt);
  const job = rowsEl.find((r) => /^(Aufgabe|Letzte Aufgabe)/.test(txt(r)));
  const speed = rowsEl.find((r) => /^Geschwindigkeit/.test(txt(r)));
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  return {
    rows: rowsEl.map(txt), texts: leaves.map(txt).filter(Boolean),
    jobImg: !!(job && job.querySelector('img')), speed: box(speed),
    more: window.__pierce('.hui-more', root).filter(vis).length,
    out, cut, docOver: document.documentElement.scrollWidth - innerWidth,
  };
});
const has = (pi, re) => !!pi && pi.rows.some((r) => re.test(r));
const head = (pi, w) => !!pi && pi.texts.some((t) => t.toUpperCase() === w.toUpperCase());
const fits = (pi) => !!pi && pi.out === 0 && !pi.cut.length && pi.docOver <= 0;

for (const [mode, w, h] of [['desk', 1440, 1000], ['phone', 393, 852]]) {
  const { page } = await open({ width: w, height: h, scale: 1, theme: 'Casora', dark: mode === 'phone', mobile: mode === 'phone' });
  usePage(page);
  await dashboard(page, d.url, 3);
  const c = await findPrinter(page);
  await need(mode + ': Drucker mit AMS, Zieltemperaturen und Titelbild im Testhaus', c, c);
  const reset = () => page.evaluate(() => { const ha = document.querySelector('home-assistant'); if (ha.__qaOrigUpdateHass) ha._updateHass = ha.__qaOrigUpdateHass; ha.__qaSticky = {}; });
  atFinish(reset);
  const now = Date.now();
  const slotA = (n, o) => ({ attributes: Object.assign({ slot: n, active: false, empty: false, remain: -1, remain_enabled: true }, o) });
  const common = {
    [c.slots[0]]: Object.assign({ state: 'Testfilament PLA' }, slotA(1, { active: true, name: 'Testfilament PLA', type: 'PLA', color: '#2A9D8FFF', remain: 62 })),
    ...(c.slots[1] ? { [c.slots[1]]: Object.assign({ state: 'Testfilament PETG' }, slotA(2, { name: 'Testfilament PETG', type: 'PETG', color: '#E9C46AFF', remain: 12 })) } : {}),
    [c.amsIdx]: { state: '2' }, ...(c.amsHum ? { [c.amsHum]: { state: '31' } } : {}),
    ...(c.ext ? { [c.ext]: { state: 'Leer', attributes: { empty: true, active: false } } } : {}),
    ...(c.task ? { [c.task]: { state: 'Testwürfel' } } : {}),
    ...(c.plate ? { [c.plate]: { state: 'textured_plate' } } : {}),
    ...(c.usage ? { [c.usage]: { state: '512.3' } } : {}),
    ...(c.online ? { [c.online]: { state: 'on' } } : {}),
    ...(c.hms ? { [c.hms]: { state: 'off', attributes: { Count: 0 } } } : {}),
    ...(c.err ? { [c.err]: { state: 'off' } } : {}),
  };
  const fanOn = {};
  (c.fans3 || []).forEach((f, i) => { if (f[0]) fanOn[f[0]] = { state: 'on', attributes: { percentage: [80, 40, 30][i] } }; });
  const printing = {
    ...common, ...fanOn,
    [c.status]: { state: 'running' }, [c.stage]: { state: 'printing' },
    ...(c.progress ? { [c.progress]: { state: '42' } } : {}), ...(c.remaining ? { [c.remaining]: { state: '1.25' } } : {}),
    ...(c.layer ? { [c.layer]: { state: '84' } } : {}), ...(c.layers ? { [c.layers]: { state: '285' } } : {}),
    [c.noz]: { state: '150' }, [c.nozT]: { state: '220' }, [c.bed]: { state: '60' }, [c.bedT]: { state: '60' },
    ...(c.start ? { [c.start]: { state: new Date(now - 45 * 60e3).toISOString() } } : {}),
    ...(c.objects ? { [c.objects]: { state: '4' } } : {}), ...(c.skipped ? { [c.skipped]: { state: '1' } } : {}),
    ...(c.speedSel ? { [c.speedSel]: { state: 'standard', attributes: { options: ['silent', 'standard', 'sport', 'ludicrous'] } } } : {}),
    ...(c.weight ? { [c.weight]: { state: '76.6' } } : {}), ...(c.length ? { [c.length]: { state: '25.6' } } : {}),
  };
  const idle = {
    ...common,
    [c.status]: { state: 'finish' }, [c.stage]: { state: 'idle' },
    ...(c.end ? { [c.end]: { state: new Date(now - 20 * 60e3).toISOString() } } : {}),
    [c.noz]: { state: '84' }, [c.nozT]: { state: '0' }, [c.bed]: { state: '28' }, [c.bedT]: { state: '0' },
    ...(c.chamber ? { [c.chamber]: { state: '26' } } : {}),
    ...(c.speedSel ? { [c.speedSel]: { state: 'unavailable' } } : {}),
    ...(c.fw ? { [c.fw]: { state: 'on', attributes: { installed_version: '1.2.3', latest_version: '1.2.4' } } } : {}),
  };

  // ── Printing ──
  await fakeStates(page, printing, { sticky: true });
  await openPrinter(page, c.stage);
  await page.waitForTimeout(1500);
  await tap(page);
  await page.waitForTimeout(4000);
  let pi = await info(page);
  await need(mode + ' druckt: Popup offen', pi);
  await check(mode + ' druckt: „Temperaturen“ mit Düse (heizt auf, Ziel) und Druckbett', head(pi, 'Temperaturen')
    && has(pi, /^Düse.*Heizt auf · Ziel 220/) && has(pi, /^Druckbett.*Ziel 60/), pi.rows);
  if ((c.fans3 || []).length) await check(mode + ' druckt: Lüfter in einer Zeile', has(pi, /^Lüfter.*Bauteil 80 %/), pi.rows);
  await check(mode + ' druckt: „Filament“ mit Slot in Gebrauch und Luft im AMS', head(pi, 'Filament')
    && has(pi, /^Testfilament PLA.*Slot 1.*Wird genutzt.*62 %/) && has(pi, /^Luft im AMS.*Trocken/), pi.rows);
  await check(mode + ' druckt: „Druck“ mit Titelbild, Platte, Objekten', head(pi, 'Druck') && pi.jobImg
    && has(pi, /^Druckplatte.*Texturiert/) && (!c.objects || has(pi, /^Objekte.*1 übersprungen/)), pi.rows);
  if (c.speedSel) await check(mode + ' druckt: „Geschwindigkeit“ als Auswahlzeile', has(pi, /^Geschwindigkeit.*Standard/) && !!pi.speed, pi.rows);
  await check(mode + ' druckt: kein „Mehr“', pi.more === 0, pi.more);
  await check(mode + ' druckt: nichts ragt aus dem Popup', fits(pi), { out: pi.out, cut: pi.cut, docOver: pi.docOver });
  if (mode === 'desk' && c.speedSel && pi.speed) {
    await page.mouse.click(pi.speed.x, pi.speed.y);
    await page.waitForTimeout(1500);
    const sub = await info(page);
    await check('„Geschwindigkeit“ öffnet die Profile', has(sub, /^Leise/) && has(sub, /^Sport/) && has(sub, /^Standard.*Aktiv/), sub && sub.rows);
  }
  await closePopup(page);

  // ── At rest ──
  await fakeStates(page, idle, { sticky: true });
  await tap(page);
  await page.waitForTimeout(4000);
  pi = await info(page);
  await need(mode + ' Ruhe: Popup offen', pi);
  await check(mode + ' Ruhe: „Zuletzt gedruckt“ mit Titelbild', head(pi, 'Zuletzt gedruckt') && has(pi, /^Letzte Aufgabe.*Testwürfel/) && pi.jobImg, pi.rows);
  await check(mode + ' Ruhe: Düse kühlt ab, kalte Teile und Lüfter nicht', has(pi, /^Düse.*Kühlt ab/) && !has(pi, /^Druckbett/) && !has(pi, /^Lüfter/), pi.rows);
  await check(mode + ' Ruhe: „Filament“', head(pi, 'Filament') && has(pi, /^Luft im AMS/), pi.rows);
  if (c.usage) await check(mode + ' Ruhe: „Drucker“ mit Druckzeit insgesamt', head(pi, 'Drucker') && has(pi, /^Druckzeit insgesamt.*512 Std\./), pi.rows);
  if (c.fw) await check(mode + ' Ruhe: Hinweis Firmware-Update', has(pi, /^Firmware-Update verfügbar/), pi.rows);
  await check(mode + ' Ruhe: nichts ragt aus dem Popup', fits(pi), { out: pi.out, cut: pi.cut, docOver: pi.docOver });
  await closePopup(page);
  await reset();
  await page.context().browser().close();
}
await finish();
