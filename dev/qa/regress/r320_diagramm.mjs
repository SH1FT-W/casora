// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-chart.js
// Community-Karte Diagramm (#50) am erfundenen „Testserver“ (dev/casora_mock/testserver.py, System-Monitor-artig):
//   1. Kachel: Wert mit Einheit („23 %“), kleine 24-h-Kurve (casora-chart als Sparkline) sichtbar – am Handy nicht (Pille).
//   2. Popup: Zeitraum-Segmente 24 Std. · 7 Tage · 30 Tage · Jahr (24 Std. aktiv), daneben Linie · Balken (Messwert: Linie
//      aktiv), Casoras Diagramm mit Linie (Verlauf aus dem Recorder), zweite Linie (RAM, gleiche Einheit) mit Legende,
//      Bereich „Linien“, Statistik „Letzte 24 Std.“ mit Höchster/Tiefster Wert/Durchschnitt aus recorder/statistics_during_period.
//   3. Tipp auf „7 Tage“: Segment wechselt, das Diagramm zeichnet 7 Tage, die Statistik heißt „Letzte 7 Tage“.
//   4. Tipp auf „Balken“: Balken je Tag, beide Reihen nebeneinander mit Legende; „24 Std.“ → Balken je Stunde (die Wahl
//      bleibt beim Zeitraumwechsel); „Jahr“ → Balken je Monat, Statistik „Letzte 12 Monate“; zurück auf „Linie“.
//   5. Zähler (Testserver-Energie, total_increasing): öffnet automatisch als Balken je Stunde mit „Heute“; 7 Tage → Balken je
//      Tag mit „Ø pro Tag“; Jahr → Balken je Monat mit „Dieser Monat“, „Letzte 12 Monate“, „Ø pro Monat“.
//   6. Nicht verfügbar (nur im Browser): Kachel „Nicht verfügbar“, Popup wirft nicht.
// Nichts wird gespeichert: die Kacheln entstehen nur im Browser. DIAGRAMM_BILDER=<ordner>: Bilder ablegen.
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const ID = 'sensor.testserver_processor_use';
const RAM = 'sensor.testserver_memory_use_percent';
const ENERGY = 'sensor.testserver_energy';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const OUT = process.env.DIAGRAMM_BILDER;

const popupInfo = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0)[0];
  const seg = (attr) => window.__pierce('[' + attr + ']', pop.shadowRoot).map((s) => (s.className.includes(' on') ? '*' : '') + s.textContent.trim());
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 900), chart: !!ch, span: ch && ch._c ? ch._c.span : null,
    kind: ch && ch._c ? ch._c.kind : null, period: ch && ch._c ? ch._c.period || null : null,
    paths: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('svg path').length : 0,
    legend: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('.lg span').length : 0,
    segs: seg('data-casora-cspan'), shapes: seg('data-casora-cshape') };
};

