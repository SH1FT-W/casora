// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraRecipe,R.tile,R.popup,R.sec,R.loadTodo,R.todoHtml
// Card request #140 (Mealie): the recipe tile and popup take HA's mealie integration as a second source. Expected in the
// browser (theme Casora, v3 popup): the tile reads „Heute · <dish>“, the popup has its status line, a stage with the
// image, the meal type, the name, time · servings and the tags, on the right the week (7 days), the ingredients, the
// numbered steps and Mealie's shopping list – no Cookidoo wording, nothing wider than the popup at 393 px.
// Default (gate): made-up Mealie entities in hass.entities/states and a stubbed websocket answer (casora/mealie/plan,
// todo/item/list for the made-up list) – nothing reaches a Mealie, nothing is saved. R597_ECHT=1: no stubs, a real Mealie
// configured in this HA (check 07.11.2026 with Mealie v3.30.0). R597_BILD=<dir>: pictures (tile, desktop light/dark,
// phone light/dark).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboard, studioDashboard, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const dash = (await casoraDashboard()) || { url: await studioDashboard(), config: { views: [{}] } };
await need('Dashboard', dash && dash.url);
const IDEA = 'sensor.casora_rezept_der_woche';
const REAL = process.env.R597_ECHT === '1';
const DIR = process.env.R597_BILD;
const DISH = 'Kürbissuppe mit Ingwer';
const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d67828"/><circle cx="160" cy="90" r="60" fill="#f5f0e6"/></svg>');
const SOUP = { type: 'dinner', note: false, name: DISH, recipe_id: 'a68bf58d-6700-4d10-9ca5-03cbde2cebed', slug: 'kurbissuppe-mit-ingwer',
  minutes: 40, time_text: null, servings: 4, yield_text: null, tags: ['Vegetarisch', 'Herbst'], image: IMG };
const PLAN = { state: 'ok', today: iso(0), days: [
  { date: iso(0), meals: [{ type: 'breakfast', note: false, name: 'Overnight Oats mit Beeren', minutes: 10, servings: 1, tags: ['Frühstück'] }, SOUP] },
  { date: iso(1), meals: [{ type: 'dinner', note: false, name: 'Spaghetti mit Tomatensoße', minutes: 25, servings: 2, tags: [] }] },
  { date: iso(2), meals: [{ type: 'lunch', note: false, name: 'Ofengemüse mit Feta und Kräutern', minutes: 65, servings: 3, tags: [] }] },
  { date: iso(3), meals: [{ type: 'dinner', note: true, name: 'Reste essen', text: 'Was vom Wochenende übrig ist' }] },
  { date: iso(4), meals: [] }, { date: iso(5), meals: [] }, { date: iso(6), meals: [] }],
  featured: { ...SOUP, date: iso(0), detail: { description: 'Cremige Suppe aus Hokkaido-Kürbis, mit frischem Ingwer und Kokosmilch abgeschmeckt.',
    ingredients: ['1 Hokkaido-Kürbis', '1 Zwiebel', '20 g Ingwer', '400 ml Kokosmilch', '500 ml Gemüsebrühe', 'Salz und Pfeffer'].map((t) => ({ text: t })),
    steps: ['Kürbis waschen, entkernen und in Würfel schneiden.', 'Zwiebel und Ingwer glasig dünsten, Kürbis kurz mitbraten.',
      'Mit Brühe ablöschen und 20 Minuten köcheln lassen.', 'Kokosmilch einrühren, pürieren und abschmecken.', 'Mit Kürbiskernen servieren.']
      .map((t) => ({ title: null, text: t })) } } };
const ENT = { 'calendar.qa_mealie_dinner': 'dinner', 'calendar.qa_mealie_breakfast': 'breakfast', 'todo.qa_mealie_einkauf': 'shopping_list' };
const ITEMS = ['Hokkaido-Kürbis', 'Kokosmilch', 'Ingwer'].map((s, i) => ({ uid: 'qa' + i, summary: s, status: 'needs_action' }));

