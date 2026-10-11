// @zustand: arbeit
// Gemeldet (11.10.2026): Am Handy rutschte der Seitenkopf („Zuhause“, Wetter) manchmal nach unten und blieb
// dort – oben galt wieder der alte Abstand 52px, obwohl die Kapsel schon unten in der Leiste saß.
// Erwartet: nach dem Laden 8px; setzt danach jemand 52px, stellt die Leiste sofort 8px wieder her.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await dashboard(page, dash.phone.url);
const resv = () => page.evaluate(() => ({ r: getComputedStyle(document.documentElement).getPropertyValue('--casora-mhead-reserve').trim(),
  docked: !!document.querySelector('.hmn-dock button-card') }));
await page.waitForTimeout(3500);
const a = await resv();
await need('Kapsel unten in der Leiste', a.docked, a);
await check('nach dem Laden oben 8px', a.r === '8px', a);
await page.evaluate(() => document.documentElement.style.setProperty('--casora-mhead-reserve', '52px'));
await page.waitForTimeout(300);
const b = await resv();
await check('späterer 52px-Wert wird sofort auf 8px zurückgestellt', b.r === '8px', b);
await finish();
