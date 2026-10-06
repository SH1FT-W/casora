// @zustand: demo
// Gemeldet (1.0.4, Weich): Im offenen Updates-Popup ein Update installiert, das einen Neustart
// braucht – „Wartet auf Neustart“ und „Jetzt neu starten“ erschienen erst nach Schließen und
// erneutem Öffnen. Erwartet: Das offene Popup baut sich selbst um (Zeile raus aus „Verfügbar“,
// Bereich „Wartet auf Neustart“ rein, Kopf mit „Jetzt neu starten“) und nach dem Neustart wieder
// zurück. Zustände nur im Browser (fakeStates), nichts geht an HA.
import { open, casoraDashboard, dashboard, cards, fakeStates, shot, check, need, finish } from './lib.mjs';

const has = (d) => /"casora_updates"/.test(JSON.stringify(d.config));
const dash = await casoraDashboard(has);
await need('Casora-Dashboard mit Updates-Kachel', dash);
const view = dash.config.views.find((v) => /"casora_updates"/.test(JSON.stringify(v))) || dash.config.views[0];
// Gemeldet im Weich-Look; Standard läuft über denselben Code (Liste/Bereich live) und wird mitgeprüft.
for (const theme of ['Casora', null]) {
const tag = theme ? 'weich' : 'standard';
console.log('  – ' + tag);
const { page } = await open(theme ? { width: 1440, height: 900, theme, dark: false } : { width: 1440, height: 900 });
await dashboard(page, dash.url + '/' + (view.path || '0'));

const A = 'update.qa_live_alpha', B = 'update.qa_live_beta';
const upd = (name, extra) => ({ state: 'on', attributes: { friendly_name: name, title: name, installed_version: '1.0.0',
  latest_version: '1.1.0', in_progress: false, release_summary: '', skipped_version: null, auto_update: false, ...extra } });
// Übrige Updates aus, damit nur die beiden Testeinträge zählen.
const others = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states)
  .filter((id) => id.startsWith('update.') && document.querySelector('home-assistant').hass.states[id].state === 'on'));
const S = Object.fromEntries(others.map((id) => [id, { state: 'off', attributes: { in_progress: false, release_summary: '' } }]));
S[A] = upd('QA Alpha'); S[B] = upd('QA Beta');
await fakeStates(page, S, { sticky: true });

// Das Demo-Dashboard hat keine eigene Updates-Kachel: wie die Glocke (openTarget in
// casora-core.js) eine unsichtbare Kachel mit der Vorlage anlegen und antippen.
const hit = await page.evaluate(async (ent) => {
  const ha = document.querySelector('home-assistant');
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: ['casora_updates'], entity: ent });
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 300));
  return await new Promise((res) => {
    el.addEventListener('hass-action', (ev) => {
      const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); res(true); } else res(false);
    }, { capture: true, once: true });
    try { el._handleAction({ detail: { action: 'tap' } }, { isIcon: false }); } catch (e) { res(false); }
    setTimeout(() => res(false), 1500);
  });
}, A);
await need('Updates-Popup geöffnet', hit);

await page.waitForTimeout(2500);

// Sichtbarer Text des Popups; „Wartet auf Neustart“-Zeilen = Text nach der Überschrift.
const pop = () => page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!p) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = window.__pierce('ha-card', p.shadowRoot || p).filter(vis).map((c) => c.innerText || '').join('\n');
  return txt.replace(/[ \t]+/g, ' ');
});
const step = async (label, patch) => {
  Object.assign(S, patch);
  await fakeStates(page, S, { sticky: true });
  await page.waitForTimeout(1500);
  await shot(tag + '_' + label);
  return pop();
};
const count = (t, re) => (t.match(re) || []).length;

const t0 = await pop();
await need('Updates-Popup offen', t0);
await shot(tag + '_1_vorher');
await check(tag + ': vorher: kein „Wartet auf Neustart“', !/Wartet auf Neustart/i.test(t0), t0.slice(0, 300));

await step('2_laeuft', { [A]: upd('QA Alpha', { in_progress: true }) });
const t3 = await step('3_installiert', { [A]: { ...upd('QA Alpha', { installed_version: '1.1.0', release_summary: 'Restart of Home Assistant required' }), state: 'off' } });
await check(tag + ': nach Installation: „Wartet auf Neustart“ erscheint im offenen Popup', /Wartet auf Neustart/i.test(t3), t3.slice(0, 400));
await check(tag + ': Neustart-Zeile „Neustart erforderlich“ sichtbar', /Neustart erforderlich/.test(t3), t3.slice(0, 400));
await check(tag + ': Beta weiter unter verfügbaren Updates', /QA Beta/.test(t3));

// Letztes offenes Update weg → Kopf wird „Wartet auf Neustart“ mit „Jetzt neu starten“.
const t4 = await step('4_nichts_offen', { [B]: { state: 'off', attributes: { installed_version: '1.1.0', in_progress: false } } });
await check(tag + ': nichts mehr offen: Kopf zeigt „Jetzt neu starten“', /Jetzt neu starten/.test(t4), t4.slice(0, 400));
await check(tag + ': „Wartet auf Neustart“ nur einmal', count(t4, /Wartet auf Neustart/ig) === 1, t4.slice(0, 400));

// Neustart erledigt: Hinweis weg → Bereich verschwindet.
const t5 = await step('5_neugestartet', { [A]: { state: 'off', attributes: { release_summary: '' } } });
await check(tag + ': nach Neustart: kein „Wartet auf Neustart“ mehr', !/Wartet auf Neustart|Jetzt neu starten/i.test(t5), t5.slice(0, 400));
await page.context().browser().close().catch(() => {});
}
await finish();
