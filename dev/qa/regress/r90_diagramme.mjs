// @zustand: arbeit
// @parallel: ui
// Casora 1.2: eigene Diagramm-Karte casora-chart statt apexcharts-card. Jedes umgestellte Popup
// (Energie, Netzwerk, Klima, Pflanze) zeigt casora-chart mit gezeichneter Kurve, nirgends steckt
// apexcharts-card im DOM; Ablesen per Tastatur und Touch ändert die Hero-Zahl; „Heute“ im
// Energie-Popup zeigt Tagesbalken mit „Heute“; Klima schaltet Temperatur/Luftfeuchtigkeit um statt
// zweiter y-Achse; die Sparkline erscheint auf der Kachel nur, wenn sie eingeschaltet ist.
// Die Kacheln werden nur im Browser erzeugt (Sensoren aus dem Testhaus), gespeichert wird nichts.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

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
    dl: by('data_rate', (e) => /download/.test(e)), ul: by('data_rate', (e) => /upload/.test(e)),
    temp: by('temperature', (e) => S[e].attributes.state_class === 'measurement'),
    hum: by('humidity', (e) => S[e].attributes.state_class === 'measurement'),
    plant: Object.keys(S).find((e) => e.startsWith('plant.')),
  };
});
await need('Sensoren im Testhaus (Leistung, Tageszähler, Download/Upload, Temperatur, Feuchte, Pflanze)',
  Object.values(ids).every(Boolean), ids);

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
  return { bars: c.shadowRoot.querySelectorAll('path[d*="Q"]').length, heute: t.includes('Heute'), avg: t.includes('Ø'), wd: t.filter((x) => /^(Mo|Di|Mi|Do|Fr|Sa|So)$/.test(x)).length };
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

// Sparkline nur, wenn eingeschaltet.
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
    return { visible: !!c, line: !!(c && c.shadowRoot.querySelector('svg path[d^="M"]')) };
  }, null, { max: 10000, quiet: 1500 });
};
const off = await spark(false);
await check('Sparkline: ausgeschaltet (Standard) keine Linie auf der Kachel', off && !off.visible, off);
const on = await spark(true);
await check('Sparkline: eingeschaltet Linie auf der Kachel', on && on.visible && on.line, on);
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r90').forEach((x) => x.remove()));
await finish();
