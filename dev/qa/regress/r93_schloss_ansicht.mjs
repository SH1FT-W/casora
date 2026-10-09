// @zustand: arbeit
// @parallel: ui
// Neu (Casora 1.2, Entwurf A): Im Schloss-Popup (Casora-Look) öffnet die Geräte-Zeile eine eigene Ansicht im
// selben Popup statt HAs Dialog: Ring + Name, Statuszeile „Verriegelt · seit … · Automatisch“, BEDIENEN
// (Entriegeln/Verriegeln mit der Rückfrage aus dem Studio, „Tür öffnen“ nur mit OPEN), ZUSTAND (Schloss,
// Tür, Batterie), VERLAUF · Heute mit Auslöser aus dem Logbuch-Kontext (Automation, Skript, Person per App,
// „Am Schloss“ – nach „Offline“ ohne Auslöser), „Ganzer Verlauf“, Zurück-Pfeil. Mehrere Schlösser: jede
// Zeile ihre eigene Ansicht. Handy einspaltig. Standard-Look: weiter HAs Dialog.
// Zustände, Logbuch-Antwort und Dienstaufrufe werden nur im Browser untergeschoben bzw. abgefangen.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('ein Casora-Dashboard', dash);

const A = 'lock.qa_wohnungstur', B2 = 'lock.qa_haustur';
const FAKE = {
  [A]: { state: 'locked', attributes: { friendly_name: 'Wohnungstür', supported_features: 1 } },
  [B2]: { state: 'unlocked', attributes: { friendly_name: 'Haustür', supported_features: 0 } },
  'sensor.qa_wohnungstur_batterie': { state: '82', attributes: { friendly_name: 'Wohnungstür Batterie', unit_of_measurement: '%', device_class: 'battery' } },
  'binary_sensor.qa_wohnungstur_kontakt': { state: 'off', attributes: { friendly_name: 'Wohnungstür Kontakt', device_class: 'door' } },
  'person.qa_anna': { state: 'home', attributes: { friendly_name: 'Anna', user_id: 'qa-user-anna' } },
};

