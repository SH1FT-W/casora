// @zustand: arbeit
// @parallel: ui
// Neu (Casora 1.2): Tanken im Auto-Popup. Erwartet: Mit eingerichtetem Tankerkönig steht direkt unter
// dem Tankbalken die Zeile „Tanken · ab X,XXX €“; Antippen zeigt im selben Popup die Ansicht „Tanken“
// (Zurück-Knopf, Empfehlung bzw. in der Lernphase der Hinweis „Die Empfehlung kommt, sobald genug Preise
// gesammelt sind, in etwa N Tagen“, Typischer Tag, Am günstigsten, Karte, Umschalter
// Günstigste/Nächste/Offen, Liste, „Daten: Tankerkönig, CC BY 4.0“). Ohne Einrichtung (kein Sensor)
// fehlt die Zeile ganz. Studio › Einstellungen › „Tanken“ mit Link zur Registrierung, maskiertem
// Schlüsselfeld, Test-Abruf, Umkreis und Kraftstoff je Auto.
// Karte (1.2): mit Mittelpunkt (Attribut center) liegt HAs eigene Karte (ha-map) unter Umkreis und Pillen, die
// Pillen sitzen an den echten Koordinaten; lädt sie nicht (kein map_tiles, keine Kacheln), bleibt die
// Punktkarte – nie eine leere Fläche. Ohne center (älterer Stand) nur die Punktkarte.
// Logos (1.2, Wunsch 08.10.2026 „fehlen zu viele, nicht richtig eingebunden“): Marken mit Zusatz („Pludra Musterstadt“)
// werden erkannt, alle Logos sitzen gleich groß im selben hellen Kreis, ein Platzhalter (16-px-Globus) oder ein
// Ladefehler fällt auf das Kürzel zurück, freie Tankstellen zeigen die Zapfsäule statt eines Kürzels. Die Logo-Adressen
// werden im Test abgefangen (eigenes Bild), damit nichts vom Netz abhängt.
// Der Tank-Sensor wird nur im Browser untergeschoben (erfundene Stationen), nichts wird in HA gespeichert.
import zlib from 'node:zlib';
import { open, casoraDashboards, dashboard, studioDashboard, studio, check, need, finish, fakeStates, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

const SID = 'sensor.casora_tanken_qa_testauto_e10';
// Mittelpunkt: Frankfurt am Main (öffentlicher Ort, Testhaus liegt auf 0/0); Lage je Station aus x/y.
const CENTER = [50.11, 8.682];
const stations = [
  { n: 'Freie Tankstelle Mühlweg', b: 'Freie', p: 1.689, o: true, d: 2.8, x: 1.9, y: 2.0 },
  { n: 'Autohof Nord', b: 'JET', p: 1.699, o: true, d: 4.6, x: 2.4, y: 3.9 },
  { n: 'Tankpunkt Südring', b: 'Tankpunkt', p: 1.719, o: true, d: 1.2, x: -0.4, y: -1.1 },
  { n: 'Stadttankstelle Gartenstraße', b: 'ARAL', p: 1.739, o: true, d: 0.9, x: -0.7, y: 0.5 },
  { n: 'Tankhof Lindenallee', b: 'Tankhof', p: 1.749, o: false, d: 3.4, x: -3.0, y: -1.6 },
].map((s) => ({ ...s, lat: +(CENTER[0] + s.y / 110.57).toFixed(4), lng: +(CENTER[1] + s.x / (111.32 * Math.cos(CENTER[0] * Math.PI / 180))).toFixed(4) }));
// Logo-Szene: Marken mit Zusätzen; Shell bekommt den Platzhalter, Wiro einen Ladefehler.
const logoStations = [
  { n: 'Pludra Musterstadt', b: 'Pludra Musterstadt', p: 1.659 }, { n: 'Freie Tankstelle Am Markt', b: 'freie Tankstelle', p: 1.669 },
  { n: 'Q1 Am Kanal', b: 'Q1', p: 1.679 }, { n: 'Schonhoff Mineralöle Süd', b: 'Schonhoff Mineralöle', p: 1.689 },
  { n: 'Shell Ringstraße', b: 'Shell', p: 1.699 }, { n: 'Wiro Tankcenter', b: 'Wiro', p: 1.709 }, { n: 'Tankhof Lindenallee', b: 'Tankhof', p: 1.719 },
].map((s, i) => ({ ...s, o: true, d: 1 + i / 2, lat: CENTER[0] + i / 300, lng: CENTER[1] }));
// PNG in beliebiger Größe (einfarbig) für die abgefangenen Logo-Adressen.
const png = (w, h) => {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x40)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
};
const LOGO_URLS = /s2\/favicons|upload\.wikimedia\.org|lanfer-energie\.de|wittrock\.de|schonhoff-mineraloele\.de|classic-oil\.de/;
const routeLogos = (pg) => pg.route(LOGO_URLS, (r) => {
  const u = r.request().url();
  if (/wittrock\.de/.test(u)) return r.abort();
  return r.fulfill({ status: /domain=shell\.de/.test(u) ? 404 : 200, contentType: 'image/png', body: /domain=shell\.de/.test(u) ? png(16, 16) : png(128, 128) });
});
const logoState = (pg) => pg.evaluate(async () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const all = () => window.__pierce('.ct-logo', s).filter((e) => e.getBoundingClientRect().height > 0);
  for (let i = 0; i < 40 && all().some((e) => { const m = e.querySelector('img'); return m && !m.complete; }); i++) await new Promise((r) => setTimeout(r, 150));
  await new Promise((r) => setTimeout(r, 400));
  const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
  const one = (e) => { const m = e.querySelector('img'), row = e.closest('.hui-srow');
    return { list: !!e.closest('.ct-list'), name: row ? row.textContent.replace(e.textContent, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ') : '',
      kind: e.dataset.logo, size: R(e), radius: getComputedStyle(e).borderRadius, text: e.textContent.trim(),
      img: m ? { u: m.dataset.u, op: getComputedStyle(m).opacity, inside: (() => { const a = e.getBoundingClientRect(), b = m.getBoundingClientRect();
        return b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5; })() } : null }; };
  return all().map(one);
});
const typical = Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 22 ? 1.649 : h < 6 ? 1.70 : 1.749));
const sensor = (dev, extra) => ({ state: '1.689', attributes: { car_device_id: dev, car_name: 'Testauto', fuel: 'e10',
  friendly_name: 'Testauto günstigster Preis Super E10', unit_of_measurement: '€/L', source: 'key', origin: 'home',
  radius_km: 5, center: CENTER, updated: new Date().toISOString(), count: stations.length, stations, error: null, ...extra } });
