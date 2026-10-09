// @zustand: arbeit
// @parallel: ui
// Gemeldet (1.2.2): Im Wetter-Popup waren die Regenmengen („mm“) unten minimal abgeschnitten.
// Erwartet: Mit Regen-Vorhersage (Stunden nur Menge, ohne Wahrscheinlichkeit) liegt jeder mm-Text
// vollständig innerhalb seines scrollenden Kastens, am Desktop (1440) und am Handy (393, WebKit), hell.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && JSON.stringify(d.config).includes('"casora_weather"'));
await need('Dashboard mit Wetter-Kachel', desk);

// Vorhersage mit Regenmengen in die Popup-Felder einsetzen (gleiche Renderer wie der Abo-Rückruf).
const fill = () => {
  const keys = Object.keys(window._hwRender || {});
  if (!keys.length) return 'kein Renderer';
  const t0 = Date.now();
  const hourly = Array.from({ length: 12 }, (_, i) => ({ datetime: new Date(t0 + i * 3600000).toISOString(),
    condition: i % 2 ? 'rainy' : 'pouring', temperature: 14 + i % 3, precipitation: [0.3, 1.25, 0, 12.4][i % 4] }));
  const daily = Array.from({ length: 7 }, (_, i) => ({ datetime: new Date(t0 + i * 86400000).toISOString(),
    condition: 'rainy', temperature: 18 + i, templow: 9 + i % 2, precipitation: [2.4, 0, 13.1, 0.6][i % 4] }));
  let n = 0;
  for (const k of keys) {
    // Spätere Abo-Rückrufe des Test-HA (nur Wahrscheinlichkeiten) sollen die Testdaten nicht überschreiben.
    const R = window._hwRender[k];
    if (!R._echt) { R._echt = { hourly: R.hourly, daily: R.daily }; R.hourly = () => R._echt.hourly(hourly); R.daily = () => R._echt.daily(daily); }
    window.__pierce('.hw-slot-hourly-' + k).forEach((el) => { el.innerHTML = R.hourly(); n++; });
    window.__pierce('.hw-slot-daily-' + k).forEach((el) => { el.innerHTML = R.daily(); n++; });
  }
  return n;
};
// Jeder Regentext muss innerhalb aller Vorfahren liegen, die senkrecht abschneiden (overflow-y hidden/clip,
// z. B. die seitlich scrollende Stunden-Reihe); senkrecht scrollende Flächen (Popup) zählen nicht.
const measure = () => window.__pierce('.hw-hr, .hw-dr').filter((el) => /mm/.test(el.textContent)).map((el) => {
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  let worst = 0, n = el.parentElement || (el.getRootNode() && el.getRootNode().host);
  while (n && n.tagName !== 'CASORA-POPUP') {
    const cs = getComputedStyle(n);
    if (/hidden|clip/.test(cs.overflowY)) {
      const p = n.getBoundingClientRect();
      worst = Math.max(worst, r.bottom - (p.top + n.clientTop + n.clientHeight));
    }
    n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
  }
  return { t: el.textContent, over: Math.round(worst * 10) / 10, h: Math.round(r.height * 10) / 10 };
});

async function run(label, opts, url, pick) {
  const { page } = await open({ ...opts, dark: false });
  usePage(page);
  await dashboard(page, url, 3);
  const at = await page.evaluate((tpl) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(tpl));
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, pick);
  await need(label + ': Wetter-Kachel', at);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__pierce('[class^="hw-slot-hourly-"], [class*=" hw-slot-hourly-"]').length > 0, null, { timeout: 10000 }).catch(() => {});
  const n = await page.evaluate(fill);
  await check(label + ': Vorhersage eingesetzt', typeof n === 'number' && n > 0, n);
  await page.waitForTimeout(2500);
  await page.evaluate(fill);
  await page.waitForTimeout(600);
  // WETTER_SHOT=<pfad>: Ausschnitt der Stunden-Reihe als Bild (Vorher/Nachher-Vergleich).
  if (process.env.WETTER_SHOT) {
    const c = await page.evaluate(() => { const s = window.__pierce('.hw-src.rain').find((e) => e.getBoundingClientRect().width > 0);
      if (s) s.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = s && s.getBoundingClientRect(); return r && { x: r.x - 8, y: r.y - 8, width: Math.min(r.width + 16, 420), height: r.height + 16 }; });
    if (c) await page.screenshot({ path: process.env.WETTER_SHOT + '-' + label + '.png', clip: c });
  }
  const m = await page.evaluate(measure);
  const bad = m.filter((x) => x.over > 0.5);
  await check(label + ': mm-Texte vorhanden', m.length >= 4, m.length);
  await check(label + ': mm-Texte nicht abgeschnitten', !bad.length, bad.slice(0, 4));
}

await run('Desktop', { width: 1440, height: 900 }, desk.url + '/' + (desk.config.views[0].path || '0'), 'casora_weather');
const phone = all.find((d) => d.url === desk.url + '-mobile');
if (phone) await run('Handy', { width: 393, height: 852, mobile: true, safari: true }, phone.url + '/' + (phone.config.views[0].path || '0'), 'casora_weather');
await finish();
