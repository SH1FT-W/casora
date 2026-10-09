// @zustand: arbeit
// @parallel: ui
// Wunsch (09.10.2026): Im Updates-Popup ein Knopf „Jetzt nach Updates suchen“, statt auf HAs
// Intervall zu warten. Erwartet: Knopf sichtbar (Casora-Look Desktop + Handy, Standard-Look);
// Antippen zeigt „Suche …“, ruft homeassistant.update_entity für alle update.*-Entitäten auf
// (als Admin mit Supervisor und HACS vorher supervisor/api /refresh_updates und je installiertes
// HACS-Repo hacs/repository/refresh), danach „Zuletzt gesucht: gerade eben“; Popup bleibt offen.
// Alles nur im Browser: Dienst- und WS-Aufrufe werden abgefangen, Supervisor/HACS nur für die
// Suche vorgetäuscht (eigenes hass-Objekt), nichts geht an HA.
import { open, casoraDashboard, dashboard, shot, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const view = dash.config.views[0];

const RUNS = [
  { tag: 'casora_desktop', theme: 'Casora', width: 1440, height: 900 },
  { tag: 'casora_handy', theme: 'Casora', width: 393, height: 852, mobile: true },
  { tag: 'standard_desktop', theme: null, width: 1440, height: 900 },
];
for (const R of RUNS) {
  console.log('  – ' + R.tag);
  const { page } = await open(R.theme
    ? { width: R.width, height: R.height, theme: R.theme, dark: false, ...(R.mobile ? { mobile: true } : {}) }
    : { width: R.width, height: R.height });
  await dashboard(page, dash.url + '/' + (view.path || '0'));

  // Abfangen: update_entity verzögert (Busy-Zustand sichtbar), Supervisor/HACS beantworten.
  const ok0 = await page.evaluate(() => {
    const K = window._casoraUpdCheck;
    if (!K) return false;
    window.__qaChk = { svc: [], ws: [] };
    try { localStorage.removeItem('casora.updCheck'); } catch (e) { /* egal */ }
    K.last = null; K.found = null; K.err = false;
    const run = K.run;
    K.run = (h) => {
      const fake = Object.create(h, {
        config: { value: Object.assign({}, h.config, { components: [].concat(h.config.components || [], ['hassio', 'hacs']) }) },
        user: { value: Object.assign({}, h.user, { is_admin: true }) },
        callWS: { value: async (m) => {
          window.__qaChk.ws.push(m);
          if (m.type === 'hacs/repositories/list') return [{ id: 1, installed: true }, { id: 2, installed: false }];
          return {};
        } },
        callService: { value: async (d, s, data, target, notify) => {
          window.__qaChk.svc.push([d, s, data, notify]);
          await new Promise((r) => setTimeout(r, 1500));
          return [];
        } },
      });
      return run(fake);
    };
    return true;
  });
  await need('Updates-Suche geladen (03-popups.js)', ok0);

  // Popup öffnen wie die Glocke: unsichtbare Kachel mit der Vorlage antippen (wie r40).
  const hit = await page.evaluate(async () => {
    const ha = document.querySelector('home-assistant');
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: ['casora_updates'] });
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
  });
  await need(R.tag + ': Updates-Popup geöffnet', hit);

  const btn = () => page.evaluate(() => {
    const b = window.__pierce('[data-huc]').find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const s = b.parentNode && b.parentNode.querySelector('.huc-s');
    return { text: b.innerText.trim(), busy: b.classList.contains('busy'), x: r.x + r.width / 2, y: r.y + r.height / 2,
      w: r.width, h: r.height, inView: r.right <= innerWidth && r.left >= 0 && r.bottom <= innerHeight, status: s ? s.innerText.trim() : '' };
  });
  // Warten, bis der Knopf da ist und still steht (Handy: das Blatt fährt erst herein).
  let b0 = null, prev = null;
  for (let i = 0; i < 30; i++) {
    b0 = await btn();
    if (b0 && prev && Math.abs(b0.y - prev.y) < 1) break;
    prev = b0; await page.waitForTimeout(300);
  }
  await check(R.tag + ': Knopf „Jetzt nach Updates suchen“ sichtbar', b0 && /Jetzt nach Updates suchen/.test(b0.text), b0);
  if (!b0) { await page.context().browser().close().catch(() => {}); continue; }
  await check(R.tag + ': Knopf ganz im Bild und antippbar groß', b0.inView && b0.h >= 18 && b0.w >= 120, b0);
  await shot(R.tag + '_1_vorher');

  if (R.mobile) await page.touchscreen.tap(b0.x, b0.y); else await page.mouse.click(b0.x, b0.y);
  await page.waitForTimeout(400);
  const b1 = await btn();
  await check(R.tag + ': während der Suche „Suche …“', b1 && b1.busy && /Suche/.test(b1.text), b1);
  await shot(R.tag + '_2_suche');

  // Auf das Ergebnis warten, nicht auf die Uhr.
  await page.waitForFunction(() => {
    const b = window.__pierce('[data-huc]').find((x) => x.getBoundingClientRect().width > 0);
    return b && !b.classList.contains('busy');
  }, null, { timeout: 20000 }).catch(() => {});
  const b2 = await btn();
  const calls = await page.evaluate(() => ({ chk: window.__qaChk,
    ids: Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => id.startsWith('update.')).sort(),
    open: !!(window.casoraPopup && window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open')) }));
  const ue = calls.chk.svc.filter((c) => c[0] === 'homeassistant' && c[1] === 'update_entity');
  await check(R.tag + ': update_entity für alle update.*-Entitäten', ue.length === 1
    && JSON.stringify([].concat(ue[0][2].entity_id).sort()) === JSON.stringify(calls.ids) && ue[0][3] === false, { ue, n: calls.ids.length });
  await check(R.tag + ': Supervisor /refresh_updates gefragt', calls.chk.ws.some((m) => m.type === 'supervisor/api' && m.endpoint === '/refresh_updates' && m.method === 'post'), calls.chk.ws);
  await check(R.tag + ': nur installiertes HACS-Repo aufgefrischt', JSON.stringify(calls.chk.ws.filter((m) => m.type === 'hacs/repository/refresh').map((m) => m.repository)) === '["1"]', calls.chk.ws);
  await check(R.tag + ': danach „Zuletzt gesucht: gerade eben“', b2 && !b2.busy && /Zuletzt gesucht: gerade eben/.test(b2.status), b2);
  await check(R.tag + ': Popup bleibt offen', calls.open);
  await shot(R.tag + '_3_fertig');
  await page.context().browser().close().catch(() => {});
}
await finish();
