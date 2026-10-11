// @zustand: arbeit
// Gemeldet (11.10.2026): Am Desktop/Tablet hatte die Glocke (und die Sprechblase) in der Kapsel keinen
// Mouse-over mehr, nur ⋯. Ursache: ohne eigene Tipp-Aktion setzt button-card ha-card.disabled
// (pointer-events:none) – :hover griff nie. Erwartet: alle drei Kreise hellen beim Darüberfahren auf,
// die Glocke öffnet weiter per Klick.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const T = ['casora_notifications_button', 'casora_assist_button', 'casora_settings_button'];
const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Tablet', { width: 1024, height: 768 }]]) {
  const { page, browser } = await open({ ...size, theme: 'Casora', dark: false });
  await dashboard(page, dash.url);
  const info = () => page.evaluate((T) => window.__pierce('button-card').filter((b) => T.some((t) => [].concat(b._config?.template || []).includes(t)))
    .map((b) => { const r = b.getBoundingClientRect(), c = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
      return { t: [].concat(b._config.template).find((t) => T.includes(t)), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width,
        bg: c ? getComputedStyle(c).backgroundColor : '' }; }).filter((x) => x.w > 0), T);
  const base = await info();
  await need(`${label}: Glocke und ⋯ sichtbar`, base.some((b) => b.t === T[0]) && base.some((b) => b.t === T[2]), base.map((b) => b.t));
  for (const b of base) {
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(450);
    const h = (await info()).find((x) => x.t === b.t);
    await check(`${label}: ${b.t} hellt beim Darüberfahren auf`, h && h.bg !== b.bg && !/rgba\(0, 0, 0, 0\)/.test(h.bg), { vorher: b.bg, hover: h && h.bg });
    await page.mouse.move(5, 500);
    await page.waitForTimeout(250);
  }
  const bell = base.find((b) => b.t === T[0]);
  await page.mouse.click(bell.x, bell.y);
  await page.waitForTimeout(1300);
  const menu = await page.evaluate(() => window.__pierce('.casora-notify-menu').some((m) => m.getBoundingClientRect().height > 0));
  await check(`${label}: Klick auf die Glocke öffnet sie`, menu);
  await browser.close();
}
await finish();
