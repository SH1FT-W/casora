// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraRecipe,R.stageHtml,R.ckWeb,R.ckTarget,R.ckOpen,R.ckHtml,_casoraLinkHandler
// Owner (04.11.2026): the kitchen popup (Küche · Rezepte, v3) lost „Cookidoo-App öffnen“ in the v3 rework – the button
// that opens the Cookidoo app on the device. Expected: the stage ends with that button in Cookidoo green with a white
// word (contrast ≥ 4,5 : 1, light and dark), its link is the Cookidoo shopping list of the idea's market (Universal Link
// on iOS / new tab on a computer, app:// or intent: on Android), and at 393 px nothing runs over the popup's edge.
// Made-up idea of the week (fakeStates, sticky) with a cookidoo.de link; the recipe tile built in the browser from
// the dashboard's casora_recipe template; window.open is stubbed, so nothing leaves the page. Nothing is saved.
// R552_BILD=<dir>, R552_TAG=vorher|nachher: pictures of the popup (desktop 1440 and phone 393, light and dark).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboard, studioDashboard, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const dash = (await casoraDashboard()) || { url: await studioDashboard(), config: { views: [{}] } };
await need('Dashboard', dash && dash.url);
const IDEA = 'sensor.casora_rezept_der_woche';
const LINK = 'https://cookidoo.de/recipes/recipe/de-DE/r000552';
const FAKE = { [IDEA]: { state: 'QA Gemüsepfanne mit Reis', attributes: { status: 'ok', minuten: 30, warum: 'Schnell und saisonal.', zutaten: ['Reis', 'Paprika'], link: LINK } } };
const DIR = process.env.R552_BILD;
const TAG = process.env.R552_TAG || 'nachher';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const AND = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const lum = (rgb) => {
  const c = (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return c.length === 3 ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : null;
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return x == null || y == null ? 0 : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function popupIn({ width, height, mobile, dark, label }) {
  const { page } = await open({ width, height, mobile, safari: mobile, dark, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url + '/' + ((dash.config.views[0] || {}).path || '0'), 1);
  await need(label + ': Rezept-Skript geladen', await page.evaluate(() => !!(window._casoraRecipe && window.casoraPopup)));
  await fakeStates(page, FAKE, { sticky: true });
  await page.evaluate(() => { window.__qaOpened = []; window.open = (u) => { window.__qaOpened.push(String(u)); return null; }; });
  const made = await page.evaluate(async (IDEA) => {
    const ha = document.querySelector('home-assistant');
    const root = window.__pierce('hui-root')[0];
    const tpl = root && root.lovelace && root.lovelace.config && root.lovelace.config.button_card_templates;
    if (!tpl || !tpl.casora_recipe) return 'Vorlage casora_recipe fehlt';
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
    if (!old) return 'keine Kachel als Anker';
    const el = document.createElement('button-card');
    el.id = 'qa-r552';
    el.setConfig({ type: 'custom:button-card', template: 'casora_recipe', entity: IDEA });
    el.hass = ha.hass; old.parentNode.insertBefore(el, old);
    await new Promise((res) => setTimeout(res, 800));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    return 'ok';
  }, IDEA);
  await need(label + ': Rezept-Popup geöffnet', made === 'ok', made);
  let r = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    r = await page.evaluate(() => {
      const P = window.casoraPopup, S = P && P.surface;
      if (!S) return null;
      const stage = window.__pierce('.hrs', S)[0];
      if (!stage || !stage.getBoundingClientRect().width) return null;
      const b = window.__pierce('.hrs-ck', S)[0];
      const sr = S.getBoundingClientRect(), st = stage.getBoundingClientRect();
      const out = { stage: true, surfaceW: Math.round(sr.width), scrollW: S.scrollWidth, clientW: S.clientWidth, vw: window.innerWidth };
      if (!b) return out;
      const br = b.getBoundingClientRect(), cs = getComputedStyle(b), span = b.querySelector('span'), ic = b.querySelector('ha-icon');
      return Object.assign(out, { text: String(b.textContent || '').trim(), link: b.getAttribute('data-casora-link'),
        bg: cs.backgroundColor, fg: getComputedStyle(span || b).color, icon: ic ? getComputedStyle(ic).color : null,
        h: Math.round(br.height), left: br.left, right: br.right, stL: st.left, stR: st.right, sL: sr.left, sR: sr.right,
        clipped: span ? span.scrollWidth > span.clientWidth + 1 : false, x: br.left + br.width / 2, y: br.top + br.height / 2 });
    });
    if (r && r.stage) break;
  }
  await need(label + ': Bühne gezeichnet', r && r.stage, r);
  await page.waitForTimeout(700);
  if (DIR) {
    fs.mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: path.join(DIR, `${TAG}-${width}-${dark ? 'dunkel' : 'hell'}.png`) });
  }
  return { page, r };
}

