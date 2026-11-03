// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/08-weich-kompakt.js custom_components/casora/scripts/local/03-popups.js
// Owner (03.11.2026, prod): the Software-Updates popup (v3) showed only "Verfügbare Updates · 1" while installed updates
// still waited for a restart – the group "Wartet auf Neustart" only appeared once nothing was left to install. Expected:
// with updates pending AND a restart owed, the list shows "Verfügbare Updates" and below it "Wartet auf Neustart" with
// the restart rows ("Neustart erforderlich"), each update once. And: the search result under the dial ("1 neues Update
// gefunden") no longer claims an update that has been installed since. Desktop 1440 and phone 393, Casora look,
// states only in the browser.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const A = 'update.qa_pending_alpha', R = 'update.qa_restart_beta';
const upd = (name, extra) => ({ state: 'on', attributes: { friendly_name: name, title: name, installed_version: '1.0.0',
  latest_version: '1.1.0', in_progress: false, release_summary: '', skipped_version: null, auto_update: false, supported_features: 1, ...extra } });

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  const others = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((id) => id.startsWith('update.') && (S[id].state === 'on' || /restart/i.test(String(S[id].attributes.release_summary || '')))); });
  const S = Object.fromEntries(others.map((id) => [id, { state: 'off', attributes: { in_progress: false, release_summary: '' } }]));
  S[A] = upd('QA Pending Alpha');
  S[R] = { ...upd('QA Restart Beta', { installed_version: '1.1.0', release_summary: 'Restart of Home Assistant required' }), state: 'off' };
  await fakeStates(page, S, { sticky: true });
  // Open the updates popup like the bell does: a hidden tile with the template, tapped.
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
  await need(label + ': Updates-Popup geöffnet', hit);
  await page.waitForTimeout(3000);
  const text = () => page.evaluate(() => {
    const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return '';
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return window.__pierce('ha-card', s).filter(vis).map((c) => c.innerText || '').join('\n').replace(/[ \t]+/g, ' ');
  });
  const t = await text();
  const count = (re) => (t.match(re) || []).length;
  await check(label + ': „Verfügbare Updates“ mit dem offenen Update', /Verfügbare Updates/i.test(t) && /Pending Alpha/.test(t), t.slice(0, 500));
  // The row says „Neustart erforderlich“ on the desktop; on the phone that value is a round restart button.
  await check(label + ': darunter „Wartet auf Neustart“ mit der Neustart-Zeile', /Wartet auf Neustart/i.test(t) && /Restart Beta/.test(t)
    && (size.mobile || /Neustart erforderlich/.test(t)), t.slice(0, 700));
  await check(label + ': jedes Update nur einmal, die Gruppe nur einmal', count(/Pending Alpha/g) === 1 && count(/Restart Beta/g) === 1
    && count(/Wartet auf Neustart/ig) === 1, t.slice(0, 700));
  await check(label + ': „Wartet auf Neustart“ steht unter den verfügbaren Updates', t.search(/Wartet auf Neustart/i) > t.search(/Verfügbare Updates/i), t.slice(0, 700));

  // A search that found Alpha, then Alpha got installed (now waiting for a restart too): the line under the dial must
  // not say "1 neues Update gefunden" any more.
  const st0 = await page.evaluate((id) => { const K = window._casoraUpdCheck; if (!K) return null;
    K.busy = false; K.err = false; K.last = Date.now(); K.found = 1; K.foundIds = [id]; return K.status().join(' · '); }, A);
  await need(label + ': Suche-Status vorhanden', st0 != null);
  await check(label + ': solange das gefundene Update offen ist, steht „1 neues Update gefunden“', /1 neues Update gefunden/.test(st0), st0);
  S[A] = { ...upd('QA Pending Alpha', { installed_version: '1.1.0', release_summary: 'Restart of Home Assistant required' }), state: 'off' };
  await fakeStates(page, S, { sticky: true });
  await page.waitForTimeout(2000);
  const st1 = await page.evaluate(() => { const K = window._casoraUpdCheck; K.paint(); return K.status().join(' · '); });
  const t1 = await text();
  await check(label + ': nach der Installation kein „neues Update gefunden“ mehr', !/neue[s]? Updates? gefunden/.test(st1) && !/neue[s]? Updates? gefunden/.test(t1), { st1 });
  // Names: with both rows in one list their shared leading word „QA“ is cut once (UI.popupNames).
  await check(label + ': nichts mehr offen: nur „Wartet auf Neustart“ mit beiden', /Wartet auf Neustart/i.test(t1) && /Pending Alpha/.test(t1)
    && /Restart Beta/.test(t1) && !/Verfügbare Updates/i.test(t1), t1.slice(0, 600));
  await page.context().close();
}
await finish();
