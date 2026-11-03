// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js#mini-fill
// Owner (03.11.2026, prod screenshots): the Studio's "Tablet" preview of Home (dark) cut the tile row at the bottom –
// the tiles' names and values were cropped by the preview frame, while "Desktop" showed whole tiles. On Home the badges
// wrap to a second line at tablet width; the space above the title did not give way, so the tile row ran out of the
// frame. Expected: at desktop (1440) and tablet-sized (1180) Studio windows, the tablet and desktop previews show every
// tile of the row whole (bottom edge inside the frame), light and dark.
import { open, usePage, studio, check, need, finish } from './lib.mjs';

for (const [w, h] of [[1440, 900], [1180, 820]]) {
  for (const dark of [true, false]) {
    const { page } = await open({ width: w, height: h, dark, theme: 'Casora' });
    usePage(page);
    await studio(page, process.env.CASORA_QA_DASH || 'qa-arbeit');
    for (const size of ['tablet', 'desktop']) {
      await page.evaluate((s) => { const p = window.__panel(); p._room = 0; p._renderTabs && p._renderTabs(); p._renderForm && p._renderForm();
        const b = window.__pierce('[data-size="' + s + '"]', p.shadowRoot)[0]; if (b) b.click(); }, size);
      await page.waitForTimeout(2500);
      const m = await page.evaluate(() => { const p = window.__panel(); const card = window.__pierce('.card.map', p.shadowRoot)[0];
        if (!card) return null; const r = card.getBoundingClientRect();
        const tiles = window.__pierce('.mtile', card).map((t) => t.getBoundingClientRect()).filter((t) => t.width > 10 && t.left < r.right - 10);
        return { bottom: Math.round(r.bottom), tiles: tiles.length, tilesBottom: tiles.length ? Math.round(Math.max(...tiles.map((t) => t.bottom))) : null }; });
      await need(`${w}${dark ? ' dunkel' : ' hell'} ${size}: Vorschau mit Kacheln`, m && m.tiles > 0, m);
      await check(`${w}${dark ? ' dunkel' : ' hell'} ${size}: Kachelreihe ganz im Rahmen`, m.tilesBottom <= m.bottom, m);
    }
    await page.context().close();
  }
}
await finish();
