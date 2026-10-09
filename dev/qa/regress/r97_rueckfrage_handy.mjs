// @zustand: arbeit
// @parallel: ui
// Gemeldet (1.2.1): „Vor dem Schalten fragen“ an der Schloss-Kachel – am Handy entriegelte „Entriegeln“
// in der Schloss-Ansicht sofort, am Desktop kam die Rückfrage. Ursache: Die Liste der Rückfrage-Entitäten
// (casora_confirm_entities) steht nur in den Räumen des Desktop-Dashboards. Erwartet: Die Kacheln mit
// Rückfrage im offenen Dashboard und in seinem Partner (Desktop ↔ Handy) zählen, ohne neu speichern.
// Nichts wird gespeichert: Die Rückfrage wird nur im Browser in die geladene Konfiguration gesetzt
// bzw. die Partner-Konfiguration beim Abholen untergeschoben.
import { open, casoraDashboard, casoraDashboards, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const hasPhone = (d) => all.some((x) => x.url === d.url + '-mobile');
const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit' && hasPhone(d))) || (await casoraDashboard(hasPhone));
await need('ein Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const tilesOf = (cfg, dom) => {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o.entity === 'string' && o.entity.indexOf(dom + '.') === 0 && o.template && o.entity.indexOf('YOUR_') < 0) out.push(o.entity);
    for (const k in o) if (k !== 'button_card_templates') walk(o[k]);
  })(cfg.views);
  return out;
};
const LOCK = tilesOf(dash.phone.config, 'lock')[0];
const COVER = tilesOf(dash.phone.config, 'cover')[0];
await need('Schloss- und Jalousie-Kachel am Handy', LOCK && COVER, { LOCK, COVER });

// Rückfrage für eine Entität in einer Konfiguration setzen (Kopie).
const withAsk = (cfg, id) => {
  const c = JSON.parse(JSON.stringify(cfg));
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.entity === id && o.template) o.variables = { ...(o.variables || {}), confirm_toggle: true };
    for (const k in o) if (k !== 'button_card_templates') walk(o[k]);
  })(c.views);
  return c;
};

async function setup(opts, url) {
  const { page } = await open(opts);
  usePage(page);
  await dashboard(page, url, 3);
  await fakeStates(page, { [LOCK]: { state: 'locked', attributes: { friendly_name: 'Testschloss', supported_features: 0 } } }, { sticky: true });
  await page.evaluate(() => {
    const conn = document.querySelector('home-assistant').hass.connection;
    window.__qaCalls = []; window.__qaPartner = null;
    const orig = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => {
      if (m && m.type === 'call_service' && (m.domain === 'lock' || m.domain === 'cover')) { window.__qaCalls.push(m.domain + '.' + m.service); return Promise.resolve({ context: { id: 'qa' } }); }
      if (m && m.type === 'lovelace/config' && window.__qaPartner && m.url_path === window.__qaPartner.url) return Promise.resolve(window.__qaPartner.cfg);
      return orig(m);
    };
  });
  return page;
}
// Geladene Konfiguration des offenen Dashboards ersetzen (wie nach dem Speichern im Studio).
const setOwn = (page, cfg) => page.evaluate((cfg) => {
  window._casoraLovelaceCfg();
  const ll = window._casoraLLEl;
  ll.lovelace = Object.assign({}, ll.lovelace, { config: cfg });
}, cfg);
// Partner neu abholen lassen (er wird eine Minute gemerkt): kurz eine andere Adresse vorgeben.
const refetchPartner = (page, partner) => page.evaluate(async (p) => {
  window.__qaPartner = p;
  const path = location.pathname;
  history.replaceState(history.state, '', '/qa-anderes' + path.slice(path.indexOf('/', 1)));
  window.casoraAsksFirst('x.y');
  history.replaceState(history.state, '', path);
  window.casoraAsksFirst('x.y');
  await new Promise((r) => setTimeout(r, 800));
}, partner);
const lockView = async (page, mobile) => {
  await page.evaluate((A) => window.loadCardHelpers().then((h) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_badge_lock_group', entity: A, variables: { locks: [A], enabled: true } });
    el.classList.add('qa-lk'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:40px;top:300px;width:220px;height:60px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }), LOCK);
  await page.waitForTimeout(1200);
  const tap = async (p) => { if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
  await tap(await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-lk').getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2 }; }));
  await page.waitForTimeout(2000);
  const row = await page.evaluate((id) => {
    const pop = window.casoraPopup && window.casoraPopup.element;
    const r = pop && window.__pierce('[data-casora-mi="' + id + '"]', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0);
    if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + 60, y: b.y + b.height / 2 };
  }, LOCK);
  if (!row) return null;
  await tap(row); await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const v = window.casoraPopup.element.shadowRoot.querySelector('.casora-lock-view');
    const b = v && v.querySelector('[data-csl-svc="unlock"]');
    if (!b) return null; const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, hint: !!v.querySelector('.csl-ask') };
  });
};
const askOpen = (page) => page.evaluate(() => !!document.querySelector('.casora-askfirst'));
const askClick = (page, cls) => page.evaluate((cls) => { const h = document.querySelector('.casora-askfirst'); const b = h && (h.shadowRoot || h).querySelector('.' + cls); if (b) b.click(); return !!b; }, cls);
const calls = (page) => page.evaluate(() => window.__qaCalls.slice());

