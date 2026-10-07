// @zustand: stress
// @parallel: allein
// Gewünscht: Beim Anlegen eines Dashboards bekommt jeder Raum (nicht nur Home) seine Badges
// aus den Geräten seines HA-Bereichs – Beleuchtung (Lichter), Klima (Heizung/Sensoren),
// Sicherheit (Schlösser), Medien (Player) –, egal ob „Automatisch einrichten“ oder leer
// begonnen. Klima und Licht landen auch als Raum-Chips im Handy-Layout.
// Legt qa-badges und qa-badges-leer (+ -mobile) über den echten Studio-Ablauf an und löscht sie wieder.
import { open, usePage, ready, shot, check, need, finish } from './lib.mjs';

const { page } = await open();
usePage(page);
const PANEL = () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && (p._state || p._flowMode)); };
await ready(page, '/casora-studio', PANEL);
const H = (fn, arg) => page.evaluate(fn, arg);

const NAMES = ['qa-badges', 'qa-badges-leer'];
const cleanup = async () => H(async (names) => {
  const h = document.querySelector('home-assistant').hass;
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (names.some((n) => d.url_path === n || d.url_path === n + '-mobile')) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
}, NAMES);
await cleanup();

const clickPrimary = async (re) => {
  await page.waitForFunction((src) => {
    const re = new RegExp(src, 'i');
    const foot = window.__pierce('.flowfoot').filter((f) => f.offsetParent).pop();
    return !!foot && [...foot.querySelectorAll('button')].some((b) => b.offsetParent && !b.classList.contains('ghost') && !b.disabled && re.test(b.textContent.trim()));
  }, re.source, { timeout: 30000 }).catch(() => {});
  const ok = await H((src) => {
    const re = new RegExp(src, 'i');
    const foot = window.__pierce('.flowfoot').filter((f) => f.offsetParent).pop();
    const btns = foot ? [...foot.querySelectorAll('button')].filter((b) => b.offsetParent && !b.classList.contains('ghost') && !b.disabled) : [];
    const b = btns.filter((x) => re.test(x.textContent.trim())).pop();
    if (!b) return false;
    b.setAttribute('data-qa-click', '1');
    return true;
  }, re.source);
  if (!ok) throw new Error('Knopf fehlt: ' + re);
  const h = await page.evaluateHandle(() => window.__pierce('[data-qa-click]')[0]);
  await h.asElement().click();
  await H(() => window.__pierce('[data-qa-click]').forEach((b) => b.removeAttribute('data-qa-click')));
};
const waitFor = (sel) => page.waitForFunction((s) => window.__pierce(s).some((e) => e.offsetParent), sel, { timeout: 30000 });

// Über den Studio-Ablauf anlegen: alle Räume, dann automatisch füllen oder leer beginnen.
async function create(name, how) {
  await ready(page, '/casora-studio', PANEL);
  await H(() => window.__panel()._createForm());
  await page.waitForFunction(() => window.__pierce('.rp-room').length > 0, null, { timeout: 30000 });
  await H(() => window.__pierce('.rp-room').forEach((r) => r.setAttribute('aria-checked', 'true')));
  await H((n) => { const i = window.__pierce('.flowin input').filter((x) => x.offsetParent).pop(); i.value = n; i.dispatchEvent(new Event('input', { bubbles: true })); }, name);
  await clickPrimary(/^(Dashboard erstellen|Create Dashboard)$/);
  await waitFor('.themecard[data-k=' + how + ']');
  await H((k) => window.__pierce('.themecard[data-k=' + k + ']')[0].click(), how);
  await clickPrimary(/^(Weiter|Continue)$/);
  if (how === 'auto') {
    await waitFor('.bs-grid');
    await clickPrimary(/(anlegen|erstellen|^Create)/);
  }
  // Von hier aus abfragen: waitForFunction mit async-Funktion kehrt sofort zurück (Promise = „wahr“).
  for (const t0 = Date.now(); ; ) {
    const ok = await H(async (n) => {
      const l = await document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/dashboards/list' });
      return l.some((x) => x.url_path === n) && l.some((x) => x.url_path === n + '-mobile');
    }, name).catch(() => false);
    if (ok) break;
    if (Date.now() - t0 > 90000) throw new Error('Dashboard ' + name + ' nach 90 s nicht angelegt');
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1500);
}

