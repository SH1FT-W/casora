// @zustand: arbeit
// @parallel: allein   (speichert Casora-Einstellungen: Empfänger der Live-Aktivitäten)
// Live-Aktivitäten (Studio → Einstellungen → Live-Aktivitäten, live_activity.py): Die Seite zeigt den
// Test-Handy-Empfänger (notify.mobile_app_testhandy) und die gefundenen Geräte (Waschmaschine, Trockner,
// Geschirrspüler, Saugroboter, Drucker). Empfänger wählen + speichern → „Probe senden“ schreibt einen
// Eintrag ins Protokoll. Ein Testlauf (casora_mock.live_lauf, Waschmaschine A) erscheint im Protokoll als
// Start (laut) → Fortschritt (leise) → Fertig → Beendet (clear_notification). Der Knopf „Testlauf starten“
// steht nur im Testhaus auf der Seite.
// Nutzertests 17.10.: Geräteschalter aus → speichern → an → speichern → neu laden = an (Fund 1); Testlauf ohne
// Empfänger gesperrt (12); „An ein Handy geschickt.“ (9); „Aktualisieren“ im Kopf des Protokolls, Testlauf als
// eigener Block (10); Meldungen deutsch bei HA-Sprache Deutsch (6); Sauger-Lauf mit Fortschritt und Fertig (7);
// am Handy (393 px) öffnet Antippen einer Gerätezeile die Einstellungen, Steuerung rechts, Unterzeile umbrochen (3, 8, 11).
import { open, studioDashboard, studio, studioRetry, check, need, atFinish, finish, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await studioDashboard();
// Texte der Aktivitäten kommen in der HA-Sprache: für den Test Deutsch, danach wieder wie vorher (Gate-Haus: en).
const setLang = async (l) => { const c = await ws(); await c.cmd({ type: 'config/core/update', language: l }); c.close(); };
const lang0 = await (async () => { const c = await ws(); const r = await c.cmd({ type: 'get_config' }); c.close(); return r.language; })();
if (lang0 !== 'de') { await setLang('de'); atFinish(() => setLang(lang0)); }
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1600, height: 1000 });
await studio(page, dash);

// Am Ende: Empfänger wieder abwählen (räumt laufende Aktivitäten ab) und Testlauf stoppen.
atFinish(async () => {
  const c = await ws();
  try { await c.cmd({ type: 'call_service', domain: 'casora_mock', service: 'live_stopp', service_data: {} }); } catch (e) { /* ohne Mock */ }
  try { await c.cmd({ type: 'casora/live/set', targets: [], devices: {}, devices_replace: true }); } catch (e) { /* alte Casora */ }
  c.close();
});
{
  const c = await ws();
  try { await c.cmd({ type: 'call_service', domain: 'casora_mock', service: 'live_stopp', service_data: {} }); } catch (e) { /* ohne Mock */ }
  // Alle Geräte auf Standard (an), keine Empfänger – frühere Tests/Nutzer haben vielleicht Geräte ausgeschaltet.
  await c.cmd({ type: 'casora/live/set', targets: [], devices: {}, devices_replace: true });
  c.close();
}

const read = () => page.evaluate(() => {
  const p = window.__panel();
  const vis = (e) => !!e && e.offsetParent !== null;
  const chips = window.__pierce('.cs-wrap .casora-chip').filter(vis).map((b) => ({ id: b.title, label: b.textContent.trim(), on: b.classList.contains('on') }));
  const devices = window.__pierce('.cs-wrap .cs-live-row').filter(vis).map((r) => ({ id: r.dataset.device,
    title: r.querySelector('.rtext b')?.textContent.trim(), sub: r.querySelector('.rtext > span')?.textContent.trim(),
    on: r.querySelector('.fswitch')?.getAttribute('aria-checked') }));
  const log = window.__pierce('.cs-wrap .cs-live-log').filter(vis).map((r) => ({ title: r.querySelector('.rtext b')?.textContent.trim(),
    text: r.querySelector('.rtext > span')?.textContent.trim(), pct: r.querySelector('.cs-live-pct')?.textContent.trim() || '' }));
  const probe = window.__pierce('.cs-wrap .cs-live-probe button.ghost').find(vis);
  const run = window.__pierce('.cs-wrap .cs-live-run button.ghost').find(vis);
  const heads = window.__pierce('.cs-wrap .fhead').filter((h) => h.offsetParent !== null || h.parentElement.offsetParent !== null)
    .map((h) => (h.firstElementChild && h.firstElementChild.tagName === 'SPAN' ? h.firstElementChild : h).textContent.trim());
  const refresh = !!window.__pierce('.cs-wrap .fhead .cs-live-refresh').find(vis);
  const protoRow = window.__pierce('.cs-wrap .frow .rtext b').filter(vis).some((b) => b.textContent.trim() === 'Protokoll');
  const probeSub = window.__pierce('.cs-wrap .cs-live-probe .rtext > span').find(vis)?.textContent.trim() || '';
  return { page: p._csPage, chips, devices, log, heads, probe: probe ? { text: probe.textContent.trim(), disabled: probe.disabled } : null,
    run: run ? { text: run.textContent.trim(), disabled: run.disabled } : null, dirty: p._csDirty(), refresh, protoRow, probeSub };
});

