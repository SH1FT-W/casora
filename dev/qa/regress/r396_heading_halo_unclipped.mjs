// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/theme_*.yaml custom_components/casora/scripts/filter-overlay.js
// Reported (owner, iPhone, 26.11.1, 01.11.2026): behind „Favoriten“ (home) and „Szenen“ (room) sat a light
// RECTANGULAR box, while „Licht“/„Klima“/„Jalousien“ looked soft. Cause: the readability halo (text-shadow
// var(--casora-mobile-title-halo), up to 24 px blur, fam-16) was cut off by an ancestor with overflow:hidden –
// for casora_mobile_header by button-card's #name (ellipsis) tight around the text and by its ha-card, for the
// room group headings by the heading itself (10 px below). A clipped halo shows straight edges.
// Expected (WebKit, iPhone 393x852, Casora light/dark, Glas, Nebel dark): every section heading with a halo has
// at least as much room up to the nearest clipping ancestor as the halo reaches (largest blur), except at the
// screen edge. Home (casora_mobile_header) and room (scenes head and group headings).
// Also (owner, 01.11.2026): without grouping by category a room with scenes shows a „Geräte“ heading before its
// tiles (same heading style), a room without scenes none; with grouping the category headings as before.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const SHOTS = process.env.R396_SHOTS;

// All visible section headings with their halo reach and the room left up to the nearest clipping ancestor.
const measure = (page) => page.evaluate(() => {
  const up = (e) => e.parentNode && e.parentNode.nodeType === 11 ? e.parentNode.host : e.parentElement;
  const reach = (ts) => {
    let m = 0;
    if (!ts || ts === 'none') return 0;
    // Each shadow: offset x, offset y, blur – the halo reaches blur + offset.
    for (const part of ts.split(/,(?![^(]*\))/)) {
      const px = (part.match(/-?[\d.]+px/g) || []).map(parseFloat);
      if (px.length >= 3) m = Math.max(m, px[2] + Math.max(Math.abs(px[0]), Math.abs(px[1])));
    }
    return m;
  };
  const heads = [];
  for (const b of window.__pierce('button-card')) {
    if (![].concat(b._config?.template || []).includes('casora_mobile_header')) continue;
    const n = b.shadowRoot && b.shadowRoot.querySelector('#name');
    if (n) heads.push(n);
  }
  for (const w of window.__pierce('[data-casora-room-group]')) if (w.firstElementChild) heads.push(w.firstElementChild);
  const vw = innerWidth, out = [];
  for (const h of heads) {
    const r = h.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
    // Hidden behind the room overlay or faded out: not seen.
    let hidden = false;
    for (let e = h; e && e !== document.documentElement; e = up(e)) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) { hidden = true; break; }
    }
    if (hidden) continue;
    const ext = reach(getComputedStyle(h).textShadow);
    const rg = document.createRange(); rg.selectNodeContents(h);
    const tr = rg.getBoundingClientRect();
    const gap = { top: 1e9, bottom: 1e9, left: 1e9, right: 1e9 }, by = [];
    for (let e = h; e && e !== document.documentElement; e = up(e)) {
      const cs = getComputedStyle(e);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = e.getBoundingClientRect();
      const g = {
        top: tr.top - c.top, bottom: c.bottom - tr.bottom,
        // At the screen edge the halo ends anyway.
        left: c.left <= 0.5 ? 1e9 : tr.left - c.left, right: c.right >= vw - 0.5 ? 1e9 : c.right - tr.right,
      };
      let hit = false;
      for (const k of Object.keys(gap)) if (g[k] < gap[k]) { gap[k] = g[k]; if (g[k] < ext) hit = true; }
      if (hit) by.push((e.localName || '') + (e.id ? '#' + e.id : '') + ':' + cs.overflowX + '/' + cs.overflowY);
    }
    out.push({ text: h.textContent.trim(), ext, min: Math.round(Math.min(...Object.values(gap))),
      gap: Object.fromEntries(Object.entries(gap).map(([k, v]) => [k, Math.round(v)])), by });
  }
  return out;
});

