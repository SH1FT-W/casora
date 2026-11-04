// @zustand: arbeit
// @parallel: ui
// Gewünscht (08.10.2026, 1.1.2, Richtung A „Leiste unter dem Kopf“): Die Geräte-Popups von Geschirrspüler,
// Waschmaschine und Trockner zeigen den Fortschritt im Casora-Look nicht mehr als 66-px-Verlaufsblock
// (Regler-Optik ohne Reglerfunktion), sondern als 6-px-Leiste über die volle Breite direkt unter der
// Kopfzeile, darunter „25 %“ links und „Fertig gegen … Uhr“ rechts. Energie- und Wasserbedarf sind eine
// Zeile mit zwei Mini-Balken; Phase/Programm stehen nur in der Kopfzeile; rechts beim Geschirrspüler die
// volle Pflege-Liste (am Handy nur Fälliges bzw. „Alles aufgefüllt“); „Programm abbrechen“ ist eine ruhige
// Sand-Pille am Spaltenende, rot erst beim Bestätigen. Bei laufender Wäsche stehen die letzten Durchgänge
// links, die Programme rechts.
// Erwartet (Casora hell, Desktop 1440 und Handy 393): Leiste 6 px hoch und so breit wie der Inhalt, kein
// Verlaufsblock, Prognose eine Zeile, Spalten am Desktop höchstens 1,5 Zeilen (95 px) auseinander (beim
// Geschirrspüler steht „Verlauf“ seit Muster v2 rechts unter der kurzen Pflege), Pille letztes Element links, Pflege rechts; am Handy
// einspaltig, Leiste volle Breite, kein Scrollen beim laufenden Geschirrspüler.
// Dazu Auto und 3D-Drucker: Auto zeigt den Tank als dieselbe Leiste („Tank 19 %“, rechts leer, ab 15 % im
// Warn-Ton) statt des Blocks; der Drucker zeigt die Restzeit groß im Kopf und „42 %“/„Fertig gegen“ an der
// Leiste, die Zeile „Fertig gegen“ unter „Druck“ entfällt.
// v3 (31.10.2026, popup-richtlinien-v3 §4 S4/§4.8): the 6-px bar under the head is replaced by the stage – the progress
// is the ring of the dial (level, not turnable), the remaining time large in its middle with the program, „25 %“ and
// „Fertig gegen … Uhr“ under it. Still checked: progress visible without a fake slider block, percent and finish time,
// no doubled phase/program rows, forecast as one row, care right (only what is due), lists right (§2: left only the
// stage), the calm two-step „Programm abbrechen“ pill, the phone in one column without scrolling far. Dropped with v3:
// bar geometry and the column balance (left holds only the stage).
// 01.11.2026 (owner): the car's tank/battery level stands in the dial only (ring + fact, orange at 15 % and below), the
// printer's percent only as the ring, its text „Fertig um HH:MM Uhr“ (r446).
import { open, casoraDashboards, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const has = (d, t) => JSON.stringify(d.config).includes('"' + t + '"');
const desk = all.find((d) => !d.mobile && has(d, 'casora_geschirrspueler') && has(d, 'casora_waschmaschine'));
const phone = desk && all.find((d) => d.mobile && d.url === desk.url + '-mobile');
await need('Dashboard mit Geschirrspüler und Waschmaschine (Desktop + Handy)', desk && phone, all.map((d) => d.url));

const TPL = { dish: 'casora_geschirrspueler', wash: 'casora_waschmaschine', dry: 'casora_trockner' };

// Entitäten der Kachel über die Module auflösen (keine festen IDs), dann „läuft“ nur im Browser unterschieben.
const runningPatch = (pg, tpl) => pg.evaluate((t) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t) && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  const h = document.querySelector('home-assistant').hass;
  const cfg = b._config || {};
  const ent = cfg.entity ? h.states[cfg.entity] : null;
  const V = cfg.variables || {};
  const p = {};
  if (t === 'casora_geschirrspueler') {
    const c = window._casoraDish.resolve(ent, V, h.states, h);
    p[c.st] = { state: 'run' };
    if (c.progress) p[c.progress] = { state: '25.0' };
    if (c.remaining) p[c.remaining] = { state: '1.2' };
    if (c.phase) p[c.phase] = { state: 'mainwash' };
    if (c.program) p[c.program] = { state: 'dishcare_dishwasher_program_eco50' };
    if (c.door) p[c.door] = { state: 'off' };
    if (c.stop) p[c.stop] = { state: 'unknown' };
    return { p, stop: !!c.stop, estimates: !!(c.energyEst || c.waterEst) };
  }
  const c = window._casoraLaundry.resolve(ent, V, h.states, h);
  p[c.st] = { state: 'running' };
  if (c.progress) p[c.progress] = { state: t === 'casora_trockner' ? '64.0' : '58' };
  if (c.remaining) p[c.remaining] = { state: t === 'casora_trockner' ? '23' : '41' };
  if (c.program) p[c.program] = { state: t === 'casora_trockner' ? 'Baumwolle Schranktrocken' : 'Baumwolle 40' };
  if (c.phase) p[c.phase] = { state: t === 'casora_trockner' ? 'drying' : 'Rinse' };
  if (c.running) p[c.running] = { state: 'on' };
  return { p, stop: !!(c.official && c.stop), washdata: c.source === 'washdata' || !!c.entry };
}, tpl);