// Karte „In der Nähe“: wartet, bis die HA-Karte geladen oder aufgegeben ist; misst Ebene, Punktkarte und Pillen.
const mapState = (pg) => pg.evaluate(async () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const one = (q) => window.__pierce(q, s)[0] || null;
  for (let i = 0; i < 80; i++) {
    const l = one('.ct-hamap');
    if (!l || l.dataset.state !== 'laden') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 400));
  const box = one('.ct-mapbox'), layer = one('.ct-hamap');
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const pinsIn = (root) => Array.from(root ? root.querySelectorAll('g.ct-pin') : []).map((g) => { const r = g.querySelector('rect').getBoundingClientRect();
    return { t: g.textContent.trim(), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width }; });
  const out = { box: box && R(box), fallbackPins: pinsIn(box && box.querySelector('svg.ct-map')), state: layer ? layer.dataset.state : null };
  if (layer) {
    const m = layer.querySelector('ha-map');
    out.layer = R(layer);
    out.visible = getComputedStyle(layer).display !== 'none' && +getComputedStyle(layer).opacity > 0.9;
    out.pins = pinsIn(layer.querySelector('svg.ct-hamap-pins'));
    const dot = Array.from(layer.querySelectorAll('svg.ct-hamap-pins circle[r="6"]')).pop();
    if (dot) { const r = dot.getBoundingClientRect(); out.dot = [r.left + r.width / 2, r.top + r.height / 2]; }
    out.hasMap = !!m;
    window.__qaMapEl = m;
    if (m && m.leafletMap) {
      const lm = m.leafletMap;
      const sensor = Object.entries(document.querySelector('home-assistant').hass.states).find(([k, x]) => x && k.startsWith('sensor.casora_tanken_qa_'))[1];
      const st = sensor.attributes.stations;
      const best = st.find((x) => x.o);
      const p = lm.latLngToContainerPoint([best.lat, best.lng]), c = lm.latLngToContainerPoint(sensor.attributes.center);
      out.expect = { best: [out.layer.x + p.x, out.layer.y + p.y], center: [out.layer.x + c.x, out.layer.y + c.y] };
      out.tiles = Array.from(m.shadowRoot.querySelectorAll('canvas, img.leaflet-tile-loaded')).length;
      out.zoomCtl = !!m.shadowRoot.querySelector('.leaflet-control-zoom') && getComputedStyle(m.shadowRoot.querySelector('.leaflet-control-zoom')).display !== 'none';
      out.attribution = (m.shadowRoot.querySelector('.leaflet-control-attribution') || { textContent: '' }).textContent.trim();
      out.dragging = lm.dragging && lm.dragging.enabled();
    }
  }
  return out;
});

