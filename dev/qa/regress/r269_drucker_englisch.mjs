// @zustand: arbeit
// @deckt: custom_components/casora/translations/dashboard/phrases/en.json
// Fund 14.10.2026 (Launch-Video): Im 3D-Drucker-Popup stand mit englischer Oberfläche „1:36 Std. übrig ·
// Schicht 124/295“ – die Muster kannten nur „36 Std. übrig“ und gar kein „Schicht x/y“. Geprüft: Drucker
// druckt (Szenario), Popup auf Englisch, kein „übrig“/„Schicht“ mehr, dafür „h left“ und „Layer“.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';

const d = await casoraDashboard();
await need('ein Casora-Dashboard', d);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false, locale: 'en-US' });
await dashboard(page, d.url, 3);
const id = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).find((x) => x.startsWith('sensor.') && /arbeitsschritt|print_stage|druck/.test(x)) || null; });
await need('Drucker-Sensor im Testhaus', id);
const svc = (s, data) => page.evaluate(([s, data]) => document.querySelector('home-assistant').hass.callService('casora_mock', s, data), [s, data]);
atFinish(() => svc('reset', {}).catch(() => {}));
await svc('scenario', { name: 'drucker_druckt' });
await page.waitForTimeout(2000);
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant'); const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_3d_printer', entity: id });
  el.id = 'qa-r269'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:20px;top:300px;width:200px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
}, id);
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r269')._handleAction({ detail: { action: 'tap' } }, { isIcon: false }));
await page.waitForTimeout(4000);
const t = await page.evaluate(() => { const p = window.casoraPopup && window.casoraPopup.element; if (!p) return '';
  const txt = (n) => { let o = ''; n.childNodes.forEach((c) => { o += c.nodeType === 3 ? c.textContent + ' ' : (c.nodeName === 'STYLE' ? '' : (c.shadowRoot ? txt(c.shadowRoot) : '') + txt(c)); }); return o; };
  return txt(p.shadowRoot).replace(/\s+/g, ' '); });
await check('Drucker-Popup offen', t.length > 50, t.slice(0, 200));
await check('kein „übrig“/„Schicht“ auf Englisch', !/übrig|Schicht/.test(t), (t.match(/.{0,30}(übrig|Schicht).{0,30}/g) || []).slice(0, 4));
await check('Restzeit und Schicht auf Englisch', /h left|min left/.test(t) && /Layer \d+\/\d+/.test(t), t.slice(0, 300));
await finish();