const findTile = async (pg, tpl) => {
  await pg.evaluate((t) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t)); b && b.scrollIntoView({ block: 'center' }); }, tpl);
  await pg.waitForTimeout(400);
  return (await cards(pg, tpl))[0] || null;
};
const offen = (pg) => pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
const openPopup = async (pg, tpl, mobile) => {
  let t = await findTile(pg, tpl);
  for (let i = 0; i < 4 && t && !(await offen(pg)); i++) {
    if (mobile) await pg.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2); else await pg.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
    for (let w = 0; w < 24 && !(await offen(pg)); w++) await pg.waitForTimeout(250);
    t = (await findTile(pg, tpl)) || t;
  }
  await pg.waitForTimeout(2600);   // nachgeladene Platten (Durchgänge, Pflege)
  return offen(pg);
};
const closePopup = async (pg) => { await pg.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* zu */ } }); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); };

// Maße des offenen Popups: Kopf, Leiste, Spalten, Verlaufsblock, Prognose, Pille, Pflege-Liste.
const measure = (pg) => pg.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!pop) return null;
  const root = pop.shadowRoot || pop;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const sc = root.querySelector('.content') || root.querySelector('.surface');
  const out = { areas: {}, text: ((sc || root).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600) };
  if (sc) { out.scrollH = sc.scrollHeight; out.clientH = sc.clientHeight; }
  for (const b of window.__pierce('button-card', root)) {
    const g = b.shadowRoot && b.shadowRoot.querySelector('#container');
    if (!g || !/left/.test(getComputedStyle(g).gridTemplateAreas || '')) continue;
    for (const k of ['hero', 'pbar', 'left', 'right', 'more']) {
      const el = g.querySelector('#' + k) || [...g.children].find((c) => (getComputedStyle(c).gridArea || '').split(' ')[0] === k);
      if (el) out.areas[k] = box(el);
    }
    out.grid = { cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, w: Math.round(g.getBoundingClientRect().width) };
    const left = out.areas.left && (g.querySelector('#left') || [...g.children].find((c) => (getComputedStyle(c).gridArea || '').split(' ')[0] === 'left'));
    if (left) {
      const kids = window.__pierce('button-card', left)[0];
      const cont = kids && kids.shadowRoot && kids.shadowRoot.querySelector('#container');
      // Blueprint v2 (rule 8): „Einstellungen“ may follow as the column's last section – the pill ends the content before it.
      const fields = cont ? [...cont.children].filter(vis).filter((c) => (getComputedStyle(c).gridArea || '').split(' ')[0] !== 'set') : [];
      const last = fields[fields.length - 1];
      out.leftLast = last ? { area: (getComputedStyle(last).gridArea || '').split(' ')[0], hasPill: !!last.querySelector('.hh-abort'), text: (last.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) } : null;
    }
    break;
  }
  const track = window.__pierce('.hh-pbar-track', root).filter(vis)[0];
  if (track) out.track = box(track);
  const pb = window.__pierce('.hh-pbar', root).filter(vis)[0];
  if (pb) out.pbarText = (pb.textContent || '').replace(/\s+/g, ' ').trim();
  const fill = window.__pierce('.hh-pbar-fill', root).filter(vis)[0];
  if (fill) out.fill = getComputedStyle(fill).backgroundColor;
  const heroEl = window.__pierce('*', root).find((e) => e.children.length === 0 && /übrig$/.test((e.textContent || '').trim()) && vis(e));
  out.heroUnit = heroEl ? heroEl.textContent.trim() : null;
  // Verlaufsblock (HH.bar): einziges Element mit clip-path:inset(…) im Inline-Stil.
  out.blocks = window.__pierce('[style*="clip-path:inset("]', root).filter(vis).length;
  out.block66 = window.__pierce('[style*="height:66px"][style*="pointer-events:none"]', root).filter(vis).length;
  const rows = window.__pierce('.hui-row', root).filter(vis);
  const rowText = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  out.rows = rows.map(rowText);
  out.forecastRows = window.__pierce('.hh-forecast', root).filter(vis).length;
  out.forecastBars = window.__pierce('.hh-forecast .hh-fc', root).filter(vis).length;
  const pill = window.__pierce('.hh-abort', root).filter(vis)[0];
  if (pill) {
    const cs = getComputedStyle(pill);
    out.pill = { ...box(pill), bg: cs.backgroundColor, radius: cs.borderRadius, armed: pill.classList.contains('armed') };
    const cf = pill.querySelector('.hui-cf');
    if (cf) { const cr = cf.getBoundingClientRect(), pr = pill.getBoundingClientRect(); out.pill.cfInside = cr.right <= pr.right + 1 && cr.left >= pr.left - 1; out.pill.cfBg = getComputedStyle(cf).backgroundColor; }
  }
  // Abschnitts-Etiketten (Großbuchstaben) mit Lage – die Spalten sind eigene Schattenbäume, innerText reicht nicht hinein.
  out.labels = {};
  window.__pierce('*', root).filter((e) => e.children.length === 0 && vis(e)).forEach((e) => {
    const t = rowText(e).toUpperCase();
    if (/^(NACHFÜLLEN & PFLEGE|LETZTE DURCHGÄNGE|PROGRAMME|DURCHGANG|VERLAUF|DRUCK)$/.test(t) && !out.labels[t]) out.labels[t] = box(e);
  });
  out.careLabel = out.labels['NACHFÜLLEN & PFLEGE'] || null;
  // v3 stage (S4 dial): box, ring level (data-pct), text of its middle and under it.
  const st = window.__pierce('[data-casora-stage="S4"]', root).filter(vis)[0];
  if (st) {
    const dl = st.querySelector('.hui-dl[role="progressbar"]');
    out.stage = { ...box(st), dial: st.getAttribute('data-casora-dial'), pct: dl ? Number(dl.getAttribute('aria-valuenow')) : null,
      text: [...st.querySelectorAll('*')].filter((e) => e.children.length === 0 && vis(e)).map((e) => e.textContent.trim()).filter(Boolean).join(' | ') };
  }
  // Any v3 stage (the car is S7): code, ring colour (--dl-col of the dial) and the text in the dial.
  const sa = window.__pierce('[data-casora-stage]', root).filter(vis)[0];
  if (sa) {
    const dla = sa.querySelector('.hui-dl');
    out.anyStage = { code: sa.getAttribute('data-casora-stage'), dial: sa.getAttribute('data-casora-dial'),
      col: dla ? (dla.getAttribute('style') || '').replace(/^.*--dl-col:\s*([^;]+);?.*$/, '$1') : null,
      text: [...sa.querySelectorAll('*')].filter((e) => e.children.length === 0 && vis(e)).map((e) => e.textContent.trim()).filter(Boolean).join(' | ') };
  }
  return out;
});
// Sand = fast durchsichtig (Alpha < 0,5) oder wenig Farbe; Rot = kräftig und rot.
const sand = (rgb) => { const m = String(rgb).match(/(\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/); if (!m) return false; const a = m[4] == null ? 1 : +m[4]; const v = [+m[1], +m[2], +m[3]]; return a < 0.5 || Math.max(...v) - Math.min(...v) < 60; };
const red = (rgb) => { const m = String(rgb).match(/(\d+)\D+(\d+)\D+(\d+)/); return !!m && +m[1] > 150 && +m[1] - +m[2] > 60 && +m[1] - +m[3] > 60; };

// ── Desktop ────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 1440, height: 900, scale: 1, theme: 'Casora', dark: false });
  for (const dev of ['dish', 'wash', 'dry']) {
    const tpl = TPL[dev];
    const view = (desk.config.views || []).find((v) => v.path !== 'home' && JSON.stringify(v).includes('"' + tpl + '"')) || desk.config.views.find((v) => JSON.stringify(v).includes('"' + tpl + '"'));
    if (!view) { await check(dev + ': Kachel im Dashboard', false, 'keine Ansicht mit ' + tpl); continue; }
    await dashboard(page, desk.url + '/' + (view.path || '0'), 3);
    await closePopup(page);
    const pr = await runningPatch(page, tpl);
    await need(dev + ': Kachel mit auflösbaren Entitäten', pr && pr.p, pr);
    await fakeStates(page, pr.p, { sticky: true });
    await page.waitForTimeout(800);
    await check(dev + ': Popup offen', await openPopup(page, tpl, false));
    const m = await measure(page);
    await check(dev + ': Weich-Aufbau mit Spalten', m && m.areas.left && m.areas.right, m && m.areas);
    if (!m || !m.areas.left) { await closePopup(page); continue; }
    const want = Number((Object.values(pr.p).find((x) => /^\d+(\.\d+)?$/.test(x.state) && +x.state > 10) || {}).state);
    await check(dev + ': Fortschritt als Ring der Bühne (S4, nicht drehbar)', m.stage && m.stage.dial === 'level' && m.stage.x < m.areas.right.x
      && (!want || Math.abs(m.stage.pct - want) <= 2), { stage: m.stage, want });
    await check(dev + ': Prozent und „Fertig gegen … Uhr“ auf der Bühne', m.stage && /\d+\s%/.test(m.stage.text) && /Fertig gegen \d\d:\d\d Uhr/.test(m.stage.text), m.stage && m.stage.text);
    await check(dev + ': Restzeit groß auf der Bühne', m.stage && /übrig/.test(m.stage.text), m.stage && m.stage.text);
    await check(dev + ': kein Verlaufsblock (HH.bar) mehr', m.blocks === 0 && m.block66 === 0, { blocks: m.blocks, block66: m.block66 });
    // „Programm festlegen ›“ (WashData detection, sub page, 04.11.2026) is a control, not a doubled row.
    await check(dev + ': Zeilen „Phase“/„Programm“ nicht doppelt zur Kopfzeile', !m.rows.some((r) => /^(Phase|Programm) (?!abbrechen|festlegen)/.test(r)), m.rows.filter((r) => /^(Phase|Programm) (?!abbrechen|festlegen)/.test(r)));
    if (dev === 'dish') {
      if (pr.estimates) {
        const lv = m.labels['VERLAUF'];
        await check('dish: „Verlauf“ rechts beim Laufen (Muster v2, Regel 5)', lv && lv.x >= m.areas.right.x - 2, lv);
        await check('dish: Prognose als eine Zeile mit zwei Mini-Balken', m.forecastRows === 1 && m.forecastBars === 2 && !m.rows.some((r) => /^(Energiebedarf|Wasserbedarf)/.test(r)), { forecastRows: m.forecastRows, forecastBars: m.forecastBars });
      }
      // Blueprint v2: desktop like the phone – what is due, else one row „Alles aufgefüllt“ (› to the single values).
      await check('dish: Pflege rechts, nur Fälliges oder „Alles aufgefüllt“', m.careLabel && m.careLabel.x >= m.areas.right.x - 2
        && !['Regeneriersalz', 'Klarspüler', 'Filter', 'Maschinenpflege'].every((w) => m.rows.some((r) => r.indexOf(w) === 0)),
        { careLabel: m.careLabel, right: m.areas.right, rows: m.rows });
    } else {
      if (pr.washdata) {
        const lc = m.labels['LETZTE DURCHGÄNGE'], lp = m.labels['PROGRAMME'];
        await check(dev + ': letzte Durchgänge und Programme als Listen rechts (links nur die Bühne)', lc && lp && lc.x >= m.areas.right.x - 2 && lp.x >= m.areas.right.x - 2, { cycles: lc, progs: lp, right: m.areas.right });
      }
    }
    if (pr.stop) {
      await check(dev + ': „Programm abbrechen“ als Pille (46–50 hoch), nicht auf der Bühne', m.pill && m.pill.h >= 46 && m.pill.h <= 50
        && !(m.stage && m.pill.y >= m.stage.y && m.pill.y < m.stage.y + m.stage.h && m.pill.x < m.stage.x + m.stage.w), { pill: m.pill, stage: m.stage });
      await check(dev + ': Pille ruhig (Sand, nicht rot), Radius rund', m.pill && !red(m.pill.bg) && sand(m.pill.bg) && parseFloat(m.pill.radius) >= 24, m.pill);
      // Antippen: Bestätigen fährt rechts herein, erst dort die Warnfarbe; nichts wird ausgelöst.
      await page.mouse.click(m.pill.x + m.pill.w / 2, m.pill.y + m.pill.h / 2);
      await page.waitForTimeout(700);
      const m2 = await measure(page);
      await check(dev + ': Pille zweistufig – Bestätigen erscheint rot in der Pille', m2 && m2.pill && m2.pill.armed && m2.pill.cfInside && red(m2.pill.cfBg), m2 && m2.pill);
      await check(dev + ': Popup bleibt nach dem ersten Tipp offen', await offen(page));
    }
    await closePopup(page);
  }

  // ── Auto: Tank als Leiste, Warn-Ton ab 15 % ──
  // Das Auto steht nicht in jedem Prüf-Dashboard (qa-arbeit hat keins) – dann ein anderes Desktop-Dashboard mit Auto nehmen.
  const carDesk = has(desk, 'casora_car') ? desk : all.find((d) => !d.mobile && has(d, 'casora_car'));
  const carView = carDesk && ((carDesk.config.views || []).find((v) => v.path !== 'home' && JSON.stringify(v).includes('"casora_car"')) || carDesk.config.views.find((v) => JSON.stringify(v).includes('"casora_car"')));
  if (carView) {
    await dashboard(page, carDesk.url + '/' + (carView.path || '0'), 3);
    await closePopup(page);
    const tankId = await page.evaluate(() => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_car') && x.getBoundingClientRect().width > 20);
      if (!b || !window._casoraCar) return null;
      const cfg = b._config || {}, p = (cfg.variables || {}).car || cfg.entity || null;
      return window._casoraCar.id(p, 'tankfullstand', 'sensor') || window._casoraCar.id(p, 'akku', 'sensor');
    });
    await need('Auto: Tank-Entität', tankId, tankId);
    for (const [v, warn] of [['40', false], ['12', true]]) {
      await fakeStates(page, { [tankId]: { state: v } }, { sticky: true });
      await page.waitForTimeout(800);
      await check('Auto ' + v + ' %: Popup offen', await openPopup(page, 'casora_car', false));
      const m = await measure(page);
      // v3 (owner, 01.11.2026): range and fill level live in the dial only, the list no longer repeats them – the
      // level fills the ring and stands as a fact („Tank 40 %“) in the dial; at 15 % and below the ring is orange.
      const sg = m && m.anyStage;
      await check('Auto ' + v + ' %: Tank/Akku ' + v + ' % im Dial', sg && sg.dial === 'level' && new RegExp('(Tank|Akku)\\b.*\\b' + v + '\\s?%').test(sg.text), sg);
      await check('Auto ' + v + ' %: Ring ' + (warn ? 'im Warn-Ton (orange)' : 'nicht im Warn-Ton'), sg && /orange/.test(sg.col || '') === warn, sg && sg.col);
      await check('Auto ' + v + ' %: kein Verlaufsblock', m && m.blocks === 0 && m.block66 === 0, m && { blocks: m.blocks, block66: m.block66 });
      await closePopup(page);
    }
  } else console.log('  info   Auto: kein Dashboard mit Auto-Kachel in diesem Testhaus – Auto-Leiste nicht geprüft (Auto-Popup prüft r89)');

  // ── 3D-Drucker: Restzeit im Kopf, Leiste mit Prozent und „Fertig gegen“ ──
  const prView = (desk.config.views || []).find((v) => v.path !== 'home' && JSON.stringify(v).includes('"casora_3d_printer"')) || desk.config.views.find((v) => JSON.stringify(v).includes('"casora_3d_printer"'));
  if (prView) {
    await dashboard(page, desk.url + '/' + (prView.path || '0'), 3);
    await closePopup(page);
    const pp = await page.evaluate(() => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_3d_printer') && x.getBoundingClientRect().width > 20);
      if (!b || !window._casoraPrint) return null;
      const h = document.querySelector('home-assistant').hass, cfg = b._config || {};
      // Vorlagen-Variablen kommen hier unausgewertet („[[[ … ]]]“) – die lässt resolve() dann selbst finden.
      const vars = Object.fromEntries(Object.entries(cfg.variables || {}).filter(([, x]) => !(typeof x === 'string' && x.trim().startsWith('[[['))));
      const c = window._casoraPrint.resolve(cfg.entity ? h.states[cfg.entity] : null, vars, h.states, h);
      const p = {};
      if (c.status) p[c.status] = { state: 'running' };
      if (c.progress) p[c.progress] = { state: '42' };
      if (c.remaining) p[c.remaining] = { state: '1.6' };
      return c.status && c.progress && c.remaining ? p : null;
    });
    await need('Drucker: Status, Fortschritt, Restzeit', pp, pp);
    await fakeStates(page, pp, { sticky: true });
    await page.waitForTimeout(800);
    await check('Drucker: Popup offen', await openPopup(page, 'casora_3d_printer', false));
    const m = await measure(page);
    await check('Drucker: Restzeit groß auf der Bühne', m && m.stage && /Std\. übrig/.test(m.stage.text), m && m.stage);
    await check('Drucker: Fortschritt 42 als Ring der Bühne', m && m.stage && m.stage.dial === 'level' && Math.abs(m.stage.pct - 42) <= 1, m && m.stage);
    // r446 (owner, 01.11.2026): the ring shows the percent (checked above), the text says „Fertig um HH:MM Uhr“.
    await check('Drucker: „Fertig um … Uhr“ auf der Bühne', m && m.stage && /Fertig um \d\d:\d\d Uhr/.test(m.stage.text), m && m.stage && m.stage.text);
    await check('Drucker: keine Zeile „Fertig gegen“ unter „Druck“', m && !m.rows.some((r) => /^Fertig gegen/.test(r)), m && m.rows);
    await closePopup(page);
  } else await check('Drucker: Kachel im Dashboard', false);
  await page.context().browser().close().catch(() => {});
}

