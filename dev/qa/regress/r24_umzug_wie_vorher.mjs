// @zustand: frisch
// @parallel: allein   (legt über den echten Umzug ein Casora-Dashboard an und löscht es am Ende)
// Umzugstest („wie ein iOS-Update“): Nach dem Umzug von Hemma 2 (Mein Zuhause (Hemma 2)) und
// Hemma 1 (Hemma 1 (Test)) hat jeder Raum dieselben Kacheln (Art, Entität, Reihenfolge) wie
// vorher, sein Foto, das Wetter (Hemma zeigte das Wetter der Übersicht in jedem Raum) und die
// Übersicht das Beleuchtungs-Badge (wo nicht ausgeschaltet), auch wenn Hemma nur eine Lichtgruppe eingetragen hatte.
// Das Original bleibt unverändert, eine Sicherung entsteht, das Handy-Layout kommt mit, das
// neue Dashboard zeigt keine Fehlerkarten. Aufräumen: neue Dashboards und Umzugs-Merker weg.
// Dazu ein selbst erweitertes Hemma 2 (eigene Kamera-Logik, eigenes Modul, Schreib-Automation):
// Frage-Schritt, „Meine“ → eigene Kachelart own_*, Modul bleibt geladen, Pfad bleibt.
import { open, ready, dashboard, check, need, finish } from './lib.mjs';
import { ws } from '../ws.mjs';

const { page } = await open({ width: 1440, height: 900, umzug: true });
const toStudio = () => ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzugRun && window.casoraUmzug; });
const c = await ws();
// Reste eines abgebrochenen Laufs zuerst weg.
for (const d of await c.cmd({ type: 'lovelace/dashboards/list' }))
  if (d.mode === 'storage' && /^qa-umzug-/.test(d.url_path)) await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
const before = (await c.cmd({ type: 'lovelace/dashboards/list' })).map((d) => d.url_path);
const settings0 = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
const made = [];

