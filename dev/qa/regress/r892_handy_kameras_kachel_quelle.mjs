// @zustand: arbeit
// @parallel: allein   (changes Home's cameras only in the browser, saves nothing)
// @deckt: custom_components/casora/panel/casora-panel.js#_phoneMap,syncCamerasMobile
// Issue #204: on the phone, a room showed a "Cameras" tile with the home's cameras in its popup, and the Studio
// offered no way to edit or remove it. Casora builds that tile itself from Home › Security › Cameras
// (syncCamerasMobile, variables.casora_derived) and puts it into the section of the first camera's room. It has
// no twin among the room tiles, so the phone preview marked it "phone layout only" and a tap led nowhere.
// Expected: tapping the tile in the phone preview opens Home's Security badge, where the cameras are set.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone layout', dash && dash.phone);

const { page } = await open({ width: 1440, height: 900 });
usePage(page);
await studio(page, dash.url);

// Home gets two cameras (browser only); the derived tile is moved into a named room section so the room page shows it.
const prep = await page.evaluate(async () => {
  const p = window.__panel();
  const cams = Object.keys(p._hass.states).filter((id) => id.startsWith('camera.')).slice(0, 2);
  if (!cams.length) return { err: 'no camera' };
  const rooms = p._state.compact.rooms;
  const homeIdx = Math.max(0, rooms.findIndex((r) => r.path === 'home'));
  const home = rooms[homeIdx];
  home.variables = { ...(home.variables || {}), security_cameras: cams };
  delete home.variables.show_security;
  const st = p._phoneState();
  const secs = st.compact.rooms || [];
  const isDerived = (t) => t && t.variables && t.variables.casora_derived === 'cameras';
  let from = secs.find((s) => (s.tiles || []).some(isDerived));
  if (!from) return { err: 'no derived tile' };
  const links = ((p._pair || {}).link || {}).links || [];
  const target = secs.find((s, i) => s.name && links.some((l) => l.section === i && !l.overview));
  if (!target) return { err: 'no room section' };
  if (from !== target) {
    const t = from.tiles.find(isDerived);
    from.tiles = from.tiles.filter((x) => x !== t);
    target.tiles = (target.tiles || []).concat([t]);
  }
  const tile = target.tiles.find(isDerived);
  p._miniSize = 'phone';
  p._phoneFilter = 'room:' + target.name;
  p._room = rooms.findIndex((r) => r.name === target.name);
  if (p._room < 0) p._room = homeIdx === 0 ? 1 : 0;
  p._rebuildPreview();
  await new Promise((r) => setTimeout(r, 1500));
  return { homeIdx, section: target.name, name: tile.name, cams: cams.length };
});
await need('Home cameras and the derived Cameras tile in a room section', prep && !prep.err, prep);
console.log('         section: ' + prep.section + ', tile: ' + prep.name);

const hit = await page.evaluate((name) => {
  const p = window.__panel();
  const els = window.__pierce('.mp-tiles .mtile', p.shadowRoot)
    .filter((el) => ((el.querySelector('.mname') || {}).textContent || '').trim() === name);
  if (!els.length) return null;
  const el = els[0];
  const info = { mk: el.dataset.mk || null, title: el.title || '' };
  el.click();
  return info;
}, prep.name);
await need('Cameras tile painted in the phone preview', hit, hit);
await page.waitForTimeout(800);
const sel = await page.evaluate(() => { const p = window.__panel(); return { sel: p._sel || null, room: p._room }; });
await check('Cameras tile does not claim to be on the phone layout only', !/phone layout only|nur im Handy-Layout/i.test(hit.title), hit);
await check('Tap on the Cameras tile opens Home › Security',
  !!sel.sel && sel.sel.group === 'badges' && sel.sel.key === 'Security' && sel.room === prep.homeIdx, { hit, sel });
await finish();
