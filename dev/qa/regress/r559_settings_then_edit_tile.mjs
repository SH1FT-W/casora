// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-b.js custom_components/casora/panel/casora-panel-updates.js custom_components/casora/panel/casora-panel-versions.js
// Issue #122 (26.11.11, desktop 1912 × 948): with Settings › "Tapping & tablet" open, "Edit tile" on a tile of the
// preview did nothing: the settings page stayed and the tile editor did not open; only after closing the settings
// first it worked. Expected: a click on a tile (or badge, room title …) in the preview leaves the open page
// (a settings tile, Updates, Rewind) and opens that editor right away.
// At 1440 and 1912 px, preview Desktop, Tablet and Phone:
//   - Settings › "Tapping & tablet" (opened from the settings grid), click on a tile in the preview → the tile's
//     editor is open, the settings page is closed;
//   - the other way round: tile editor open → Settings opens over it, a click on another tile → its editor;
//   - unsaved changes (a setting of this dashboard on "Tapping & tablet", a setting for all dashboards on another
//     tile): leaving this way keeps the draft (like leaving the settings through the sidebar), the page shows it
//     again with the save bar when reopened; then it is discarded, nothing is saved;
//   - 1440: with the settings open, a badge and the room title / photo open their editor as well; with Updates or
//     Rewind open, a click on a tile opens its editor.
// Every step is repeated once if the Studio reloads under load (studioRetry); nothing is saved.
import { open, studio, studioRetry, studioDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard für das Studio', dash, dash);

const SIZES = [['1440', { width: 1440, height: 900 }], ['1912', { width: 1912, height: 948 }]];
for (const [tag, opts] of SIZES) {
  const { page, browser } = await open({ ...opts, dark: false });
  usePage(page);
  await studio(page, dash);
  const step = (fn) => studioRetry(page, dash, fn);
  const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
  const wait = (ms) => page.waitForTimeout(ms);
  // A visible tile of the preview, marked for a real mouse click; skip = a key not to take.
  const markTile = (skip) => P(`const R = p.shadowRoot; R.querySelectorAll('[data-qa]').forEach((e) => e.removeAttribute('data-qa'));
    const t = [...R.querySelectorAll('.card.map .mtile[data-mk^="t:"]:not(.ghost):not(.bghost)')].find((x) => { const r = x.getBoundingClientRect();
      return x.dataset.mk !== arg && r.width > 20 && r.height > 20; });
    if (!t) return null; t.setAttribute('data-qa', 'tile'); return t.dataset.mk;`, skip || '');
  const state = () => P(`const R = p.shadowRoot; const vis = (e) => !!(e && e.getClientRects().length && e.getBoundingClientRect().width > 0);
    return { cs: !!p._csOpen, cu: !!p._cuOpen, cv: !!p._cvOpen, sel: p._sel ? p._sel.group + ':' + p._sel.key : null,
      editor: vis(R.querySelector('#pane #band-tiles .tile.sel')), page: vis([...R.querySelectorAll('.cs-wrap, .cn-block, .cu-wrap')].find(vis)) };`);
  // The gear (Settings), then a tile of the settings grid.
  const openTile = async (id) => {
    await P(`p._bOpenSettings(null); await new Promise((r) => setTimeout(r, 900));
      const b = p.shadowRoot.querySelector('.cs-hubtile[data-tile="' + arg + '"]'); if (b) b.click();`, id);
    await wait(1400);
    return P(`return !!p._csOpen && p._csPage === 'n-' + arg;`, id);
  };
  const preview = async (size) => {
    await P(`if (p._bClose) p._bClose(); p._miniSize = arg; if (p._bSyncSize) p._bSyncSize(); p._rebuildPreview();`, size);
    await wait(1200);
    return P('return p._miniSize;');
  };

  for (const size of ['desktop', 'tablet', 'phone']) {
    await step(async () => {
      const sz = await preview(size);
      if (sz !== size) { console.log(`  (${tag}: Vorschau ${size} nicht möglich, ist ${sz})`); return; }
      const at = `${tag} ${size}`;
      await need(`${at}: „Tapping & tablet“ offen`, await openTile('use'));
      const mk = await markTile();
      await need(`${at}: Kachel in der Vorschau sichtbar`, mk, mk);
      await page.locator('[data-qa=tile]').click();
      await wait(1400);
      let s = await state();
      await check(`${at}: Einstellungen offen, Klick auf Kachel → Kachel-Editor offen, Einstellungen zu`,
        !s.cs && s.sel === 'tiles:' + mk.slice(2) && s.editor && !s.page, s);
      // The other way round: editor open → settings → another tile.
      await need(`${at}: aus dem Editor heraus „Tapping & tablet“ offen`, await openTile('use'));
      const mk2 = await markTile(mk);
      if (!mk2) return;
      await page.locator('[data-qa=tile]').click();
      await wait(1400);
      s = await state();
      await check(`${at}: Editor → Einstellungen → andere Kachel → deren Editor offen`, !s.cs && s.sel === 'tiles:' + mk2.slice(2) && s.editor && !s.page, s);
    });
  }

  // Unsaved changes: this dashboard's setting on "Tapping & tablet" (the reported page) and a setting for all
  // dashboards on the first tile that has one. SW: the first usable switch of a block that is (dash) or is not (all
  // dashboards) "Only this dashboard", or of the block arg.blk; "Advanced" open.
  const SW = `const d = p.shadowRoot.querySelector('.cn-adv'); if (d && !d.open) { d.open = true; await new Promise((r) => setTimeout(r, 900)); }
    const val = (sw) => (sw.type === 'checkbox' ? String(sw.checked) : sw.getAttribute('aria-checked'));
    const swOf = (blk) => [...blk.querySelectorAll('button.sw, [role=switch], input[type=checkbox]')].find((x) => x.getClientRects().length && !x.disabled);
    let hit = null;
    for (const blk of p.shadowRoot.querySelectorAll('#pane .cn-block')) {
      if (arg.blk ? blk.dataset.pkey !== arg.blk : !!blk.querySelector('.cn-bhead .cn-only') !== arg.dash) continue;
      const sw = swOf(blk); if (sw) { hit = { blk, sw }; break; } }`;
  for (const [tile, dash] of [['use', true], ...['look', 'bell', 'house', 'phone', 'wx', 'ai', 'system'].map((x) => [x, false])]) {
    const found = await step(async () => {
      await preview('desktop');
      await openTile(tile);
      const flip = await P(SW + ` if (!hit) return null; const before = val(hit.sw); hit.sw.click(); await new Promise((r) => setTimeout(r, 600));
        return { blk: hit.blk.dataset.pkey, before, dirty: p._csLeaveDirty() };`, { dash });
      if (!flip && !dash) return false;
      const kind = dash ? 'nur dieses Dashboard' : 'alle Dashboards';
      await need(`${tag}: Einstellung (${kind}) auf „${tile}“ umgeschaltet, ungespeichert`, flip && flip.dirty, flip);
      const mk3 = await markTile();
      await page.locator('[data-qa=tile]').click();
      await wait(1400);
      const s3 = await state();
      await check(`${tag}: ungespeichert (${kind}), Klick auf Kachel → Kachel-Editor offen, Einstellungen zu`,
        !s3.cs && s3.sel === 'tiles:' + mk3.slice(2) && s3.editor && !s3.page, s3);
      const kept = await P('return p._csLeaveDirty();');
      await check(`${tag}: die Änderung (${kind}) bleibt als Entwurf, nicht still verworfen`, kept, kept);
      await openTile(tile);
      const again = await P(SW + ` const bar = p.shadowRoot.querySelector('.cs-bar');
        return { now: hit ? val(hit.sw) : null, bar: !!bar && !bar.classList.contains('cs-clean') };`, { blk: flip.blk });
      await check(`${tag}: beim Wiederöffnen steht die Änderung (${kind}) noch da, Speicherleiste sichtbar`,
        again.now !== null && again.now !== flip.before && again.bar, { vorher: flip.before, ...again });
      await P('await p._csDiscardAll(); p._csBar();');
      await wait(900);
      await check(`${tag}: verworfen (${kind}), nichts gespeichert`, !(await P('return p._csLeaveDirty();')));
      return true;
    });
    if (found && !dash) break;
  }

  if (tag === '1440') {
    // With the settings open, the other things to pick in the preview open their editor as well.
    const PICKS = [['Badge', '.card.map .pbadge[data-mk^="b:"]:not(.ghost)', 'badges'],
      ['Raumtitel/Foto', '.card.map [data-pv="room"], .card.map [data-pv="photo"]', 'rooms'], ['Uhrzeit', '.card.map [data-pv="time"]', 'rooms']];
    for (const [name, sel, group] of PICKS) {
      await step(async () => {
        await preview('desktop');
        await need(`${tag}: „Tapping & tablet“ offen (${name})`, await openTile('use'));
        const there = await P(`const R = p.shadowRoot; R.querySelectorAll('[data-qa]').forEach((e) => e.removeAttribute('data-qa'));
          const e = [...R.querySelectorAll(arg)].find((x) => { const r = x.getBoundingClientRect(); return r.width > 8 && r.height > 8; });
          if (!e) return false; e.setAttribute('data-qa', 'pick'); return true;`, sel);
        if (!there) { console.log(`  (${name}: nicht in der Vorschau)`); return; }
        await page.locator('[data-qa=pick]').click();
        await wait(1400);
        const s5 = await state();
        await check(`${tag}: Einstellungen offen, Klick auf ${name} → dessen Editor offen, Einstellungen zu`,
          !s5.cs && !s5.page && !!s5.sel && s5.sel.startsWith(group + ':'), s5);
      });
    }
    // Updates and Rewind beside the preview: a click on a tile opens its editor too.
    for (const [name, fn] of [['Updates', '_cuOpenPage'], ['Rewind', '_cvOpenPage']]) {
      await step(async () => {
        await preview('desktop');
        const ok = await P(`if (typeof p[arg] !== 'function') return false; p._bOpen = true; await p[arg]();
          await new Promise((r) => setTimeout(r, 1500)); return !!(p._cuOpen || p._cvOpen);`, fn);
        if (!ok) { console.log(`  (${name} lässt sich hier nicht öffnen)`); return; }
        const m = await markTile();
        if (!m) { console.log(`  (${name}: keine Kachel sichtbar)`); return; }
        const clicked = await page.locator('[data-qa=tile]').click({ timeout: 4000 }).then(() => true, () => false);
        await check(`${tag}: ${name} offen, Kachel in der Vorschau anklickbar`, clicked);
        await wait(1400);
        const s4 = await state();
        await check(`${tag}: ${name} offen, Klick auf Kachel → Kachel-Editor offen, ${name} zu`,
          !s4.cu && !s4.cv && s4.sel === 'tiles:' + m.slice(2) && s4.editor, s4);
      });
    }
  }
  await browser.close();
}
await finish();