// Headings of the shown room page in order (after the room head and its chips): scenes / devices heads, category
// group heads, tiles.
const roomPage = (page) => page.evaluate(() => {
  const ov = window.__pierce('casora-filter-overlay').find((o) => o._showing);
  if (!ov || !ov._contentEl) return null;
  const kids = [...ov._contentEl.children];
  const from = ov._subBadgesWrapper && kids.includes(ov._subBadgesWrapper) ? kids.indexOf(ov._subBadgesWrapper) + 1 : 2;
  const heads = [];
  for (const kid of kids.slice(from)) {
    if (kid.hasAttribute('data-casora-room-group')) { heads.push('group:' + kid.getAttribute('data-casora-room-group')); continue; }
    const bc = kid.localName === 'button-card' ? kid : kid.querySelector && kid.querySelector(':scope > button-card');
    const t = [].concat(bc?._config?.template || []);
    if (t.includes('casora_mobile_header')) heads.push(bc._config.name);
    else if (t.includes('casora_scene_row')) heads.push('[scenes]');
    else if (heads[heads.length - 1] !== '[tiles]') heads.push('[tiles]');
  }
  return heads;
});

// Rooms with tiles and scenes (from the overlays' own lists), in bar order.
const rooms = (page) => page.evaluate(() => (window.__pierce('casora-mobile-nav')[0]?._items('rooms') || []).filter((x) => x.label).map((x) => x.label));
// Before a room page is built: without scenes, or with the tiles of all rooms (several categories → groups).
const prepare = (page, label, how) => page.evaluate(([label, how]) => {
  const ov = window.__pierce('casora-filter-overlay').find((o) => o._config && o._config.room === label);
  if (!ov || ov._autoSectionsDone) return 'built';
  if (how === 'noscenes') { ov._config = { ...ov._config, scenes: false }; return 'ok'; }
  const rows = [];
  let pending = null;
  for (const kid of ov._container.children) {
    const bc = ov._getBC(kid);
    if ([].concat(bc?._config?.template || []).includes('casora_mobile_header')) { pending = bc._config.name; continue; }
    const hsr = kid.querySelector?.('casora-smart-row');
    if (hsr && pending) { rows.push({ name: pending, hsr }); pending = null; }
  }
  const mine = rows.find((r) => r.name === label);
  if (!mine) return 'no row';
  const extra = rows.filter((r) => r !== mine).flatMap((r) => r.hsr._config?.cards || []).slice(0, 12);
  mine.hsr._config = { ...mine.hsr._config, cards: [...(mine.hsr._config?.cards || []), ...JSON.parse(JSON.stringify(extra))] };
  return 'ok';
}, [label, how]);
const openRoom = (page, label) => page.evaluate((label) => {
  const k = (window.__pierce('casora-mobile-nav')[0]?._items('rooms') || []).find((x) => x.label === label);
  if (k) k.run();
  return !!k;
}, label);
const settle = async (page) => {
  let last = '', same = 0;
  for (let i = 0; i < 30 && same < 3; i++) {
    await page.waitForTimeout(400);
    const v = JSON.stringify(await roomPage(page));
    same = v === last && v !== 'null' && v !== '[]' ? same + 1 : 0; last = v;
  }
  await page.waitForTimeout(900); // reveal animation
};

const haloChecks = async (tag, list) => {
  for (const h of list) {
    await check(`${tag} „${h.text}“ – Schein vorhanden`, h.ext > 0, h);
    await check(`${tag} „${h.text}“ – Schein nicht eckig abgeschnitten`, h.ext > 0 && h.min >= h.ext, h);
  }
};

