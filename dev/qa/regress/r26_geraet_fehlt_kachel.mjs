// @zustand: arbeit
// Gemeldet: Fehlt die Entität einer Kachel in HA (z. B. nach einem Umzug mit umbenannten Geräten),
// zeigte das Popup schon „Gerät fehlt“, die Kachel selbst aber „Aus“, einen leeren Zustand oder
// sogar einen Schalter. Erwartet: Zustandstext „Gerät fehlt“, nicht aktiv, kein Schalter – und das
// Popup zeigt den Hinweis „Gerät fehlt“. Die Entitäten werden nur im Browser „entfernt“.
import { open, casoraDashboard, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

const TPLS = ['casora_light', 'casora_thermostat', 'casora_media', 'casora_cover'];
const has = (x, t) => JSON.stringify(x).includes(`"${t}"`);
const dash = await casoraDashboard((d) => has(d.config, 'casora_light') && has(d.config, 'casora_thermostat'));
await need('Casora-Dashboard mit Licht- und Thermostat-Kachel', dash);
const view = dash.config.views.find((v) => has(v, 'casora_light') && has(v, 'casora_thermostat'))
  || dash.config.views.find((v) => has(v, 'casora_light')) || dash.config.views[0];
const { page } = await open();
await dashboard(page, dash.url + '/' + (view.path || '0'));

// Sichtbare Kacheln dieser Arten mit fester Entität: Entität, Text, Schalter, Aktiv-Schleier.
const tiles = () => page.evaluate((tpls) => window.__pierce('button-card').filter((b) => {
  const c = b._config || {}; const r = b.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && typeof c.entity === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(c.entity)
    && [].concat(c.template || []).some((t) => tpls.includes(t));
}).map((b) => {
  const sr = b.shadowRoot; const card = sr && sr.querySelector('ha-card');
  const st = sr && sr.querySelector('#state'); const tg = sr && sr.querySelector('#toggle');
  const r = b.getBoundingClientRect();
  return { entity: b._config.entity, tpl: [].concat(b._config.template).join('+'),
    state: st ? st.innerText.replace(/\s+/g, ' ').trim() : '',
    toggle: !!(tg && getComputedStyle(tg).display !== 'none' && tg.getBoundingClientRect().width > 0),
    veil: card ? getComputedStyle(card).getPropertyValue('--casora-active-overlay-opacity').trim() : '',
    x: r.x + r.width / 2, y: r.y + r.height / 2 };
}), TPLS);

const before = await tiles();
await need('sichtbare Geräte-Kacheln', before.length >= 2, before.length);
await check('ohne fehlendes Gerät zeigt keine Kachel „Gerät fehlt“', before.every((t) => t.state !== 'Gerät fehlt'),
  before.filter((t) => t.state === 'Gerät fehlt').map((t) => t.entity));

// Die Hälfte der Kacheln (mind. Licht + Thermostat) verliert ihr Gerät.
const gone = new Set();
for (const t of TPLS) { const x = before.find((b) => b.tpl.includes(t)); if (x) gone.add(x.entity); }
await fakeStates(page, Object.fromEntries([...gone].map((e) => [e, null])), { sticky: true });
await page.waitForTimeout(800);
const after = await tiles();
for (const t of after) {
  const missing = gone.has(t.entity);
  const label = `${t.tpl} (${missing ? 'fehlt' : 'vorhanden'})`;
  if (missing) {
    await check(`${label}: Zustandstext „Gerät fehlt“`, t.state === 'Gerät fehlt', t.state);
    await check(`${label}: kein Schalter`, !t.toggle);
    await check(`${label}: nicht aktiv`, t.veil !== '1', t.veil);
  } else {
    await check(`${label}: kein „Gerät fehlt“`, t.state !== 'Gerät fehlt', t.state);
  }
}

// Popup der Licht-Kachel ohne Gerät: Hinweis „Gerät fehlt“.
const light = after.find((t) => gone.has(t.entity) && t.tpl.includes('casora_light'));
if (light) {
  await page.mouse.click(light.x, light.y);
  await page.waitForTimeout(2200);
  const pop = await page.evaluate(() => {
    const p = window.__pierce('casora-popup').find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const box = p && (p.shadowRoot || p).querySelector('.soft-empty');
    return p ? { missing: p.hasAttribute('missing'), shown: !!(box && !box.hidden),
      text: box ? box.textContent.replace(/\s+/g, ' ').trim() : '' } : null;
  });
  await check('Popup der Kachel zeigt „Gerät fehlt“', pop && pop.missing && pop.shown && /Gerät fehlt/.test(pop.text), pop);
}
await finish();