let s = await studioRetry(page, dash, async () => {
  await page.evaluate(() => window.__panel()._csOpenPage('live'));
  await page.waitForFunction(() => window.__pierce('.cs-wrap .cs-live-row').some((r) => r.offsetParent !== null), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  return read();
});
await need('Seite „Live-Aktivitäten“ offen', s.page === 'live', s);
await check('Überschriften Empfänger · Geräte · Probe · Testlauf · Zuletzt gesendet (in dieser Reihenfolge)',
  ['Empfänger', 'Geräte', 'Probe', 'Testlauf', 'Zuletzt gesendet'].every((h, i, a) => s.heads.includes(h) && (!i || s.heads.indexOf(a[i - 1]) < s.heads.indexOf(h))), s.heads);
await check('Fund 10: „Aktualisieren“ im Kopf des Protokolls, keine Zeile „Protokoll“ unter den Einträgen', s.refresh && !s.protoRow, s);
const handy = s.chips.find((c) => c.id === 'notify.mobile_app_testhandy');
await check('Empfänger „Testhandy“ wählbar (noch aus)', handy && handy.label === 'Testhandy' && !handy.on, s.chips);
const kinds = (sub) => (sub || '').split(' · ')[0];
const found = new Set(s.devices.map((d) => kinds(d.sub)));
await check('Geräte erkannt: Waschmaschine, Trockner, Geschirrspüler, Saugroboter, 3D-Drucker',
  ['Waschmaschine', 'Trockner', 'Geschirrspüler', 'Saugroboter', '3D-Drucker'].every((k) => found.has(k)), [...found]);
await check('jedes Gerät mit Quelle, Stufe und Schalter an', s.devices.length >= 5 && s.devices.every((d) => /Geprüft|Ungetestet/.test(d.sub) && d.on === 'true'), s.devices);
await check('Probe ohne Empfänger gesperrt', s.probe && s.probe.disabled, s.probe);
await check('Fund 12: Testlauf-Knopf im Testhaus vorhanden, ohne Empfänger gesperrt', s.run && s.run.disabled, s.run);

// Fund 1: Gerät aus → speichern → an → speichern → neu laden = an
const saveNow = async () => {
  await page.evaluate(() => window.__pierce('.cs-save').find((b) => b.offsetParent !== null && !b.disabled)?.click());
  await page.waitForFunction(() => !window.__panel()._csDirty() && !(window.__panel()._cs || {}).busy, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
};
const devId = s.devices[0].id;
const toggle = () => page.evaluate((id) => window.__pierce('.cs-wrap .cs-live-row').find((r) => r.dataset.device === id).querySelector('.fswitch').click(), devId);
await toggle();
await saveNow();
let srv = await (async () => { const c = await ws(); const r = await c.cmd({ type: 'casora/live/get' }); c.close(); return r; })();
await check('Fund 1: aus gespeichert', srv.found.find((f) => f.device_id === devId)?.settings.on === false, srv.devices);
await toggle();
await saveNow();
srv = await (async () => { const c = await ws(); const r = await c.cmd({ type: 'casora/live/get' }); c.close(); return r; })();
await check('Fund 1: wieder an gespeichert (Server)', srv.found.find((f) => f.device_id === devId)?.settings.on === true && !srv.devices[devId], srv.devices);
await page.evaluate(async () => { const p = window.__panel(); await p._csLiveLoad(p._cs); p._csRender(); });
await page.waitForTimeout(600);
s = await read();
await check('Fund 1: nach Neuladen an', s.devices.find((d) => d.id === devId)?.on === 'true', s.devices);

// Empfänger antippen → Leiste wird schmutzig → speichern
await page.evaluate(() => window.__pierce('.cs-wrap .casora-chip').find((b) => b.title === 'notify.mobile_app_testhandy').click());
await page.waitForTimeout(400);
s = await read();
await check('Empfänger gewählt, Einstellungen ungespeichert', s.chips.find((c) => c.id === 'notify.mobile_app_testhandy')?.on && s.dirty, s);
await page.evaluate(() => window.__pierce('.cs-save').find((b) => b.offsetParent !== null && !b.disabled)?.click());
await page.waitForFunction(() => !window.__panel()._csDirty() && !(window.__panel()._cs || {}).busy, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
s = await read();
await check('gespeichert: Probe und Testlauf freigegeben', !s.dirty && s.probe && !s.probe.disabled && s.run && !s.run.disabled, s);

// Probe senden → Protokoll
await page.evaluate(() => window.__pierce('.cs-wrap .cs-live-probe button.ghost').find((b) => b.offsetParent !== null).click());
await page.waitForFunction(() => window.__pierce('.cs-wrap .cs-live-log').some((r) => r.offsetParent !== null), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);
s = await read();
// Benachrichtigungstexte folgen der Server-Sprache von HA (wie der Lüften-Push); das Test-HA steht auf Deutsch (Fund 6).
const lang = await (async () => { const c = await ws(); const r = await c.cmd({ type: 'get_config' }); c.close(); return r.language; })();
await need('HA-Sprache Deutsch im Test-HA (core config language de)', lang === 'de', lang);
const probeLine = s.log.find((l) => / · Probe$/.test(l.title));
await check('Probe im Protokoll: „Gerät · Probe“ (einmal), 42 %, deutscher Hinweistext', probeLine && probeLine.pct === '42%'
  && !/Probe · Probe$/.test(probeLine.title) && /Beispiel aus Casora – verschwindet in 2 Minuten/.test(probeLine.text), s.log);
await check('Fund 9: „An ein Handy geschickt.“', s.probeSub === 'An ein Handy geschickt.', s.probeSub);

// Testlauf an Waschmaschine A (30 s) → Start, Fortschritt, Fertig, Beendet
{
  const c = await ws();
  await c.cmd({ type: 'call_service', domain: 'casora_mock', service: 'live_lauf', service_data: { geraet: 'waschmaschine_a', sekunden: 30 } });
  c.close();
}
// Protokoll mitlesen, bis der Lauf beendet ist (30 s Lauf + Nachlauf), höchstens 75 s.
let wm = [];
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__panel()._csLiveRefresh());
  await page.waitForTimeout(600);
  s = await read();
  // Nur Einträge nach der Probe (das Protokoll überlebt Neustarts; davor kann ein älterer Lauf stehen).
  const ip = s.log.findIndex((l) => / · Probe$/.test(l.title));
  wm = (ip >= 0 ? s.log.slice(0, ip) : s.log).filter((l) => /^Waschmaschine A/.test(l.title));
  if (wm[0] && wm[0].title.endsWith('Beendet')) break;
}
const titles = wm.map((l) => l.title.replace(/^Waschmaschine A · /, ''));
await check('Testlauf: Start „Läuft“ im Protokoll', titles.includes('Läuft'), titles);
await check('Testlauf: Fortschritt mit Prozent und Phase', wm.some((l) => l.title.endsWith('Läuft') && /\d+%/.test(l.pct)
  && /Baumwolle 40 · (Waschen|Spülen|Schleudern)/.test(l.text)), wm);
await check('Testlauf: „Fertig · Wäsche rausnehmen“ (deutsch)', wm.some((l) => l.title.endsWith('Fertig') && l.text === 'Fertig · Wäsche rausnehmen'), wm);
await check('Fund 6: keine englischen Meldungstexte im Testlauf', !wm.some((l) => /\b(Running|Washing|Rinsing|Spinning|Ending soon|Done|Take out)\b/.test(l.text)), wm);
await check('Testlauf: zum Schluss „Beendet“ (Gerät aus → clear), genau einmal', wm[0] && wm[0].title.endsWith('Beendet')
  && wm[0].text === 'Live-Aktivität beendet' && wm.filter((l) => l.title.endsWith('Beendet')).length === 1, wm.slice(0, 3));

// Fund 7: Sauger-Testlauf (30 s) → Fortschritt + Fläche, danach „Fertig“ mit Fläche und Dauer
{
  const c = await ws();
  await c.cmd({ type: 'call_service', domain: 'casora_mock', service: 'live_lauf', service_data: { geraet: 'sauger', sekunden: 30 } });
  c.close();
}
let vac = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__panel()._csLiveRefresh());
  await page.waitForTimeout(600);
  s = await read();
  const iw = s.log.findIndex((l) => /^Waschmaschine A · Beendet$/.test(l.title));
  vac = (iw >= 0 ? s.log.slice(0, iw) : s.log).filter((l) => /^Testsauger/.test(l.title));
  if (vac.some((l) => l.title.endsWith('Fertig'))) break;
}
await check('Fund 7: Sauger läuft mit Fortschritt und Fläche', vac.some((l) => l.title.endsWith('Läuft') && /\d+%/.test(l.pct) && /m²/.test(l.text)), vac);
await check('Fund 7: Sauger „Fertig“ mit Fläche und Dauer', vac.some((l) => l.title.endsWith('Fertig') && /^Fertig · \d+ m² in \d+ Min\.$/.test(l.text)), vac);

