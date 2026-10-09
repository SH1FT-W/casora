// @zustand: arbeit
// @parallel: ui
// Gemeldet (1.2.1): Im Energie-Popup „blinkt“ der Energiefluss die ganze Zeit, solange das Popup offen
// ist. Ursache: jede neue Leistung baute den ganzen Fluss als HTML neu (Kreise, Symbole, SVG, laufende
// Punkte) – die Symbole luden neu, die Animation startete neu.
// Erwartet: Popup 10 s offen, Leistungen ändern sich jede Sekunde – die Knoten des Flusses (Kreise,
// Symbole, Linien) bleiben dieselben Elemente, keine Fluss-Animation startet neu, die Werte stimmen.
// Die Sensoren werden nur im Browser untergeschoben (erfundene IDs), gespeichert wird nichts.
// Ab 1.2.1 zeigt das Weich-Design (Theme Casora) den Fluss als ruhige Balken (Entwurf B, ohne Animation):
// dort bleiben Karte, Balken-Teile und Symbol dieselben Elemente, nur Texte, Breiten und Sichtbarkeit
// ändern sich, und die Anteile ergeben zusammen 100 %. Standard/Glas: Kreis-Fluss wie bisher.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900 });
await dashboard(page, dash.url, 3);

const ID = {
  home: 'sensor.qa_r96_haus', solar: 'sensor.qa_r96_solar', soc: 'sensor.qa_r96_akku', grid: 'sensor.qa_r96_netz',
  chg: 'sensor.qa_r96_laden', dis: 'sensor.qa_r96_entladen', out: 'sensor.qa_r96_ausgang', exp: 'sensor.qa_r96_einspeisung',
};
const W = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
const werte = (i) => ({
  [ID.home]: { state: String(420 + i * 37), attributes: { ...W, friendly_name: 'Haus' } },
  [ID.solar]: { state: String(900 + i * 53), attributes: { ...W, friendly_name: 'Solar' } },
  [ID.soc]: { state: String(60 + (i % 5)), attributes: { unit_of_measurement: '%', device_class: 'battery', friendly_name: 'Akku' } },
  [ID.grid]: { state: String(30 + i * 11), attributes: { ...W, friendly_name: 'Netz' } },
  [ID.chg]: { state: String(300 + i * 13), attributes: { ...W, friendly_name: 'Laden' } },
  [ID.dis]: { state: '0', attributes: { ...W, friendly_name: 'Entladen' } },
  [ID.out]: { state: String(600 + i * 40), attributes: { ...W, friendly_name: 'Ausgang' } },
  [ID.exp]: { state: '0', attributes: { ...W, friendly_name: 'Einspeisung' } },
});
await fakeStates(page, werte(0), { sticky: true });

// Energie-Kachel mit Solar im Browser erzeugen und antippen.
await page.evaluate(async (I) => {
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_energy', entity: I.home,
    variables: { entity_solar_power: I.solar, entity_battery_soc: I.soc, entity_netz_power: I.grid,
      entity_battery_charge: I.chg, entity_battery_discharge: I.dis, entity_solarbank_output: I.out, entity_grid_export: I.exp } });
  el.classList.add('qa-r96');
  el.hass = document.querySelector('home-assistant').hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99999;';
  document.querySelector('home-assistant').shadowRoot.appendChild(el);
}, ID);
await page.waitForTimeout(1500);
const at = await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r96');
  const r = (el.shadowRoot && el.shadowRoot.querySelector('ha-card') || el).getBoundingClientRect();
  return { x: r.x + Math.min(r.width, 200) / 2, y: r.y + Math.min(r.height, 120) / 2 }; });
await page.mouse.click(at.x, at.y);

// Den Fluss im offenen Popup finden: Balken-Karte (B) oder das SVG mit den Flusslinien.
const FIND = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const b = window.__pierce('[data-casora-kind="b"]', pop.shadowRoot)[0];
  if (b) return b;
  const svg = window.__pierce('svg', pop.shadowRoot).find((s) => s.querySelector('path.hpf') || s.getAttribute('data-casora-flow') != null);
  return svg ? svg.parentElement : null;
};
const da = await stable(page, (f) => { const box = new Function('return (' + f + ')()')(); return box ? (box.dataset.casoraKind === 'b' ? 10 : box.querySelectorAll('ha-icon').length) : 0; },
  FIND.toString(), { max: 12000, quiet: 1200 });
