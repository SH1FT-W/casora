// @zustand: arbeit
// @parallel: allein
// Gewünscht 03.10.2026 (Hemma hatte es): show_security_inline am Raum zeigt statt der
// Sammel-Badge „Sicherheit“ die einzelnen Einträge direkt in der Badge-Reihe (Schloss, Alarm,
// Fenster/Türen, Kameras); ohne den Schalter bleibt die Sammel-Badge. Studio: Schalter
// „Einzeln anzeigen“ in der Badge-Einstellung Sicherheit, Vorschau wie das Dashboard.
// Legt neutrale Beispiel-Entitäten (REST-Zustand) und das Dashboard qa-sicherheit-inline an
// und räumt beides wieder ab.
import { open, usePage, shot, studio, casoraDashboard, dashboard, cards, check, need, finish } from './lib.mjs';

const URL_PATH = 'qa-sicherheit-inline';
const ENT = {
  'binary_sensor.fenster_beispiel': { state: 'off', attributes: { device_class: 'window', friendly_name: 'Fenster' } },
  'binary_sensor.terrassentuer_beispiel': { state: 'on', attributes: { device_class: 'door', friendly_name: 'Terrassentür' } },
  'camera.kamera_beispiel': { state: 'idle', attributes: { friendly_name: 'Kamera' } },
};

const src = await casoraDashboard();
await need('Casora-Dashboard als Vorlage', src);
const roomView = src.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('Raumansicht', roomView);

const { page } = await open({ width: 1440, height: 900 });
usePage(page);
await dashboard(page, src.url + '/' + (src.config.views[0].path || '0'));
const H = (fn, arg) => page.evaluate(fn, arg);

const cleanup = () => H(async ([u, ids]) => {
  const h = document.querySelector('home-assistant').hass;
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (d.url_path === u) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  for (const id of ids) { try { await h.callApi('DELETE', 'states/' + id); } catch (e) { /* fehlt schon */ } }
}, [URL_PATH, Object.keys(ENT)]);
await cleanup();

// Neutrale Beispiel-Entitäten
await H(async (ent) => {
  const h = document.querySelector('home-assistant').hass;
  for (const [id, v] of Object.entries(ent)) await h.callApi('POST', 'states/' + id, v);
}, ENT);

// Raum: nur Sicherheit (Fenster, Terrassentür, Kamera) – alles andere aus der Vorlage bleibt.
const SEC = /^(security_|show_security)/;
const build = (inline) => {
  const cfg = JSON.parse(JSON.stringify(src.config));
  const view = JSON.parse(JSON.stringify(roomView));
  const V = view.cards[0].variables = Object.fromEntries(Object.entries(view.cards[0].variables || {})
    .filter(([k]) => !SEC.test(k)));
  V.security_entity_2 = 'binary_sensor.fenster_beispiel';
  V.security_entity_3 = 'binary_sensor.terrassentuer_beispiel';
  V.security_cameras = ['camera.kamera_beispiel'];
  if (inline) V.show_security_inline = true;
  view.path = 'raum';
  cfg.views = [view];
  return cfg;
};
const save = (cfg) => H(async ([u, c]) => {
  const h = document.querySelector('home-assistant').hass;
  const l = await h.callWS({ type: 'lovelace/dashboards/list' });
  if (!l.some((d) => d.url_path === u)) await h.callWS({ type: 'lovelace/dashboards/create', url_path: u,
    title: 'QA Sicherheit einzeln', mode: 'storage', require_admin: false, show_in_sidebar: false });
  await h.callWS({ type: 'lovelace/config/save', url_path: u, config: c });
}, [URL_PATH, cfg]);

const SECT = /^casora_badge_(security_group|security|lock_group|camera_group|contact_group)$/;
const row = async () => {
  const all = await cards(page);
  const top = all.filter((c) => c.t.some((t) => /^casora_badge_/.test(t)));
  if (!top.length) return [];
  const y0 = Math.min(...top.map((c) => c.y));
  return top.filter((c) => c.y - y0 < 20).sort((a, b) => a.x - b.x)
    .map((c) => ({ t: c.t.find((t) => /^casora_badge_/.test(t)), text: c.text }));
};