const runs = [['Casora', false], ['Casora', true], ['Casora Glas', false], ['Casora Nebel', true]];
for (const [theme, dark] of runs) {
  for (const grouping of ['off', 'on']) {
    const tag = `${theme} ${dark ? 'dunkel' : 'hell'} Gruppen ${grouping}`;
    const { page, context } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark, theme });
    usePage(page);
    await context.addInitScript((g) => { try { localStorage.setItem('casora-room-groups', g); } catch (_) {} }, grouping);
    await dashboard(page, dash.phone.url, 3);
    // The theme's halo reaches the headings shortly after the tiles.
    await page.waitForFunction(() => window.__pierce('button-card').some((b) => [].concat(b._config?.template || []).includes('casora_mobile_header')
      && b.shadowRoot?.querySelector('#name') && getComputedStyle(b.shadowRoot.querySelector('#name')).textShadow !== 'none'), null, { timeout: 15000 }).catch(() => {});

    if (grouping === 'off') {
      const home = await measure(page);
      console.log(tag, 'Zuhause', JSON.stringify(home));
      await need(`${tag}: Zuhause – Abschnittsüberschriften gefunden`, home.length > 0, home);
      await haloChecks(`${tag}: Zuhause`, home);
      if (SHOTS) await shot(`${SHOTS}_${theme}_${dark ? 'dunkel' : 'hell'}_zuhause`);
    }

    // Room pages: (off) a room with scenes and one made scene-less, (on) a room with tiles of several categories.
    await page.waitForFunction(() => (window.__pierce('casora-mobile-nav')[0]?._items('rooms') || []).filter((x) => x.label).length >= 2,
      null, { timeout: 30000 }).catch(() => {});
    const all = await rooms(page);
    await need(`${tag}: zwei Räume in der Leiste`, all.length >= 2, all);
    const plan = grouping === 'off' ? [[all[0], null], [all[1], 'noscenes']] : [[all[all.length > 2 ? 2 : 0], 'many']];
    for (const [label, how] of plan) {
      if (how) await need(`${tag}: ${label} vorbereitet (${how})`, (await prepare(page, label, how)) === 'ok');
      await openRoom(page, label);
      await settle(page);
      const heads = await roomPage(page);
      console.log(tag, label, how || '', JSON.stringify(heads));
      const groups = heads.filter((x) => /^group:/.test(x));
      const devHead = heads.filter((x) => /^(Geräte|Devices)$/.test(x));
      if (how === 'many') {
        await check(`${tag}: ${label} – Gruppen-Überschriften (Licht, Klima …)`, groups.length >= 2, heads);
        await check(`${tag}: ${label} – mit Gruppen kein „Geräte“-Kopf`, devHead.length === 0, heads);
      } else if (how === 'noscenes') {
        await check(`${tag}: ${label} – ohne Szenen keine Überschrift`, heads.length > 0 && heads.every((x) => x === '[tiles]'), heads);
      } else {
        const at = heads.indexOf('[scenes]');
        await need(`${tag}: ${label} hat Szenen`, at > 0, heads);
        await check(`${tag}: ${label} – Gruppen aus`, groups.length === 0, heads);
        await check(`${tag}: ${label} – nach den Szenen ein „Geräte“-Kopf vor den Kacheln`,
          devHead.length === 1 && heads[at + 1] === devHead[0] && heads[at + 2] === '[tiles]', heads);
      }
      if (how !== 'noscenes') {
        const list = await measure(page);
        console.log(tag, label, 'Schein', JSON.stringify(list));
        await need(`${tag}: ${label} – Überschriften sichtbar`, list.length > 0, list);
        await haloChecks(`${tag}: ${label}`, list);
        if (SHOTS) {
          // For the comparison pictures only: a photo-like background with dark and light spots, as in the report.
          await page.evaluate(() => {
            const ov = window.__pierce('casora-filter-overlay').find((o) => o._showing);
            if (ov && ov._blurLayerEl) ov._blurLayerEl.style.background = 'linear-gradient(160deg, #e9d2b0 0%, #6b4a33 30%, #c9a27a 50%, #3b2a20 75%, #b98c66 100%)';
          });
          await page.waitForTimeout(300);
          await shot(`${SHOTS}_${theme}_${dark ? 'dunkel' : 'hell'}_gruppen-${grouping}_raum`);
        }
      }
    }
    await page.context().browser().close();
  }
}
await finish();
