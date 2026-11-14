// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b.js
// Keyboard and screen reader round (14.11.2026): in the Studio preview every clickable part is a keyboard stop with
// role button, named from its visible text – the room photo (mini-fill) and a tile's switch (mtgl) have no text, so a
// screen reader announced just „button“ for them. Expected: every button of the preview has a name in the shown
// language (photo: „Change the photo“, switch: the tile's name and „Switch“). Nothing is saved.
import { open, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('a Casora dashboard for the Studio', dash);
const { page } = await open({ width: 1440, height: 900, locale: 'en-US', lang: 'en' });
await studio(page, dash);
// The preview names its buttons when it draws; wait until there are some.
await page.waitForFunction(() => window.__pierce('.card.map [role=button]').length > 5, null, { timeout: 30000 }).catch(() => {});
const res = await page.evaluate(() => window.__pierce('.card.map [role=button]')
  .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((e) => ({ cls: String(e.className).split(' ')[0], name: (e.getAttribute('aria-label') || '').trim() })));
await need('the preview has buttons', res.length > 5, res.length);
const nameless = res.filter((r) => !r.name);
await check('every button of the Studio preview has a name', nameless.length === 0, nameless.slice(0, 6));
const photo = res.find((r) => r.cls === 'mini-fill');
if (photo) await check('room photo is named in English', photo.name === 'Change the photo', photo);
const sw = res.find((r) => r.cls === 'mtgl');
if (sw) await check('tile switch is named with its tile and „Switch“', / · Switch$/.test(sw.name) && sw.name.length > 9, sw);
await finish();
