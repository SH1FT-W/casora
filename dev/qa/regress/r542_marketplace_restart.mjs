// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#casoraNeedsRestart,casoraWatchRestarts custom_components/casora/scripts/local/03-popups.js custom_components/casora/updates.py
// HA 2026.11 builds HACS in as the Marketplace. After installing, its update entity is off with installed == latest
// and says nothing about the restart (HACS put "Restart of Home Assistant required" into release_summary); the
// restart is only a repair issue restart_required_<GitHub id>_<ref>. Casora's backend lists those entities
// (casora/updates/restarts) and the restart rule reads that list. Checked here: the subscription answers on the
// gate's HA, and with a Marketplace-like entity in that list the Updates tile says "Neustart ausstehend" and the
// popup lists it under "Wartet auf Neustart" with "Neustart erforderlich" – same as a HACS entity with the text.
// States only in the browser (fakeStates); the list is set the way the subscription sets it.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const M = 'update.qa_marketplace_repo', H = 'update.qa_hacs_repo';
const base = (name, extra) => ({ state: 'off', attributes: { friendly_name: name, title: name, installed_version: 'v1.1.0',
  latest_version: 'v1.1.0', in_progress: false, release_summary: null, skipped_version: null, auto_update: false,
  supported_features: 23, ...extra } });

const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url);

// 1. The backend command exists for every user and sends a list (empty on the gate's HA).
const sub = await page.evaluate(() => new Promise((res) => {
  const h = document.querySelector('home-assistant').hass;
  let unsub = null;
  const t = setTimeout(() => res({ timeout: true }), 5000);
  Promise.resolve(h.connection.subscribeMessage((ev) => { clearTimeout(t); res({ ev }); if (unsub) unsub(); },
    { type: 'casora/updates/restarts' })).then((u) => { unsub = u; }, (e) => { clearTimeout(t); res({ err: String(e && (e.message || e.code)) }); });
}));
await check('casora/updates/restarts antwortet mit einer Liste', sub.ev && Array.isArray(sub.ev.entity_ids), sub);
await check('Neustart-Beobachter im Dashboard', await page.evaluate(() => typeof window.casoraWatchRestarts === 'function'));

// 2. Everything else not pending, one Marketplace entity (no text) and one HACS entity (text).
const others = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).filter((id) => id.startsWith('update.') && (S[id].state === 'on' || /restart/i.test(String(S[id].attributes.release_summary || '')))); });
const S = Object.fromEntries(others.map((id) => [id, { state: 'off', attributes: { in_progress: false, release_summary: '' } }]));
S[M] = base('QA Marketplace Repo');
S[H] = base('QA Hacs Repo', { release_summary: 'Restart of Home Assistant required' });
await fakeStates(page, S, { sticky: true });
await page.evaluate((m) => { window._casoraRestartIds = { [m]: true }; }, M);
await page.waitForTimeout(800);
const rule = await page.evaluate(({ M, H }) => {
  const st = document.querySelector('home-assistant').hass.states;
  return { m: window.casoraNeedsRestart(st[M]), h: window.casoraNeedsRestart(st[H]) };
}, { M, H });
await check('Regel: Marketplace-Eintrag aus der Reparatur-Liste wartet auf Neustart', rule.m === true, rule);
await check('Regel: HACS-Text zählt weiter', rule.h === true, rule);

// 3. The popup, opened like the bell does.
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
}, M);
await need('Updates-Popup geöffnet', hit);
await page.waitForTimeout(3000);
const t = await page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return '';
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return window.__pierce('ha-card', s).filter(vis).map((c) => c.innerText || '').join('\n').replace(/[ \t]+/g, ' ');
});
await check('Popup: „Wartet auf Neustart“ mit dem Marketplace-Eintrag', /Wartet auf Neustart/i.test(t) && /Marketplace Repo/.test(t), t.slice(0, 700));
await check('Popup: HACS-Eintrag ebenso', /Hacs Repo/.test(t), t.slice(0, 700));
await check('Popup: „Neustart erforderlich“ in den Zeilen', /Neustart erforderlich/.test(t), t.slice(0, 700));
await page.context().close();
await finish();
