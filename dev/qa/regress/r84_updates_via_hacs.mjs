// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel-updates.js custom_components/casora/update*.py custom_components/casora/release_notes.py
// Casora installs nothing itself (HACS default-store review, hacs/default#12143): Studio › Updates
// asks HACS. "Install" calls HA's update.install on HACS' update entity for Casora (HACS downloads
// casora.zip); a beta row installs exactly that version (version = its tag). "Open in HACS" opens
// Casora's page in HACS (/hacs/repository/<id>), without that page HACS' update entry (more-info).
// After HACS installed: "restart needed". Without a HACS entry: no button, only the hint.
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
  window.__qaUpd = { calls: [], done: false, doneVer: null, entity: E, url: URL_HACS, pushed: [], moreInfo: [] };
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
          hacs_url: q.url, latest, update_available: !q.done, pending_restart: q.done ? (q.doneVer || latest) : null });
        const g = (r.groups || []).find((x) => x.kind === 'casora');
        // A beta after the new stable one (e.g. 26.10.62b1).
        const beta = bump(latest) + 'b1';
        if (g && !g.releases.some((x) => x.version === beta)) {
          g.releases.unshift({ kind: 'casora', version: beta, date: '2026-10-07', source: 'github', prerelease: true,
            notes_md: '- **QA beta**', notes_html: '<ul><li><strong>QA beta</strong></li></ul>', summary: 'QA beta' });
        }
        if (g && !g.releases.some((x) => x.version === latest)) {
          g.releases.unshift({ kind: 'casora', version: latest, date: '2026-10-08', source: 'github', notes_md: '- **QA neu**',
            notes_html: '<ul><li><strong>QA neu</strong></li></ul>', summary: 'QA neu' });
        }
      }
      return r;
    };
    h.callService = async (domain, service, data) => {
      if (domain === 'update') {
        const q = window.__qaUpd; q.calls.push([domain, service, data]);
        if (service === 'install') { q.done = true; q.doneVer = data.version ? String(data.version).replace(/^v/, '') : null; }
        return [];
      }
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

const LABEL = /In HACS öffnen|Open in HACS/;
const INSTALL = /^(Installieren|Install)$/;
const openUpdates = async () => {
  await page.evaluate(() => {
    const p = window.__panel(); p._cuData = null; p._cuErr = null; if (p._cuOpen) p._cuClose();
    p._ask = async () => true;  // confirm dialog: yes
    p._cuOpenPage();
  });
  await page.waitForTimeout(2500);
};
const hero = () => page.evaluate(({ src, ins }) => {
  const re = new RegExp(src); const ir = new RegExp(ins);
  const h = window.__pierce('.cu-hero').find((x) => x.getClientRects().length);
  const bs = h ? [...h.querySelectorAll('button')] : [];
  return h ? { text: h.innerText.replace(/\s+/g, ' '), hacs: bs.filter((b) => re.test(b.textContent)).length,
    install: bs.filter((b) => ir.test(b.textContent.trim())).length } : null;
}, { src: LABEL.source, ins: INSTALL.source });
const clickHero = (src) => page.evaluate(async (src) => {
  const re = new RegExp(src);
  const b = window.__pierce('.cu-hero button').find((x) => re.test(x.textContent.trim()));
  if (!b || b.disabled) return false;
  b.click();
  await new Promise((r) => setTimeout(r, 3500));
  return true;
}, src);
const reset = () => page.evaluate((u) => Object.assign(window.__qaUpd, { calls: [], done: false, doneVer: null, pushed: [], moreInfo: [], url: u }), URL_HACS);

// 1) New version: "Install" and "Open in HACS"; Install calls update.install on HACS' entry without a version.
await openUpdates();
const h0 = await hero();
await shot('1_new');
await need('Updates-Kopf da', h0, h0);
await check('Knöpfe „Installieren“ und „In HACS öffnen“', h0.install === 1 && h0.hacs === 1, h0);
await check('Installieren gedrückt', await clickHero(INSTALL.source));
const q1 = await page.evaluate(() => window.__qaUpd);
await check('update.install an HACS\' Eintrag, ohne Version', q1.calls.length === 1 && q1.calls[0][1] === 'install'
  && q1.calls[0][2].entity_id === E && !q1.calls[0][2].version, q1.calls);
const h1 = await hero();
await shot('1b_restart');
await check('danach: Neustart nötig, kein Fehler', h1 && /Neustart nötig|restart needed/i.test(h1.text) && !/geklappt|didn't work/i.test(h1.text), h1);

// 2) Beta row: installs exactly that version (tag v…b1).
await reset();
await openUpdates();
const beta = await page.evaluate(async () => {
  const items = window.__pierce('.cu-item');
  const it = items.find((x) => /b1$/.test((x.querySelector('.cu-v') || {}).textContent || ''));
  if (!it) return null;
  const body = it.querySelector('.cu-body');
  if (body && body.hidden) it.querySelector('.cu-row').click();
  const b = it.querySelector('.cu-rowinst');
  if (!b) return { v: it.querySelector('.cu-v').textContent, btn: false };
  b.click();
  await new Promise((r) => setTimeout(r, 3500));
  return { v: it.querySelector('.cu-v').textContent, btn: true };
});
const q2 = await page.evaluate(() => window.__qaUpd);
await shot('2_beta');
await check('Beta-Zeile hat „Installieren“', beta && beta.btn, beta);
await check('Beta: update.install mit ihrer Version', q2.calls.length === 1 && q2.calls[0][2].version === 'v' + (beta && beta.v), q2.calls);

// 3) Installed version has no button.
await reset();
await openUpdates();
const inst = await page.evaluate(() => {
  const d = window.__panel()._cuData;
  const it = window.__pierce('.cu-item').find((x) => (x.querySelector('.cu-v') || {}).textContent === String(d.installed));
  if (!it) return null;
  const body = it.querySelector('.cu-body');
  if (body && body.hidden) it.querySelector('.cu-row').click();
  return it.querySelectorAll('.cu-rowinst').length;
});
await check('installierte Version: kein Knopf', inst === 0 || inst === null, inst);

// 4) "Open in HACS" opens Casora's HACS page; without that page HACS' update entry (more-info).
await check('In HACS öffnen gedrückt', await clickHero(LABEL.source));
const q4 = await page.evaluate(() => window.__qaUpd);
await check('öffnet die HACS-Seite von Casora', q4.pushed.length === 1 && q4.pushed[0] === URL_HACS, q4.pushed);
await page.evaluate(() => Object.assign(window.__qaUpd, { url: null, pushed: [], moreInfo: [] }));
await openUpdates();
await clickHero(LABEL.source);
const q5 = await page.evaluate(() => window.__qaUpd);
await check('ohne HACS-Seite: Mehr-Info von HACS\' Eintrag', q5.moreInfo.includes(E) && !q5.pushed.length, q5);

// 5) No HACS entry for Casora: no button, hint.
await page.evaluate(() => Object.assign(window.__qaUpd, { done: false, entity: null, url: null }));
await openUpdates();
const h5 = await hero();
await shot('5_no_entry');
await check('ohne Eintrag: kein Knopf', h5 && h5.hacs === 0 && h5.install === 0, h5);
await check('ohne Eintrag: Hinweis auf HACS', h5 && /HACS/.test(h5.text), h5);

await finish();
