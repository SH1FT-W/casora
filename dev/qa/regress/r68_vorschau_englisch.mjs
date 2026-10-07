// @zustand: arbeit
// Gemeldet (07.10.2026): In der Studio-Vorschau mit englischer Oberfläche blieben „Alles sicher“
// (Sicherheits-Badge) und „Jalousien“ (Gruppen-Überschrift am Handy) deutsch, ebenso Kachel-Zustände
// wie „3 Räume“ oder „Bereit“. Diese Wörter kommen deutsch aus den Dashboard-Skripten; das
// Dashboard übersetzt sie, die Vorschau tat es nicht. Erwartet: „All secure“ in Vorschau (Desktop
// und Handy) und Dashboard, kein bekanntes deutsches Wort mehr in der Vorschau.
// Zustände werden nur im Browser untergeschoben (alles zu), Theme „Casora“.
import { open, casoraDashboards, studio, dashboard, fakeStates, stable, check, need, finish } from './lib.mjs';

const dash = (await casoraDashboards()).find((d) => !d.mobile);
await need('Desktop-Dashboard', dash);
const { page } = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora', lang: 'en', locale: 'en-US' });

const allClosed = async () => {
  const patch = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states; const o = {};
    for (const e of Object.keys(S)) {
      const dc = S[e].attributes.device_class;
      if (e.startsWith('binary_sensor.') && ['door', 'window', 'opening', 'garage_door'].includes(dc)) o[e] = { state: 'off' };
      if (e.startsWith('lock.')) o[e] = { state: 'locked' };
      if (e.startsWith('alarm_control_panel.')) o[e] = { state: 'pending' };
      if (e.startsWith('camera.')) o[e] = { state: 'idle' };
    }
    return o; });
  await fakeStates(page, patch, { sticky: true });
};
// Sichtbare Texte, die die Dashboard-Übersetzung kennt (also deutsch geblieben sind), und alle Texte.
const texts = (inPanel) => {
  const tr = window.casoraTr || ((x) => x); const left = new Set(), seen = new Set();
  (function walk(r) { const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const v = n.data.trim(), p = n.parentNode;
      if (!v || !/[A-Za-z]/.test(v) || !p || /STYLE|SCRIPT/.test(p.nodeName)) continue;
      if (!(p.getBoundingClientRect && p.getBoundingClientRect().width > 0)) continue;
      seen.add(v); if (tr(v) !== v || /[äöüÄÖÜß]/.test(v)) left.add(v); }
    r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); })(inPanel ? window.__panel().shadowRoot : document);
  return { tr: typeof window.casoraTr, german: [...left], secure: seen.has('All secure'), alles: seen.has('Alles sicher') };
};

await studio(page, dash.url);
await allClosed();
for (const size of ['desktop', 'phone']) {
  await page.evaluate((size) => { const p = window.__panel(); p._room = 0; p._renderTabs(); p._renderForm();
    p._miniSize = size; p._bSyncSize && p._bSyncSize(); p._rebuildPreview(); }, size);
  const r = await stable(page, texts, true, { max: 8000 });
  await check(`Vorschau ${size}: Übersetzung geladen`, r && r.tr === 'function', r);
  await check(`Vorschau ${size}: Sicherheit „All secure“`, r && r.secure && !r.alles, r);
  await check(`Vorschau ${size}: keine deutschen Reste`, r && !r.german.length, r && r.german);
}
// Ohne Dashboard-Übersetzung nimmt die Vorschau eigene englische Überschriften – auch für Jalousien.
const src = await page.evaluate(() => fetch('/casora_panel/casora-panel.js').then((r) => r.text()).catch(() => ''));
await check('Vorschau: englischer Rückfall kennt „Blinds“', /covers: "Blinds"/.test(src));

await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));
await allClosed();
const sec = await stable(page, () => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group') && b.getBoundingClientRect().width > 0)
  .map((b) => b.shadowRoot.querySelector('ha-card').innerText.replace(/\s+/g, ' ').trim()));
await check('Dashboard: Sicherheit „All secure“', sec && sec.length && sec.every((t) => /All secure/.test(t)), sec);
await finish();
