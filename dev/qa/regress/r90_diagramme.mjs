// @zustand: arbeit
// @parallel: ui
// Casora 1.2: eigene Diagramm-Karte casora-chart statt apexcharts-card. Jedes umgestellte Popup
// (Energie, Netzwerk, Klima, Pflanze) zeigt casora-chart mit gezeichneter Kurve, nirgends steckt
// apexcharts-card im DOM; Ablesen per Tastatur und Touch ändert die Hero-Zahl; „Heute“ im
// Energie-Popup zeigt Tagesbalken mit „Heute“; die Zeilen „Heute“/„Diesen Monat“ schalten das Hero-Diagramm
// auf 7 bzw. 30 Tagessäulen um (Hero-Zahl liest den Tageswert), erneutes Tippen bzw. die Leistung zurück; Klima schaltet Temperatur/Luftfeuchtigkeit um statt
// zweiter y-Achse; die Sparkline erscheint auf der Kachel nur, wenn sie eingeschaltet ist.
// 1.2.1 (gemeldet: Batterie-Popup nicht auf den neuen Graphen umgestellt): im Casora-Look zeigt das
// Batterie-Popup das Diagramm gleich in der Sand-Karte (Etikett innen, niedrigste Batterie gewählt),
// Zeilen schalten es um; Wetter-Diagramm mit Etikett in der Karte; ein Popup ohne Diagramm-Platz
// hängt sein Diagramm nicht mehr ins nächste Popup; Dünger-Säulen mit Etikett; Etiketten 20/18 vom Kartenrand (D1).
// Die Kacheln werden nur im Browser erzeugt (Sensoren aus dem Testhaus), gespeichert wird nichts.
import { open, casoraDashboard, dashboard, check, need, finish, stable, plateLabels } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900 });
await dashboard(page, dash.url, 3);

// Passende Sensoren aus dem Testhaus suchen (keine festen IDs im Repo).
const ids = await page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  const all = Object.keys(S).filter((e) => e.startsWith('sensor.') && isFinite(parseFloat(S[e].state)));
  const by = (dc, f = () => true) => all.find((e) => S[e].attributes.device_class === dc && f(e, parseFloat(S[e].state)));
  return {
    power: by('power', (e, v) => v > 50 && S[e].attributes.state_class === 'measurement'),
    today: by('energy', (e) => /heute|today/.test(e) && S[e].attributes.state_class === 'total_increasing'),
    month: by('energy', (e) => /monat|month/.test(e)),
    dl: by('data_rate', (e) => /download/.test(e)), ul: by('data_rate', (e) => /upload/.test(e)),
    temp: by('temperature', (e) => S[e].attributes.state_class === 'measurement'),
    hum: by('humidity', (e) => S[e].attributes.state_class === 'measurement'),
    plant: Object.keys(S).find((e) => e.startsWith('plant.')),
  };
});
await need('Sensoren im Testhaus (Leistung, Tageszähler, Download/Upload, Temperatur, Feuchte, Pflanze)',
  Object.values(ids).every(Boolean), ids);
// Der Mock schreibt die 30 Tage Statistik erst kurz nach dem Start – bis zu 60 s darauf warten.
let statsOk = false;
for (let i = 0; i < 30 && !statsOk; i++) {
  statsOk = await page.evaluate(async (id) => {
    const r = await document.querySelector('home-assistant').hass.callWS({ type: 'recorder/statistics_during_period',
      start_time: new Date(Date.now() - 3 * 864e5).toISOString(), statistic_ids: [id], period: 'day', types: ['change'] });
    return (r[id] || []).some((x) => x.change > 0);
  }, ids.today).catch(() => false);
  if (!statsOk) await page.waitForTimeout(2000);
}
await need('Tagesstatistik im Testhaus (Mock)', statsOk, ids.today);

