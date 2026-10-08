// @zustand: arbeit
// @parallel: ui
// Gewünscht (05.10.2026): Die Liste unter der Welle (Casora-Look, Desktop/Tablet) ist offen, sobald
// etwas läuft – auch nach dem Neuladen. Selbst zugeklappt (Escape/Welle) bleibt sie auf
// diesem Gerät zu, auch nach dem Neuladen, bis eine NEUE Wiedergabe startet. Schließt sie sich von
// selbst (nichts läuft mehr), zählt das nicht als „zu“. Nur im Browser, gespeichert wird nichts.
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


const { page, context } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', scale: 1, welleAuto: true });
await context.addInitScript(INIT, IDS);
const menu = () => page.evaluate(() => !!document.querySelector('.casora-welle-menu'));
const memo = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('casora.welle.offen') || 'null'); } catch (e) { return null; } });
const until = async (fn, want, ms = 6000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (v === want) return v; await page.waitForTimeout(250); } return v; };
const play = (a, b) => fakeStates(page, { [IDS[0]]: a ? player(a, 1) : { state: 'off' }, [IDS[1]]: b ? player(b, 2) : { state: 'off' }, [IDS[2]]: { state: 'off' } }, { sticky: true });

await dashboard(page, dash.url);
await page.evaluate(() => localStorage.removeItem('casora.welle.offen'));
await play('Erster Titel', 'Zweiter Titel');
await check('Läuft etwas: Liste öffnet von selbst', await until(menu, true));

await page.keyboard.press('Escape');
await check('Escape klappt zu', await until(menu, false, 3000) === false);
const m1 = await memo();
await check('Zugeklappt wird gemerkt', m1 && m1.open === false, m1);

await page.reload();
await dashboard(page, dash.url);
await play('Erster Titel', 'Zweiter Titel');
await page.waitForTimeout(4000);
await check('Nach Neuladen bleibt sie zu (gleiche Wiedergabe)', !(await menu()));

await play('Neuer Titel', 'Zweiter Titel');
await check('Neue Wiedergabe öffnet sie wieder', await until(menu, true));

await play(null, null);
await check('Nichts läuft mehr: Liste schließt sich', (await until(menu, false)) === false);
const m2 = await memo();
await check('Selbst-Schließen zählt nicht als „zu“', m2 && m2.open === true, m2);

await page.reload();
await dashboard(page, dash.url);
await play('Dritter Titel', null);
await check('Nach Neuladen mit Wiedergabe: offen', await until(menu, true));
await finish();
