// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/15-person.js#PALETTE,P.place,P.zoneHue,zoneIcon,dayStart,P.when,P.dist,slug,P.phone,trackers
// 1.4 (Wunsch 12.10.2026): Tipp auf eine Person öffnete HAs Kartendialog. Erwartet: Casoras Personen-Popup
// (Entwurf B): Kopf mit Ort und „seit …“, HAs Karte, „Verlauf“ als Zeitleiste (seit 1.4.2, vorher „Zuletzt“), unterwegs „Nach Hause“ mit
// Entfernung; Karte direkt unter dem Kopf (nicht hochgeschoben). Zustände nur vorübergehend im Wegwerf-HA.
// Popup v3 (richtlinien §4 S7, §3): the place is the stage's sentence, „seit“ and the distance home („Von zuhause“,
// formerly the section „Nach Hause“) are its facts; the head says „Seit …“ instead of repeating the place.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url);
const PID = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).find((k) => k.startsWith('person.')));
await need('eine Person', PID);
const was = await page.evaluate(async (pid) => { const h = document.querySelector('home-assistant').hass; const s = h.states[pid];
  await h.callApi('POST', 'states/zone.qa_arbeit', { state: '0', attributes: { friendly_name: 'QA Arbeit', latitude: 48.1, longitude: 11.6, radius: 100 } });
  await h.callApi('POST', 'states/' + pid, { state: 'QA Arbeit', attributes: { ...s.attributes, latitude: 48.1, longitude: 11.6 } });
  return { state: s.state, attributes: s.attributes }; }, PID);
atFinish(() => page.evaluate(async ([pid, w]) => { const h = document.querySelector('home-assistant').hass;
  await h.callApi('POST', 'states/' + pid, w).catch(() => {}); await h.callApi('DELETE', 'states/zone.qa_arbeit').catch(() => {}); }, [PID, was]).catch(() => {}));
await page.waitForTimeout(800);
// Personen-Kachel wie im Studio vorn einsetzen und antippen.
const pt = await page.evaluate(async (pid) => {
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 120 && x.width < 420 && x.height > 50 && x.top > 250 && x.top < innerHeight - 150
    && !/badge|room|section/.test([].concat((b._config || {}).template || []).join()); });
  if (!old) return null;
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_presence', entity: pid });
  el.hass = document.querySelector('home-assistant').hass; old.parentNode.insertBefore(el, old);
  await new Promise((r) => setTimeout(r, 900)); el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, PID);
await need('Personen-Kachel eingesetzt', pt);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(4500);
const r = await page.evaluate(() => {
  const sf = window.casoraPopup && window.casoraPopup.surface, sr = sf && sf.getRootNode();
  const mi = document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog');
  const deep = (n) => { let o = ''; if (n.shadowRoot) o += deep(n.shadowRoot); for (const k of n.childNodes) o += k.nodeType === 3 ? k.textContent : deep(k); return o; };
  const txt = sr ? deep(sr).replace(/\s+/g, ' ') : '';
  const map = window.__pierce('hui-map-card')[0], bar = sr && sr.querySelector('.header-bar');
  return { open: !!sf, haDialog: !!(mi && mi.shadowRoot && mi.shadowRoot.querySelector('ha-dialog, ha-adaptive-dialog, [open]')),
    status: sr && (sr.querySelector('.header-status') || {}).textContent, map: !!map,
    gap: map && bar ? Math.round(map.getBoundingClientRect().top - bar.getBoundingClientRect().bottom) : null,
    zuletzt: /Verlauf/.test(txt) && window.__pierce('.cpe-verlauf').length > 0, nachHause: /Nach Hause/.test(txt), ring: !!(sr && sr.querySelector('.header-ring:not([hidden]) .g, .header-ring:not([hidden]) .im')),
    stage: (() => { const st = window.__pierce('.hui-stage[data-casora-stage="S7"]', sf).find((e) => e.getBoundingClientRect().width > 0);
      return st ? { text: deep(st).replace(/\s+/g, ' '), icon: !!st.querySelector('ha-icon, .hui-st-ic, svg') } : null; })() };
});
await check('Casoras Popup offen, kein HA-Dialog', r.open && !r.haDialog, r);
const v3 = !!r.stage;
if (v3) {
  await check('Bühne: Ort als Satz, „Seit …“ (Kopf oder Bühne)', /QA Arbeit/.test(r.stage.text) && /seit/i.test((r.status || '') + ' ' + r.stage.text), { status: r.status, stage: r.stage.text });
  await check('Bühne mit Symbol', r.stage.icon, r.stage);
} else {
  await check('Kopf: Ort und „seit …“', /QA Arbeit/.test(r.status || '') && /seit/.test(r.status || ''), r.status);
  await check('Kopf mit Symbol', r.ring, r);
}
await check('Karte (HAs Kartenkarte)', r.map, r);
await check('Karte nicht unter den Kopf geschoben (Abstand ≥ 0)', r.gap !== null && r.gap >= 0, r.gap);
if (v3) await check('„Verlauf“ (Zeitleiste) und unterwegs „Von zuhause“ mit Entfernung', r.zuletzt && /Von zuhause/i.test(r.stage.text) && /\d\s?(km|m)\b/.test(r.stage.text), { zuletzt: r.zuletzt, stage: r.stage.text });
else await check('„Verlauf“ (Zeitleiste) und unterwegs „Nach Hause“', r.zuletzt && r.nachHause, r);
// 1.5: Tipp auf den Marker der Karte öffnet weder HAs Dialog noch dasselbe Popup ein zweites Mal (mit ‹).
const mk = await page.evaluate(() => { const m = window.__pierce('ha-entity-marker')[0]; if (!m) return null; const b = m.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
if (mk) {
  await page.mouse.click(mk.x, mk.y);
  await page.waitForTimeout(2500);
  const m2 = await page.evaluate(() => { const sr = window.casoraPopup.element.shadowRoot, bk = sr.querySelector('.header-back');
    return { open: window.casoraPopup.element.hasAttribute('open'), back: !!(bk && !bk.hidden),
      native: !!document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog') }; });
  await check('Marker-Tipp: Popup bleibt, kein HA-Dialog, kein ‹', m2.open && !m2.native && !m2.back, m2);
}
await finish();