for (const src of ['hemma-zuhause', 'hemma-eins']) {
  if (!before.includes(src)) { await need('Hemma-Dashboard ' + src + ' im Zustand frisch', false); }
  const orig = JSON.stringify(await c.cmd({ type: 'lovelace/config', url_path: src }));
  await toStudio();
  const r = await page.evaluate(async (src) => {
    const p = window.__panel(); const U = window.casoraUmzug; const I = window.__casoraPanelInternals;
    const list = await U.candidates(p, { includeDone: true });
    const cand = list.find((x) => x.url_path === src);
    if (!cand) return { err: 'nicht gefunden' };
    const a = await U.analyze(cand, await p._bundleOnce(), p._hass);
    // Vorgeschlagener Name (03.10.2026): nie „(importiert …)“, nie leer.
    const proposed = U.proposeTitle(p, cand);
    a.newTitle = 'QA Umzug ' + src;
    p._flowOpen('full');
    const done = new Promise((resolve) => { const o = p._flowDone; p._flowDone = function (x) { p._flowDone = o; const res = o.call(this, x); resolve(x && x.url_path); return res; }; });
    p._casoraUmzugRun(a, {});
    const url = await Promise.race([done, new Promise((res) => setTimeout(() => res(null), 90000))]);
    if (!url) return { err: 'Umzug nicht fertig' };
    const sig = (t) => [[].concat(t.template || []).filter((x) => typeof x === 'string').join('+').replace(/^(hemma|casora)_/, ''), t.entity || ''].join('|');
    const cfg = await p._hass.callWS({ type: 'lovelace/config', url_path: url });
    const after = ((I.extractAny(cfg).compact || {}).rooms || []);
    const tilesA = (t) => (t.card && t.card.template === 'casora_custom' ? null : sig(t));
    return { url, legacy: a.legacy, proposed, own: a.own.map((x) => [].concat(x.tile.template || [])[0]),
      before: a.rooms.map((r) => ({ name: r.name, image: !!r.image, tiles: r.tiles.map((t) => sig(t.card || t)) })),
      after: after.map((r) => ({ name: r.name, image: !!(r.variables || {}).image, weather: !!((r.variables || {}).weather_entity || (r.variables || {}).weather_temp_sensor),
        lights: (r.variables || {}).show_lights !== false && !!((r.variables || {}).light_group_entity || (r.variables || {}).light_entity_1),
        tiles: (r.tiles || []).map((t) => (t.template === 'casora_custom' ? 'custom' : sig(t))) })) };
  }, src);
  if (r.err) { await check(src + ': Umzug läuft durch', false, r.err); continue; }
  made.push(r.url, r.url + '-mobile');
  await check(src + ': Name ohne „(importiert)“', !!r.proposed && !/importiert|imported/i.test(r.proposed), r.proposed);
  // Schalter, Aquarien und Türklingel (mit Kamera) sind Studio-Kacheln, keine eigenen Karten mehr.
  await check(src + ': Schalter/Aquarium/Türklingel als Studio-Kacheln', !r.own.some((t) => /_(switch|aquarium|doorbell)$/.test(t)), r.own);
  await check(src + ': gleiche Zahl Räume', r.before.length === r.after.length, r.before.length + ' → ' + r.after.length);
  for (const [i, b] of r.before.entries()) {
    const a = r.after[i] || { tiles: [] };
    // Türklingel → Kamera-Kachel mit derselben Kamera ist gewollt (Entscheidung 03.10.2026).
    const same = (t, x) => x === t || x === 'custom' || (/^doorbell\|camera\./.test(t) && x === t.replace(/^doorbell/, 'camera'));
    const diff = b.tiles.map((t, k) => (same(t, a.tiles[k]) ? null : `#${k + 1} ${t} → ${a.tiles[k]}`)).filter(Boolean);
    await check(`${src} / ${b.name}: Kacheln gleich (Art, Entität, Reihenfolge)`, b.tiles.length === a.tiles.length && !diff.length, diff.slice(0, 3));
    await check(`${src} / ${b.name}: Raumfoto`, !b.image || a.image);
  }
  const homeA = r.after[0] || {};
  if (homeA.weather) await check(src + ': Wetter in jedem Raum', r.after.every((x) => x.weather), r.after.filter((x) => !x.weather).map((x) => x.name));
  await check(src + ': Original unverändert', JSON.stringify(await c.cmd({ type: 'lovelace/config', url_path: src })) === orig);
  const list = (await c.cmd({ type: 'lovelace/dashboards/list' })).map((d) => d.url_path);
  await check(src + ': Handy-Layout angelegt', list.includes(r.url + '-mobile'));
  // F-06 (06.10.2026): Nach dem Umzug von Hemma 1 zeigte das Handy „Home“ statt „Zuhause“ – der
  // Handy-Titel (Kopf + Leiste) bekam die Übersicht nicht mit. Wie am Desktop: Standardname übersetzt.
  {
    const dcfg = await c.cmd({ type: 'lovelace/config', url_path: r.url });
    const homeAuto = /"casora_auto_name":"home"/.test(JSON.stringify(dcfg.views[0] || {}));
    const mcfg = await c.cmd({ type: 'lovelace/config', url_path: r.url + '-mobile' }).catch(() => null);
    const find = (x, f, d = 0) => { if (!x || typeof x !== 'object' || d > 12) return null; if (f(x)) return x;
      for (const y of Object.values(x)) { const h = find(y, f, d + 1); if (h) return h; } return null; };
    const nav = find(mcfg, (o) => o.type === 'custom:casora-mobile-nav');
    const head = find(mcfg, (o) => o.template === 'casora_mobile_weather');
    if (homeAuto) await check(src + ': Handy-Titel der Übersicht folgt der Sprache (Kopf + Leiste)',
      !!nav && nav.home_auto === true && !nav.home_label && !!head && (head.variables || {}).home_auto === true && !(head.variables || {}).home_name,
      { nav: nav && { home_auto: nav.home_auto, home_label: nav.home_label }, head: head && head.variables });
  }
  // Nur für Vorher/Nachher-Bilder: Handy-Startseite nach dem Umzug (R24_SHOT=<Pfad>, nur Hemma 1).
  if (process.env.R24_SHOT && r.legacy) {
    const ph = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false });
    await dashboard(ph.page, r.url + '-mobile/' + ((((await c.cmd({ type: 'lovelace/config', url_path: r.url + '-mobile' })).views || [])[0] || {}).path || '0'), 3);
    await ph.page.waitForTimeout(2500);
    await ph.page.screenshot({ path: process.env.R24_SHOT });
    await ph.browser.close();
  }
  // Dashboard ansehen: keine Fehlerkarten; Übersicht mit Beleuchtungs-Badge, wenn Hemma Lichter eingetragen hatte.
  await dashboard(page, r.url + '/' + 'home');
  const seen = await page.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    return { errs: window.__pierce('hui-error-card').filter(vis).length,
      lights: window.__pierce('button-card').filter((b) => vis(b) && [].concat((b._config || {}).template || []).includes('casora_badge_light_group')).length };
  });
  await check(src + ': keine Fehlerkarten', seen.errs === 0, seen.errs);
  if (homeA.lights) await check(src + ': Beleuchtungs-Badge in der Übersicht sichtbar', seen.lights > 0);
}