const run = async (view, dark, first) => {
  const { page } = await open(Object.assign({ theme: 'Casora', dark }, view));
  await dashboard(page, dash.url, 3);
  await need('Testserver im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
  // Kachel im Browser erzeugen (nicht gespeichert) und hass weiterreichen, solange sie lebt.
  const makeTile = (cls, entity, name, variables, col) => page.evaluate(async ([cls, entity, name, variables, col]) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity, name, variables });
    el.classList.add(cls);
    el.hass = ha.hass;
    const phone = window.innerWidth < 600;
    el.style.cssText = 'position:fixed;left:' + ((phone ? 16 : 400) + col * (phone ? 190 : 260)) + 'px;top:' + (phone ? 120 : 300) + 'px;width:' + (phone ? 170 : 220) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, [cls, entity, name, variables, col || 0]);
  await makeTile('qa-r270', ID, 'CPU-Last', { entity_2: RAM, label_2: 'RAM' });
  const tile = (cls = 'qa-r270') => stable(page, (cls) => {
    const el = document.querySelector('home-assistant').shadowRoot.querySelector('.' + cls);
    const sr = el && el.shadowRoot;
    if (!sr || !sr.querySelector('ha-card')) return null;
    const st = sr.querySelector('#state');
    const spark = window.__pierce('casora-chart', sr)[0];
    const r = spark && spark.getBoundingClientRect();
    return { state: st ? st.textContent.trim() : '', spark: !!(r && r.width > 20),
      path: !!(spark && spark.shadowRoot && spark.shadowRoot.querySelector('svg path')) };
  }, cls, { max: 10000, quiet: 1000 });
  const tapTile = async (cls = 'qa-r270') => {
    const at = await page.evaluate((cls) => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.' + cls).getBoundingClientRect();
      return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; }, cls);
    await page.mouse.click(at.x, at.y);
  };
  const openPop = async (cls, until) => {
    await tapTile(cls);
    return stable(page, popupInfo, null, { max: 15000, quiet: 2000, until: until || ((p) => p && p.paths > 0 && /Durchschnitt/.test(p.txt)) });
  };
  // Segment antippen (Zeitraum „24h|7d|30d|1y“ oder Form „line|bar“) und warten, bis das Diagramm umgestellt ist.
  const seg = async (attr, value, until) => {
    await page.evaluate(([attr, value]) => { const s = window.__pierce('[' + attr + ']').find((x) => new RegExp('\\|' + value + '$').test(x.getAttribute(attr))); s.click(); }, [attr, value]);
    return stable(page, popupInfo, null, { max: 15000, quiet: 2000, until });
  };
  const close = async () => {
    await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
    await page.waitForTimeout(600);
  };
  const tag = (view.mobile ? 'Handy' : 'Desktop') + (dark ? ' dunkel' : ' hell');
  const shot = (n) => OUT && page.screenshot({ path: OUT + '/' + n + '-' + tag.replace(' ', '-') + '.png' });

  let t = await tile();
  await check(tag + ': Kachel zeigt den Wert mit Einheit', t && /^\d+\s?%$/.test(t.state), t);
  // Am Handy (Pille, 62 hoch) blendet casora_entity jede Sparkline aus – wie Energie- und Pflanzen-Kachel.
  if (view.mobile) await check(tag + ': Kachel ohne Sparkline (Pille)', t && !t.spark, t);
  else await check(tag + ': Kachel mit Sparkline (Verlauf vorhanden)', t && t.spark && t.path, t);
  await shot('1-kachel');
  let p = await openPop();
  await check(tag + ': Segmente 24 Std. (aktiv) · 7 Tage · 30 Tage · Jahr', p && p.segs.join('|') === '*24 Std.|7 Tage|30 Tage|Jahr', p && p.segs);
  await check(tag + ': Umschalter Linie (aktiv, Messwert) · Balken', p && p.shapes.join('|') === '*Linie|Balken', p && p.shapes);
  await check(tag + ': Diagramm über 24 Std. mit Linien und Legende (CPU + RAM)', p && p.chart && p.span === '24h' && p.kind === 'line' && p.paths >= 2 && p.legend === 2, p && [p.chart, p.span, p.kind, p.paths, p.legend]);
  await check(tag + ': Bereich „Linien“ mit beiden Sensoren', p && /Linien .*RAM/.test(p.txt), p && p.txt);
  await check(tag + ': Statistik „Letzte 24 Std.“ mit Höchster/Tiefster Wert und Durchschnitt',
    p && /Letzte 24 Std\. Höchster Wert .*Tiefster Wert .*Durchschnitt \d+\s?%/.test(p.txt), p && p.txt);
  await check(tag + ': Kopfzeile mit Wert und Durchschnitt', p && /CPU-Last \d+\s?% · Ø \d+\s?% · 24 Std\./.test(p.txt), p && p.txt);
  await shot('2-popup');
  if (first) {
    const p7 = await seg('data-casora-cspan', '7d', (x) => x && x.span === '7d' && /Letzte 7 Tage Höchster/.test(x.txt));
    await check(tag + ': „7 Tage“ – Segment aktiv, Diagramm 7 Tage, Statistik „Letzte 7 Tage“',
      p7 && p7.segs.join('|') === '24 Std.|*7 Tage|30 Tage|Jahr' && p7.span === '7d' && p7.paths >= 2 && /Letzte 7 Tage Höchster Wert/.test(p7.txt), p7);
    await shot('3-popup-7-tage');
    // Umschalter: Messwerte als Balken je Tag, beide Reihen nebeneinander; die Wahl bleibt beim Zeitraumwechsel.
    const pb = await seg('data-casora-cshape', 'bar', (x) => x && x.kind === 'bar' && x.span === '7d' && x.paths >= 8);
    await check(tag + ': „Balken“ – Segment aktiv, Balken je Tag über 7 Tage, beide Reihen mit Legende',
      pb && pb.shapes.join('|') === 'Linie|*Balken' && pb.kind === 'bar' && pb.period === 'day' && pb.paths >= 8 && pb.legend === 2, pb);
    await shot('4-popup-balken-7-tage');
    const ph = await seg('data-casora-cspan', '24h', (x) => x && x.kind === 'bar' && x.span === '24h' && x.paths > 0);
    await check(tag + ': „24 Std.“ bleibt bei Balken – je Stunde', ph && ph.kind === 'bar' && ph.period === 'hour' && ph.paths >= 12 && ph.shapes.join('|') === 'Linie|*Balken', ph);
    await shot('5-popup-balken-24-std');
    const py = await seg('data-casora-cspan', '1y', (x) => x && x.span === '1y' && x.kind === 'bar' && /Letzte 12 Monate Höchster/.test(x.txt));
    await check(tag + ': „Jahr“ – Balken je Monat, Statistik „Letzte 12 Monate“ mit Höchster/Tiefster Wert',
      py && py.segs.join('|') === '24 Std.|7 Tage|30 Tage|*Jahr' && py.period === 'month' && py.paths >= 10 && /Letzte 12 Monate Höchster Wert .*Tiefster Wert .*Durchschnitt/.test(py.txt), py);
    await shot('6-popup-balken-jahr');
    const pl = await seg('data-casora-cshape', 'line', (x) => x && x.kind === 'line' && x.span === '1y' && x.paths > 0);
    await check(tag + ': zurück auf „Linie“ – Jahr als Linie aus Monatsmitteln', pl && pl.kind === 'line' && pl.period === 'month' && pl.paths >= 2 && pl.shapes.join('|') === '*Linie|Balken', pl);
    await shot('7-popup-linie-jahr');
    await close();
    // Zähler: Energie des Servers öffnet automatisch als Balken (je Stunde über 24 Std.) mit Verbrauch heute.
    await makeTile('qa-r320e', ENERGY, 'Server-Strom', {}, 1);
    t = await tile('qa-r320e');
    await check(tag + ': Zähler-Kachel zeigt kWh', t && /kWh$/.test(t.state), t);
    const pe = await openPop('qa-r320e', (x) => x && x.paths > 0 && /Heute/.test(x.txt));
    await check(tag + ': Zähler – automatisch Balken je Stunde, 24 Std., „Heute“ in der Statistik',
      pe && pe.shapes.join('|') === 'Linie|*Balken' && pe.kind === 'bar' && pe.period === 'hour' && pe.span === '24h' && pe.paths >= 12 && /Letzte 24 Std\. Heute [\d,.]+\s?kWh/.test(pe.txt), pe);
    await shot('8-energie-balken-24-std');
    const pe7 = await seg('data-casora-cspan', '7d', (x) => x && x.span === '7d' && /Ø pro Tag/.test(x.txt));
    await check(tag + ': Zähler 7 Tage – Balken je Tag, „Heute“, „Letzte 7 Tage“, „Ø pro Tag“',
      pe7 && pe7.kind === 'bar' && pe7.period === 'day' && pe7.paths >= 6 && /Heute [\d,.]+\s?kWh Letzte 7 Tage [\d,.]+\s?kWh Ø pro Tag/.test(pe7.txt), pe7);
    await shot('9-energie-balken-7-tage');
    const pey = await seg('data-casora-cspan', '1y', (x) => x && x.span === '1y' && /Ø pro Monat/.test(x.txt));
    await check(tag + ': Zähler Jahr – Balken je Monat, „Dieser Monat“, „Letzte 12 Monate“, „Ø pro Monat“',
      pey && pey.kind === 'bar' && pey.period === 'month' && pey.paths >= 10 && /Dieser Monat [\d,.]+\s?kWh Letzte 12 Monate [\d,.]+\s?kWh Ø pro Monat/.test(pey.txt), pey);
    await shot('10-energie-balken-jahr');
    await close();
    // Nicht verfügbar nur im Browser: Kachel sagt es, das Popup bleibt ruhig.
    await fakeStates(page, { [ID]: { state: 'unavailable' } }, { sticky: true });
    t = await tile();
    await check(tag + ': nicht verfügbar → „Nicht verfügbar“ auf der Kachel', t && /Nicht verfügbar/.test(t.state), t);
    p = await stable(page, popupInfo, null, { max: 8000, quiet: 1500 });
    await tapTile();
    p = await stable(page, popupInfo, null, { max: 8000, quiet: 1500 });
    await check(tag + ': Popup bei „Nicht verfügbar“ öffnet ohne undefined/NaN', p && /Nicht verfügbar/.test(p.txt) && !/undefined|NaN/.test(p.txt), p && p.txt);
  }
  await close();
  await page.context().close();
};

await run({ width: 1440, height: 1000 }, true, true);
await run({ width: 1440, height: 1000 }, false, false);
await run({ width: 393, height: 852, mobile: true }, true, false);
await finish();
