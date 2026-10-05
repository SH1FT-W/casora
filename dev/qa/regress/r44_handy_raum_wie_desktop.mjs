// @zustand: arbeit
// @parallel: allein   (setzt Badge-Einstellungen nur im Browser; speichert ein paralleler Test ein Dashboard, holt die Seite die echten Werte neu)
// Gemeldet (05.10.2026): Im Raum am Handy fehlten Energie und Sicherheit (Türen/Fenster), die am
// Tablet im Raum-Kopf stehen. Die Handy-Raumseite hatte eine eigene, abgespeckte Badge-Reihe aus
// room_chips (nur beim Speichern im Studio befüllt); Einzel-Anzeige (show_*_inline) galt dort nicht.
// Erwartet: (1) Die Raumseite am Handy zeigt dieselben Badges wie der Raum-Kopf am Desktop – gleiche
// Arten, gleiche Entitäten, gleiche Reihenfolge – auch ohne Speichern im Studio (Variablen zur
// Laufzeit vom Desktop-Dashboard, WS casora/phone_room_badges). (2) Einzel-Anzeige am Desktop wirkt
// am Handy. (3) Ein Handy-Schalter in room_chips wirkt nur am Handy. (4) Antippen einer Sammel-Badge
// klappt am Handy ihre Unter-Reihe auf, ohne den gemeinsamen Helfer casora_expanded_row.
// (5) Die Studio-Vorschau (Handy, Raumseite) zeigt dieselben Badges wie das echte Handy.
// Es wird nichts gespeichert: abweichende Einstellungen nur im Browser (casoraPhoneRoom.prime,
// setConfig der Karte).
import { open, usePage, studio, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

const views = dash.config.views.filter((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
const V = (v) => v.cards[0].variables || {};
const has = (v, re) => Object.entries(V(v)).some(([k, x]) => re.test(k) && x && !(Array.isArray(x) && !x.length));
const SEC = /^(security_entity_\d|security_locks|security_lock_entity|security_cameras)$/;
const EN = /^(energy_power_entity|energy_entities|energy_entity_\d)$/;
const secRoom = views.find((v) => has(v, SEC) && V(v).show_security !== false);
const enRoom = views.find((v) => has(v, EN) && V(v).show_energy !== false);
await need('Raum mit Sicherheit (Kontakt/Schloss) im Desktop-Dashboard', secRoom);
await need('Raum mit Energie im Desktop-Dashboard', enRoom);
const picks = [...new Set([secRoom, enRoom, ...views.filter((v) => has(v, /^(temp_sensor_1|light_entity_1|light_group_entity)$/))])].slice(0, 4);

// Handy-Schlüssel je Raum (wie phoneRoomKeys): Overlay des Raums, sonst aus dem Namen.
const kids = dash.phone.config.views[0].cards[1].cards;
const keyOf = (name) => {
  const ov = kids.find((k) => k && k.type === 'custom:casora-filter-overlay' && k.room === name);
  return (ov && ov.filter_category) || 'room_' + String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
};

// Sichtbare Badges einer Reihe (im Schatten-DOM der Karte), nach Lage von links.
const ROW = (page, host, field) => page.evaluate(([host, field]) => {
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes(host)
    && b.getBoundingClientRect().width > 0);
  const row = card && card.shadowRoot && card.shadowRoot.querySelector('#' + field);
  if (!row || getComputedStyle(row).display === 'none') return null;
  const out = [];
  const walk = (root) => root.querySelectorAll('*').forEach((e) => {
    if (e.localName === 'button-card') {
      const r = e.getBoundingClientRect();
      const t = [].concat((e._config || {}).template || []).find((x) => /^casora_badge_/.test(x)) || '?';
      if (r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none') out.push({ t, ent: (e._config || {}).entity || '', x: r.x });
      return;
    }
    if (e.shadowRoot) walk(e.shadowRoot);
  });
  walk(row);
  return out.sort((a, b) => a.x - b.x).map((b) => b.t + (b.ent ? ':' + b.ent : ''));
}, [host, field]);

// ── Desktop: Raum-Kopf je Raum ────────────────────────────────────────────────
const want = {};
{
  const { page } = await open({ width: 1280, height: 800 });
  usePage(page);
  for (const v of picks) {
    await dashboard(page, dash.url + '/' + v.path, 3);
    want[v.path] = ((await ROW(page, 'casora_room', 'badges')) || [])
      .filter((t) => !t.startsWith('casora_badge_scene'));
  }
}

// ── Handy: Raumseite je Raum ─────────────────────────────────────────────────
const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);
const go = async (key) => {
  await page.evaluate((k) => window._casoraFilter.set(k), key);
  await page.waitForTimeout(3000);
};
const phoneRow = async () => ((await ROW(page, 'casora_mobile_sensor_chips', 'rooms_row')) || [])
  .filter((t) => !/^casora_badge_base/.test(t));   // Bewegung: nur Handy

const phoneGot = {};
for (const v of picks) {
  await go(keyOf(v.cards[0].name));
  const got = await phoneRow();
  phoneGot[v.path] = got;
  console.log('         ' + v.cards[0].name + ': ' + got.map((t) => t.replace(/^casora_badge_/, '').replace(/:.*$/, '')).join(', '));
  await check(`„${v.cards[0].name}“: Handy-Raumseite = Raum-Kopf am Desktop`,
    want[v.path].length > 0 && JSON.stringify(got) === JSON.stringify(want[v.path]), { desktop: want[v.path], handy: got });
}
await check('Sicherheit steht am Handy', (await (async () => { await go(keyOf(secRoom.cards[0].name)); return phoneRow(); })())
  .some((t) => /^casora_badge_(security_group|security|contact_group|lock_group)/.test(t)));
await check('Energie steht am Handy', (await (async () => { await go(keyOf(enRoom.cards[0].name)); return phoneRow(); })())
  .some((t) => /^casora_badge_energy/.test(t)));

// ── Einzel-Anzeige vom Desktop wirkt am Handy ────────────────────────────────
const secKey = keyOf(secRoom.cards[0].name);
const server = await page.evaluate((u) => document.querySelector('home-assistant').hass
  .callWS({ type: 'casora/phone_room_badges', url_path: u }), dash.phone.url);
await need('Server liefert die Raum-Badges', server && server.rooms && server.rooms[secKey], server);
const inl = JSON.parse(JSON.stringify(server.rooms));
inl[secKey].vars.show_security_inline = true;
await page.evaluate((r) => window.casoraPhoneRoom.prime(r), inl);
await go(secKey);
const inlRow = await phoneRow();
await check('show_security_inline: einzelne Sicherheits-Badges statt Sammel-Badge',
  !inlRow.some((t) => t.startsWith('casora_badge_security_group'))
  && inlRow.some((t) => /^casora_badge_(security|contact_group|lock_group|camera_group):/.test(t)), inlRow);
await page.evaluate((r) => window.casoraPhoneRoom.prime(r), server.rooms);

// ── Handy-Schalter wirkt nur am Handy ────────────────────────────────────────
const enKey = keyOf(enRoom.cards[0].name);
const set = await page.evaluate((k) => {
  const el = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  if (!el) return false;
  const cfg = JSON.parse(JSON.stringify(el._config));
  const rc = { ...((cfg.variables || {}).room_chips || {}) };
  rc[k] = { ...(rc[k] || {}), show_energy: false };
  cfg.variables = { ...(cfg.variables || {}), room_chips: rc };
  el.setConfig(cfg);
  el.hass = document.querySelector('home-assistant').hass;
  return true;
}, enKey);
await need('Karte casora_mobile_sensor_chips am Handy', set);
await go('all');
await go(enKey);
const offRow = await phoneRow();
await check('Handy-Schalter show_energy: false blendet Energie nur am Handy aus',
  !offRow.some((t) => /^casora_badge_energy/.test(t)) && want[enRoom.path].some((t) => /^casora_badge_energy/.test(t)), offRow);

// ── Sammel-Badge klappt am Handy die Unter-Reihe auf (je Gerät) ──────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: 'window.__pierce=function(s,r){const o=[];(function w(x){if(!x)return;x.querySelectorAll(s).forEach(e=>o.push(e));x.querySelectorAll("*").forEach(e=>{if(e.shadowRoot)w(e.shadowRoot)})})(r||document);return o;};' });
await page.waitForFunction(() => window.__pierce('button-card').length > 5 && window._casoraFilter, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await go(secKey);
const before = await page.evaluate(() => document.querySelector('home-assistant').hass.states['input_select.casora_expanded_row']?.state);
const tapped = await page.evaluate(() => {
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  const row = card && card.shadowRoot.querySelector('#rooms_row');
  const g = row && window.__pierce('button-card', row).find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group')
    && b.getBoundingClientRect().width > 0);
  if (!g) return false;
  (g.shadowRoot.querySelector('ha-card') || g).click();
  return true;
});
await page.waitForTimeout(2000);
if (tapped) {
  const sub = await ROW(page, 'casora_mobile_sensor_chips', 'room_sub_security');
  await check('Antippen „Sicherheit“: Unter-Reihe mit Schlössern/Kontakten offen', !!sub && sub.length > 0, sub);
  const after = await page.evaluate(() => document.querySelector('home-assistant').hass.states['input_select.casora_expanded_row']?.state);
  await check('gemeinsamer Helfer casora_expanded_row bleibt unberührt', after === before, { before, after });
} else {
  await check('Sammel-Badge „Sicherheit“ am Handy antippbar', false, 'keine sichtbare casora_badge_security_group');
}
await page.evaluate(() => window._casoraFilter.set('all'));

// ── Studio-Vorschau (Handy) = echtes Handy ───────────────────────────────────
// Art je Badge: Sammel-Badge „security“, einzeln „security:“ (Vorschau-IDs security / security:0).
const KIND = { security_group: 'security', security: 'security:', contact_group: 'security:', lock_group: 'security:',
  camera_group: 'security:', climate_group: 'climate', temp: 'climate:', humidity: 'climate:', air_quality: 'climate:',
  light_group: 'lights', presence_group: 'people', presence: 'people:', energy_group: 'energy', media_group: 'media' };
const kinds = (list) => list.map((t) => KIND[t.replace(/^casora_badge_/, '').replace(/:.*$/, '')] || t);
{
  const { page: sp } = await open({ width: 1440, height: 900 });
  usePage(sp);
  await studio(sp, dash.url);
  for (const v of picks) {
    const prev = await sp.evaluate(async (name) => {
      const p = window.__panel();
      p._miniSize = 'phone';
      p._phoneFilter = 'room:' + name;
      p._rebuildPreview();
      await new Promise((r) => setTimeout(r, 1200));
      const row = window.__pierce('.mp-roombadges', p.shadowRoot)[0];
      if (!row) return null;
      return [...row.children].map((el) => el.dataset.mk).filter(Boolean)
        .map((mk) => { const id = mk.slice(2); return id.includes(':') ? id.split(':')[0] + ':' : id; });
    }, v.cards[0].name);
    const real = kinds(phoneGot[v.path] || []);
    await check(`Studio-Vorschau Handy „${v.cards[0].name}“ = echtes Handy`, !!prev && JSON.stringify(prev) === JSON.stringify(real),
      { vorschau: prev, handy: real });
  }
}
await finish();