// ── Handy-Dashboard: Rückfrage an der Handy-Kachel ─────────────────────────────
{
  const page = await setup({ width: 393, height: 852, mobile: true, dark: true, theme: 'Casora' }, dash.phone.url);
  await check('Handy: ohne Einstellung keine Rückfrage', !(await page.evaluate((A) => window.casoraAsksFirst(A), LOCK)));
  await setOwn(page, withAsk(dash.phone.config, LOCK));
  await page.waitForTimeout(1500);
  await check('Handy: Schloss-Kachel mit Rückfrage zählt', await page.evaluate((A) => window.casoraAsksFirst(A), LOCK));
  const ub = await lockView(page, true);
  await need('Handy: Schloss-Ansicht mit „Entriegeln“', ub);
  await check('Handy: Hinweis „Mit Rückfrage“', ub.hint, ub);
  await page.touchscreen.tap(ub.x, ub.y); await page.waitForTimeout(600);
  await check('Handy: „Entriegeln“ fragt nach', await askOpen(page));
  await askClick(page, 'no'); await page.waitForTimeout(400);
  await check('Handy: Abbrechen entriegelt nicht', (await calls(page)).length === 0, await calls(page));
  await page.touchscreen.tap(ub.x, ub.y); await page.waitForTimeout(600);
  await askClick(page, 'yes'); await page.waitForTimeout(500);
  await check('Handy: Bestätigen entriegelt', (await calls(page)).join() === 'lock.unlock', await calls(page));
  // Einstellung nur am Desktop (Partner): Regler/Knöpfe im Jalousie-Popup fragen auch am Handy.
  await refetchPartner(page, { url: dash.url, cfg: withAsk(dash.config, COVER) });
  await check('Handy: Rückfrage vom Desktop-Partner zählt', await page.evaluate((C) => window.casoraAsksFirst(C), COVER));
  const p = page.evaluate((C) => window.casoraConfirmSpec({ domain: 'cover', service: 'set_cover_position', target: { entity_id: C }, data: { position: 0 } }), COVER);
  await page.waitForTimeout(500);
  await check('Handy: Positions-Regler fragt nach', await askOpen(page));
  await askClick(page, 'no');
  await check('Handy: Abbrechen fährt nicht', (await p) === false);
}

// ── Desktop-Dashboard: Einstellung nur an der Handy-Kachel gilt auch hier ─────
{
  const page = await setup({ width: 1440, height: 900, dark: false, theme: 'Casora' }, dash.url);
  await refetchPartner(page, { url: dash.phone.url, cfg: withAsk(dash.phone.config, LOCK) });
  await check('Desktop: Rückfrage vom Handy-Partner zählt', await page.evaluate((A) => window.casoraAsksFirst(A), LOCK));
  const ub = await lockView(page, false);
  await need('Desktop: Schloss-Ansicht mit „Entriegeln“', ub);
  await page.mouse.click(ub.x, ub.y); await page.waitForTimeout(600);
  await check('Desktop: „Entriegeln“ fragt nach', await askOpen(page));
  await askClick(page, 'no'); await page.waitForTimeout(400);
  await check('Desktop: Abbrechen entriegelt nicht', (await calls(page)).length === 0, await calls(page));
}
await finish();
