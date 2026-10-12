// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/15-person.js
// 1.4 (Wunsch 12.10.2026): Tipp auf eine Person öffnete HAs Kartendialog. Erwartet: Casoras Personen-Popup
// (Entwurf B): Kopf mit Ort und „seit …“, HAs Karte, „Zuletzt“ aus dem Verlauf, unterwegs „Nach Hause“ mit
// Entfernung; Karte direkt unter dem Kopf (nicht hochgeschoben). Zustände nur vorübergehend im Wegwerf-HA.
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
    zuletzt: /Zuletzt/.test(txt), nachHause: /Nach Hause/.test(txt), ring: !!(sr && sr.querySelector('.header-ring:not([hidden]) .g, .header-ring:not([hidden]) .im')) };
});
await check('Casoras Popup offen, kein HA-Dialog', r.open && !r.haDialog, r);
await check('Kopf: Ort und „seit …“', /QA Arbeit/.test(r.status || '') && /seit/.test(r.status || ''), r.status);
await check('Kopf mit Symbol', r.ring, r);
await check('Karte (HAs Kartenkarte)', r.map, r);
await check('Karte nicht unter den Kopf geschoben (Abstand ≥ 0)', r.gap !== null && r.gap >= 0, r.gap);
await check('„Zuletzt“ und unterwegs „Nach Hause“', r.zuletzt && r.nachHause, r);
await finish();
