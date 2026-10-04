// @zustand: arbeit
// Gemeldet: In der Studio-Vorschau klappt die Szenen-Badge nicht auf (keine Unter-Badges),
// im Dashboard aber schon. Erwartet: Antippen zeigt die Szenen als Unter-Badges.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => JSON.stringify(d.config).includes('"show_scenes":true'));
await need('Casora-Dashboard mit Szenen-Badge', dash);
const { page } = await open();
await studio(page, dash.url);

// Home-Raum (Szenen-Badge steht in der Home-Zeile) in der Vorschau zeigen.
const info = await page.evaluate(async () => {
  const p = window.__panel();
  const I = window.__casoraPanelInternals;
  const i = p._state.compact.rooms.findIndex((r) => I.isHomeRoom ? I.isHomeRoom(r) : /home/i.test(r.path || ''));
  p._room = Math.max(0, i);
  p._renderTabs && p._renderTabs();
  p._renderForm();
  await new Promise((r) => setTimeout(r, 1200));
  const pills = window.__pierce('.mini-badges .pbadge:not(.ghost)');
  return { room: p._room, pills: pills.map((b) => b.textContent.replace(/\s+/g, ' ').trim()) };
});
const scenes = await page.evaluate(() => {
  const b = window.__pierce('.mini-badges .pbadge:not(.ghost)').find((x) => /Szenen|Scenes/.test(x.textContent));
  if (!b) return null;
  b.click();
  return true;
});
await check('Szenen-Badge in der Vorschau vorhanden', scenes, info.pills);
if (scenes) {
  await page.waitForTimeout(900);
  const subs = await page.evaluate(() => {
    const s = window.__pierce('.mini-subs')[0];
    return { on: !!(s && s.classList.contains('on')), n: s ? s.querySelectorAll('.pbadge').length : 0 };
  });
  await check('Szenen-Badge klappt auf (Unter-Badges sichtbar)', subs.on && subs.n > 0, subs);
}
await finish();