// Kachel im Browser erzeugen, antippen, warten bis das Popup offen ist und ein Diagramm gezeichnet hat.
async function popup(cfg) {
  // Esc beendet beim Ablesen nur das Ablesen – das Popup direkt schließen.
  await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
  await page.waitForFunction(() => !window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(async (c) => {
    document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r90').forEach((x) => x.remove());
    const h = await window.loadCardHelpers();
    const el = h.createCardElement(c);
    el.classList.add('qa-r90');
    el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }, cfg);
  await page.waitForTimeout(1500);
  // Mitte der sichtbaren Karte (Badges sind niedriger als der Platz).
  const at = await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r90');
    const r = (el.shadowRoot && el.shadowRoot.querySelector('ha-card') || el).getBoundingClientRect();
    return { x: r.x + Math.min(r.width, 200) / 2, y: r.y + Math.min(r.height, 120) / 2 }; });
  await page.mouse.click(at.x, at.y);
  return stable(page, () => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    if (!pop) return null;
    const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 50);
    return { charts: ch.length, drawn: ch.filter((c) => c.shadowRoot && c.shadowRoot.querySelector('svg path[d^="M"]')).length,
      apex: window.__pierce('apexcharts-card').length };
  }, null, { max: 12000, quiet: 1200 });
}
const chartIn = () => window.__pierce('casora-chart', window.__pierce('casora-popup').find((p) => p.hasAttribute('open')).shadowRoot)
  .find((c) => c.getBoundingClientRect().width > 50);

// Energie: Kurve, Ablesen (Tastatur + Touch) über die Hero-Zahl.
let r = await popup({ type: 'custom:button-card', template: 'casora_energy', entity: ids.power,
  variables: { entity_usage_today: ids.today } });
await check('Energie: casora-chart gezeichnet', r && r.drawn >= 1, r);
await check('Energie: kein apexcharts-card im DOM', r && r.apex === 0, r);
const hero = () => page.evaluate(() => { const n = window.__pierce('[data-casora-read]')[0]; return n ? n.textContent.trim() : null; });
const before = await hero();
await check('Energie: Hero-Zahl liest mit (data-casora-read)', before != null, before);
await page.evaluate((f) => { const c = eval(f)(); c.shadowRoot.querySelector('svg').focus(); }, chartIn.toString());
for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
const byKey = await hero();
await check('Energie: Pfeiltaste ändert die Hero-Zahl', byKey && byKey !== before, [before, byKey]);
const when = await page.evaluate(() => { const n = window.__pierce('[data-casora-read-when]')[0]; return n ? n.textContent : ''; });
await check('Energie: Zeit beim Ablesen („Heute, … Uhr“ bzw. Wochentag)', /Uhr|\d:\d\d/.test(when), when);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await check('Energie: Esc stellt die Hero-Zahl wieder her', await hero() === before, await hero());
const touched = await page.evaluate((f) => {
  const svg = eval(f)().shadowRoot.querySelector('svg'), b = svg.getBoundingClientRect();
  const ev = (t, x) => svg.dispatchEvent(new PointerEvent(t, { pointerType: 'touch', clientX: x, clientY: b.y + b.height / 2, bubbles: true, buttons: 1 }));
  ev('pointerdown', b.x + b.width * 0.2); ev('pointerleave', b.x + b.width * 0.2);
  const n = window.__pierce('[data-casora-read]')[0];
  return n ? n.textContent.trim() : null;
}, chartIn.toString());
await check('Energie: Touch liest ab und bleibt nach dem Loslassen stehen', touched && touched !== before, [before, touched]);
const aria = await page.evaluate((f) => { const s = eval(f)().shadowRoot.querySelector('svg'); return [s.getAttribute('role'), s.getAttribute('aria-label'), s.getAttribute('tabindex'), getComputedStyle(s).touchAction]; }, chartIn.toString());
await check('Energie: role=img, aria-label, Tab-Stopp, touch-action pan-y', aria[0] === 'img' && aria[1] && aria[2] === '0' && aria[3] === 'pan-y', aria);