await need('Energiefluss im Popup', da >= 4, da);
const B = await page.evaluate((f) => { const box = new Function('return (' + f + ')()')(); return box.dataset.casoraKind === 'b'; }, FIND.toString());
console.log('Ansicht', B ? 'Balken (B)' : 'Kreis-Fluss');

// Beobachten: Knoten merken, Mutationen zählen, Animationen merken.
await page.evaluate((f) => {
  const box = new Function('return (' + f + ')()')();
  const Q = window.__qa96 = { box, icons: [...box.querySelectorAll('ha-icon')], svg: box.querySelector('svg') || box.querySelector('[data-seg]'),
    segs: [...box.querySelectorAll('[data-seg], [data-leg]')],
    added: 0, removed: 0, anims: [], restarts: 0 };
  const root = box.getRootNode();
  Q.obs = new MutationObserver((ms) => ms.forEach((m) => { const el = (l) => [...l].filter((n) => n.nodeType === 1).length; Q.added += el(m.addedNodes); Q.removed += el(m.removedNodes); }));
  Q.obs.observe(root, { childList: true, subtree: true });
  Q.host = root.host;
  const find = new Function('return (' + f + ')()');
  const anims = () => { const b = find(); return b ? [...b.querySelectorAll('.hpf')].flatMap((p) => p.getAnimations()) : []; };
  Q.anims = anims();
  Q.tick = setInterval(() => { anims().forEach((a) => { if (!Q.anims.includes(a)) { Q.restarts++; Q.anims.push(a); } }); }, 100);
}, FIND.toString());

for (let i = 1; i <= 10; i++) {
  await fakeStates(page, werte(i), { sticky: true });
  await page.waitForTimeout(1000);
}

const r = await page.evaluate((f) => {
  const Q = window.__qa96; clearInterval(Q.tick); Q.obs.disconnect();
  const box = new Function('return (' + f + ')()')();
  const text = box ? box.textContent.replace(/\s+/g, ' ') : '';
  return { sameHost: !!box && box.getRootNode().host === Q.host, sameBox: box === Q.box, sameSvg: !!box && box.querySelector('svg') === Q.svg,
    sameIcons: !!box && [...box.querySelectorAll('ha-icon')].every((x, i) => x === Q.icons[i]) && Q.icons.every((x) => x.isConnected),
    sameSegs: !!box && Q.segs.every((x) => x.isConnected && box.contains(x)),
    sameSvg2: !!box && (box.querySelector('svg') || box.querySelector('[data-seg]')) === Q.svg,
    added: Q.added, removed: Q.removed, restarts: Q.restarts, anims: Q.anims.length, text: text.slice(0, 200) };
}, FIND.toString());
console.log(JSON.stringify(r));
check('Fluss-Element bleibt dasselbe', r.sameBox, r);
check(B ? 'Balken-Teile bleiben dieselben' : 'SVG bleibt dasselbe', B ? r.sameSvg2 && r.sameSegs : r.sameSvg, r);
check('Symbole bleiben dieselben (kein Neuladen)', r.sameIcons, r);
if (B) check('Balken ohne Animation', r.anims === 0 && r.restarts === 0, r);
else check('keine Fluss-Animation startet neu', r.anims > 0 && r.restarts === 0, r);
check('keine Elemente ersetzt (nur Texte)', r.added === 0 && r.removed === 0, r);
// Letzter Stand: Haus 420 + 10·37 = 790 W, Solar 900 + 530 = 1,4 kW, Akku 60 %.
check('Werte aktualisieren sich', /790 W/.test(r.text) && /1[,.]4 kW/.test(r.text) && /60 %/.test(r.text), r.text);

