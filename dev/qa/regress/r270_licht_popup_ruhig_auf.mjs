// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet (14.10.2026): Beim Öffnen des Licht-Popups kam die Raumleiste („Alle, Wohnzimmer …“) sichtbar
// später als die Räume darunter, und nach einer knappen halben Sekunde sprang der Inhalt um 58px nach unten.
// Ursache: die Leiste war bis zum fertigen Layout versteckt, und das Kopfabstand-Messen (_fitHeadGap) hielt
// deshalb „Räume“ für den Anfang und schob den Inhalt unter den Kopf. Geprüft wird Bild für Bild nach dem
// Antippen der Licht-Kachel: sobald die Leiste sichtbar ist, bewegen sich weder Leiste noch Popup mehr
// senkrecht, und die Leiste liegt nie über dem Inhaltsbereich (unter dem Kopf).
// Hinweis: Der alte Sprung hing vom Timing beim Öffnen ab und ließ sich im Testhaus nicht sicher nachstellen –
// der Test wacht über das Ergebnis, ein Gegenlauf mit dem alten Stand war hier grün.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = await casoraDashboard();
await need('ein Casora-Dashboard', d);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
await dashboard(page, d.url, 3);
await page.waitForTimeout(2000);
// Licht-Kachel mit Raumleiste: eine Lichtgruppe über mehrere Räume, als Kachel eingesetzt.
const ok = await page.evaluate(async () => {
  const ha = document.querySelector('home-assistant'), S = ha.hass.states;
  // Wie im Popup (group_rooms): eine Gruppe, deren Mitglieder selbst Raumgruppen sind.
  const grp = (x) => S[x] && Array.isArray((S[x].attributes || {}).entity_id);
  const g = Object.keys(S).find((x) => x.startsWith('light.') && grp(x) && S[x].attributes.entity_id.length >= 3
    && S[x].attributes.entity_id.every(grp));
  if (!g) return false;
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity: g, variables: { group_rooms: true } });
  el.id = 'qa-r270'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:400px;top:600px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  return true;
});
await need('Haus-Lichtgruppe aus Raumgruppen', ok);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__rec = []; const t0 = performance.now();
  const vis = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement || (n.getRootNode() && n.getRootNode().host)) {
    const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.opacity === '0') return false; } return true; };
  const tick = () => {
    const t = performance.now() - t0, p = window.casoraPopup && window.casoraPopup.element;
    if (p && p.hasAttribute('open')) {
      const a = window.__pierce('*', p.shadowRoot).find((e) => e.children.length === 0 && e.textContent.trim() === 'Alle' && e.getBoundingClientRect().width > 0);
      const c = p.shadowRoot.querySelector('.content'), sf = window.casoraPopup.surface;
      if (a && c && sf) window.__rec.push({ t: Math.round(t), vis: vis(a), y: Math.round(a.getBoundingClientRect().y),
        top: Math.round(c.getBoundingClientRect().y), h: Math.round(sf.getBoundingClientRect().height) });
    }
    if (t < 2500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r270')._handleAction({ detail: { action: 'tap' } }, { isIcon: false }));
await page.waitForTimeout(3000);
const rec = await page.evaluate(() => window.__rec);
const shown = rec.filter((r) => r.vis);
await need('Raumleiste im Licht-Popup', shown.length > 0, rec.slice(0, 5));
const last = shown[shown.length - 1];
const moved = shown.filter((r) => Math.abs(r.y - last.y) > 3 || Math.abs(r.h - last.h) > 3);
await check('ab dem Sichtbarwerden kein Sprung (Leiste und Popup stehen)', moved.length === 0, { moved: moved.slice(0, 4), last });
await check('Raumleiste nie unter den Kopf geschoben', rec.every((r) => r.y >= r.top), rec.filter((r) => r.y < r.top).slice(0, 3));
await finish();