// Energie: „Heute“ → 7 Tagessäulen, „Diesen Monat“ → 30, erneutes Tippen bzw. die Leistung → Kurve.
r = await popup({ type: 'custom:button-card', template: 'casora_energy', entity: ids.power,
  variables: { entity_usage_today: ids.today, entity_usage_month: ids.month } });
await check('Energie (Heute + Monat): Popup mit Diagramm', r && r.drawn >= 1, r);
// want(v): erwartetes Ergebnis – dann bis zu 20 s darauf warten. Die Tagesstatistik kommt per WebSocket
// nach; unter Last war das Diagramm nach 1,2 s Ruhe noch nicht umgestellt (09.10.2026).
const tapMetric = async (eid, want) => {
  const at = await page.evaluate((eid) => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    const row = pop && window.__pierce('[data-hp-metric="' + eid + '"]', pop.shadowRoot)[0];
    if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    const b = row.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, eid);
  if (!at) return null;
  await page.waitForTimeout(300);
  await page.mouse.click(at.x, at.y);
  const read = () => stable(page, (f) => {
    const c = eval(f)();
    if (!c || !c.shadowRoot || !c._c) return null;
    const svg = c.shadowRoot.querySelector('svg');
    return { kind: c._c.kind, span: c._c.span, bars: c.shadowRoot.querySelectorAll('path[d*="Q"]').length,
      heute: [...c.shadowRoot.querySelectorAll('text')].some((t) => t.textContent === 'Heute'),
      label: svg && svg.getAttribute('aria-label') };
  }, chartIn.toString(), { max: 10000, quiet: 1200 });
  let v = await read();
  for (const t0 = Date.now(); want && !(v && want(v)) && Date.now() - t0 < 20000;) { await page.waitForTimeout(500); v = await read(); }
  return v;
};
let t = await tapMetric(ids.today, (v) => v.kind === 'bar' && v.bars >= 6 && v.heute);
await check('Energie: „Heute“ antippen → 7 Tagessäulen mit „Heute“', t && t.kind === 'bar' && t.span === '7d' && t.bars >= 6 && t.bars <= 7 && t.heute, t);
const hero0 = await hero();
await page.evaluate((f) => eval(f)().shadowRoot.querySelector('svg').focus(), chartIn.toString());
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
const heroDay = await hero();
const whenDay = await page.evaluate(() => { const n = window.__pierce('[data-casora-read-when]')[0]; return n ? n.textContent : ''; });
await check('Energie: Säulen ablesen → Hero-Zahl zeigt den Tageswert (kWh, Datum)', heroDay && /kWh/.test(heroDay) && heroDay !== hero0
  && /Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag/.test(whenDay), [hero0, heroDay, whenDay]);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
t = await tapMetric(ids.month, (v) => v.kind === 'bar' && v.span === '30d' && v.bars >= 28);
await check('Energie: „Diesen Monat“ antippen → 30 Tagessäulen', t && t.kind === 'bar' && t.span === '30d' && t.bars >= 28 && t.bars <= 30, t);
t = await tapMetric(ids.month);
await check('Energie: „Diesen Monat“ erneut antippen → zurück auf die Leistungskurve', t && t.kind === 'line' && t.bars === 0, t);
await tapMetric(ids.today);
t = await tapMetric(ids.power);
await check('Energie: Leistung antippen → zurück auf die Leistungskurve', t && t.kind === 'line', t);
// Tagesverbrauch (Geräte-Popups „Verbrauch pro Tag“, Energie „Heute“): _hpBarCfg aus 01-basis.js.
await page.evaluate(async (today) => {
  const h = await window.loadCardHelpers();
  const el = h.createCardElement(window._hpBarCfg('qa:' + today, today, 'Verbrauch pro Tag', '7d'));
  el.classList.add('qa-r90b'); el.hass = document.querySelector('home-assistant').hass;
  el.style.cssText = 'position:fixed;left:380px;top:120px;width:600px;z-index:99999;background:#fff;';
  document.querySelector('home-assistant').shadowRoot.appendChild(el);
}, ids.today);
const bar = await stable(page, () => {
  const c = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r90b');
  if (!c || !c.shadowRoot) return null;
  const t = [...c.shadowRoot.querySelectorAll('text')].map((x) => x.textContent);
  const n = c.shadowRoot.querySelectorAll('path[d*="Q"]').length;
  // Erst zählen, wenn die Statistik da ist (vorher kurz ohne Säulen).
  return n ? { bars: n, heute: t.includes('Heute'), avg: t.includes('Ø'), wd: t.filter((x) => /^(Mo|Di|Mi|Do|Fr|Sa|So)$/.test(x)).length } : null;
}, null, { max: 10000, quiet: 1000 });
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r90b').forEach((x) => x.remove()));
await check('Tagesverbrauch: Säulen mit „Heute“, deutschen Wochentagen und Ø-Linie', bar && bar.bars >= 3 && bar.heute && bar.avg && bar.wd >= 5, bar);

