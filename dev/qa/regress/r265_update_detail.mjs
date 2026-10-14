// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/17-update-detail.js
// Update-Detailseite (1.5, Entwurf A): Tipp auf ein Update im Update-Popup öffnet KEINEN nativen HA-Dialog,
// sondern die Detailseite im selben Popup – ‹ zurück, Versionen, „Was ist neu“ aus den Versionshinweisen,
// Installieren (mit Sicherung, abschaltbar) und Überspringen. ‹ führt zurück zur Liste. Nur im Browser
// nachgestellte Updates, es wird nichts installiert.
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora', dark: false });
await dashboard(page, dash.url, 3);
// Ein Geräte-Update (Firmware), keine System-Updates (HA, HACS, Casora – die stehen unter „System“).
const ID = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).find((k) => k.startsWith('update.') && (S[k].attributes || {}).device_class === 'firmware'); });
await need('ein Update im Testhaus', ID);
await fakeStates(page, { [ID]: { state: 'on', attributes: { installed_version: '2.3.1', latest_version: '2.4.0', title: 'QA Firmware',
  // Lange URL, Tabelle und Code wie in echten Versionshinweisen – nichts davon darf seitlich überstehen (14.10.).
  release_summary: '## Neu\n- Erster Punkt\n- **Zweiter** Punkt\n- Siehe https://example.com/' + 'sehr-langer-pfad-'.repeat(12)
    + '\n\n| Spalte A | Spalte B | Spalte C |\n|---|---|---|\n| ' + 'x'.repeat(80) + ' | b | c |\n\n```yaml\nlange_zeile: ' + 'y'.repeat(120) + '\n```', release_url: 'https://example.com/qa', supported_features: 13 } } }, { sticky: true });
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_updates', entity: id, name: 'Updates' });
  el.id = 'qa-r265'; el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:20px;top:200px;width:170px;height:120px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
}, ID);
await page.waitForTimeout(2500);
await page.mouse.click(100, 260);
const POP = (id) => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 3) { if (c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); } else if (c.nodeType === 1 && c.nodeName !== 'STYLE') { if (c.shadowRoot) walk(c.shadowRoot); walk(c); } });
  walk(p.shadowRoot);
  const back = p.shadowRoot.querySelector('.header-back');
  const inst = window.__pierce('[data-casora-upd-install]', p.shadowRoot)[0];
  return { title: p.shadowRoot.querySelector('.header-title').textContent, back: !!(back && !back.hidden), text: parts.join(' ').replace(/\s+/g, ' ').slice(0, 1500),
    // Was ein Tipp auf Installieren jetzt schicken würde (liest „Vorher sichern“ beim Tipp).
    install: inst && window._casoraUpdDetail ? window._casoraUpdDetail.installSpec(id, document.querySelector('home-assistant').hass.states[id]) : null, row: !!window.__pierce('[data-casora-mi="' + id + '"]', p.shadowRoot)[0],
    native: !!document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog') };
};
const pop = () => page.evaluate(POP, ID);
let s = await stable(page, POP, ID, { max: 8000, quiet: 1000 });
await need('Update-Popup mit der Update-Zeile', s && s.row, s);
const at = await page.evaluate((id) => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const b = window.__pierce('[data-casora-mi="' + id + '"]', p.shadowRoot)[0].getBoundingClientRect(); return { x: b.x + 60, y: b.y + b.height / 2 };
}, ID);
await page.mouse.click(at.x, at.y);
s = await stable(page, POP, ID, { max: 8000, quiet: 1200 });
await check('Kein nativer HA-Dialog', s && !s.native, s);
await check('Detailseite: Titel = Update, ‹ zurück sichtbar', s && /QA/.test(s.title) && s.back, s && s.title);
await check('Versionen und Versionshinweise (Markdown)', s && /2\.3\.1/.test(s.text) && /2\.4\.0/.test(s.text) && /Erster Punkt/.test(s.text) && /Zweiter Punkt/.test(s.text), s && s.text);
const wide = await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const n = window.__pierce('.cud-notes', p.shadowRoot)[0]; const sf = p.shadowRoot.querySelector('.surface');
  return n ? { sw: n.scrollWidth, cw: n.clientWidth, right: Math.round(n.getBoundingClientRect().right), surf: Math.round(sf.getBoundingClientRect().right) } : null; });
await check('„Was ist neu“ bricht um (nichts steht seitlich über)', wide && wide.sw <= wide.cw + 1 && wide.right <= wide.surf, wide);
await check('Installieren mit Sicherung, Überspringen da', s && s.install && s.install.service === 'install' && s.install.data.backup === true && /Überspringen/.test(s.text), s && s.install);
await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open')); window.__pierce('[data-casora-upd-bk]', p.shadowRoot)[0].click(); });
await page.waitForTimeout(400);
s = await pop();
await check('„Vorher sichern“ aus → Installieren ohne Sicherung', s && s.install && !s.install.data.backup, s && s.install);
// Echter Klick (Kopfmitte nimmt sonst keine Klicks an – per Skript ausgelöst fiel das nicht auf).
const bk = await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const r = p.shadowRoot.querySelector('.header-back').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(bk.x, bk.y);
s = await stable(page, POP, ID, { max: 8000, quiet: 1200 });
await check('‹ zurück zur Update-Liste', s && !s.back && s.row, s && s.title);
await finish();
