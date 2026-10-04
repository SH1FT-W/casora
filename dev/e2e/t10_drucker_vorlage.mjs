// Drucker-Kachel: alte Vorlage (feste IDs, Haupt-Dashboard) vs. neue (Finder, Test-Dashboard).
import { open, call, PIERCE, shot, HAUS, BASE } from './harness.mjs';
const { browser, page, errors, token } = await open();
console.log('Szenario:', await call(token, 'casora_mock', 'scenario', { name: process.env.SZENARIO || 'drucker_druckt' }));
await page.goto(BASE + '/casora-studio', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('home-assistant')?.hass, null, { timeout: 30000 });
// Test-Dashboard: Drucker-Kachel auf den Helfer setzen (wie im eigenen Dashboard)
await page.evaluate(async (E) => {
  const h = document.querySelector('home-assistant').hass;
  const c = await h.callWS({ type: 'lovelace/config', url_path: 'test-neu' });
  const row = c.views[0].cards.find((x) => x.type === 'custom:casora-smart-row');
  const t = row.cards.find((x) => [].concat(x.template || []).includes('casora_3d_printer'));
  t.entity = E; delete t.name;
  await h.callWS({ type: 'lovelace/config/save', url_path: 'test-neu', config: c });
}, HAUS.drucker_kachel);
const tile = async (url) => {
  await page.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: PIERCE });
  await page.waitForTimeout(10000);
  return page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => x._config && [].concat(x._config.template || []).includes('casora_3d_printer'));
    if (!b) return null;
    const v = b._evaluatedVariables || {};
    const vk = Object.keys(b).filter((k) => /var/i.test(k));
    const keys = ['progress_entity', 'progress_value', 'entity_error', 'entity_pause', 'toggle_entity', 'toggle_service', 'show_progress'];
    const ev = b._evaluatedVariables; const pick = (k) => { const x = ev && ev[k]; return x && typeof x === 'object' && 'value' in x ? x.value : x; };
    return { evType: ev && ev.constructor && ev.constructor.name, n: ev && Object.keys(ev).slice(0, 60).join(','), text: (b.shadowRoot?.querySelector('ha-card')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160), vars: Object.fromEntries(keys.map((k) => [k, pick(k)])) };
  });
};
const alt = await tile('dashboard-hemma/home'); // Adresse des Test-Dashboards
console.log('ALT  (feste IDs):', JSON.stringify(alt));
await shot(page, 'p10_alt');
const neu = await tile('test-neu/home');
console.log('NEU  (Finder)   :', JSON.stringify(neu));
await shot(page, 'p10_neu');
const diff = Object.keys((alt || {}).vars || {}).filter((k) => JSON.stringify(alt.vars[k]) !== JSON.stringify(neu.vars[k]));
console.log(diff.length ? 'ABWEICHUNG: ' + diff.join(', ') : 'Vorlagenvariablen identisch');
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 5));
await browser.close();
