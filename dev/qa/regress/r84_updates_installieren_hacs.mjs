// @zustand: arbeit
// Gemeldet (1.1.1): „Installieren“ unter Studio › Updates tat nichts. Das Studio rief update.install
// auf eine nicht mehr geladene eigene Update-Entität auf (Casora kam über HACS), HA übersprang
// den Aufruf still, keine Rückmeldung. Erwartet: Aufruf an HACS' Update-Entität für Casora,
// Fortschritt sichtbar, danach „installiert – Neustart nötig“; tut der Aufruf nichts, eine
// Fehlermeldung statt Stille; ohne Update-Entität Knopf aus mit Hinweis.
// Zusatz: Die Hinweise („Was ist neu“) einer noch nicht installierten Version haben unten einen
// Knopf „Installieren“ (gleicher Weg); bei der installierten Version keiner.
// Alles nur im Browser: Antwort von casora/updates/list, Zustand und Dienstaufruf werden
// untergeschoben (fakeStates, callService/callWS abgefangen), nichts geht an HA.
// @parallel: ui
import { open, studio, studioDashboard, fakeStates, shot, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
await studio(page, dash);

const E = 'update.qa_hacs_casora';
// Abfangen: Übersicht wie mit HACS, Dienstaufrufe mitschreiben; Verhalten je Fall über window.__qaUpd.
await page.evaluate((E) => {
  const ha = document.querySelector('home-assistant');
  const bump = (v) => { const p = String(v).split('-')[0].split('.').map(Number); return `${p[0]}.${p[1]}.${(p[2] || 0) + 1}`; };
  window.__qaUpd = { mode: 'ok', calls: [], done: false, entity: E };
  const patch = (h) => {
    if (!h || h.__qaUpd) return;
    const ws = h.callWS.bind(h);
    const svc = h.callService.bind(h);
    h.callWS = async (msg) => {
      const r = await ws(msg);
      if (msg && msg.type === 'casora/updates/list') {
        const q = window.__qaUpd;
        const latest = bump(r.installed);
        Object.assign(r, { hacs: true, own_check: false, entity_id: q.entity, install_via: q.entity ? 'hacs' : null,
          install_version: null, entity_ready: !!q.entity, latest, update_available: !q.done, pending_restart: q.done ? latest : null });
        const g = (r.groups || []).find((x) => x.kind === 'casora');
        if (g && !g.releases.some((x) => x.version === latest)) {
          g.releases.unshift({ kind: 'casora', version: latest, date: '2026-10-08', source: 'github', notes_md: '- **QA neu**',
            notes_html: '<ul><li><strong>QA neu</strong></li></ul>', summary: 'QA neu' });
        }
      }
      return r;
    };
    h.callService = async (domain, service, data) => {
      if (domain !== 'update') return svc(domain, service, data);
      const q = window.__qaUpd;
      q.calls.push([domain, service, data]);
      q.running = true;
      await new Promise((res) => setTimeout(res, 2500));
      q.running = false;
      if (q.mode === 'ok') q.done = true;
      return [];
    };
    h.__qaUpd = true;
  };
  patch(ha.hass);
  const orig = ha._updateHass;
  ha._updateHass = function (obj) { const r = orig.call(this, obj); patch(this.hass); return r; };
}, E);
const upd = (extra) => ({ state: 'on', attributes: { friendly_name: 'Casora Update', installed_version: 'v1.0.0',
  latest_version: 'v9.9.9', in_progress: false, supported_features: 23, release_url: 'https://github.com/SH1FT-W/casora/releases/v9.9.9', ...extra } });
await fakeStates(page, { [E]: upd() }, { sticky: true });

const openUpdates = async () => {
  await page.evaluate(() => { const p = window.__panel(); p._cuData = null; if (p._cuOpen) p._cuClose(); p._cuOpenPage(); });
  await page.waitForTimeout(2500);
};
const hero = () => page.evaluate(() => {
  const h = window.__pierce('.cu-hero').find((x) => x.getClientRects().length);
  return h ? { text: h.innerText.replace(/\s+/g, ' '), bar: !!h.querySelector('.cu-bar'),
    install: [...h.querySelectorAll('button')].filter((b) => /Installieren|Install/.test(b.textContent)).map((b) => b.disabled) } : null;
});
const clickInstall = () => page.evaluate(async () => {
  const b = window.__pierce('.cu-hero button').find((x) => /Installieren|Install/.test(x.textContent));
  if (!b || b.disabled) return false;
  b.click();
  await new Promise((r) => setTimeout(r, 600));
  const c = window.__pierce('.askcard button').find((x) => /Installieren|Install/.test(x.textContent));
  if (c) c.click();
  return !!c;
});

// 1) Installieren über HACS: richtige Entität, Fortschritt, danach Neustart nötig.
await openUpdates();
const h0 = await hero();
await need('Updates-Kopf mit Installieren', h0 && h0.install.length === 1, h0);
await check('Installieren ist bedienbar', h0.install[0] === false, h0);
await check('Installieren bestätigt', await clickInstall());
await page.waitForTimeout(900);
const h1 = await hero();
await shot('1_laeuft');
const calls = await page.evaluate(() => window.__qaUpd.calls);
await check('update.install auf HACS-Entität', calls.length === 1 && calls[0][1] === 'install' && calls[0][2].entity_id === E, calls);
await check('Fortschritt sichtbar', h1 && h1.bar && /installiert …|Installing/.test(h1.text), h1);
await page.waitForTimeout(3500);
const h2 = await hero();
await shot('2_danach');
await check('danach: installiert, Neustart nötig', h2 && /Neustart nötig|restart needed/i.test(h2.text) && /HACS/.test(h2.text), h2);

// 1b) „Was ist neu“ der neuen Version: Knopf unten, gleicher Weg; installierte Version ohne Knopf.
await page.evaluate(() => Object.assign(window.__qaUpd, { mode: 'ok', done: false, calls: [] }));
await openUpdates();
const rows = await page.evaluate(() => {
  const p = window.__panel(); const d = p._cuData;
  const out = {};
  window.__pierce('.cu-item').forEach((it) => {
    const v = (it.querySelector('.cu-v') || {}).textContent;
    const body = it.querySelector('.cu-body');
    if (v === d.installed || v === d.latest) {
      if (body && body.hidden) it.querySelector('.cu-row').click();
      out[v === d.latest ? 'neu' : 'inst'] = it.querySelectorAll('.cu-rowinst').length;
    }
  });
  return out;
});
await shot('1b_was_ist_neu');
await check('„Was ist neu“ der neuen Version: Knopf Installieren', rows.neu === 1, rows);
await check('installierte Version: kein Knopf', rows.inst === 0, rows);
const rowClick = await page.evaluate(async () => {
  const b = window.__pierce('.cu-rowinst').find((x) => x.getClientRects().length);
  if (!b || b.disabled) return false;
  b.click();
  await new Promise((r) => setTimeout(r, 600));
  const c = window.__pierce('.askcard button').find((x) => /Installieren|Install/.test(x.textContent));
  if (c) c.click();
  return !!c;
});
await page.waitForTimeout(900);
const callsB = await page.evaluate(() => window.__qaUpd.calls);
await check('Knopf unten ruft update.install auf HACS-Entität', rowClick && callsB.length === 1 && callsB[0][2].entity_id === E, callsB);
await page.waitForTimeout(3500);
const h2b = await hero();
await check('danach (Knopf unten): Neustart nötig', h2b && /Neustart nötig|restart needed/i.test(h2b.text), h2b);

// 2) Aufruf läuft durch, installiert aber nichts: ehrliche Fehlermeldung statt Stille.
await page.evaluate(() => Object.assign(window.__qaUpd, { mode: 'nichts', done: false, calls: [] }));
await openUpdates();
await clickInstall();
await page.waitForTimeout(4000);
const h3 = await hero();
await check('ohne Wirkung: Fehlermeldung', h3 && /nicht geklappt|didn't work/i.test(h3.text), h3);

// 3) Keine HACS-Entität für Casora: Knopf aus, Hinweis.
await page.evaluate(() => Object.assign(window.__qaUpd, { mode: 'ok', done: false, entity: null }));
await openUpdates();
const h4 = await hero();
await shot('3_ohne_entitaet');
await check('ohne Entität: Installieren aus', h4 && h4.install.length === 1 && h4.install[0] === true, h4);
await check('ohne Entität: Hinweis auf HACS', h4 && /keinen Update-Eintrag|no update entry/i.test(h4.text), h4);

await finish();