// Netzwerk: zwei Reihen auf einer Skala, Legende liest mit.
r = await popup({ type: 'custom:button-card', template: 'casora_network', entity: ids.dl, variables: { entity_download: ids.dl, entity_upload: ids.ul } });
await check('Netzwerk: casora-chart gezeichnet, kein apexcharts-card', r && r.drawn >= 1 && r.apex === 0, r);

// Klima: Umschalter statt zweiter Achse.
r = await popup({ type: 'custom:button-card', template: 'casora_badge_temp', entity: ids.temp, variables: { entity_temp: ids.temp, entity_humidity: ids.hum } });
await check('Klima: casora-chart gezeichnet, kein apexcharts-card', r && r.drawn >= 1 && r.apex === 0, r);
const sw = await page.evaluate((f) => {
  const c = eval(f)(); const b = c && [...c.shadowRoot.querySelectorAll('.sw button')];
  if (!b || b.length !== 2) return { n: b ? b.length : 0 };
  const a0 = c.shadowRoot.querySelector('svg').getAttribute('aria-label');
  b[1].click();
  const a1 = c.shadowRoot.querySelector('svg').getAttribute('aria-label');
  return { n: 2, a0, a1, sel: c.shadowRoot.querySelectorAll('.sw button')[1].getAttribute('aria-selected') };
}, chartIn.toString());
await check('Klima: Umschalter Temperatur/Luftfeuchtigkeit wechselt die Kurve', sw.n === 2 && sw.a0 !== sw.a1 && sw.sel === 'true', sw);

// Pflanze.
r = await popup({ type: 'custom:button-card', template: 'casora_plant', entity: ids.plant });
await check('Pflanze: casora-chart gezeichnet, kein apexcharts-card', r && r.drawn >= 1 && r.apex === 0, r);
await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
await page.waitForTimeout(600);

