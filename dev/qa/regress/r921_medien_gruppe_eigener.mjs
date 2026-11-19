// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/47-media-extra.js#_casoraMediaGroup,_casoraMediaExtra,_casoraMediaExtraHtml
// Issue #212 (Sonos: one speaker in the kitchen, a stereo pair as one player in the living room, a picture frame speaker
// in the office). A) All three play as one group: the kitchen's media popup said „Zusammen abspielen · 3 Lautsprecher“
// but listed only the two others, the kitchen itself was counted and missing. B) Kitchen and office play, the living
// room is idle: its popup listed the two others without any sign that they play.
// Expected (Casora look, desktop): A) counted = listed, the popup's own speaker first and highlighted. B) the playing
// speakers say „Läuft“ and stand first. The test speakers' states are faked in this browser only (nothing reaches HA).
import { open, usePage, dashboard, casoraDashboard, fakeStates, check, need, finish, shot } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1280, height: 900, dark: false, theme: 'Casora' });
usePage(page);
const views = dash.config.views.map((v, i) => v.path || String(i));
await dashboard(page, dash.url + '/' + views[0], 3);

const WZ = 'media_player.testlautsprecher_wohnzimmer', KUE = 'media_player.testlautsprecher_kueche';
const BUERO = 'media_player.testlautsprecher_buero', BAD = 'media_player.testlautsprecher_bad';
const have = await page.evaluate((ids) => ids.every((id) => !!document.querySelector('home-assistant').hass.states[id]), [WZ, KUE, BUERO]);
await need('Testlautsprecher im Testhaus', have);

const song = { media_content_type: 'music', media_title: 'Morgenlicht', media_artist: 'Testensemble', media_duration: 214,
  media_position: 61, media_position_updated_at: new Date().toISOString() };
const play = (members) => ({ state: 'playing', attributes: { ...song, group_members: members } });
const idle = (id) => ({ state: 'idle', attributes: { group_members: [id] } });

// Rows of the „Zusammen abspielen“ section of the open popup: label, value, highlighted.
const section = () => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const box = window.__pierce('.mx', s).find((x) => x.getBoundingClientRect().width > 0);
  if (!box) return null;
  const rows = [...box.querySelectorAll('.hui-row')].map((r) => {
    const lab = r.querySelector('.hui-inner > div[style*="flex:1"] > div');
    const val = [...r.querySelectorAll('.hui-end')].map((e) => e.textContent.trim()).join(' ');
    return { label: lab ? lab.textContent.trim() : '', value: val, sel: r.classList.contains('hui-sel') };
  });
  const head = (box.textContent.match(/Zusammen abspielen[^A-Za-zÄÖÜ]*\d*\s*Lautsprecher|Zusammen abspielen/) || [''])[0];
  return { head: head.replace(/\s+/g, ' ').trim(), rows };
});
const openPopup = async (id) => {
  await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* closed */ } });
  await page.waitForTimeout(800);
  await page.evaluate((x) => window._casoraNotifyOpenViaCard(x, () => {}, null, true), id);
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface;
    return s && window.__pierce('.mx .hui-row', s).some((x) => x.getBoundingClientRect().width > 0); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return section();
};

// A) all three in one group.
const all3 = [KUE, WZ, BUERO];
await fakeStates(page, { [KUE]: play(all3), [WZ]: play(all3), [BUERO]: play(all3), [BAD]: idle(BAD) }, { sticky: true });
const a = await openPopup(KUE);
await shot('A Küche, alle drei spielen');
await need('A: Abschnitt „Zusammen abspielen“ im Küchen-Popup', a && a.rows.length, a);
const lit = a.rows.filter((r) => r.sel);
await check('A: Überschrift zählt 3 Lautsprecher', /3 Lautsprecher/.test(a.head), a);
await check('A: gezählt = gelistet (3 hinterlegte Zeilen)', lit.length === 3, a);
await check('A: der eigene Lautsprecher steht zuerst', /Küche/.test(a.rows[0].label) && a.rows[0].sel, a);
await check('A: alle hinterlegten Zeilen sagen „Läuft“', lit.every((r) => /Läuft/.test(r.value)), a);

// B) kitchen and office play together, the living room is idle.
await fakeStates(page, { [KUE]: play([KUE, BUERO]), [BUERO]: play([KUE, BUERO]), [WZ]: idle(WZ) }, { sticky: true });
const b = await openPopup(WZ);
await shot('B Wohnzimmer ruht, Küche und Büro spielen');
await need('B: Abschnitt „Zusammen abspielen“ im Wohnzimmer-Popup', b && b.rows.length, b);
const playing = b.rows.filter((r) => /Läuft/.test(r.value)).map((r) => r.label);
await check('B: Küche und Büro als spielend genannt', playing.length === 2 && playing.some((l) => /Küche/.test(l))
  && playing.some((l) => /Büro/.test(l)), b);
await check('B: die spielenden stehen zuerst', b.rows.slice(0, 2).every((r) => /Läuft/.test(r.value)), b);
await check('B: nichts hinterlegt, keine Zahl (Wohnzimmer spielt nicht mit)', !b.rows.some((r) => r.sel) && !/\d/.test(b.head), b);
await check('B: das Wohnzimmer listet sich nicht selbst', !b.rows.some((r) => /Wohnzimmer/.test(r.label)), b);
await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* closed */ } });
await finish();