// Umschalten auf Einspeisung: Netz-Knoten weicht dem Einspeise-Knoten (B: Netz-Anteil weg, Einspeise-Anteil da), ohne Neuaufbau.
await fakeStates(page, { ...werte(10), [ID.exp]: { state: '350', attributes: { ...W } }, [ID.grid]: { state: '0', attributes: { ...W } } }, { sticky: true });
await page.waitForTimeout(800);
const e = await page.evaluate((f) => {
  const box = new Function('return (' + f + ')()')();
  const vis = (s) => { const n = box.querySelector(s); return !!n && n.style.display !== 'none'; };
  const pct = (k) => [...box.querySelectorAll('[data-b="' + k + '-leg"] [data-leg]')].filter((n) => n.style.display !== 'none')
    .reduce((s, n) => s + parseInt(n.querySelector('[data-p]').textContent, 10), 0);
  return box.dataset.casoraKind === 'b'
    ? { same: box === window.__qa96.box, exp: vis('[data-b="to-leg"] [data-leg="exp"]'), grid: vis('[data-b="from-leg"] [data-leg="netz"]'),
      from: pct('from'), to: pct('to'), text: box.textContent,
      // Sichtbar gezeichnet (Woher: Solar; Wohin: Haus, Akku, Einspeisung): jedes eingeblendete Balkenstück hat Breite und Höhe, die Legende steht in einer Zeile.
      segs: [...box.querySelectorAll('[data-seg]')].filter((n) => n.style.display !== 'none').map((n) => { const r = n.getBoundingClientRect(); return Math.min(r.width, r.height); }),
      legFlex: getComputedStyle(box.querySelector('[data-b="to-leg"]')).display === 'flex' && getComputedStyle(box.querySelector('[data-b="from-bar"]')).display === 'flex' }
    : { same: box === window.__qa96.box, exp: vis('[data-fn="exp"]'), grid: vis('[data-fn="grid"]'), text: box.textContent };
}, FIND.toString());
check('Einspeisung: Knoten wechselt ohne Neuaufbau', e.same && e.exp && !e.grid && /350 W/.test(e.text), e);
if (B) check('Anteile ergeben je Balken 100 %', e.from === 100 && e.to === 100, e);
if (B) check('Balken sichtbar gezeichnet', e.legFlex && e.segs.length === 4 && e.segs.every((x) => x >= 8), { segs: e.segs, legFlex: e.legFlex });

if (B) {
  // Abend: Solar aus – kein „Wohin Solar“-Balken, nur der ruhige Hinweis; Akku entlädt. Ohne Neuaufbau.
  await fakeStates(page, { ...werte(10), [ID.solar]: { state: '0', attributes: { ...W } }, [ID.out]: { state: '380', attributes: { ...W } },
    [ID.chg]: { state: '0', attributes: { ...W } }, [ID.dis]: { state: '380', attributes: { ...W } }, [ID.grid]: { state: '230', attributes: { ...W } },
    [ID.exp]: { state: '0', attributes: { ...W } }, [ID.home]: { state: '610', attributes: { ...W } } }, { sticky: true });
  await page.waitForTimeout(800);
  const a = await page.evaluate((f) => {
    const box = new Function('return (' + f + ')()')();
    const vis = (s) => { const n = box.querySelector(s); return !!n && n.style.display !== 'none' && n.getBoundingClientRect().height > 0; };
    return { same: box === window.__qa96.box, toBar: vis('[data-b="to-bar"]'), hint: vis('[data-b="to-hint"]'),
      hintText: box.querySelector('[data-b="to-hint"]').textContent, akku: box.querySelector('[data-b="akkusub"]').textContent,
      from: [...box.querySelectorAll('[data-b="from-leg"] [data-leg]')].filter((n) => n.style.display !== 'none').map((n) => n.textContent.replace(/\s+/g, ' ').trim()) };
  }, FIND.toString());
  console.log(JSON.stringify(a));
  check('Solar aus: kein Solar-Balken, ruhiger Hinweis', a.same && !a.toBar && a.hint && a.hintText.length > 0, a);
  check('Abend: Akku entlädt, Woher Akku 62 % + Netz 38 %', /62 %/.test(a.from.join('|')) && /38 %/.test(a.from.join('|')) && a.from.length === 2, a);
}
await finish();