async function setup(opts) {
  const { page } = await open(opts);
  usePage(page);
  await dashboard(page, dash.url, 3);
  await fakeStates(page, FAKE, { sticky: true });
  await page.evaluate(({ A }) => {
    // Logbuch: feste Einträge (heute zwischen Mitternacht und jetzt), Dienstaufrufe nur mitschreiben.
    const ha = document.querySelector('home-assistant');
    const conn = ha.hass.connection;
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const at = (f) => (d0.getTime() + (Date.now() - d0.getTime()) * f) / 1000;
    const self = { context_entity_id: A, context_state: 'unlocking' };
    const LOG = [
      { when: d0.getTime() / 1000 - 3600, state: 'locked' },
      { when: at(0.2), state: 'unlocking', context_user_id: 'qa-user-anna' },
      { when: at(0.2) + 4, state: 'unlocked', context_user_id: 'qa-user-anna', ...self },
      { when: at(0.3), state: 'open', context_event_type: 'script_started', context_domain: 'script', context_name: 'Paketbote', context_entity_id: 'script.paketbote' },
      { when: at(0.4), state: 'locked' },
      { when: at(0.6), state: 'unavailable' },
      { when: at(0.62), state: 'locked' },
      { when: at(0.7), state: 'unlocked' },
      { when: at(0.9), state: 'locked', context_event_type: 'automation_triggered', context_domain: 'automation', context_name: 'Gute Nacht', context_entity_id: 'automation.gute_nacht' },
    ].map((e) => ({ entity_id: A, ...e }));
    window.__qaCalls = []; window.__qaLog = 0; window.__qaMoreInfo = 0;
    const orig = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => {
      if (m && m.type === 'logbook/get_events') { window.__qaLog++; return Promise.resolve((m.entity_ids || []).includes(A) ? LOG : []); }
      if (m && m.type === 'call_service' && m.domain === 'lock') { window.__qaCalls.push(m.service + ':' + JSON.stringify(m.service_data || m.target)); return Promise.resolve({ context: { id: 'qa' } }); }
      return orig(m);
    };
    window.addEventListener('hass-more-info', () => { window.__qaMoreInfo++; }, true);
    // „Vor dem Schalten fragen“ für die Wohnungstür (wie im Studio gesetzt).
    Object.defineProperty(window, '__casoraConfirmIds', { configurable: true, get: () => [A], set: () => {} });
  }, { A });
  // Schloss-Badge mit beiden Schlössern, Akku und Türkontakt (wie im Raum zugeordnet) – nur im Browser.
  await page.evaluate(({ A, B2 }) => {
    return window.loadCardHelpers().then((h) => {
      const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_badge_lock_group', entity: A,
        variables: { locks: [A, B2], battery_entities: { [A]: 'sensor.qa_wohnungstur_batterie' },
          door_sensors: { [A]: 'binary_sensor.qa_wohnungstur_kontakt' }, enabled: true } });
      el.classList.add('qa-lk'); el.hass = document.querySelector('home-assistant').hass;
      el.style.cssText = 'position:fixed;left:40px;top:300px;width:220px;height:60px;z-index:99999;';
      document.querySelector('home-assistant').shadowRoot.appendChild(el);
    });
  }, { A, B2 });
  await page.waitForTimeout(1500);
  return page;
}
const tap = async (page, mobile, x, y) => { if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
const openPopup = async (page, mobile) => {
  const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-lk').getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; });
  await tap(page, mobile, at.x, at.y);
  await page.waitForTimeout(2000);
};
const rowAt = (page, id) => page.evaluate((id) => {
  const pop = window.casoraPopup && window.casoraPopup.element;
  const r = pop && window.__pierce('[data-casora-mi="' + id + '"]', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0);
  if (!r) return null;
  r.scrollIntoView({ block: 'center' });
  const b = r.getBoundingClientRect(); return { x: b.x + 60, y: b.y + b.height / 2 };
}, id);
const view = (page) => page.evaluate(() => {
  const pop = window.casoraPopup && window.casoraPopup.element;
  if (!pop || !pop.hasAttribute('open')) return { open: false };
  const sr = pop.shadowRoot, v = sr.querySelector('.casora-lock-view');
  const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
  const vis = (e) => !!e && e.getBoundingClientRect().height > 0;
  const back = sr.querySelector('.casora-lock-back');
  const L = v && v.querySelector('.csl-left'), R = v && v.querySelector('.csl-right');
  return { open: true, view: !!v, title: txt(sr.querySelector('.header-title')), line: txt(v && v.querySelector('.csl-line')),
    back: vis(back), backAt: back ? (() => { const b = back.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })() : null,
    btns: v ? [...v.querySelectorAll('.csl-btn')].map((b) => ({ t: txt(b), svc: b.dataset.cslSvc || null })) : [],
    ask: !!(v && v.querySelector('.csl-ask')),
    zustand: v ? [...v.querySelectorAll('.csl-zustand .hui-srow')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()) : [],
    ev: v ? [...v.querySelectorAll('.csl-ev')].map((e) => ({ act: txt(e.querySelector('.csl-act')), trig: txt(e.querySelector('.csl-trig')) })) : [],
    more: vis(v && v.querySelector('.csl-more')),
    cols: !!(v && v.querySelector('.csl-cols')),
    lr: L && R ? { lx: Math.round(L.getBoundingClientRect().x), rx: Math.round(R.getBoundingClientRect().x), lb: Math.round(L.getBoundingClientRect().bottom), rt: Math.round(R.getBoundingClientRect().top) } : null,
    rowsVisible: window.__pierce('[data-casora-mi]', sr).filter(vis).length,
    pageW: document.documentElement.scrollWidth, winW: window.innerWidth,
    moreInfo: window.__qaMoreInfo, log: window.__qaLog, calls: window.__qaCalls };
});
const btnAt = (page, svc) => page.evaluate((svc) => {
  const pop = window.casoraPopup.element; const b = pop.shadowRoot.querySelector('.casora-lock-view [data-csl-svc="' + svc + '"]');
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: Math.round(r.height), rad: getComputedStyle(b).borderRadius };
}, svc);
const askOpen = (page) => page.evaluate(() => !!document.querySelector('.casora-askfirst'));
const askClick = (page, cls) => page.evaluate((cls) => { const h = document.querySelector('.casora-askfirst'); const b = h && (h.shadowRoot || h).querySelector('.' + cls); if (b) b.click(); return !!b; }, cls);