// Kachel im Browser anlegen (Auto über seine Reichweite), Dienstaufrufe abfangen.
const mount = (pg) => pg.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  if (!conn.__qaSend) {
    conn.__qaSend = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => (m && m.type === 'call_service' ? Promise.resolve({}) : conn.__qaSend(m));
  }
  const C = window._casoraCar;
  const anchor = C && C.id(null, 'reichweite_kombiniert', 'sensor');
  if (!anchor) return null;
  if (window.__qaTile) window.__qaTile.remove();
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_car', entity: anchor, name: 'Auto' });
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 1000));
  return { anchor, dev: (ha.hass.entities[anchor] || {}).device_id || null };
});
const openPopup = async (pg) => {
  await pg.evaluate(() => { if (window._casoraTank) window._casoraTank.leave(true); if (window.casoraPopup) window.casoraPopup.close(); });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => {
    const el = window.__qaTile;
    el.hass = document.querySelector('home-assistant').hass;
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && (ev.detail.config.icon_tap_action || ev.detail.config.tap_action);
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: true });
  });
  for (let i = 0; i < 30; i++) {
    if (await pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface) && window.__pierce('.hui-srow', window.casoraPopup.surface).length > 0)) break;
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(900);
};
const popup = (pg) => pg.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const P = (q) => window.__pierce(q, s).filter((e) => e.getBoundingClientRect().height > 0);
  const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
  const row = P('.casora-tank-row')[0];
  const bar = P('.hui-sl, [data-casora-axis]')[0];
  const sr = window.casoraPopup.element.shadowRoot;
  return {
    row: row ? txt(row.querySelector('.hui-srow') || row) : null,
    rowTop: row ? row.getBoundingClientRect().top : null,
    barBottom: bar ? bar.getBoundingClientRect().bottom : null,
    firstRowTop: (P('.hui-srow').filter((e) => !e.closest('.casora-tank-row'))[0] || { getBoundingClientRect: () => ({ top: null }) }).getBoundingClientRect().top,
    view: P('.casora-tank-view').length ? txt(P('.casora-tank-view')[0]) : null,
    title: sr.querySelector('.header-title').textContent,
    back: !!sr.querySelector('.casora-tank-back'),
    seg: P('.ct-seg .hui-sg').map(txt),
    segOn: P('.ct-seg .hui-sg.on').map(txt),
    list: P('.ct-list .hui-srow').map(txt),
    map: P('.ct-map').length, top: P('.ct-top > div').length, day: P('.ct-day').length, scale: P('.ct-scale').length,
    // Typischer Tag (1.2): Säulen als casora-chart (18 Stunden, Skala rechts), Etikett in Versalien.
    dayBars: (() => { const c = P('.ct-day casora-chart')[0]; return c && c.shadowRoot ? c.shadowRoot.querySelectorAll('path[d*="Q"]').length : 0; })(),
    dayLabel: (() => { const l = P('.ct-day > div')[0]; return l ? [l.textContent, getComputedStyle(l).textTransform, getComputedStyle(l).fontSize] : null; })(),
  };
});
const tap = (pg, sel) => pg.evaluate((sel) => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const el = window.__pierce(sel, s).find((e) => e.getBoundingClientRect().height > 0);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  return true;
}, sel);

