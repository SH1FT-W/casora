// @zustand: arbeit
// Gemeldet (07.10.2026): In der Studio-Vorschau mit englischer Oberfläche blieben „Alles sicher“
// (Sicherheits-Badge) und „Jalousien“ (Gruppen-Überschrift am Handy) deutsch, ebenso Kachel-Zustände
// wie „3 Räume“ oder „Bereit“. Diese Wörter kommen deutsch aus den Dashboard-Skripten; das
// Dashboard übersetzt sie, die Vorschau tat es nicht. Erwartet: „All secure“ in Vorschau (Desktop
// und Handy) und Dashboard, kein bekanntes deutsches Wort mehr in der Vorschau.
// Zustände werden nur im Browser untergeschoben (alles zu), Theme „Casora“. Raumnamen sind
// Nutzerdaten und bleiben, wie angelegt; eigene Kachelnamen übersetzt die Vorschau wie das Dashboard.
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
  // Raumnamen legt der Nutzer an (im Haus „arbeit“ deutsch) – sie zählen nicht als deutsche Reste.
  const rooms = new Set(inPanel ? ((window.__panel()._state || {}).compact || { rooms: [] }).rooms.map((r) => String(r.name || '').trim()) : []);
  (function walk(r) { const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const v = n.data.trim(), p = n.parentNode;
      if (!v || !/[A-Za-z]/.test(v) || !p || /STYLE|SCRIPT/.test(p.nodeName)) continue;
      if (!(p.getBoundingClientRect && p.getBoundingClientRect().width > 0)) continue;
      seen.add(v); if (!rooms.has(v) && (tr(v) !== v || /[äöüÄÖÜß]/.test(v))) left.add(v); }
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
// Raumnamen (07.10.2026, 1.1.1): Das Dashboard übersetzt deutsche Standardnamen („Küche“ → „Kitchen“),
// die Vorschau zeigt dieselben Namen. Studio-Listen und Eingabefelder behalten den eingegebenen Namen.
await page.evaluate(() => { const p = window.__panel(); p._room = 0; p._renderTabs(); p._renderForm();
  p._miniSize = 'desktop'; p._bSyncSize && p._bSyncSize(); p._rebuildPreview(); });
const prev = await stable(page, () => {
  const p = window.__panel(); const rooms = p._state.compact.rooms;
  const tabs = [...p.shadowRoot.querySelectorAll('.mini-tab:not(.scenes):not(.hid)')].map((t) => t.textContent.trim());
  return { tabs, raw: rooms.map((r) => p._roomLabel(r)), shown: rooms.map((r) => p._roomShown(r)) };
}, null, { max: 8000 });
await check('Vorschau: Raumleiste übersetzt mindestens einen Raumnamen', prev && prev.shown.some((n, i) => n !== prev.raw[i]), prev);
await check('Studio: eingegebene Raumnamen bleiben unübersetzt', prev && prev.raw.some((n) => /[äöüß]|zimmer|Küche|Flur|Büro/i.test(n)), prev && prev.raw);

// Ohne Dashboard-Übersetzung nimmt die Vorschau eigene englische Überschriften – auch für Jalousien.
const src = await page.evaluate(() => fetch('/casora_panel/casora-panel.js').then((r) => r.text()).catch(() => ''));
await check('Vorschau: englischer Rückfall kennt „Blinds“', /covers: "Blinds"/.test(src));

await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));
await allClosed();
const sec = await stable(page, () => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group') && b.getBoundingClientRect().width > 0)
  .map((b) => b.shadowRoot.querySelector('ha-card').innerText.replace(/\s+/g, ' ').trim()));
await check('Dashboard: Sicherheit „All secure“', sec && sec.length && sec.every((t) => /All secure/.test(t)), sec);
const navNames = await stable(page, () => window.__pierce('casora-nav').flatMap((n) => [...(n.shadowRoot || n).querySelectorAll('.route .label')])
  .filter((l) => l.getBoundingClientRect().width > 0).map((l) => l.textContent.trim()));
await check('Raumnamen: Vorschau-Leiste = Dashboard-Leiste', navNames && navNames.length && prev
  && navNames.join('|') === prev.tabs.join('|'), { dashboard: navNames, vorschau: prev && prev.tabs });
await finish();
