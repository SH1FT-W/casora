// @zustand: arbeit
// @parallel: allein
// Gewünscht 07.10.2026 (1.1.1): Kamera-Kachel „Status von: …“. Kommt das Bild über einen Proxy, meldet
// die Kamera „bereit“, obwohl die echte Kamera weg ist. Eine freiwillige zweite Entität je Kamera-Kachel
// (andere Kamera oder Verbindungssensor) sagt, ob sie erreichbar ist.
// Erwartet: Studio-Feld „Status from“ an der Kamera-Kachel; Status-Entität nicht verfügbar → Kachel
// „Offline“, Sicherheits-Badge „Kamera offline“ (Dashboard und Studio-Vorschau); Status wieder da →
// beides wie vorher; ohne Einstellung bleibt die Kamera trotz totem Sensor online.
// Legt neutrale Beispiel-Entitäten (REST-Zustand) und das Dashboard qa-kamera-status an und räumt ab.
import { open, usePage, studio, casoraDashboard, dashboard, cards, check, need, finish, atFinish } from './lib.mjs';

const URL_PATH = 'qa-kamera-status';
const CAM = 'camera.qa_proxy_kamera', REAL = 'camera.qa_echte_kamera', CONN = 'binary_sensor.qa_kamera_verbunden';
const ENT = {
  [CAM]: { state: 'idle', attributes: { friendly_name: 'QA Proxy' } },
  [REAL]: { state: 'unavailable', attributes: { friendly_name: 'QA Echt' } },
  [CONN]: { state: 'on', attributes: { device_class: 'connectivity', friendly_name: 'QA Verbunden' } },
};

const src = await casoraDashboard();
await need('Casora-Dashboard als Vorlage', src);
const roomView = src.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('Raumansicht', roomView);

const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await dashboard(page, src.url + '/' + (src.config.views[0].path || '0'));
const H = (fn, arg) => page.evaluate(fn, arg);
const setState = (id, v) => H(async ([i, s]) => {
  await document.querySelector('home-assistant').hass.callApi('POST', 'states/' + i, s); }, [id, v]);

const cleanup = () => H(async ([u, ids]) => {
  const h = document.querySelector('home-assistant').hass;
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (d.url_path === u) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  for (const id of ids) { try { await h.callApi('DELETE', 'states/' + id); } catch (e) { /* fehlt schon */ } }
}, [URL_PATH, Object.keys(ENT)]);
await cleanup();
atFinish(cleanup);
for (const [id, v] of Object.entries(ENT)) await setState(id, v);

// Raum mit nur der Proxy-Kamera in Sicherheit und als Kachel.
const SEC = /^(security_|show_security)/;
const build = (status) => {
  const cfg = JSON.parse(JSON.stringify(src.config));
  const view = JSON.parse(JSON.stringify(roomView));
  const V = view.cards[0].variables = Object.fromEntries(Object.entries(view.cards[0].variables || {})
    .filter(([k]) => !SEC.test(k)));
  V.security_cameras = [CAM];
  view.cards[2].cards = [{ type: 'custom:button-card', template: 'casora_camera', entity: CAM, name: 'QA Kamera',
    ...(status ? { variables: { status_entity: status } } : {}) }];
  view.path = 'raum';
  cfg.views = [view];
  return cfg;
};
const save = (cfg) => H(async ([u, c]) => {
  const h = document.querySelector('home-assistant').hass;
  const l = await h.callWS({ type: 'lovelace/dashboards/list' });
  if (!l.some((d) => d.url_path === u)) await h.callWS({ type: 'lovelace/dashboards/create', url_path: u,
    title: 'QA Kamera-Status', mode: 'storage', require_admin: false, show_in_sidebar: false });
  await h.callWS({ type: 'lovelace/config/save', url_path: u, config: c });
}, [URL_PATH, cfg]);

const look = async () => {
  const all = await cards(page);
  const tile = all.find((c) => c.t.includes('casora_camera'));
  const sec = all.find((c) => c.t.includes('casora_badge_security_group'));
  return { tile: tile && tile.text, sec: sec && sec.text };
};

// 1) Ohne Einstellung: der tote Sensor ändert nichts.
await save(build(null));
await dashboard(page, URL_PATH + '/raum', 2);
await page.waitForTimeout(1200);
const a = await look();
await check('ohne Einstellung: Kachel nicht offline', a.tile && !/Offline/.test(a.tile), a);
await check('ohne Einstellung: kein „Kamera offline“', a.sec && !/Kamera offline/.test(a.sec), a);

// 2) Status von einer anderen (nicht verfügbaren) Kamera
await save(build(REAL));
await dashboard(page, URL_PATH + '/raum', 2);
const b = await look();
await check('Status-Kamera nicht verfügbar: Kachel „Offline“', /Offline/.test(b.tile || ''), b);
await check('Status-Kamera nicht verfügbar: Sicherheits-Badge „Kamera offline“', /Kamera offline/.test(b.sec || ''), b);

// 3) Verbindungssensor: an → online, aus → offline (Badge zeichnet ohne Neuladen neu)
await save(build(CONN));
await dashboard(page, URL_PATH + '/raum', 2);
const c = await look();
await check('Verbindungssensor an: online', c.tile && !/Offline/.test(c.tile) && !/Kamera offline/.test(c.sec || ''), c);
await setState(CONN, { ...ENT[CONN], state: 'off' });
await page.waitForTimeout(1500);
const d = await look();
await check('Verbindungssensor aus: Kachel „Offline“ ohne Neuladen', /Offline/.test(d.tile || ''), d);
await check('Verbindungssensor aus: „Kamera offline“ ohne Neuladen', /Kamera offline/.test(d.sec || ''), d);

// 4) Studio: Feld an der Kamera-Kachel, Vorschau zählt mit
await studio(page, URL_PATH);
const st = await H(async () => {
  const p = window.__panel();
  p._room = 0; p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  const t = p._state.compact.rooms[0].tiles[0];
  p._bOpen = true;
  p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' });
  await new Promise((r) => setTimeout(r, 1200));
  // Erweitert aufklappen, damit das Feld zu sehen ist
  p.shadowRoot.querySelectorAll('#pane .tile.sel .adv:not(.open) .advsum').forEach((s) => s.click());
  await new Promise((r) => setTimeout(r, 500));
  const txt = (p.shadowRoot.querySelector('#pane .tile.sel') || p.shadowRoot).textContent;
  const room = p._state.compact.rooms[0];
  const sec = p._miniModel(room).find((x) => String(x.id) === 'security');
  return { field: /Status von|Status from/.test(txt), sec: sec && [sec.label, sec.sub, sec.text].join(' | ') };
});
await check('Studio: Feld „Status von“ an der Kamera-Kachel', st.field, st);
await check('Studio-Vorschau: „Kamera offline“ wie das Dashboard', /Kamera offline|Camera offline/.test(st.sec || ''), st);
await finish();