for (const vp of [{ name: 'Desktop', width: 1440, height: 900 }, { name: 'Handy', width: 393, height: 852, mobile: true }]) {
  const { page } = await open({ width: vp.width, height: vp.height, mobile: !!vp.mobile, dark: process.env.R89_DARK === '1', theme: 'Casora' });
  usePage(page);
  await dashboard(page, vp.mobile ? (all.find((d) => d.mobile && d.url === desk.url + '-mobile') || desk).url : desk.url);
  const car = await mount(page);
  await need(vp.name + ': Auto im Testhaus', car && car.dev, car);

  // Ohne Einrichtung: keine Zeile (auch echte Tank-Sensoren des Test-HA ausblenden).
  const real = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((k) => k.startsWith('sensor.casora_tanken_')));
  const none = Object.fromEntries(real.concat([SID]).map((k) => [k, null]));
  await fakeStates(page, none, { sticky: true });
  await openPopup(page);
  let p = await popup(page);
  await check(vp.name + ': ohne Einrichtung keine Zeile „Tanken“', p && p.row === null && p.firstRowTop != null, p);

  // Lernphase: Zeile mit Preis, Ansicht mit Hinweis statt Empfehlung.
  await fakeStates(page, { ...none, [SID]: sensor(car.dev, { typical: null, low: null, high: null, days: 2, learn_days_left: 5, center: null }) }, { sticky: true });
  await openPopup(page);
  p = await popup(page);
  await check(vp.name + ': Zeile „Tanken · ab 1,689 €“', p && /^Tanken/.test(p.row || '') && /ab 1,689 €/.test(p.row) && /Super E10 · Preise werden gesammelt/.test(p.row), p && p.row);
  await check(vp.name + ': Zeile direkt unter dem Tankbalken, vor Zustand/Wartung',
    p && p.rowTop != null && (p.barBottom == null || (p.rowTop > p.barBottom && p.rowTop - p.barBottom < 24)) && p.rowTop < p.firstRowTop, p);
  await tap(page, '.casora-tank-row');
  await page.waitForTimeout(800);
  p = await popup(page);
  await check(vp.name + ': Ansicht „Tanken“ mit Zurück-Knopf', p && p.title === 'Tanken' && p.back && p.view, p && { title: p.title, back: p.back });
  await check(vp.name + ': Lernphase zeigt den Hinweis statt einer Empfehlung',
    p && /Die Empfehlung kommt, sobald genug Preise gesammelt sind, in etwa 5 Tagen\./.test(p.view) && !p.day && !p.scale, p && p.view);
  {
    const ms = await mapState(page);
    await check(vp.name + ': ohne Mittelpunkt (älterer Stand) nur die Punktkarte mit Pillen',
      ms.box && ms.box.h > 100 && ms.fallbackPins.length === 5 && (ms.state === null || ms.visible === false), ms);
  }
  await check(vp.name + ': Am günstigsten (3 Kacheln), Punktkarte, Umschalter, Liste, Quelle',
    p && p.top === 3 && p.map === 1 && p.seg.join('|') === 'Günstigste|Nächste|Offen' && p.list.length === 5
    && /Daten: Tankerkönig, CC BY 4\.0/.test(p.view) && !/Lindenallee.*Mühlweg/.test(p.list.join('|')), p);
  // Markenlogos (1.2): JET und ARAL bekommen ihr Logo (Adresse aus 12-tanken.js), freie Tankstellen die Zapfsäule.
  const logos = await page.evaluate(() => window.__pierce('img').map((i) => i.getAttribute('src') || '').filter((u) => /s2\/favicons|Aral_Logo/.test(u)));
  await check(vp.name + ': Markenlogos für JET und ARAL', logos.some((u) => /domain=jet\.de/.test(u)) && logos.some((u) => /Aral_Logo/.test(u)), logos.slice(0, 4));
  if (process.env.R89_BILD) await page.screenshot({ path: `${process.env.CASORA_OUT}/r89_${vp.name.replace(/\W+/g, '_')}_logos.png` });
  await tap(page, '.ct-seg .hui-sg:nth-child(3)');
  await page.waitForTimeout(400);
  p = await popup(page);
  await check(vp.name + ': „Offen“ blendet geschlossene aus', p && p.segOn[0] === 'Offen' && p.list.length === 4 && !p.list.some((t) => /Lindenallee/.test(t)), p && p.list);
  await tap(page, '.ct-seg .hui-sg:nth-child(2)');
  await page.waitForTimeout(400);
  p = await popup(page);
  await check(vp.name + ': „Nächste“ sortiert nach Entfernung', p && /Gartenstraße/.test(p.list[0] || ''), p && p.list);
  await tap(page, '.casora-tank-back');
  await page.waitForTimeout(600);
  p = await popup(page);
  await check(vp.name + ': Zurück führt ins Auto-Popup', p && p.view === null && p.title !== 'Tanken' && !p.back && /Tanken/.test(p.row || ''), p && { title: p.title, view: !!p.view });

  // Logos: Marken mit Zusatz, Platzhalter und Ladefehler → Kürzel, freie Tankstelle → Zapfsäule, alle gleich groß.
  {
    await routeLogos(page);
    await page.evaluate(() => { if (window._casoraTank) for (const k of Object.keys(window._casoraTank.seen)) delete window._casoraTank.seen[k]; });
    await fakeStates(page, { ...none, [SID]: sensor(car.dev, { typical: null, low: null, high: null, days: 2, learn_days_left: 5, center: null,
      stations: logoStations, count: logoStations.length }) }, { sticky: true });
    await openPopup(page);
    await tap(page, '.casora-tank-row');
    await page.waitForTimeout(800);
    const L = await logoState(page);
    const row = (n) => L.find((x) => x.list && x.name.startsWith(n));
    const pl = row('Pludra'), q1 = row('Q1'), sh = row('Schonhoff'), shell = row('Shell'), wiro = row('Wiro'), frei = row('Freie'), th = row('Tankhof');
    await check(vp.name + ': Logo trotz Zusatz („Pludra Musterstadt“, „Schonhoff Mineralöle“) und für Q1, sichtbar im Kreis',
      [pl, q1, sh].every((x) => x && x.kind === 'bild' && x.img && x.img.op === '1' && x.img.inside) && /pludra/.test(pl.img.u) && /schonhoff/.test(sh.img.u), L);
    await check(vp.name + ': Platzhalter (16-px-Globus) fällt auf das Kürzel zurück', shell && shell.kind === 'kuerzel' && !shell.img && shell.text === 'SR', shell);
    await check(vp.name + ': Logo lädt nicht → Kürzel', wiro && wiro.kind === 'kuerzel' && !wiro.img && wiro.text === 'WT', wiro);
    await check(vp.name + ': freie Tankstelle zeigt die Zapfsäule statt eines Kürzels', frei && frei.kind === 'frei' && frei.text === '' && th && th.kind === 'kuerzel', { frei, th });
    const sizes = L.map((x) => x.size.join('x'));
    await check(vp.name + ': alle Logo-Kreise gleich groß und rund (Liste und Kacheln)',
      L.length >= 10 && L.filter((x) => x.list).length === logoStations.length && new Set(sizes).size === 1 && L.every((x) => x.radius === '50%'), sizes);
    // Neu zeichnen (Umschalter): bekannte Ergebnisse sofort, kein Zwischenzustand.
    await tap(page, '.ct-seg .hui-sg:nth-child(2)');
    const again = await page.evaluate(() => window.__pierce('.ct-list .ct-logo', window.casoraPopup.surface).map((e) => [e.dataset.logo, (e.querySelector('img') || { style: {} }).style.opacity || '']));
    await check(vp.name + ': nach dem Umschalten sofort Logo bzw. Kürzel (kein Flackern)',
      again.length === logoStations.length && again.every(([k, o]) => k !== 'bild' || o === '1') && again.filter(([k]) => k === 'kuerzel').length === 3, again);
    if (process.env.R89_BILD) await page.screenshot({ path: `${process.env.CASORA_OUT}/r89_${vp.name.replace(/\W+/g, '_')}_logo_szene.png` });
    await page.unroute(LOGO_URLS);
  }

  // Genug Preise: Empfehlung mit Skala und Typischem Tag.
  await fakeStates(page, { ...none, [SID]: sensor(car.dev, { typical, low: 1.649, high: 1.749, days: 14, learn_days_left: 0 }) }, { sticky: true });
  await openPopup(page);
  await tap(page, '.casora-tank-row');
  await page.waitForTimeout(800);
  p = await popup(page);
  await check(vp.name + ': Empfehlung mit Preis-Skala und Typischem Tag', p && p.scale === 1 && p.day === 1 && /Empfehlung/.test(p.view)
    && /Tief/.test(p.view) && /jetzt 1,689 €/.test(p.view) && /Hoch/.test(p.view) && !/Die Empfehlung kommt/.test(p.view), p && p.view);
  await check(vp.name + ': Typischer Tag als casora-chart (18 Säulen), Etikett „Typischer Tag · Ø 14 Tage“ 12 px Versalien',
    p && p.dayBars === 18 && p.dayLabel && /Typischer Tag · Ø 14 Tage/.test(p.dayLabel[0]) && p.dayLabel[1] === 'uppercase' && p.dayLabel[2] === '12px', p && [p.dayBars, p.dayLabel]);
  if (process.env.R89_BILD) {
    await page.evaluate(() => { const d = window.__pierce('.ct-day', window.casoraPopup.surface)[0]; if (d) d.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${process.env.CASORA_OUT}/r89_${vp.name.replace(/\W+/g, '_')}_typischer_tag.png` });
  }
  // Karte: HA-Karte geladen (Ebene deckt die Punktkarte, Pillen an den Koordinaten) oder Rückfall auf die Punktkarte.
  const ms = await mapState(page);
  console.log(`  ${vp.name}: Karte ${ms.state === 'ok' ? 'HA-Karte geladen' : 'Rückfall Punktkarte (' + ms.state + ')'}`);
  await check(vp.name + ': Karte „In der Nähe“ nie leer (HA-Karte oder Punktkarte mit 5 Pillen)',
    ms.box && ms.box.h > 100 && (ms.state === 'ok' ? ms.visible && ms.hasMap && ms.tiles > 0 && ms.pins.length === 5 : ms.fallbackPins.length === 5 && !ms.visible), ms);
  if (ms.state === 'ok') {
    const near = (a, b, t = 2.5) => a && b && Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t;
    const best = ms.pins.find((q) => q.t === '1,689');
    await check(vp.name + ': HA-Karte liegt genau auf der Fläche der Punktkarte',
      ['x', 'y', 'w', 'h'].every((k) => Math.abs(ms.layer[k] - ms.box[k]) < 1.5), { layer: ms.layer, box: ms.box });
    await check(vp.name + ': günstigste Pille an ihrer Koordinate, Umkreis-Mitte am Standort',
      best && near([best.cx, best.cy], ms.expect.best) && near(ms.dot, ms.expect.center), { best, dot: ms.dot, expect: ms.expect });
    await check(vp.name + ': Karte ohne Zoom-Knöpfe, nicht verschiebbar, OSM-Hinweis sichtbar',
      !ms.zoomCtl && ms.dragging === false && /OpenStreetMap/.test(ms.attribution), ms);
    // Umschalten zeichnet die Ansicht neu – die Karte bleibt dieselbe (kein Neuladen).
    await tap(page, '.ct-seg .hui-sg:nth-child(2)');
    await page.waitForTimeout(500);
    const same = await page.evaluate(() => { const l = window.__pierce('.ct-hamap', window.casoraPopup.surface)[0]; return !!l && l.querySelector('ha-map') === window.__qaMapEl && l.dataset.state === 'ok'; });
    await check(vp.name + ': Karte bleibt beim Umschalten erhalten', same);
  }
  if (process.env.R89_BILD) await page.screenshot({ path: `${process.env.CASORA_OUT}/r89_${vp.name.replace(/\W+/g, '_')}_karte.png` });
  // Kartendienst gestört (Kacheln blockiert): Punktkarte bleibt sichtbar, keine leere Fläche.
  if (!vp.mobile) {
    await page.route('**/api/map_tiles/**', (r) => r.abort());
    await openPopup(page);
    await tap(page, '.casora-tank-row');
    await page.waitForTimeout(800);
    const fb = await mapState(page);
    await check(vp.name + ': Kartendienst gestört → Punktkarte mit Pillen statt leerer Fläche',
      fb.state === 'fehler' && !fb.visible && fb.box && fb.box.h > 100 && fb.fallbackPins.length === 5, fb);
    await page.unroute('**/api/map_tiles/**');
  }
  await page.evaluate(() => { if (window._casoraTank) window._casoraTank.leave(true); if (window.casoraPopup) window.casoraPopup.close(); });
  await page.context().browser().close();
}

// Studio › Einstellungen › Tanken
const sd = await studioDashboard();
await need('ein Dashboard fürs Studio', sd);
const { page } = await open({ width: 1600, height: 1000, theme: 'Casora', dark: false });
usePage(page);
await studio(page, sd);
await page.evaluate(() => window.__panel()._csOpenPage('fuel'));
await page.waitForTimeout(2500);
const st = await page.evaluate(() => {
  const P = (q) => window.__pierce(q).filter((e) => e.offsetParent);
  const wrap = P('.cs-wrap')[0];
  const key = P('.cs-tk-key')[0];
  const link = P('.cs-tk-link')[0];
  return { text: wrap ? wrap.textContent.replace(/\s+/g, ' ') : '', keyType: key && key.type, keyValue: key && key.value,
    link: link && link.href, test: P('.cs-tk-test button').length, radius: !!P('.cs-tk-radius')[0],
    side: P('.sidelist .siderow, #sidesections .siderow').map((e) => e.textContent.trim()) };
});
await check('Studio: Abschnitt „Tanken“ unter Einstellungen', /Tanken/.test(st.side.join('|')) || /Tankstellen in der Nähe/.test(st.text), st.side);
// 08.10.2026: Das neue Studio hat eigene Listen (Einstellungs-Menü, Suche) – dort fehlte „Tanken“.
{
  const fs = await import('node:fs');
  const b = fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-panel-b.js', import.meta.url), 'utf8');
  const m = fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8');
  await check('Studio: „Tanken“ im Einstellungs-Menü und in der Suche des neuen Studios', /\["fuel", "Fuel prices"/.test(b) && /\["fuel", "Fuel prices"/.test(m));
}
await check('Studio: Link zur Registrierung', st.link === 'https://onboarding.tankerkoenig.de/', st.link);
await check('Studio: Schlüsselfeld maskiert und leer', st.keyType === 'password' && !st.keyValue, st);
await check('Studio: Test-Abruf, Umkreis, Kraftstoff je Auto, Quelle', st.test === 1 && st.radius && /Kraftstoff je Auto/.test(st.text) && /Daten: Tankerkönig, CC BY 4\.0/.test(st.text), st.text.slice(0, 400));
await finish();
