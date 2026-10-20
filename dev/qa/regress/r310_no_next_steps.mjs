// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b-ux.js
// Asked for: the "Next steps" card in Content (own photo, first scene, open on the phone) is removed.
// Expected: no such card, also for a browser that still has it switched on (casora.studio.next = "on").
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard for the Studio', dash);
for (const [name, o] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, mobile: true }]]) {
  const { page, context } = await open(o);
  usePage(page);
  await context.addInitScript(() => { localStorage.setItem('casora.studio.next', 'on'); localStorage.removeItem('casora.studio.next.done'); });
  await studio(page, dash);
  // Content with nothing selected: where the card used to sit.
  await page.evaluate(() => { const p = window.__panel(); p._sel = null; p._bOpen = true; p._renderForm(); });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const pane = window.__panel().shadowRoot.getElementById('pane');
    return { pane: !!pane, card: !!(pane && pane.querySelector('.uxnext')), text: !!(pane && /Als Nächstes|Next steps/.test(pane.textContent)) };
  });
  await need(`${name}: Content pane open`, r.pane, r);
  await check(`${name}: no "Next steps" card`, !r.card && !r.text, r);
}
await finish();