// ── Handy ──────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true, scale: 2, theme: 'Casora', dark: false });
  await page.context().addInitScript(() => { try { localStorage.setItem('casora_mobile_filter', 'all'); } catch (e) { /* egal */ } });
  await dashboard(page, phone.url + '/' + ((phone.config.views[0] || {}).path || '0'), 3);
  // Die Handy-Leiste kennt ihre Räume erst nach dem Aufbau – darauf warten (unter Last war die Liste
  // sonst leer und der Test rot: „Kachel am Handy – []“, 09.10.2026).
  await page.waitForFunction(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
    return !!n && n._rooms.some((r) => /^room_/.test(r.key)); }, null, { timeout: 20000 }).catch(() => {});
  const keys = await page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
    return n ? n._rooms.map((r) => r.key).filter((k) => /^room_/.test(k)) : []; }).catch(() => []);
  for (const dev of ['dish', 'wash']) {
    const tpl = TPL[dev];
    let t = await findTile(page, tpl);
    for (const k of keys) {
      if (t) break;
      await page.evaluate((x) => window._casoraFilter && window._casoraFilter.set(x), k);
      for (const t0 = Date.now(); !t && Date.now() - t0 < 6000;) { await page.waitForTimeout(500); t = await findTile(page, tpl); }
    }
    await need(dev + ': Kachel am Handy', t, keys);
    await closePopup(page);
    const pr = await runningPatch(page, tpl);
    await need(dev + ': Kachel mit auflösbaren Entitäten (Handy)', pr && pr.p, pr);
    await fakeStates(page, pr.p, { sticky: true });
    await page.waitForTimeout(800);
    await check(dev + ' Handy: Popup offen', await openPopup(page, tpl, true));
    const m = await measure(page);
    await check(dev + ' Handy: einspaltig (rechte Spalte unter der linken)', m && m.grid && m.grid.cols === 1 && m.areas.left && (!m.areas.right || m.areas.right.y >= m.areas.left.y + m.areas.left.h - 1), m && { grid: m.grid, areas: m.areas });
    await check(dev + ' Handy: Fortschritt als Ring der Bühne, Prozent und „Fertig gegen“', m && m.stage && m.stage.dial === 'level' && /\d+\s%/.test(m.stage.text)
      && /Fertig gegen/.test(m.stage.text), m && m.stage);
    await check(dev + ' Handy: kein Verlaufsblock', m && m.blocks === 0 && m.block66 === 0, m && { blocks: m.blocks, block66: m.block66 });
    if (dev === 'dish') {
      await check('dish Handy: Pflege nur Fälliges oder „Alles aufgefüllt“ (keine volle Liste)', m && !(['Regeneriersalz', 'Klarspüler', 'Filter', 'Maschinenpflege'].every((w) => m.rows.some((r) => r.indexOf(w) === 0))), m && m.rows);
      // v3: no settings section any more; the sheet holds stage and lists – at most the last list section lies below the edge.
      await check('dish Handy: laufender Geschirrspüler scrollt höchstens um einen Listenabschnitt', m && m.scrollH != null && m.scrollH <= m.clientH + 140, m && { scrollH: m.scrollH, clientH: m.clientH });
    }
    await closePopup(page);
  }
}

await finish();
