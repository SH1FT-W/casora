// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b.js custom_components/casora/panel/casora-panel-settings.js
// T21 (test 2): Settings › Appearance in the inspector did not close with Esc (twice), and its sheet had another
// background than the tile sheet. Expected: Esc closes the settings page (focus inside and on the page background),
// the settings sheet has the inspector's background like the content sheet.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);
// The inspector's color without its alpha (the page is nearly opaque over the photo, the content sheet frosted).
const bg = () => P(`const i = p.shadowRoot.querySelector('.inspector'); if (!i) return null;
  const m = getComputedStyle(i).backgroundColor.match(/\\d+(\\.\\d+)?/g); return m ? m.slice(0, 3).join(',') : null;`);

// Content sheet for comparison.
await P('p._bShowList();');
await wait(1500);
const contentBg = await bg();
await P('p._bClose();');
await wait(600);

for (const how of ['inside', 'outside']) {
  await P('p._csShow("look");');
  await wait(1200);
  await need('settings page open', await P('return !!p._csOpen;'));
  if (how === 'inside') {
    await P(`const b = p.shadowRoot.querySelector('.inspector button, .inspector [tabindex]'); if (b) b.focus();`);
  } else {
    await P('if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); p.blur && p.blur();');
  }
  if (how === 'inside') {
    const settingsBg = await bg();
    await check('T21 settings sheet has the content sheet\'s background', settingsBg === contentBg, { settingsBg, contentBg });
  }
  await page.keyboard.press('Escape');
  await wait(800);
  await check(`T21 Esc closes the settings page (focus ${how})`, !(await P('return !!p._csOpen;')), {});
}
await finish();