// Erwartung unabhängig von Casoras Plan: was steht im HA-Bereich des Raums?
const expect = () => H(() => {
  const h = document.querySelector('home-assistant').hass;
  const R = h.entities || {}, D = h.devices || {}, A = h.areas || {};
  const out = {};
  Object.keys(h.states).forEach((id) => {
    const e = R[id];
    if (!e || e.hidden || e.entity_category || e.disabled_by) return;
    const aid = e.area_id || (D[e.device_id] || {}).area_id;
    if (!aid || !A[aid]) return;
    const dom = id.split('.')[0];
    const o = out[A[aid].name] = out[A[aid].name] || {};
    if (dom === 'light' && !/(^|_)status_led$|_led$/.test(id.split('.')[1])) o.lights = true;
    if (dom === 'lock') (o.locks = o.locks || []).push(id);
    if (dom === 'media_player') o.media = true;
    if (dom === 'climate') o.climate = true;
  });
  return out;
});

const configOf = (url) => H(async (u) => document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/config', url_path: u }), url);
const roomKeyOf = (n) => 'room_' + String(n || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const want = await expect();
for (const [name, how] of [['qa-badges', 'auto'], ['qa-badges-leer', 'empty']]) {
  await create(name, how);
  const cfg = await configOf(name);
  const rooms = (cfg.views || []).map((v) => (v.cards || [])[0]).filter((c) => c && c.template === 'casora_room');
  await need(`[${how}] Räume angelegt`, rooms.length > 3, rooms.length);
  const miss = [];
  let checked = 0;
  rooms.slice(1).forEach((hero) => {
    const w = want[hero.name];
    if (!w) return;
    const V = hero.variables || {};
    const keys = Object.keys(V);
    checked++;
    if (w.lights && !keys.some((k) => /^(light_entity_\d+|light_group_entity)$/.test(k) && V[k])) miss.push(hero.name + ': Beleuchtung');
    if (w.locks && !(V.security_locks || []).some((l) => w.locks.includes(l))) miss.push(hero.name + ': Sicherheit/Schloss');
    if (w.media && !V.media_player_1) miss.push(hero.name + ': Medien');
    if (w.climate && !(V.climate_entity_1 || V.temp_sensor_1)) miss.push(hero.name + ': Klima');
  });
  await check(`[${how}] Räume mit Geräten im Bereich geprüft`, checked >= 5, checked);
  await check(`[${how}] jeder Raum hat seine Badges (Licht/Klima/Sicherheit/Medien)`, !miss.length, miss.slice(0, 12));
  const home = rooms[0].variables || {};
  await check(`[${how}] Home hat Badges`, Object.keys(home).some((k) => /^light_entity_\d+$/.test(k)), Object.keys(home));

  // Handy: Licht/Klima der Räume als Raum-Chips.
  const m = await configOf(name + '-mobile');
  let chips = null;
  JSON.stringify(m, (k, v) => { if (v && v.template === 'casora_mobile_sensor_chips' && v.variables && v.variables.room_chips) chips = v.variables.room_chips; return v; });
  const noChip = rooms.slice(1).filter((hero) => {
    const V = hero.variables || {};
    const light = V.light_group_entity || Object.keys(V).filter((k) => /^light_entity_\d+$/.test(k)).map((k) => V[k])[0];
    if (!light && !V.temp_sensor_1) return false;
    const c = (chips || {})[roomKeyOf(hero.name)] || {};
    return !(c.lights_entity || c.temp_entity);
  }).map((h) => h.name);
  await check(`[${how}] Handy: Raum-Chips für Räume mit Licht/Temperatur`, !!chips && !noChip.length, noChip.slice(0, 10));
}

// Bildschirmfoto: ein Raum mit Licht, Schloss und Kamera (Desktop und Handy).
const cfg = await configOf('qa-badges-leer');
const view = (cfg.views || []).slice(1).find((v) => { const V = ((v.cards || [])[0] || {}).variables || {}; return (V.security_locks || []).length && V.light_entity_1; })
  || (cfg.views || [])[1];
await ready(page, '/qa-badges-leer/' + (view.path || '1'), () => window.__pierce('button-card').length >= 1, 60000);
await page.waitForTimeout(3500);
console.log('  📸', await shot('desktop_raum'));
const phone = await open({ mobile: true, width: 390, height: 844 });
await ready(phone.page, '/qa-badges-leer-mobile/home', () => window.__pierce('button-card').length >= 1, 60000);
await phone.page.waitForTimeout(3500);
usePage(phone.page);
console.log('  📸', await shot('handy'));
usePage(page);

if (!process.env.CASORA_QA_KEEP) await cleanup();
await finish();
