// @zustand: arbeit
// Weich 1.0.7: Die Medien-Welle oben rechts öffnet am Desktop ein Panel (Liste wie „Aktuelle
// Wiedergabe“) statt den Kachel-Stapel über input_boolean.casora_now_playing_minimized aufzuklappen.
// Erwartet: Tipp auf die Welle öffnet das Panel unter der Welle mit je Player einer Zeile, der
// Helfer bleibt unberührt, der Stapel bleibt verborgen; Play/Pause ruft media_play_pause; Tipp
// Welle und Escape schließen (Tipp daneben nicht mehr, 08.10.2026); endet die letzte Wiedergabe, schließt das Panel sich selbst.
// Nur im Browser: Design „Casora“, Wiedergabe in der Raumkarte und Player werden untergeschoben,
// Dienstaufrufe für media_player werden abgefangen.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora-Dashboard mit Raumkarte', dash);

const IDS = ['media_player.qa_welle_1', 'media_player.qa_welle_2', 'media_player.qa_welle_3'];
const { page, context } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', scale: 1 });
// Wiedergabe in den Raumkarten einschalten, mit drei eigenen Playern (nur in diesem Browser).
await context.addInitScript((ids) => {
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
}, IDS);
await dashboard(page, dash.url);

const now = new Date().toISOString();
const player = (title, i) => ({ state: 'playing', attributes: { friendly_name: 'QA Lautsprecher ' + i, media_title: title,
  media_artist: 'QA', media_duration: 300, media_position: 60, media_position_updated_at: now, media_content_type: 'music',
  supported_features: 4127295 } });
await fakeStates(page, { [IDS[0]]: player('Erster Titel', 1), [IDS[1]]: player('Zweiter Titel', 2), [IDS[2]]: player('Dritter Titel', 3) }, { sticky: true });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__qaCalls = [];
  const h = document.querySelector('home-assistant').hass, orig = h.callService;
  h.callService = function (d, s, data) {
    window.__qaCalls.push(d + '.' + s);
    if (d === 'media_player') return Promise.resolve();
    return orig.apply(this, arguments);
  };
});

const state = () => page.evaluate(() => {
  const m = document.querySelector('.casora-welle-menu');
  const sr = m && [...m.querySelectorAll('div')].map((d) => d.shadowRoot).filter(Boolean)[0];
  const np = window.__pierce('button-card').filter((c) => [].concat(c._config?.template || []).includes('casora_now_playing'));
  const stack = np.map((c) => c.shadowRoot?.getElementById('np_main')).filter(Boolean).map((e) => e.getBoundingClientRect().height);
  return { open: !!m && m.style.opacity !== '0', rows: sr ? sr.querySelectorAll('.r').length : 0,
    box: m ? m.getBoundingClientRect().toJSON() : null, stack,
    helper: document.querySelector('home-assistant').hass.states['input_boolean.casora_now_playing_minimized']?.state,
    calls: window.__qaCalls.slice() };
});
const wave = () => page.evaluate(() => {
  const r = window.__pierce('.np-head-wave').map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0)[0];
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, bottom: r.bottom } : null;
});

const w = await wave();
await need('Medien-Welle sichtbar', w);
const before = await state();
await page.mouse.click(w.x, w.y);
await page.waitForTimeout(1000);
const opened = await state();
await check('Welle öffnet das Panel mit drei Zeilen', opened.open && opened.rows >= 3, opened);
await check('Panel liegt unter der Welle und im Fenster', opened.box && opened.box.top >= w.bottom && opened.box.right <= 1440 && opened.box.left >= 0, opened.box);
await check('Kachel-Stapel bleibt verborgen', opened.stack.every((h) => h === 0), opened.stack);
await check('Helfer casora_now_playing_minimized unberührt', opened.helper === before.helper && !opened.calls.some((c) => c.startsWith('input_boolean')), opened);

const btn = await page.evaluate(() => {
  const sr = [...document.querySelector('.casora-welle-menu').querySelectorAll('div')].map((d) => d.shadowRoot).filter(Boolean)[0];
  const r = sr.querySelector('.r .p').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(btn.x, btn.y);
await page.waitForTimeout(600);
const paused = await state();
await check('Play/Pause in der Zeile ruft media_play_pause, Panel bleibt offen', paused.calls.includes('media_player.media_play_pause') && paused.open, paused.calls);

// 08.10.2026: Tipp daneben schließt NICHT mehr – nur die Welle (oder Escape) klappt zu.
await page.mouse.click(300, 650);
await page.waitForTimeout(700);
await check('Tipp daneben lässt offen', (await state()).open);
// Raumwechsel am Desktop (andere Ansicht, zurück zur ersten): die Liste kommt an der Welle zurück.
const views = (dash.config.views || []).map((v, i) => v.path || String(i));
if (views.length > 1) {
  // Ab hier wie im echten Betrieb: Ohne Welle im Raum klappt die Liste vorübergehend zu und kommt zurück.
  await page.evaluate(() => { window.CASORA_QA_NO_WELLE_AUTO = false; });
  const go = (p) => page.evaluate((u) => { history.pushState(null, '', u); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, '/' + dash.url + '/' + p);
  await go(views[1]); await page.waitForTimeout(2000);
  let there = false;
  for (let i = 0; i < 10 && !there; i++) { await page.waitForTimeout(500); there = (await state()).open; }
  await go(views[0]); await page.waitForTimeout(1500);
  let back = false;
  for (let i = 0; i < 12 && !back; i++) { await page.waitForTimeout(500); back = (await state()).open; }
  const dbg = await page.evaluate(() => ({ memo: localStorage.getItem('casora.welle.offen'), waves: window.__pierce('.np-head-wave').map((w) => { const r = w.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), busy: !!(window.casoraPopup && window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open')), path: location.pathname }));
  await check('Raumwechsel blendet die Liste nicht dauerhaft aus', back, { imRaum: there, dbg });
  await page.evaluate(() => { window.CASORA_QA_NO_WELLE_AUTO = true; });
}
await page.mouse.click(w.x, w.y);
await page.waitForTimeout(700);
await check('Welle schließt', !(await state()).open);

await page.mouse.click(w.x, w.y);
await page.waitForTimeout(900);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await check('Escape schließt', !(await state()).open);

await page.mouse.click(w.x, w.y);
await page.waitForTimeout(900);
await fakeStates(page, Object.fromEntries(IDS.map((id) => [id, { state: 'off', attributes: {} }])), { sticky: true });
await page.waitForTimeout(1500);
const ende = await state();
await check('Letzte Wiedergabe beendet: Panel schließt sich selbst', !ende.open, ende);
await finish();