// Desktop 1440, light: button, colours, link, a click opens the shopping list.
{
  const { page, r } = await popupIn({ width: 1440, height: 900, mobile: false, dark: false, label: 'Desktop hell' });
  await check('Desktop: Knopf „Cookidoo-App öffnen“ auf der Bühne', r.text === 'Cookidoo-App öffnen', r);
  if (r.text) {
    await check('Desktop: Cookidoo-Grün (rgb(0, 129, 52))', /^rgb\(0, 129, 52\)$/.test(r.bg), r.bg);
    await check('Desktop: weiße Schrift und weißes Symbol', /^rgb\(255, 255, 255\)$/.test(r.fg) && /^rgb\(255, 255, 255\)$/.test(r.icon || ''), r);
    await check('Desktop: Kontrast Schrift ≥ 4,5 : 1', ratio(r.bg, r.fg) >= 4.5, ratio(r.bg, r.fg).toFixed(2));
    await check('Desktop: Trefferfläche ≥ 44 hoch', r.h >= 44, r.h);
    await check('Desktop: Link = Cookidoo-Einkaufsliste des Rezept-Markts', r.link === 'https://cookidoo.de/shopping/de-DE', r.link);
    const tg = await page.evaluate(([w, ua]) => ua.map((u) => window._casoraRecipe.ckTarget(w, u[0], u[1])), [r.link, [[IOS, false], [AND, true], [AND, false], [MAC, false]]]);
    await check('iOS: Universal Link (https) im neuen Fenster', tg[0].url === r.link && tg[0].how === 'open', tg[0]);
    await check('Android in der HA-App: app://com.vorwerk.cookidoo', tg[1].url === 'app://com.vorwerk.cookidoo' && tg[1].how === 'assign', tg[1]);
    await check('Android im Browser: intent: mit Paket und Rückfall-Seite', /^intent:\/\/cookidoo\.de\/shopping\/de-DE#Intent;scheme=https;package=com\.vorwerk\.cookidoo;S\.browser_fallback_url=https%3A%2F%2Fcookidoo\.de%2Fshopping%2Fde-DE;end$/.test(tg[2].url), tg[2]);
    await check('Computer: Seite im neuen Tab', tg[3].url === r.link && tg[3].how === 'open', tg[3]);
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(500);
    const opened = await page.evaluate(() => window.__qaOpened);
    await check('Desktop: Klick öffnet die Cookidoo-Seite in neuem Tab', opened.length === 1 && opened[0] === r.link, opened);
  }
  await page.context().browser().close();
}

// Dark: same green, still readable.
{
  const { page, r } = await popupIn({ width: 1440, height: 900, mobile: false, dark: true, label: 'Desktop dunkel' });
  await check('Dunkel: Knopf da, Cookidoo-Grün, Kontrast ≥ 4,5 : 1', r.text === 'Cookidoo-App öffnen' && /^rgb\(0, 129, 52\)$/.test(r.bg) && ratio(r.bg, r.fg) >= 4.5, r);
  await page.context().browser().close();
}

// Phone 393 (WebKit, iPhone): no overflow, a tap hands the Universal Link to the system.
for (const dark of [false, true]) {
  const { page, r } = await popupIn({ width: 393, height: 852, mobile: true, dark, label: 'Handy ' + (dark ? 'dunkel' : 'hell') });
  const w = 'Handy ' + (dark ? 'dunkel' : 'hell');
  await check(w + ': Knopf „Cookidoo-App öffnen“', r.text === 'Cookidoo-App öffnen', r);
  await check(w + ': Popup ohne waagrechten Überlauf', r.scrollW <= r.clientW + 1 && r.surfaceW <= r.vw, r);
  if (r.text) {
    await check(w + ': Knopf innerhalb der Bühne und des Bildschirms', r.left >= r.stL - 1 && r.right <= r.stR + 1 && r.right <= r.vw, r);
    await check(w + ': Wort nicht abgeschnitten', !r.clipped, r);
    if (!dark) {
      await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); el && el.scrollIntoView && el.scrollIntoView({ block: 'center' }); }, [r.x, r.y]);
      await page.waitForTimeout(300);
      const pos = await page.evaluate(() => { const b = window.__pierce('.hrs-ck', window.casoraPopup.surface)[0]; const x = b.getBoundingClientRect(); return [x.left + x.width / 2, x.top + x.height / 2]; });
      await page.touchscreen.tap(pos[0], pos[1]);
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => window.__qaOpened);
      await check(w + ': Tippen gibt den Universal Link (https) weiter', opened.length >= 1 && opened[0] === 'https://cookidoo.de/shopping/de-DE', opened);
    }
  }
  await page.context().browser().close();
}
await finish();