async function popupIn({ width, height, mobile, dark, label }) {
  const { page } = await open({ width, height, mobile, safari: mobile, dark, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url + '/' + ((dash.config.views[0] || {}).path || '0'), 1);
  await need(label + ': Rezept-Skript geladen', await page.evaluate(() => !!(window._casoraRecipe && window._casoraRecipe.mealieOn && window.casoraPopup)));
  if (!REAL) {
    await fakeStates(page, Object.fromEntries(Object.keys(ENT).map((id) => [id, { state: id.startsWith('todo.') ? '3' : 'off', attributes: {} }])), { sticky: true });
    await page.evaluate(([ENT, PLAN, ITEMS]) => {
      const ha = document.querySelector('home-assistant');
      const entities = { ...ha.hass.entities };
      for (const [id, key] of Object.entries(ENT)) entities[id] = { entity_id: id, platform: 'mealie', translation_key: key };
      const orig = ha.hass.callWS;
      const callWS = (m) => (m && m.type === 'casora/mealie/plan' ? Promise.resolve(JSON.parse(JSON.stringify(PLAN)))
        : m && m.type === 'todo/item/list' && m.entity_id === 'todo.qa_mealie_einkauf' ? Promise.resolve({ items: JSON.parse(JSON.stringify(ITEMS)) })
          : orig(m));
      ha._updateHass({ entities, callWS });
      const R = window._casoraRecipe; R.ml.ts = 0; R.ml.data = null; R.todo.key = null;
    }, [ENT, PLAN, ITEMS]);
    await page.waitForTimeout(400);
  }
  const made = await page.evaluate(async (IDEA) => {
    const ha = document.querySelector('home-assistant');
    const root = window.__pierce('hui-root')[0];
    const tpl = root && root.lovelace && root.lovelace.config && root.lovelace.config.button_card_templates;
    if (!tpl || !tpl.casora_recipe) return 'Vorlage casora_recipe fehlt';
    // A tile of the usual size in its own box over the dashboard (the popup does not care where it sits).
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:120px;top:140px;width:190px;height:150px;z-index:5;display:grid;';
    document.body.appendChild(box);
    const el = document.createElement('button-card');
    el.id = 'qa-r597';
    el.setConfig({ type: 'custom:button-card', template: 'casora_recipe', entity: IDEA });
    el.hass = ha.hass; box.appendChild(el);
    window.__qaTile = el;
    return 'ok';
  }, IDEA);
  await need(label + ': Rezept-Kachel angelegt', made === 'ok', made);
  let tile = '';
  for (let i = 0; i < 40 && !/Heute ·/.test(tile); i++) {
    await page.waitForTimeout(250);
    tile = await page.evaluate(() => { const t = window.__qaTile; const s = t && t.shadowRoot && t.shadowRoot.querySelector('#state'); return s ? s.textContent.trim() : ''; });
  }
  if (DIR && !mobile && !dark) {
    fs.mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = window.__qaTile.getBoundingClientRect(); return { x: r.left - 24, y: r.top - 24, width: r.width + 48, height: r.height + 48 }; });
    await page.screenshot({ path: path.join(DIR, 'tile.png'), clip: box });
  }
  await page.evaluate(() => {
    const el = window.__qaTile;
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  });
  let r = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    r = await page.evaluate(() => {
      const S = window.casoraPopup && window.casoraPopup.surface;
      if (!S) return null;
      const q = (s) => window.__pierce(s, S);
      const name = q('.hr-mstage .hrs-n')[0];
      if (!name || !name.getBoundingClientRect().width || q('.hrl-r').length === 0) return null;
      const img = q('.hrm-img')[0];
      const txt = q('.hr-mstage, .hr-mweek, .hr-ming, .hr-msteps, .hr-todo').map((n) => n.textContent).join(' ');
      return { name: name.textContent.trim(), tags: q('.hrm-tag').map((n) => n.textContent.trim()), days: q('.hrm-day').length,
        today: q('.hrm-day.now').length, ing: q('.hr-ming li').length, steps: q('.hrm-st').length, todo: q('.hrl-r .hrl-n').map((n) => n.textContent.trim()),
        img: img ? { w: img.naturalWidth, h: Math.round(img.getBoundingClientRect().height) } : null,
        cook: /Cookidoo|Thermomix|Claude/.test(txt), line: (q('.hr-mline')[0] || {}).textContent || '',
        scrollW: S.scrollWidth, clientW: S.clientWidth, labels: q('.hr-mweek, .hr-ming, .hr-msteps').map((n) => n.textContent.slice(0, 30)) };
    });
    if (r && (!r.img || r.img.w > 0)) break;
  }
  await need(label + ': Popup mit Mealie-Bühne', r && r.name, r);
  await page.waitForTimeout(600);
  if (DIR) {
    fs.mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: path.join(DIR, `${mobile ? 'phone' : 'desktop'}-${dark ? 'dark' : 'light'}.png`), fullPage: false });
    if (mobile) {
      // The phone sheet scrolls: a second picture further down (week, ingredients, steps, list).
      await page.evaluate(() => { const S = window.casoraPopup.surface; const sc = [S, ...window.__pierce('*', S)].find((n) => n.scrollHeight > n.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(n).overflowY)); if (sc) sc.scrollTop = 700; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, `phone-${dark ? 'dark' : 'light'}-2.png`) });
    }
  }
  return { page, r, tile };
}

for (const v of [{ width: 1440, height: 900, mobile: false, dark: false, label: 'Desktop hell' },
  { width: 1440, height: 900, mobile: false, dark: true, label: 'Desktop dunkel' },
  { width: 393, height: 852, mobile: true, dark: false, label: 'Handy hell' },
  { width: 393, height: 852, mobile: true, dark: true, label: 'Handy dunkel' }]) {
  const { page, r, tile } = await popupIn(v);
  const L = v.label + ': ';
  await check(L + 'Kachel „Heute · Kürbissuppe …“', /^Heute · Kürbissuppe/.test(tile), tile);
  await check(L + 'Bühne: voller Name', r.name === DISH, r.name);
  await check(L + 'Bühne: Schlagwörter als Chips', r.tags.includes('Vegetarisch'), r.tags);
  await check(L + 'Bühne: Bild geladen', r.img && r.img.w > 0 && r.img.h > 60, r.img);
  await check(L + 'Statuszeile „Heute geplant“', /Heute geplant/.test(r.line), r.line);
  await check(L + 'Woche: 7 Tage, heute hervorgehoben', r.days === 7 && r.today === 1, r);
  await check(L + 'Zutaten gelistet', r.ing >= 6, r.ing);
  await check(L + 'Zubereitung: Schritte (höchstens 4 offen + Rest unter „Alle“)', r.steps >= 4, r.steps);
  await check(L + 'Einkaufsliste aus Mealie', r.todo.some((t) => /Kokosmilch/.test(t)), r.todo);
  await check(L + 'keine Cookidoo-Wörter', !r.cook, r);
  await check(L + 'nichts breiter als das Popup', r.scrollW <= r.clientW + 1, r);
  await page.context().browser().close();
}
await finish();
