// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel-updates.js custom_components/casora/update*.py custom_components/casora/release_notes.py
// Casora installs nothing itself (HACS default-store review, hacs/default#12143). Studio › Updates
// shows the new version and offers "Update via HACS": it opens Casora's page in HACS
// (/hacs/repository/<id>), without that page HACS' update entry (more-info). No update.install from
// the Studio. The notes of a new version have the same button at the bottom, the installed one none.
// After HACS installed: "restart needed". Without a HACS entry: no button, only the hint.
// (Formerly r84_updates_installieren_hacs: the Studio called update.install on HACS' entity.)
// Browser only: the answer of casora/updates/list, states and service calls are faked
// (fakeStates, callService/callWS intercepted), nothing goes to HA.
// @parallel: ui
import { open, studio, studioDashboard, fakeStates, shot, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
await studio(page, dash);

const E = 'update.qa_hacs_casora';
const URL_HACS = '/hacs/repository/424242';
await page.evaluate(({ E, URL_HACS }) => {
  const ha = document.querySelector('home-assistant');
  // Next stable number, also from a beta (26.10.60b1 → 26.10.61).
  const bump = (v) => { const p = String(v).replace(/^v/, '').split('-')[0].split('.').map((x) => parseInt(x, 10)); return `${p[0]}.${p[1]}.${(p[2] || 0) + 1}`; };
  window.__qaUpd = { calls: [], done: false, entity: E, url: URL_HACS, pushed: [], moreInfo: [] };
  const patch = (h) => {
    if (!h || h.__qaUpd) return;
    const ws = h.callWS.bind(h);
    const svc = h.callService.bind(h);
    h.callWS = async (msg) => {
      const r = await ws(msg);
      if (msg && msg.type === 'casora/updates/list') {
        const q = window.__qaUpd;
        const latest = bump(r.installed);
        Object.assign(r, { hacs: true, own_check: false, entity_id: q.entity, via: q.entity ? 'hacs' : null,
          hacs_url: q.url, latest, update_available: !q.done, pending_restart: q.done ? latest : null });
        const g = (r.groups || []).find((x) => x.kind === 'casora');
        if (g && !g.releases.some((x) => x.version === latest)) {
          g.releases.unshift({ kind: 'casora', version: latest, date: '2026-10-08', source: 'github', notes_md: '- **QA neu**',
            notes_html: '<ul><li><strong>QA neu</strong></li></ul>', summary: 'QA neu' });
        }
      }
      return r;
    };
    h.callService = async (domain, service, data) => {
      if (domain === 'update') { window.__qaUpd.calls.push([domain, service, data]); return []; }
      return svc(domain, service, data);
    };
    h.__qaUpd = true;
  };
  patch(ha.hass);
  const orig = ha._updateHass;
  ha._updateHass = function (obj) { const r = orig.call(this, obj); patch(this.hass); return r; };
  // Navigation and more-info: only record, stay in the Studio.
  const push = history.pushState.bind(history);
  history.pushState = function (st, t, url) {
    if (String(url || '').startsWith('/hacs/')) { window.__qaUpd.pushed.push(String(url)); return; }
    return push(st, t, url);
  };
  window.addEventListener('hass-more-info', (ev) => window.__qaUpd.moreInfo.push(ev.detail && ev.detail.entityId), true);
}, { E, URL_HACS });
await fakeStates(page, { [E]: { state: 'on', attributes: { friendly_name: 'Casora Update', installed_version: 'v1.0.0',
  latest_version: 'v9.9.9', in_progress: false, supported_features: 23, release_url: 'https://github.com/SH1FT-W/casora/releases/v9.9.9' } } },
{ sticky: true });

const LABEL = /Über HACS aktualisieren|Update via HACS/;
const openUpdates = async () => {
  await page.evaluate(() => { const p = window.__panel(); p._cuData = null; if (p._cuOpen) p._cuClose(); p._cuOpenPage(); });
  await page.waitForTimeout(2500);
};
const hero = () => page.evaluate((src) => {
  const re = new RegExp(src);
  const h = window.__pierce('.cu-hero').find((x) => x.getClientRects().length);
  const bs = h ? [...h.querySelectorAll('button')] : [];
  return h ? { text: h.innerText.replace(/\s+/g, ' '), hacs: bs.filter((b) => re.test(b.textContent)).length,
    install: bs.filter((b) => /^(Installieren|Install)$/.test(b.textContent.trim())).length } : null;
}, LABEL.source);
const clickHacs = () => page.evaluate(async (src) => {
  const re = new RegExp(src);
  const b = window.__pierce('.cu-hero button').find((x) => re.test(x.textContent));
  if (!b || b.disabled) return false;
  b.click();
  await new Promise((r) => setTimeout(r, 600));
  return true;
}, LABEL.source);

// 1) New version: button to HACS, no Install; tap opens Casora's HACS page.
await openUpdates();
const h0 = await hero();
await shot('1_neu');
await need('Updates-Kopf da', h0, h0);
await check('Knopf „Über HACS aktualisieren“, kein „Installieren“', h0.hacs === 1 && h0.install === 0, h0);
await check('Knopf gedrückt', await clickHacs());
const q1 = await page.evaluate(() => window.__qaUpd);
await check('öffnet die HACS-Seite von Casora', q1.pushed.length === 1 && q1.pushed[0] === URL_HACS, q1.pushed);
await check('kein update.install aus dem Studio', q1.calls.every((c) => c[1] !== 'install'), q1.calls);

// 1b) Notes of the new version: same button at the bottom; installed version without one. An installed beta
// (26.10.60b1) has no notes of its own in the list – then the newest listed version below the new one.
await openUpdates();
const rows = await page.evaluate(() => {
  const p = window.__panel(); const d = p._cuData;
  const out = {};
  const items = window.__pierce('.cu-item').map((it) => ({ it, v: (it.querySelector('.cu-v') || {}).textContent }));
  const inst = items.find((x) => x.v === d.installed) || items.find((x) => x.v !== d.latest);
  items.forEach(({ it, v }) => {
    if (v === d.latest || (inst && it === inst.it)) {
      const body = it.querySelector('.cu-body');
      if (body && body.hidden) it.querySelector('.cu-row').click();
      out[v === d.latest ? 'neu' : 'inst'] = it.querySelectorAll('.cu-rowinst').length;
      if (v !== d.latest) out.instV = v;
    }
  });
  return out;
});
await shot('1b_was_ist_neu');
await check('„Was ist neu“ der neuen Version: Knopf zu HACS', rows.neu === 1, rows);
await check('installierte Version: kein Knopf', rows.inst === 0, rows);

// 2) Without HACS page (repo id unknown): more-info of HACS' update entry.
await page.evaluate(() => Object.assign(window.__qaUpd, { url: null, pushed: [], moreInfo: [] }));
await openUpdates();
await clickHacs();
const q2 = await page.evaluate(() => window.__qaUpd);
await check('ohne HACS-Seite: Mehr-Info von HACS\' Eintrag', q2.moreInfo.includes(E) && !q2.pushed.length, q2);

// 3) HACS installed it: restart needed.
await page.evaluate(() => Object.assign(window.__qaUpd, { url: '/hacs/repository/424242', done: true }));
await openUpdates();
const h3 = await hero();
await shot('3_neustart');
await check('danach: Neustart nötig, über HACS', h3 && /Neustart nötig|restart needed/i.test(h3.text) && /HACS/.test(h3.text), h3);

// 4) No HACS entry for Casora: no button, hint.
await page.evaluate(() => Object.assign(window.__qaUpd, { done: false, entity: null, url: null }));
await openUpdates();
const h4 = await hero();
await shot('4_ohne_eintrag');
await check('ohne Eintrag: kein Knopf', h4 && h4.hacs === 0 && h4.install === 0, h4);
await check('ohne Eintrag: Hinweis auf HACS', h4 && /HACS/.test(h4.text), h4);

await finish();
