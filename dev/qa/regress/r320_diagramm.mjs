// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-chart.js
// Community-Karte Diagramm (#50) am erfundenen „Testserver“ (dev/casora_mock/testserver.py, System-Monitor-artig):
//   1. Kachel: Wert mit Einheit („23 %“), kleine 24-h-Kurve (casora-chart als Sparkline) sichtbar – am Handy nicht (Pille).
//   2. Popup: Zeitraum-Segmente 24 Std. · 7 Tage · 30 Tage (24 Std. aktiv), Casoras Diagramm mit Linie (Verlauf aus
//      dem Recorder), zweite Linie (RAM, gleiche Einheit) mit Legende, Bereich „Linien“, Statistik „Letzte 24 Std.“ mit
//      Höchster/Tiefster Wert/Durchschnitt aus recorder/statistics_during_period.
//   3. Tipp auf „7 Tage“: Segment wechselt, das Diagramm zeichnet 7 Tage, die Statistik heißt „Letzte 7 Tage“.
//   4. Nicht verfügbar (nur im Browser): Kachel „Nicht verfügbar“, Popup wirft nicht.
// Nichts wird gespeichert: die Kachel entsteht nur im Browser. DIAGRAMM_BILDER=<ordner>: Bilder ablegen.
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const ID = 'sensor.testserver_processor_use';
const RAM = 'sensor.testserver_memory_use_percent';
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
  const segs = window.__pierce('[data-casora-cspan]', pop.shadowRoot).map((s) => (s.className.includes(' on') ? '*' : '') + s.textContent.trim());
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 900), chart: !!ch, span: ch && ch._c ? ch._c.span : null,
    paths: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('svg path').length : 0,
    legend: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('.lg span').length : 0, segs };
};

const run = async (view, dark, first) => {
  const { page } = await open(Object.assign({ theme: 'Casora', dark }, view));
  await dashboard(page, dash.url, 3);
  await need('Testserver im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
  // Kachel im Browser erzeugen (nicht gespeichert) und hass weiterreichen, solange sie lebt.
  await page.evaluate(async ([id, ram]) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity: id, name: 'CPU-Last',
      variables: { entity_2: ram, label_2: 'RAM' } });
    el.classList.add('qa-r270');
    el.hass = ha.hass;
    const phone = window.innerWidth < 600;
    el.style.cssText = 'position:fixed;left:' + (phone ? 16 : 400) + 'px;top:' + (phone ? 120 : 300) + 'px;width:' + (phone ? 170 : 220) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, [ID, RAM]);
  const tile = () => stable(page, () => {
    const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r270');
    const sr = el && el.shadowRoot;
    if (!sr || !sr.querySelector('ha-card')) return null;
    const st = sr.querySelector('#state');
    const spark = window.__pierce('casora-chart', sr)[0];
    const r = spark && spark.getBoundingClientRect();
    return { state: st ? st.textContent.trim() : '', spark: !!(r && r.width > 20),
      path: !!(spark && spark.shadowRoot && spark.shadowRoot.querySelector('svg path')) };
  }, null, { max: 10000, quiet: 1000 });
  const openPop = async () => {
    const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r270').getBoundingClientRect();
      return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
    await page.mouse.click(at.x, at.y);
    return stable(page, popupInfo, null, { max: 15000, quiet: 2000, until: (p) => p && p.paths > 0 && /Durchschnitt/.test(p.txt) });
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
  await check(tag + ': Segmente 24 Std. (aktiv) · 7 Tage · 30 Tage', p && p.segs.join('|') === '*24 Std.|7 Tage|30 Tage', p && p.segs);
  await check(tag + ': Diagramm über 24 Std. mit Linien und Legende (CPU + RAM)', p && p.chart && p.span === '24h' && p.paths >= 2 && p.legend === 2, p && [p.chart, p.span, p.paths, p.legend]);
  await check(tag + ': Bereich „Linien“ mit beiden Sensoren', p && /Linien .*RAM/.test(p.txt), p && p.txt);
  await check(tag + ': Statistik „Letzte 24 Std.“ mit Höchster/Tiefster Wert und Durchschnitt',
    p && /Letzte 24 Std\. Höchster Wert .*Tiefster Wert .*Durchschnitt \d+\s?%/.test(p.txt), p && p.txt);
  await check(tag + ': Kopfzeile mit Wert und Durchschnitt', p && /CPU-Last \d+\s?% · Ø \d+\s?% · 24 Std\./.test(p.txt), p && p.txt);
  await shot('2-popup');
  if (first) {
    await page.evaluate(() => { const s = window.__pierce('[data-casora-cspan]').find((x) => /\|7d$/.test(x.getAttribute('data-casora-cspan'))); s.click(); });
    const p7 = await stable(page, popupInfo, null, { max: 15000, quiet: 2000, until: (x) => x && x.span === '7d' && /Letzte 7 Tage Höchster/.test(x.txt) });
    await check(tag + ': „7 Tage“ – Segment aktiv, Diagramm 7 Tage, Statistik „Letzte 7 Tage“',
      p7 && p7.segs.join('|') === '24 Std.|*7 Tage|30 Tage' && p7.span === '7d' && p7.paths >= 2 && /Letzte 7 Tage Höchster Wert/.test(p7.txt), p7);
    await shot('3-popup-7-tage');
    await close();
    // Nicht verfügbar nur im Browser: Kachel sagt es, das Popup bleibt ruhig.
    await fakeStates(page, { [ID]: { state: 'unavailable' } }, { sticky: true });
    t = await tile();
    await check(tag + ': nicht verfügbar → „Nicht verfügbar“ auf der Kachel', t && /Nicht verfügbar/.test(t.state), t);
    p = await stable(page, popupInfo, null, { max: 8000, quiet: 1500 });
    const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r270').getBoundingClientRect();
      return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
    await page.mouse.click(at.x, at.y);
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
