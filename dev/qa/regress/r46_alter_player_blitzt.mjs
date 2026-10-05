// @zustand: arbeit
// @parallel: ui
// Gemeldet (05.10.2026): Nach Cache leeren/Neuladen zeigte der Casora-Look erst kurz den alten
// Player (Desktop: Kachel-Stapel unter der Welle, Handy: Medien-Zeile), bis die Skripte
// 09-weich-wiedergabe.js / 10-weich-welle.js nachgeladen waren. Erwartet: Die Vorlagen erkennen
// den Casora-Look schon beim ersten Zeichnen am Theme (--casora-popup-layout: soft) und blenden den
// alten Player aus; in Hemma 2 bleibt er sichtbar. Die Zusatz-Skripte werden hier blockiert
// (Zustand „noch nicht geladen“). Nur im Browser, gespeichert wird nichts.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora-Dashboard mit Raumkarte', dash);

const IDS = ['media_player.qa_welle_1', 'media_player.qa_welle_2', 'media_player.qa_welle_3'];

// Wiedergabe in den Raumkarten einschalten, mit drei eigenen Playern (nur in diesem Browser).
const INIT = (ids) => {
  const fix = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(fix); return; }
    if (o.variables && [].concat(o.template || []).includes('casora_room')) {
      o.variables.show_now_playing = true;
      ids.forEach((id, i) => { o.variables['media_player_' + (i + 1)] = id; });
    }
    for (const k in o) fix(o[k]);
  };
  const add = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function (t, fn, opt) {
    if (t !== 'message') return add.call(this, t, fn, opt);
    return add.call(this, t, function (ev) {
      if (typeof ev.data === 'string' && ev.data.includes('"casora_room"') && ev.data.includes('"views"')) {
        try { const d = JSON.parse(ev.data); fix(d); ev = new MessageEvent('message', { data: JSON.stringify(d) }); } catch (e) { /* unverändert */ }
      }
      return fn.call(this, ev);
    }, opt);
  };
};

const now = new Date().toISOString();
const player = (title, i) => ({ state: 'playing', attributes: { friendly_name: 'QA Lautsprecher ' + i, media_title: title,
  media_artist: 'QA', media_duration: 300, media_position: 60, media_position_updated_at: now, media_content_type: 'music',
  supported_features: 4127295 } });

async function look(theme) {
  const { page, context } = await open({ width: 1440, height: 900, dark: false, theme, scale: 1 });
  await context.route(/\/local\/(09-weich-wiedergabe|10-weich-welle)\.js/, (r) => r.abort());
  await context.addInitScript(INIT, IDS);
  await dashboard(page, dash.url);
  await fakeStates(page, { [IDS[0]]: player('Erster Titel', 1), [IDS[1]]: player('Zweiter Titel', 2) }, { sticky: true });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const np = window.__pierce('button-card').filter((c) => [].concat(c._config?.template || []).includes('casora_now_playing'));
    return np.map((c) => {
      const m = c.shadowRoot && c.shadowRoot.getElementById('np_main');
      const b = m && m.getBoundingClientRect();
      return { display: m ? getComputedStyle(m).display : null, h: b ? Math.round(b.height) : 0, loaded: typeof window._casoraNPSoft === 'object' };
    });
  });
  await page.close();
  return r;
}

const soft = await look('Casora');
await need('Wiedergabe-Karte im Casora-Look', soft.length, soft);
await check('Skripte blockiert (Zustand vor dem Nachladen)', soft.every((x) => !x.loaded), soft);
await check('Casora-Look: alter Stapel schon beim ersten Zeichnen aus', soft.every((x) => x.display === 'none' || x.h === 0), soft);
const legacy = await look('Hemma 2');
await need('Wiedergabe-Karte in Hemma 2', legacy.length, legacy);
await check('Hemma 2: Stapel bleibt sichtbar', legacy.some((x) => x.display !== 'none' && x.h > 0), legacy);
await finish();