// Sparkline nur, wenn eingeschaltet; neutral (D9) und nur Desktop/Tablet (D3).
const spark = async (on) => {
  await page.evaluate(async ([p, on]) => {
    document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r90').forEach((x) => x.remove());
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_energy', entity: p, variables: { sparkline: on } });
    el.classList.add('qa-r90'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }, [ids.power, on]);
  return stable(page, () => {
    const t = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r90');
    const c = t && window.__pierce('casora-chart', t.shadowRoot).find((x) => x.getBoundingClientRect().width > 10);
    const path = c && c.shadowRoot.querySelector('svg path[d^="M"]');
    // D9 (1.2): Linie neutral (--casora-chart-spark, sonst gedeckter Text-Ton), nicht in einer Serienfarbe.
    let ink = null, teal = null;
    if (c) {
      const q = document.createElement('i'); c.shadowRoot.appendChild(q);
      q.style.color = 'var(--casora-chart-spark, var(--cink3))'; ink = getComputedStyle(q).color;
      q.style.color = 'var(--cc3)'; teal = getComputedStyle(q).color; q.remove();
    }
    return { visible: !!c, line: !!path, stroke: path ? getComputedStyle(path).stroke : null, ink, teal };
  }, null, { max: 10000, quiet: 1500 });
};
const off = await spark(false);
await check('Sparkline: ausgeschaltet (Standard) keine Linie auf der Kachel', off && !off.visible, off);
const on = await spark(true);
await check('Sparkline: eingeschaltet Linie auf der Kachel', on && on.visible && on.line, on);
await check('Sparkline: Linie neutral im gedeckten Text-Ton, nicht in Serienfarbe (D9)', on && on.stroke === on.ink && on.stroke !== on.teal, on);
// D3 (1.2): In der Handy-Pillen-Kachel keine Sparkline (lief über Name und Zustand), nur Desktop/Tablet.
await page.setViewportSize({ width: 393, height: 852 });
await page.waitForTimeout(600);
const phoneSpark = await spark(true);
await check('Sparkline: am Handy (Pillen-Kachel) ausgeblendet (D3)', phoneSpark && !phoneSpark.visible, phoneSpark);
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r90').forEach((x) => x.remove()));

// ── Casora-Look (Weich): Batterie, Wetter, Dünger ────────────────────────────
const soft = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
await dashboard(soft.page, dash.url, 3);
const P = soft.page;
async function popupIn(pg, cfg) {
  await pg.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
  await pg.waitForTimeout(500);
  await pg.evaluate(async (c) => {
    document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r90').forEach((x) => x.remove());
    const h = await window.loadCardHelpers();
    const el = h.createCardElement(c);
    el.classList.add('qa-r90'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }, cfg);
  await pg.waitForTimeout(1500);
  const at = await pg.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r90');
    const r = (el.shadowRoot && el.shadowRoot.querySelector('ha-card') || el).getBoundingClientRect();
    return { x: r.x + Math.min(r.width, 200) / 2, y: r.y + Math.min(r.height, 120) / 2 }; });
  await pg.mouse.click(at.x, at.y);
}
// Diagramm im offenen Popup: Serie, Etikett, Sand-Karte (Vorfahr mit Fläche und Radius), gewählte Zeile.
const look = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const c = window.__pierce('casora-chart', pop.shadowRoot).find((x) => x.getBoundingClientRect().width > 50);
  if (!c || !c._c || !c.shadowRoot.querySelector('svg')) return null;
  let n = c, plate = false, label = null;
  for (let i = 0; i < 6 && n && !plate; i++) {
    n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
    if (!n) break;
    const st = getComputedStyle(n);
    if (st.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(st.borderTopLeftRadius) > 0) {
      plate = true;
      const ct = n.querySelector('.hp-ct');
      if (ct) label = { t: ct.textContent.trim(), tt: getComputedStyle(ct).textTransform, fw: getComputedStyle(ct).fontWeight };
    }
  }
  const sel = window.__pierce('[data-hp-metric].hp-sel', pop.shadowRoot).map((r) => r.dataset.hpMetric);
  return { entity: c._c.series[0] && c._c.series[0].entity, plate, label, sel, rows: window.__pierce('[data-hp-metric]', pop.shadowRoot).length,
    ro: !!c.shadowRoot.querySelector('.ro'), apex: window.__pierce('apexcharts-card').length };
};
const bat = await P.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).filter((e) => S[e].attributes.device_class === 'battery' && isFinite(parseFloat(S[e].state)))
    .sort((a, b) => parseFloat(S[a].state) - parseFloat(S[b].state));
});
await need('Batterie-Sensoren im Testhaus', bat.length >= 2, bat.length);
await popupIn(P, { type: 'custom:button-card', template: 'casora_battery', entity: bat[0] });
let b1 = await stable(P, look, null, { max: 12000, quiet: 1200 });
await check('Batterie (Casora-Look): casora-chart gleich sichtbar, in der Sand-Karte, kein apexcharts-card', b1 && b1.plate && b1.apex === 0, b1);
await check('Batterie (Casora-Look): Etikett innen (Versalien, 700) mit Zeitraum, „Jetzt“-Zeile', b1 && b1.label && /30 Tage/.test(b1.label.t)
  && b1.label.tt === 'uppercase' && b1.label.fw === '700' && b1.ro, b1);
{ const L = (await plateLabels(P)).find((l) => /30 Tage/.test(l.t));
  await check('Batterie (Casora-Look): Etikett 20/18 vom Rand der Sand-Karte (D1)', L && L.dx === 20 && L.dy === 18, L); }