// Handy (393 px): Gerätezeile antippen öffnet die Einstellungen (Fund 3), Steuerung rechts in der Zeile (11),
// Unterzeile vollständig (8).
{
  const { page: ph } = await open({ width: 393, height: 852, mobile: true });
  await studio(ph, dash);
  await ph.evaluate(() => window.__panel()._csOpenPage('live'));
  await ph.waitForFunction(() => window.__pierce('.cs-wrap .cs-live-row').some((r) => r.offsetParent !== null), null, { timeout: 30000 }).catch(() => {});
  await ph.waitForTimeout(800);
  const row = await ph.evaluateHandle(() => window.__pierce('.cs-wrap .cs-live-row').find((r) => r.offsetParent !== null));
  await row.scrollIntoViewIfNeeded();
  const b = await row.boundingBox();
  await ph.touchscreen.tap(b.x + 60, b.y + b.height / 2);
  await ph.waitForTimeout(800);
  const m = await ph.evaluate(() => {
    const vis = (e) => !!e && e.offsetParent !== null;
    const rows = window.__pierce('.cs-wrap .cs-live-opt').filter(vis);
    const subs = window.__pierce('.cs-wrap .cs-live-row .rtext > span').filter(vis);
    return { open: window.__pierce('.cs-wrap .cs-live-row.open').filter(vis).length, opts: rows.length,
      right: rows.map((r) => { const rb = r.getBoundingClientRect(), cb = r.querySelector('.cs-live-ctl').getBoundingClientRect();
        return { inRow: cb.top >= rb.top - 1 && cb.bottom <= rb.bottom + 1, rightGap: Math.round(rb.right - cb.right), leftOfText: cb.left > r.querySelector('.rtext').getBoundingClientRect().right - 1,
          vCenter: Math.abs((cb.top + cb.bottom) / 2 - (rb.top + rb.bottom) / 2) < 12 }; }),
      cut: subs.filter((sp) => sp.scrollWidth > sp.clientWidth + 1).map((sp) => sp.textContent) };
  });
  usePage(ph);
  await check('Fund 3: Handy – Antippen der Gerätezeile öffnet ihre Einstellungen', m.open === 1 && m.opts === 4, m);
  await check('Fund 11: Handy – Auswahl/Schalter rechts in derselben Zeile', m.right.length === 4
    && m.right.every((r) => r.inRow && r.leftOfText && r.vCenter && r.rightGap <= 24), m.right);
  await check('Fund 8: Handy – Geräte-Unterzeilen nicht abgeschnitten', !m.cut.length, m.cut);
  usePage(page);
}
await finish();