// 1) Ohne Schalter: Sammel-Badge
await save(build(false));
await dashboard(page, URL_PATH + '/raum', 3);
const aus = await row();
const ausSec = aus.filter((b) => SECT.test(b.t));
await check('ohne Schalter: eine Sammel-Badge „Sicherheit“', ausSec.length === 1 && ausSec[0].t === 'casora_badge_security_group'
  && /Sicherheit/.test(ausSec[0].text), aus);
console.log('  📸', await shot('aus_dunkel'));

// 2) Mit Schalter: Einzel-Badges an der Sicherheits-Stelle
await save(build(true));
await dashboard(page, URL_PATH + '/raum', 3);
const an = await row();
const anSec = an.filter((b) => SECT.test(b.t));
await check('einzeln: keine Sammel-Badge', !anSec.some((b) => b.t === 'casora_badge_security_group'), an);
await check('einzeln: Fenster · Geschlossen', anSec.some((b) => b.t === 'casora_badge_contact_group' && /Fenster/.test(b.text)
  && /Geschlossen/.test(b.text)), anSec);
await check('einzeln: Terrassentür · Geöffnet', anSec.some((b) => /Terrassentür/.test(b.text) && /Geöffnet|Offen/.test(b.text)), anSec);
await check('einzeln: Kamera', anSec.some((b) => b.t === 'casora_badge_camera_group'), anSec);
await check('einzeln: Reihenfolge Kontakte vor Kameras', anSec.map((b) => b.t).join(',')
  === 'casora_badge_contact_group,casora_badge_contact_group,casora_badge_camera_group', anSec.map((b) => b.t));
const first = an.findIndex((b) => SECT.test(b.t));
const last = an.length - 1 - [...an].reverse().findIndex((b) => SECT.test(b.t));
await check('einzeln: zusammen an der Sicherheits-Stelle (vorn, wie Standard-Reihenfolge)',
  first === 0 && an.slice(first, last + 1).every((b) => SECT.test(b.t)), an.map((b) => b.t));
// Die Unter-Reihe der Sammel-Badge bleibt aus (wie bei Klima einzeln).
const subRow = await H(() => window.__pierce('#badges_security').map((e) => getComputedStyle(e).display));
await check('Unter-Reihe der Sammel-Badge ist aus', subRow.length && subRow.every((d) => d === 'none'), subRow);
console.log('  📸', await shot('an_dunkel'));

// Hell
const light = await open({ width: 1440, height: 900, dark: false });
usePage(light.page);
await dashboard(light.page, URL_PATH + '/raum', 3);
console.log('  📸', await shot('an_hell'));
usePage(page);

// 3) Studio: Schalter und Vorschau
await studio(page, URL_PATH);
const st = await H(async () => {
  const p = window.__panel();
  p._room = 0; p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  p._select({ group: 'badges', key: 'Security', label: 'Security' });
  await new Promise((r) => setTimeout(r, 1200));
  const room = p._state.compact.rooms[0];
  const model = p._miniModel(room).filter((b) => String(b.id).startsWith('security'));
  const txt = p.shadowRoot.textContent;
  const pills = [...p.shadowRoot.querySelectorAll('.pbadge')].filter((e) => e.getBoundingClientRect().width > 0
    && !e.classList.contains('ghost')).map((e) => e.textContent.trim());
  return { ids: model.map((b) => b.id), labels: model.map((b) => b.label), sw: /Einzeln anzeigen/.test(txt), pills };
});
await check('Studio: Schalter „Einzeln anzeigen“', st.sw, st);
await check('Studio-Vorschau: Einzel-Badges Fenster, Terrassentür, Kamera',
  JSON.stringify(st.ids) === JSON.stringify(['security:0', 'security:1', 'security:2'])
  && st.labels[0] === 'Fenster' && st.pills.some((t) => /Fenster/.test(t)), st);
console.log('  📸', await shot('studio_dunkel'));
usePage(light.page);
await studio(light.page, URL_PATH);
await light.page.evaluate(async () => {
  const p = window.__panel();
  p._room = 0; p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  p._select({ group: 'badges', key: 'Security', label: 'Security' });
  await new Promise((r) => setTimeout(r, 1200));
});
console.log('  📸', await shot('studio_hell'));
usePage(page);

if (!process.env.CASORA_QA_KEEP) await cleanup();
await finish();