await check('Batterie (Casora-Look): niedrigste Batterie gewählt und hinterlegt', b1 && b1.sel.length === 1 && b1.sel[0] === b1.entity, b1);
const other = await P.evaluate((cur) => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const row = window.__pierce('[data-hp-metric]', pop.shadowRoot).find((r) => r.dataset.hpMetric !== cur && r.getBoundingClientRect().height > 0);
  if (!row) return null;
  row.scrollIntoView({ block: 'center' });
  const r = row.getBoundingClientRect();
  return { id: row.dataset.hpMetric, x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, b1 && b1.entity);
if (other) { await P.waitForTimeout(300); await P.mouse.click(other.x, other.y); }
const b2 = await stable(P, look, null, { max: 8000, quiet: 1000 });
await check('Batterie (Casora-Look): Zeile antippen schaltet Diagramm, Etikett und Hinterlegung um', other && b2 && b2.entity === other.id
  && b2.sel.length === 1 && b2.sel[0] === other.id && b2.label && b2.label.t !== b1.label.t, [other, b2]);

// Ein Popup, dessen Diagramm keinen Platz bekommt (Geräte im Casora-Look), darf sein Diagramm nicht ins nächste hängen.
const weather = await P.evaluate((pw) => {
  const S = document.querySelector('home-assistant').hass.states;
  window._hpChartCfg(pw, 'Leistung', '24h', '#FF9F0A', 150);
  window._hpChartInit(pw);
  return Object.keys(S).find((e) => e.startsWith('weather.'));
}, ids.power);
await popupIn(P, { type: 'custom:button-card', template: 'casora_weather', entity: weather });
const w = await stable(P, look, null, { max: 12000, quiet: 1500 });
await check('Wetter (Casora-Look): Diagramm mit Etikett in der Sand-Karte, kein fremdes Diagramm aus dem vorigen Popup',
  w && w.plate && w.label && !/Leistung/.test(w.label.t) && w.entity !== ids.power && w.label.tt === 'uppercase', w);
{ const L = (await plateLabels(P)).find((l) => /48 Stunden/.test(l.t));
  await check('Wetter (Casora-Look): Etikett 20/18 vom Rand der Sand-Karte (D1)', L && L.dx === 20 && L.dy === 18, L); }

// Dünger: Säulen mit Etikett in der eigenen Karte (casora-chart title + plate).
await P.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
await P.waitForTimeout(500);
await P.evaluate((t) => window._casoraAqDoseOpen({ vol: 'input_number.qa_r90_dose', btn: 'button.qa_r90_dose', today: t, label: 'Dünger' }), ids.today);
const dz = await stable(P, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const c = pop && window.__pierce('casora-chart', pop.shadowRoot).find((x) => x.getBoundingClientRect().width > 50);
  const tt = c && c.shadowRoot.querySelector('.tt');
  return c ? { plate: c.hasAttribute('plate'), title: tt ? tt.textContent : null, tt: tt ? getComputedStyle(tt).textTransform : null } : null;
}, null, { max: 8000, quiet: 1000 });
await check('Dünger (Casora-Look): Säulen in der Karte mit Etikett „Dosiert · 7 Tage“', dz && dz.plate && dz.title === 'Dosiert · 7 Tage' && dz.tt === 'uppercase', dz);
{ const L = (await plateLabels(P)).find((l) => /^Dosiert/.test(l.t));
  await check('Dünger (Casora-Look): Etikett 20/18 vom Rand der Sand-Karte (D1)', L && L.dx === 20 && L.dy === 18, L); }
await finish();
