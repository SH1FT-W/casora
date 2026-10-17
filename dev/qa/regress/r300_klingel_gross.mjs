// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/24-klingel.js dev/casora_mock/klingel.py
// Reolink-Türklingel (#23): großes Bild und zweite Kamera an der erfundenen Testklingel camera.testklingel_sub
// mit der zweiten Testkamera camera.testhof (dev/casora_mock/klingel.py):
//   1. Popup: Groß-Knopf auf dem Bild → großes Bild in der obersten Ebene (breiter als im Popup), Esc schließt nur
//      das große Bild, das Popup bleibt offen.
//   2. Umschalter „Klingel | Testhof“ auf dem Bild: wechselt das Live-Bild auf die zweite Kamera, Sprechen dort
//      gesperrt; auch im großen Bild umschaltbar; × schließt.
//   3. Mit Stream (untergeschoben): Tipp auf „Mithören“ → automatisch groß (Studio-Option, Standard an).
//   4. Wischen nach unten schließt nur das große Bild.
//   5. Ohne Studio-Feld: kein Umschalter (unverändert).
// Kacheln entstehen nur im Browser (nicht gespeichert).
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const ID = 'camera.testklingel_sub', HOF = 'camera.testhof';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1180, height: 820, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Testklingel und Testhof im Testhaus (Mock)', await page.evaluate(([a, b]) => {
  const S = document.querySelector('home-assistant').hass.states;
  return !!(S[a] && S[b]);
}, [ID, HOF]));
const tile = async (cls, variables) => page.evaluate(async ([id, cls, variables]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_reolink_doorbell', entity: id, name: 'Haustür', variables });
  el.classList.add(cls);
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [ID, cls, variables]);
// Zustand des Live-Bilds im offenen Popup (Shadow-DOM durchsucht).
const live = (arg) => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const el = pop && window.__pierce('casora-klingel-live', pop.shadowRoot)[0];
  if (!el || !el.shadowRoot) return null;
  const r = el.shadowRoot, q = (s) => r.querySelector(s);
  const st = q('.st'), fs = q('.fs'), fr = q('.fr'), sg = q('.sg'), tb = q('.tlk'), nt = q('.nt');
  const rect = (x) => { const b = x && x.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
  let top = false;
  try { top = st.matches(':popover-open'); } catch (e) { top = null; }
  return { open: !!pop, big: st.classList.contains('big'), top, fs: !!fs && !fs.hidden, fsRect: rect(fs), fr: rect(fr),
    seg: sg && !sg.hidden ? [...sg.querySelectorAll('.sgb')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')) : null,
    segRects: sg ? [...sg.querySelectorAll('.sgb')].map(rect) : [], view: el._v && el._v.id, x: rect(q('.x')), xShown: !q('.x').hidden,
    talkOff: tb ? tb.disabled : null, note: nt && !nt.hidden ? nt.textContent.trim() : '', snd: rect(q('.snd')), sndOn: q('.snd').getAttribute('aria-pressed'),
    mark: !!(el._card && el._card.__qaR300), card: !!el._card,
    vw: innerWidth };
}, arg, { max: 8000, quiet: 600 });
const click = async (r) => { await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(500); };
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };

const at = await tile('qa-r300', { camera2: HOF, talk: true });
await page.mouse.click(at.x, at.y);
let l = await live();
await check('Popup: Groß-Knopf auf dem Bild, Umschalter „Klingel | Testhof“', l && l.fs && l.seg && l.seg.join('|') === 'Klingel*|Testhof' && l.view === ID, l);
await check('Groß-Knopf: 44 px Trefferfläche, oben rechts im Bild', l && l.fsRect && l.fsRect.w >= 36 && Math.abs(l.fsRect.x + l.fsRect.w - (l.fr.x + l.fr.w)) <= 12, l && { fs: l.fsRect, fr: l.fr });
const small = l && l.fr;
await click(l.fsRect);
l = await live();
await check('Groß: oberste Ebene, Bild deutlich breiter, × sichtbar', l && l.big && l.top !== false && l.xShown && l.fr.w > small.w * 1.5, l && { big: l.big, top: l.top, w: l.fr.w, vorher: small && small.w });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
l = await live();
await check('Esc schließt nur das große Bild, Popup bleibt offen', l && l.open && !l.big && l.top === false, l);

// Zweite Kamera
await click(l.segRects[1]);
l = await live();
await check('Umschalter: Live-Bild zeigt die zweite Kamera', l && l.view === HOF && l.seg.join('|') === 'Klingel|Testhof*', l);
await check('Zweite Kamera: Sprechen gesperrt', l && l.talkOff === true && (/nur über die Klingel|HTTPS|Browser/.test(l.note)), l && { talk: l.talkOff, note: l.note });
await click(l.fsRect);
l = await live();
await click(l.segRects[0]);
l = await live();
await check('Im großen Bild umschaltbar (zurück zur Klingel, bleibt groß)', l && l.big && l.view === ID, l && { big: l.big, view: l.view });
await click(l.x);
l = await live();
await check('× schließt das große Bild', l && !l.big && l.open, l && { big: l.big, open: l.open });
await closePop();

// Mithören → groß (mit untergeschobenem Stream; Ton an der Klingel an)
await fakeStates(page, { [ID]: { state: 'idle', attributes: { supported_features: 2, friendly_name: 'Testklingel Fluent' } } }, { sticky: true });
await page.mouse.click(at.x, at.y);
l = await live();
await need('Mithören-Knopf da', l && l.snd && l.snd.w > 0, l);
await click(l.snd);
l = await live();
await check('Mithören → automatisch groß', l && l.big && l.sndOn === 'true', l && { big: l.big, snd: l.sndOn });
// Player markieren: nach dem Schließen muss es derselbe sein (kein neuer Stream, Ton bricht nicht ab).
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const el = window.__pierce('casora-klingel-live', pop.shadowRoot)[0];
  if (el._card) el._card.__qaR300 = true;
});
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
l = await live();
await check('Esc: Mithören läuft weiter (derselbe Player)', l && !l.big && l.sndOn === 'true' && l.card && l.mark, l && { big: l.big, snd: l.sndOn, card: l.card, mark: l.mark });
await closePop();

// Wischen nach unten (Touch über CDP) schließt nur das große Bild.
await page.mouse.click(at.x, at.y);
l = await live();
await click(l.fsRect);
const cdp = await page.context().newCDPSession(page);
const tp = (y) => [{ x: Math.round(l.vw / 2), y }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(300) });
for (let y = 315; y <= 480; y += 15) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(y) });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(600);
l = await live();
await check('Wischen nach unten schließt das große Bild, Popup bleibt', l && !l.big && l.open, l && { big: l.big, open: l.open });
await closePop();

// Ohne Studio-Feld: kein Umschalter
const at2 = await tile('qa-r300b', {});
await page.evaluate(() => { const a = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r300'); if (a) a.remove(); });
await page.mouse.click(at2.x, at2.y);
l = await live();
await check('Ohne zweite Kamera: kein Umschalter, Groß-Knopf da', l && !l.seg && l.fs, l);
await closePop();
await finish();
