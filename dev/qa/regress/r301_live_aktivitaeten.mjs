// @zustand: arbeit
// @parallel: allein   (speichert Casora-Einstellungen: Empfänger der Live-Aktivitäten)
// Live-Aktivitäten (Studio → Einstellungen → Live-Aktivitäten, live_activity.py): Die Seite zeigt den
// Test-Handy-Empfänger (notify.mobile_app_testhandy) und die gefundenen Geräte (Waschmaschine, Trockner,
// Geschirrspüler, Saugroboter, Drucker). Empfänger wählen + speichern → „Probe senden“ schreibt einen
// Eintrag ins Protokoll. Ein Testlauf (casora_mock.live_lauf, Waschmaschine A) erscheint im Protokoll als
// Start (laut) → Fortschritt (leise) → Fertig → Beendet (clear_notification). Der Knopf „Testlauf starten“
// steht nur im Testhaus auf der Seite.
import { open, studioDashboard, studio, studioRetry, check, need, atFinish, finish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1600, height: 1000 });
await studio(page, dash);

// Am Ende: Empfänger wieder abwählen (räumt laufende Aktivitäten ab) und Testlauf stoppen.
atFinish(async () => {
  const c = await ws();
  try { await c.cmd({ type: 'call_service', domain: 'casora_mock', service: 'live_stopp', service_data: {} }); } catch (e) { /* ohne Mock */ }
  try { await c.cmd({ type: 'casora/live/set', targets: [] }); } catch (e) { /* alte Casora */ }
  c.close();
});
{
  const c = await ws();
  await c.cmd({ type: 'casora/live/set', targets: [] });
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
  const heads = window.__pierce('.cs-wrap .fhead').filter(vis).map((h) => h.textContent.trim());
  return { page: p._csPage, chips, devices, log, heads, probe: probe ? { text: probe.textContent.trim(), disabled: probe.disabled } : null,
    run: run ? { text: run.textContent.trim(), disabled: run.disabled } : null, dirty: p._csDirty() };
});

let s = await studioRetry(page, dash, async () => {
  await page.evaluate(() => window.__panel()._csOpenPage('live'));
  await page.waitForFunction(() => window.__pierce('.cs-wrap .cs-live-row').some((r) => r.offsetParent !== null), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  return read();
});
await need('Seite „Live-Aktivitäten“ offen', s.page === 'live', s);
await check('Überschriften Empfänger · Geräte · Probe · Zuletzt gesendet', ['Empfänger', 'Geräte', 'Probe', 'Zuletzt gesendet'].every((h) => s.heads.includes(h)), s.heads);
const handy = s.chips.find((c) => c.id === 'notify.mobile_app_testhandy');
await check('Empfänger „Testhandy“ wählbar (noch aus)', handy && handy.label === 'Testhandy' && !handy.on, s.chips);
const kinds = (sub) => (sub || '').split(' · ')[0];
const found = new Set(s.devices.map((d) => kinds(d.sub)));
await check('Geräte erkannt: Waschmaschine, Trockner, Geschirrspüler, Saugroboter, 3D-Drucker',
  ['Waschmaschine', 'Trockner', 'Geschirrspüler', 'Saugroboter', '3D-Drucker'].every((k) => found.has(k)), [...found]);
await check('jedes Gerät mit Quelle, Stufe und Schalter an', s.devices.length >= 5 && s.devices.every((d) => /Geprüft|Ungetestet/.test(d.sub) && d.on === 'true'), s.devices);
await check('Probe ohne Empfänger gesperrt', s.probe && s.probe.disabled, s.probe);
await check('Testlauf-Knopf im Testhaus vorhanden', s.run && !s.run.disabled, s.run);

// Empfänger antippen → Leiste wird schmutzig → speichern
await page.evaluate(() => window.__pierce('.cs-wrap .casora-chip').find((b) => b.title === 'notify.mobile_app_testhandy').click());
await page.waitForTimeout(400);
s = await read();
await check('Empfänger gewählt, Einstellungen ungespeichert', s.chips.find((c) => c.id === 'notify.mobile_app_testhandy')?.on && s.dirty, s);
await page.evaluate(() => window.__pierce('.cs-save').find((b) => b.offsetParent !== null && !b.disabled)?.click());
await page.waitForFunction(() => !window.__panel()._csDirty() && !(window.__panel()._cs || {}).busy, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
s = await read();
await check('gespeichert: Probe freigegeben', !s.dirty && s.probe && !s.probe.disabled, s);

// Probe senden → Protokoll
await page.evaluate(() => window.__pierce('.cs-wrap .cs-live-probe button.ghost').find((b) => b.offsetParent !== null).click());
await page.waitForFunction(() => window.__pierce('.cs-wrap .cs-live-log').some((r) => r.offsetParent !== null), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);
s = await read();
// Benachrichtigungstexte folgen der Server-Sprache von HA (wie der Lüften-Push) – deutsch oder englisch.
const probeLine = s.log.find((l) => / · (Probe|Test)$/.test(l.title));
await check('Probe im Protokoll: „Gerät · Probe“ (einmal), 42 %, Hinweistext', probeLine && probeLine.pct === '42%'
  && !/(Probe|Test) · (Probe|Test)$/.test(probeLine.title) && /(Beispiel aus Casora|Sample from Casora)/.test(probeLine.text), s.log);

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
  const ip = s.log.findIndex((l) => / · (Probe|Test)$/.test(l.title));
  wm = (ip >= 0 ? s.log.slice(0, ip) : s.log).filter((l) => /^Waschmaschine A/.test(l.title));
  if (wm[0] && wm[0].title.endsWith('Beendet')) break;
}
const titles = wm.map((l) => l.title.replace(/^Waschmaschine A · /, ''));
await check('Testlauf: Start „Läuft“ im Protokoll', titles.includes('Läuft'), titles);
await check('Testlauf: Fortschritt mit Prozent und Phase', wm.some((l) => l.title.endsWith('Läuft') && /\d+%/.test(l.pct)
  && /Baumwolle 40 · (Waschen|Spülen|Schleudern|Washing|Rinsing|Spinning)/.test(l.text)), wm);
await check('Testlauf: „Fertig · Wäsche rausnehmen“', wm.some((l) => l.title.endsWith('Fertig') && /(Wäsche rausnehmen|Take out the laundry)/.test(l.text)), wm);
await check('Testlauf: zum Schluss „Beendet“ (Gerät aus → clear), genau einmal', wm[0] && wm[0].title.endsWith('Beendet')
  && wm[0].text === 'Live-Aktivität beendet' && wm.filter((l) => l.title.endsWith('Beendet')).length === 1, wm.slice(0, 3));
await finish();