// ── Desktop (Casora, hell) ──────────────────────────────────────────────────
{
  const page = await setup({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  await openPopup(page, false);
  const at = await rowAt(page, A);
  await need('Schloss-Popup mit Zeile „Wohnungstür“', at);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1500);
  let v = await view(page);
  await check('Tipp auf die Zeile öffnet die Casora-Ansicht (kein HA-Dialog)', v.view && v.moreInfo === 0, v);
  await check('Bisheriger Popup-Inhalt ausgeblendet', v.rowsVisible === 0, v.rowsVisible);
  await check('Titel = Name des Schlosses, Zurück-Pfeil sichtbar', v.title === 'Wohnungstür' && v.back, v);
  await check('Statuszeile „Verriegelt · seit … · Automatisch“', /^Verriegelt · seit \S+ · Automatisch$/.test(v.line || ''), v.line);
  await check('Hauptknopf „Entriegeln“ + „Tür öffnen“ (OPEN)', v.btns.length === 2 && v.btns[0].t === 'Entriegeln' && v.btns[0].svc === 'unlock' && v.btns[1].svc === 'open', v.btns);
  await check('Hinweis auf die Rückfrage', v.ask, v);
  await check('Zustand: Schloss, Tür, Batterie', v.zustand.length === 3 && /^Schloss.*Verriegelt$/.test(v.zustand[0]) && /^Tür Türkontakt Geschlossen$/.test(v.zustand[1]) && /^Batterie.*82 %$/.test(v.zustand[2]), v.zustand);
  await check('Verlauf: Logbuch gefragt, 7 Einträge von heute, neueste zuerst', v.log >= 1 && v.ev.length === 7 && v.ev[0].act === 'Verriegelt', v.ev);
  const trig = v.ev.map((e) => e.trig);
  await check('Auslöser: Automation mit Namen', trig[0] === 'Automatisch · Gute Nacht', trig);
  await check('Auslöser: ohne Kontext „Am Schloss“', trig[1] === 'Am Schloss' && v.ev[1].act === 'Entriegelt', trig);
  await check('Nach „Offline“ kein erfundener Auslöser', v.ev[3].act === 'Offline' && trig[2] === null && trig[3] === null, v.ev);
  await check('Auslöser: Skript mit Namen', v.ev[5].act === 'Geöffnet' && trig[5] === 'Skript · Paketbote', v.ev);
  await check('Auslöser: Person per App (Übergang zusammengefasst)', v.ev[6].act === 'Entriegelt' && trig[6] === 'Anna per App', v.ev);
  await check('„Ganzer Verlauf“ da', v.more, v);
  await check('Desktop zweispaltig (Verlauf rechts)', v.cols && v.lr && v.lr.rx > v.lr.lx + 200, v.lr);
  const ub = await btnAt(page, 'unlock');
  await check('Hauptknopf 44 hoch, voll rund', ub && ub.h === 44 && parseFloat(ub.rad) >= 22, ub);
  // Rückfrage: Abbrechen schaltet nicht, Ja schaltet.
  await page.mouse.click(ub.x, ub.y); await page.waitForTimeout(500);
  await check('Rückfrage erscheint', await askOpen(page));
  await askClick(page, 'no'); await page.waitForTimeout(400);
  v = await view(page);
  await check('Abbrechen: kein Dienstaufruf', v.calls.length === 0, v.calls);
  await page.mouse.click(ub.x, ub.y); await page.waitForTimeout(500);
  await askClick(page, 'yes'); await page.waitForTimeout(500);
  v = await view(page);
  await check('Ja: lock.unlock für die Wohnungstür', v.calls.length === 1 && /^unlock:.*qa_wohnungstur/.test(v.calls[0]), v.calls);
  // Tür öffnen fragt immer.
  const ob = await btnAt(page, 'open');
  await page.mouse.click(ob.x, ob.y); await page.waitForTimeout(500);
  await check('Tür öffnen fragt nach', await askOpen(page));
  await askClick(page, 'yes'); await page.waitForTimeout(500);
  v = await view(page);
  await check('Tür öffnen: lock.open', v.calls.length === 2 && /^open:/.test(v.calls[1]), v.calls);
  // Zurück.
  await page.mouse.click(v.backAt.x, v.backAt.y); await page.waitForTimeout(800);
  v = await view(page);
  await check('Zurück: Ansicht weg, Popup offen, Zeilen wieder da', v.open && !v.view && !v.back && v.rowsVisible >= 2 && v.title !== 'Wohnungstür', v);
  // Zweites Schloss: eigene Ansicht, ohne OPEN kein „Tür öffnen“, entriegelt → „Verriegeln“ (ohne Rückfrage).
  const at2 = await rowAt(page, B2);
  await page.mouse.click(at2.x, at2.y); await page.waitForTimeout(1500);
  v = await view(page);
  await check('Zweite Zeile öffnet ihre eigene Ansicht', v.view && v.title === 'Haustür' && v.moreInfo === 0, v);
  await check('Ohne OPEN kein „Tür öffnen“, Knopf „Verriegeln“', v.btns.length === 1 && v.btns[0].svc === 'lock' && v.btns[0].t === 'Verriegeln' && !v.ask, v.btns);
  const lb = await btnAt(page, 'lock');
  await page.mouse.click(lb.x, lb.y); await page.waitForTimeout(500);
  v = await view(page);
  await check('Ohne Rückfrage-Einstellung schaltet „Verriegeln“ sofort', !(await askOpen(page)) && v.calls.length === 3 && /^lock:.*qa_haustur/.test(v.calls[2]), v.calls);
  // Zustände: Klemmt → Verriegeln, nicht verfügbar → kein Knopf.
  await fakeStates(page, { [B2]: { state: 'jammed' } }, { sticky: true }); await page.waitForTimeout(900);
  v = await view(page);
  await check('Klemmt: Statuszeile „Klemmt“, Knopf „Verriegeln“', /^Klemmt/.test(v.line || '') && v.btns[0] && v.btns[0].svc === 'lock', v);
  await fakeStates(page, { [B2]: { state: 'unavailable' } }, { sticky: true }); await page.waitForTimeout(900);
  v = await view(page);
  await check('Nicht verfügbar: „Offline“, kein Schaltknopf', /^Offline/.test(v.line || '') && v.btns.length === 0, v);
}

// ── Handy (Casora, Touch): einspaltig ───────────────────────────────────────
{
  const page = await setup({ width: 393, height: 852, mobile: true, dark: true, theme: 'Casora' });
  await openPopup(page, true);
  const at = await rowAt(page, A);
  await need('Handy: Zeile „Wohnungstür“', at);
  await page.touchscreen.tap(at.x, at.y); await page.waitForTimeout(1500);
  const v = await view(page);
  await check('Handy: Antippen öffnet die Ansicht (kein HA-Dialog)', v.view && v.moreInfo === 0, v);
  await check('Handy: bisheriger Popup-Inhalt ausgeblendet (keine Zeile sichtbar)', v.rowsVisible === 0, v.rowsVisible);
  await check('Handy: einspaltig (Verlauf unter Bedienen/Zustand)', !v.cols && v.lr && v.lr.rt >= v.lr.lb && Math.abs(v.lr.rx - v.lr.lx) < 4, v.lr);
  await check('Handy: keine Seitenbreite über den Bildschirm', v.pageW <= v.winW + 1, v);
  await page.touchscreen.tap(v.backAt.x, v.backAt.y); await page.waitForTimeout(800);
  await check('Handy: Zurück führt zurück', !(await view(page)).view);
}

// ── Standard-Look: weiter HAs Dialog ───────────────────────────────────────
{
  const page = await setup({ width: 1440, height: 900, dark: false, theme: 'Hemma 2' });
  await openPopup(page, false);
  const at = await rowAt(page, A);
  if (at) {
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(1200);
    const v = await view(page);
    await check('Standard: keine Casora-Ansicht, HA-Dialog wie bisher', !v.view && v.moreInfo >= 1, v);
  } else await check('Standard: Schloss-Popup mit Zeile', false);
}
await finish();