// Größe am Handy wie vorher (gemeldet 03.10.2026: nach dem Umzug alle Kacheln gleich groß).
// Hemma-Paar mit eigenem Handy-Dashboard (deutsch, „Favoriten“), darin große und ausdrücklich
// kleine Kacheln: nach dem Umzug dieselbe Größe am Handy und an der Raum-Kachel (dort speichert
// das Studio „Größe am Handy“, sonst ginge sie beim nächsten Speichern verloren).
{
  const base = ['hemma-zuhause', 'hemma-zwei'].find((u) => before.includes(u));
  await need('Hemma-2-Dashboard für das Hemma-Paar', !!base);
  await toStudio();
  const r = await page.evaluate(async (base) => {
    const p = window.__panel(); const h = p._hass; const U = window.casoraUmzug; const I = window.__casoraPanelInternals;
    const SRC = 'qa-umzug-hemma-paar';
    const raw = await h.callWS({ type: 'lovelace/config', url_path: base });
    const bundle = await p._bundleOnce();
    const desk = I.extractAny(window.casoraRename(JSON.parse(JSON.stringify(raw)), 'hemma'));
    const st = I.mobileFromRooms(bundle.mobile, bundle.templates, desk.compact.rooms);
    // Jede zweite Kachel mit Entität groß, die übrigen ausdrücklich klein.
    st.compact.rooms.forEach((sec) => (sec.tiles || []).forEach((t, k) => {
      if (t && t.entity) t.variables = { ...(t.variables || {}), size: k % 2 ? 'small' : 'large' };
    }));
    const mcfg = I.expandAny(st, { extras: {}, templates: bundle.templates });
    (function walk(cards) { (cards || []).forEach((c) => { if (!c) return;
      if (c.template === 'casora_mobile_header' && c.name === 'Favorites') c.name = 'Favoriten'; walk(c.cards); }); })(mcfg.views[0].cards);
    const hemma = (o) => JSON.parse(JSON.stringify(o).replace(/casora_/g, 'hemma_').replace(/custom:casora-/g, 'custom:hemma-'));
    for (const [u, cfg] of [[SRC, raw], [SRC + '-mobile', hemma(mcfg)]]) {
      await h.callWS({ type: 'lovelace/dashboards/create', url_path: u, title: 'QA Hemma Paar', show_in_sidebar: false, require_admin: false });
      await h.callWS({ type: 'lovelace/config/save', url_path: u, config: cfg });
    }
    const list = await U.candidates(p, { includeDone: true });
    const cand = list.find((x) => x.url_path === SRC);
    if (!cand || !cand.rawMobile) return { err: 'Hemma-Paar nicht als Kandidat mit Handy erkannt' };
    const a = await U.analyze(cand, bundle, h);
    a.newTitle = 'QA Umzug Paar neu';
    p._flowOpen('full');
    const done = new Promise((resolve) => { const o = p._flowDone; p._flowDone = function (x) { p._flowDone = o; const res = o.call(this, x); resolve(x && x.url_path); return res; }; });
    p._casoraUmzugRun(a, {});
    const url = await Promise.race([done, new Promise((res) => setTimeout(() => res(null), 90000))]);
    if (!url) return { err: 'Umzug nicht fertig' };
    const inner = (t) => { let c = t; while (c && c.type === 'conditional' && c.card) c = c.card; return c || {}; };
    const sig = (t0) => { const t = inner(t0); return [].concat(t.template || []).filter((x) => typeof x === 'string').join('+') + '|' + (t.entity || ''); };
    const sz = (t) => String((inner(t).variables || {}).size || '');
    const sizes = (secs) => secs.map((s) => (s.tiles || []).filter((t) => inner(t).entity).map((t) => sig(t) + '=' + (sz(t) || '-')));
    const afterM = (I.extractAny(await h.callWS({ type: 'lovelace/config', url_path: url + '-mobile' })).compact || {}).rooms || [];
    const afterD = (I.extractAny(await h.callWS({ type: 'lovelace/config', url_path: url })).compact || {}).rooms || [];
    const deskLarge = new Set();
    afterD.forEach((r) => (r.tiles || []).forEach((t) => { if (sz(t) === 'large') deskLarge.add(sig(t)); }));
    return { url, src: SRC, before: sizes(st.compact.rooms), after: sizes(afterM), desk: [...deskLarge] };
  }, base);
  if (r.err) await check('Hemma-Paar: Umzug läuft durch', false, r.err);
  else {
    made.push(r.src, r.src + '-mobile', r.url, r.url + '-mobile');
    const nBig = r.before.flat().filter((x) => /=large$/.test(x)).length;
    await check('Hemma-Paar: Handy-Testdaten haben große Kacheln', nBig > 0, nBig);
    await check('Hemma-Paar: gleiche Zahl Handy-Abschnitte', r.before.length === r.after.length, r.before.length + ' → ' + r.after.length);
    const diff = [];
    r.before.forEach((sec, i) => sec.forEach((x, k) => { if ((r.after[i] || [])[k] !== x) diff.push(`Abschnitt ${i + 1} #${k + 1}: ${x} → ${(r.after[i] || [])[k]}`); }));
    await check('Hemma-Paar: Größe am Handy wie vorher (groß/klein je Kachel)', !diff.length, diff.slice(0, 4));
    const desk = new Set(r.desk);
    const lost = r.before.flat().filter((x) => /=large$/.test(x)).map((x) => x.replace(/=large$/, '')).filter((s) => !desk.has(s));
    await check('Hemma-Paar: große Kacheln auch an der Raum-Kachel (Studio „Größe am Handy“)', !lost.length, lost.slice(0, 4));

    // Reparatur (gemeldet 04.10.2026): Umzüge vor 1.0.3 verloren die Größen beim ersten Speichern.
    // Nachstellen: alle Größen aus dem neuen Paar entfernen. Beim Öffnen im Studio holt Casora sie
    // einmalig aus der Umzugs-Sicherung (casora_sicherungen) zurück, mit Hinweis; danach nicht wieder.
    const rep = await page.evaluate(async ({ url }) => {
      const p = window.__panel(); const h = p._hass; const I = window.__casoraPanelInternals;
      const strip = (o) => { if (Array.isArray(o)) return o.forEach(strip); if (!o || typeof o !== 'object') return;
        if (o.variables && typeof o.variables === 'object' && 'size' in o.variables) delete o.variables.size;
        Object.keys(o).forEach((k) => { if (k !== 'button_card_templates') strip(o[k]); }); };
      for (const u of [url, url + '-mobile']) {
        const cfg = await h.callWS({ type: 'lovelace/config', url_path: u });
        strip(cfg.views);
        await h.callWS({ type: 'lovelace/config/save', url_path: u, config: cfg });
      }
      // Der Umzugs-Merker wird nach dem Fertig-Bildschirm geschrieben – kurz warten.
      for (let i = 0; i < 20; i++) {
        const um = ((await h.callWS({ type: 'casora/settings/get' })).settings || {}).umzug || {};
        if ((um.done || []).some((x) => x && x.target === url)) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      // Alle Meldungen in der Zeit mitschreiben: die Statuszeile kann bis zum Nachsehen schon
      // von einer späteren Meldung ersetzt sein (z. B. Vorlagen-Hinweis beim Laden).
      const open = async () => {
        const seen = [], orig = p._status;
        p._status = function (msg, kind) { if (msg) seen.push(String(msg)); return orig.call(this, msg, kind); };
        try {
          p._setDash(url); p._remember(url); await p._load();
          await new Promise((r) => setTimeout(r, 1500));
        } finally { p._status = orig; }
        return seen.join(' | ');
      };
      const inner = (t) => { let c = t; while (c && c.type === 'conditional' && c.card) c = c.card; return c || {}; };
      const sig = (t0) => { const t = inner(t0); return [].concat(t.template || []).filter((x) => typeof x === 'string').join('+') + '|' + (t.entity || ''); };
      const sizes = async () => ((I.extractAny(await h.callWS({ type: 'lovelace/config', url_path: url + '-mobile' })).compact || {}).rooms || [])
        .map((s) => (s.tiles || []).filter((t) => inner(t).entity).map((t) => sig(t) + '=' + (String((inner(t).variables || {}).size || '') || '-')));
      const stripped = await sizes();
      const note1 = await open();
      const after = await sizes();
      const note2 = await open();
      return { stripped, after, note1, note2 };
    }, { url: r.url });
    const flat = (x) => JSON.stringify(x);
    await check('Reparatur: Größen vorher entfernt', !rep.stripped.flat().some((x) => /=large$/.test(x)), rep.stripped.flat().slice(0, 3));
    await check('Reparatur: Größe am Handy wieder wie in Hemma', flat(rep.after) === flat(r.before),
      rep.after.flat().filter((x, k) => x !== r.before.flat()[k]).slice(0, 4));
    await check('Reparatur: Hinweis im Studio', /Hemma/.test(rep.note1 || ''), rep.note1);
    await check('Reparatur: nur einmal', !/Hemma/.test(rep.note2 || ''), rep.note2);
  }
}

// Selbst erweitertes Hemma 2 (gemeldet 03.10.2026: nach dem Umzug Kamera ohne eigene Standbild-Logik,
// eigenes Modul abgehängt). Synthetisch: (a) angepasste Kamera-Vorlage + Popup mit eigener Variable
// snapshot_path, (b) eigenes Modul als Ressource (/local/hemma-local/beispiel.js setzt
// window._hemmaBeispiel), (c) Automation, die nach www/hemma/snapshots schreibt. Erwartet: Der
// Frage-Schritt zeigt die Kamera (mit Popup, „Meine“ vorgewählt), „Meine“ ergibt eine eigene
// Kachelart own_*, das Modul bleibt geladen und die Kachel nutzt es, der Pfad bleibt.
// Mit CASORA_CONFIG_DIR (Konfigurationsordner des Test-HA) liegen Modul und Standbild als echte
// Dateien dort; ohne wird das Modul im Browser vorgeladen (wie eine geladene Ressource).
{
  const base = ['hemma-zuhause', 'hemma-zwei'].find((u) => before.includes(u));
  await need('Hemma-2-Dashboard für den eigenen Umbau', !!base);
  const SRC = 'qa-umzug-eigen';
  const MOD = '/local/hemma-local/beispiel.js';
  const SNAP = '/local/hemma/snapshots/beispiel_garten.jpg';
  const CFG = process.env.CASORA_CONFIG_DIR || '';
  const fs = await import('node:fs');
  const pth = await import('node:path');
  const MODJS = "window._hemmaBeispiel = { label: function (p) { return p ? 'Beispiel mit Standbild' : 'Beispiel ohne'; } };\n";
  if (CFG) {
    fs.mkdirSync(pth.join(CFG, 'www/hemma-local'), { recursive: true });
    fs.writeFileSync(pth.join(CFG, 'www/hemma-local/beispiel.js'), MODJS);
    fs.mkdirSync(pth.join(CFG, 'www/hemma/snapshots'), { recursive: true });
    fs.writeFileSync(pth.join(CFG, 'www/hemma/snapshots/beispiel_garten.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }
  const resBefore = await c.cmd({ type: 'lovelace/resources' });
  for (const x of resBefore) if (x.url === MOD) await c.cmd({ type: 'lovelace/resources/delete', resource_id: x.id });
  const res = await c.cmd({ type: 'lovelace/resources/create', res_type: 'module', url: MOD });
  // Automation, die Standbilder nach www/hemma/snapshots schreibt (landet in automations.yaml).
  const { tokens } = await import('../ws.mjs');
  const { access_token } = await tokens();
  const BASEURL = process.env.CASORA_URL || 'http://localhost:8124';
  const AUTO = 'qa_umzug_standbild';
  const autoRes = await fetch(BASEURL + '/api/config/automation/config/' + AUTO, {
    method: 'POST', headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias: 'QA Umzug Standbild', triggers: [{ trigger: 'event', event_type: 'qa_umzug_nie' }],
      actions: [{ action: 'camera.snapshot', target: { entity_id: 'camera.qa_beispiel' },
        data: { filename: "/config/www/hemma/snapshots/{{ 'beispiel_garten' }}.jpg" } }], mode: 'single' }),
  });
  await check('eigener Umbau: Automation angelegt', autoRes.ok, autoRes.status);

  // Seite neu, damit das Modul (Ressource bzw. vorgeladen) wie in einem echten Browser da ist.
  const o2 = await open({ width: 1440, height: 900, umzug: true });
  if (!CFG) await o2.context.addInitScript((js) => { try { (0, eval)(js); } catch (e) { /* egal */ } }, MODJS);
  const pg = o2.page;
  await ready(pg, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzugRun && window.casoraUmzug; });
  const r = await pg.evaluate(async ({ base, SRC, SNAP }) => {
    const p = window.__panel(); const h = p._hass; const U = window.casoraUmzug; const I = window.__casoraPanelInternals;
    const raw = await h.callWS({ type: 'lovelace/config', url_path: base });
    const T = raw.button_card_templates;
    // (a) Kamera: eigene Variable snapshot_path, Anzeige über das eigene Modul; Popup mit eigenem snapshot_dir.
    T.hemma_camera = JSON.parse(JSON.stringify(T.hemma_camera));
    T.hemma_camera.variables = { ...(T.hemma_camera.variables || {}), snapshot_path: null };
    T.hemma_camera.custom_fields = { ...(T.hemma_camera.custom_fields || {}),
      beispiel: "[[[ return window._hemmaBeispiel ? window._hemmaBeispiel.label(variables.snapshot_path) : 'Modul fehlt'; ]]]" };
    T.hemma_popup_camera = JSON.parse(JSON.stringify(T.hemma_popup_camera));
    T.hemma_popup_camera.variables = { ...(T.hemma_popup_camera.variables || {}), snapshot_dir: '/local/hemma/snapshots/' };
    let cam = null;
    (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object' || cam) return;
      if (o.type === 'custom:button-card' && [].concat(o.template || [])[0] === 'hemma_camera') { cam = o; return; }
      Object.values(o).forEach(walk); })(raw.views);
    if (!cam) return { err: 'keine Kamera-Kachel im Hemma-Dashboard' };
    cam.variables = { ...(cam.variables || {}), snapshot_path: SNAP };
    await h.callWS({ type: 'lovelace/dashboards/create', url_path: SRC, title: 'QA Hemma Eigen', show_in_sidebar: false, require_admin: false });
    await h.callWS({ type: 'lovelace/config/save', url_path: SRC, config: raw });
    const list = await U.candidates(p, { includeDone: true });
    const cand = list.find((x) => x.url_path === SRC);
    if (!cand) return { err: 'eigenes Hemma-Dashboard nicht als Kandidat erkannt' };
    const a = await U.analyze(cand, await p._bundleOnce(), h);
    const g = a.groups.find((x) => x.key === 'casora_camera');
    // Frage-Schritt wie im Assistenten (Bild für die Ablage), Auswahl wie der Knopf sie weitergibt.
    a.newTitle = 'QA Umzug Eigen neu';
    p._flowOpen('full');
    p._casoraUmzugChoose(a, {});
    await new Promise((res) => setTimeout(res, 1200));
    const card = [...p.shadowRoot.querySelectorAll('.cc-card')].find((c) => /Kamera|Camera/.test(c.textContent));
    const shown = card ? { text: card.textContent, mine: !!(card.querySelector('.cc-seg button.on') || {}).textContent
      && /Meine|Mine/.test(card.querySelector('.cc-seg button.on').textContent) } : null;
    return { g: g && { names: g.names, vars: g.vars, uses: g.uses.length }, shown, keep: a.keep, ownModules: a.ownModules,
      writeKept: (a.writeKept || []).map((x) => x.path) };
  }, { base, SRC, SNAP });
  made.push(SRC);
  if (r.err) await check('eigener Umbau: Vorbereitung', false, r.err);
  else {
    await check('Frage-Schritt: Kamera als angepasste Kachel', !!r.g && !!r.shown, r.g);
    await check('Frage-Schritt: Kamera-Popup gehört dazu', !!r.g && r.g.names.includes('casora_popup_camera'), r.g && r.g.names);
    await check('Frage-Schritt: eigene Variable snapshot_path erkannt', !!r.g && r.g.vars.includes('snapshot_path'), r.g && r.g.vars);
    await check('Frage-Schritt: „Meine“ vorgewählt (eigene Logik)', !!r.shown && r.shown.mine && r.keep.casora_camera === true, r.keep);
    await check('Übersicht: eigenes Modul erkannt', (r.ownModules || []).some((u) => u.indexOf('/local/hemma-local/beispiel.js') === 0), r.ownModules);
    await check('Übersicht: Pfad mit Schreib-Automation erkannt', (r.writeKept || []).includes('www/hemma/snapshots/'), r.writeKept);
    try { await pg.screenshot({ path: (process.env.CASORA_OUT || '/tmp/casora-qa') + '/r24_frage_schritt.png' }); } catch (e) { /* nur Ablage */ }

    // Umziehen mit „Meine“ für die Kamera.
    const m = await pg.evaluate(async () => {
      const p = window.__panel(); const I = window.__casoraPanelInternals;
      const U = window.casoraUmzug;
      const list = await U.candidates(p, { includeDone: true });
      const a = await U.analyze(list.find((x) => x.url_path === 'qa-umzug-eigen'), await p._bundleOnce(), p._hass);
      a.newTitle = 'QA Umzug Eigen neu';
      const byName = {};
      a.groups.forEach((g) => g.names.forEach((n) => { byName[n] = g.key === 'casora_camera' ? true : false; }));
      p._flowOpen('full');
      const done = new Promise((resolve) => { const o = p._flowDone; p._flowDone = function (x) { p._flowDone = o; const res = o.call(this, x); resolve(x && x.url_path); return res; }; });
      p._casoraUmzugRun(a, byName);
      const url = await Promise.race([done, new Promise((res) => setTimeout(() => res(null), 90000))]);
      if (!url) return { err: 'Umzug nicht fertig' };
      // Dateien übernehmen (carryFiles) läuft nach und schreibt danach den Fertig-Hinweis („… bleibt“):
      // auf den Hinweis warten statt fester 2,5 s – unter Last (paralleles Gate) dauert es länger.
      const rowsText = () => [...p.shadowRoot.querySelectorAll('.frow')].map((r) => r.textContent).join(' | ');
      for (let i = 0; i < 80 && !/snapshots/.test(rowsText()); i++) await new Promise((res) => setTimeout(res, 250));
      const cfg = await p._hass.callWS({ type: 'lovelace/config', url_path: url });
      const mob = await p._hass.callWS({ type: 'lovelace/config', url_path: url + '-mobile' }).catch(() => null);
      const T = cfg.button_card_templates || {};
      const bundle = await p._bundleOnce();
      const uses = (c, name) => { let n = 0; (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object') return;
        if ([].concat(o.template || []).includes(name)) n++; Object.keys(o).forEach((k) => { if (k !== 'button_card_templates') walk(o[k]); }); })(c && c.views); return n; };
      const rooms = (I.extractAny(cfg).compact || {}).rooms || [];
      I.syncUserTileTypes(T, rooms, null, cfg[I.FINGERPRINT_KEY]);
      const own = (I.USER_TILE_TYPES || []).find((t) => t.template === 'own_camera');
      const fin = [...p.shadowRoot.querySelectorAll('.frow')].map((r) => r.textContent).join(' | ');
      return { url, own: !!T.own_camera, ownPopup: !!T.own_popup_camera, meta: ((T.own_camera || {}).variables || {}).casora_tile,
        chain: (T.own_camera || {}).template, popupVar: ((T.own_popup_camera || {}).variables || {}).snapshot_dir,
        casoraIsShipped: JSON.stringify(T.casora_camera) === JSON.stringify(bundle.templates.casora_camera),
        fp: (cfg[I.FINGERPRINT_KEY] || {}).casora_camera, deskUses: uses(cfg, 'own_camera'), deskOld: uses(cfg, 'casora_camera'),
        mobUses: uses(mob, 'own_camera'), mobOld: uses(mob, 'casora_camera'),
        picker: own ? { id: own.id, label: own.label, own: own.own } : null,
        snapKept: JSON.stringify(cfg).indexOf('/local/hemma/snapshots/beispiel_garten.jpg') >= 0 && JSON.stringify(cfg).indexOf('/local/casora/snapshots/') < 0,
        finish: fin };
    });
    if (m.err) await check('eigener Umbau: Umzug läuft durch', false, m.err);
    else {
      made.push(m.url, m.url + '-mobile');
      try { await pg.screenshot({ path: (process.env.CASORA_OUT || '/tmp/casora-qa') + '/r24_fertig.png' }); } catch (e) { /* nur Ablage */ }
      await check('„Meine“: eigene Kachelart own_camera mit eigenem Popup', m.own && m.ownPopup, m);
      await check('„Meine“: Kachelart-Merkmal (casora_tile, Grundlage Kamera)', !!m.meta && m.meta.base === 'casora_camera' && m.meta.kept === true, m.meta);
      await check('„Meine“: Kachel bindet das eigene Popup ein', [].concat(m.chain || []).includes('own_popup_camera'), m.chain);
      await check('„Meine“: eigenes Popup behält snapshot_dir', m.popupVar === '/local/hemma/snapshots/', m.popupVar);
      await check('„Meine“: casora_camera ist wieder Casoras (bekommt Updates)', m.casoraIsShipped && m.fp !== 'eigene', m.fp);
      await check('„Meine“: Kacheln zeigen auf own_camera (Desktop)', m.deskUses > 0 && m.deskOld === 0, [m.deskUses, m.deskOld]);
      await check('„Meine“: Kacheln zeigen auf own_camera (Handy)', m.mobUses > 0 && m.mobOld === 0, [m.mobUses, m.mobOld]);
      await check('„Meine“: im Studio als eigene Kachelart', !!m.picker && m.picker.own === true, m.picker);
      await check('Pfad mit Schreib-Automation bleibt (/local/hemma/snapshots)', m.snapKept);
      await check('Fertig: Hinweis „Pfad bleibt“', /snapshots/.test(m.finish) && /Automation/.test(m.finish), m.finish.slice(0, 300));
      if (CFG) await check('Standbild nicht nach www/casora kopiert', !fs.existsSync(pth.join(CFG, 'www/casora/snapshots/beispiel_garten.jpg')));
      const resNow = await c.cmd({ type: 'lovelace/resources' });
      await check('Modul bleibt als Ressource registriert', resNow.some((x) => x.url === MOD));
      // Dashboard: Kachel nutzt das Modul (Vorlage ruft _casoraBeispiel, Modul setzt _hemmaBeispiel).
      await dashboard(pg, m.url + '/home');
      await pg.waitForTimeout(2500);
      const seen = await pg.evaluate(() => {
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        const cams = window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('own_camera'));
        const txt = cams.map((b) => { const f = b.shadowRoot && b.shadowRoot.querySelector('#beispiel'); return f ? f.textContent.trim() : ''; });
        return { n: cams.length, txt, errs: window.__pierce('hui-error-card').filter(vis).length, twin: typeof window._casoraBeispiel };
      });
      await check('Dashboard: Kamera-Kachel nutzt das eigene Modul', seen.n > 0 && seen.txt.some((x) => x === 'Beispiel mit Standbild'), seen);
      await check('Dashboard: keine Fehlerkarten', seen.errs === 0, seen.errs);
      try { await pg.screenshot({ path: (process.env.CASORA_OUT || '/tmp/casora-qa') + '/r24_dashboard.png' }); } catch (e) { /* nur Ablage */ }
    }
  }
  // Aufräumen: Ressource, Automation, Dateien.
  try { await c.cmd({ type: 'lovelace/resources/delete', resource_id: res.id }); } catch (e) { /* schon weg */ }
  await fetch(BASEURL + '/api/config/automation/config/' + AUTO, { method: 'DELETE', headers: { Authorization: 'Bearer ' + access_token } }).catch(() => {});
  if (CFG) {
    try { fs.rmSync(pth.join(CFG, 'www/hemma-local/beispiel.js')); } catch (e) { /* weg */ }
    try { fs.rmSync(pth.join(CFG, 'www/hemma/snapshots/beispiel_garten.jpg')); } catch (e) { /* weg */ }
  }
}

// Aufräumen: nur, was dieser Test angelegt hat, und den Umzugs-Merker wie vorher.
for (const d of await c.cmd({ type: 'lovelace/dashboards/list' }))
  if (made.includes(d.url_path) && !before.includes(d.url_path)) await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
const s1 = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
if (settings0.umzug) s1.umzug = settings0.umzug; else delete s1.umzug;
await c.cmd({ type: 'casora/settings/set', settings: s1 });
c.close();
await finish();
