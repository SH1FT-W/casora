// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js#casoraFitTitle dashboards/casora/button_card_templates.json#casora_mobile_weather
// #197: on the phone's Home the time-of-day greeting ("Goedemiddag", 32 px) ran into the weather text on the right
// ("Gedeeltelijk bewolkt") at 390 px. The title kept a fixed 145 px for the weather, a long weather text is wider.
// Expected (Studio hint): a long greeting gets smaller and stays on one line, and it never touches the weather.
import { open, usePage, studio, casoraDashboard, dashboard, fakeStates, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('dashboard with a phone twin', d && d.phone, d && d.url);
const SHOT = process.env.CASORA_SHOT_DIR;
const c = await ws();
const [desk0, phone0] = [await c.cmd({ type: 'lovelace/config', url_path: d.url }), await c.cmd({ type: 'lovelace/config', url_path: d.phone.url })];
c.close();
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: d.url, config: desk0 }); await c2.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone0 }); c2.close(); });
const wx = (JSON.stringify(phone0).match(/"weather_entity":"(weather\.[^"]+)"/) || [])[1];
await need('phone header with a weather entity', wx, null);

{
  const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  usePage(page);
  await studio(page, d.url);
  const ok = await page.evaluate(async () => {
    const p = window.__panel(), V = p._state.compact.rooms[0].variables;
    V.casora_greeting = 'time';
    delete V.casora_greeting_next;
    return p._save();
  });
  await need('greeting saved', ok);
  await page.waitForTimeout(1000);
}

// Greeting span and weather field in the phone header (button-card shadow DOM).
const measure = (pg) => pg.evaluate(() => {
  const head = window.__pierce('button-card').find((b) => b.shadowRoot && b.shadowRoot.querySelector('#weather') && b.shadowRoot.querySelector('#name span[data-no-i18n]'));
  if (!head) return null;
  const R = head.shadowRoot, sp = R.querySelector('#name span[data-no-i18n]'), w = R.querySelector('#weather');
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  // Visible weather text: the right edge of the greeting must stay left of every text in the weather card.
  const wc = w.querySelector('button-card');
  const parts = wc && wc.shadowRoot ? ['#name', '#label'].map((s) => wc.shadowRoot.querySelector(s)).filter((e) => e && e.getBoundingClientRect().width > 0) : [];
  const fs = parseFloat(getComputedStyle(sp).fontSize);
  return { text: sp.textContent, g: box(sp), weather: box(w), texts: parts.map((e) => ({ ...box(e), text: e.textContent.trim() })), fs, cut: sp.scrollWidth > sp.clientWidth + 1 && getComputedStyle(sp).textOverflow === 'ellipsis', lines: Math.round(sp.getBoundingClientRect().height / (fs * 1.2)) };
});

const LANGS = (process.env.R827_LANGS || 'nl,de,fr,es,pl,it,en').split(',');
const ROUNDS = [[360, LANGS], [390, ['nl']], [393, LANGS]];
const HOURS = [15, 20];
const CONDS = ['partlycloudy', 'lightning-rainy', 'exceptional'];
// The greeting follows the clock only on a new render, so each hour gets its own page load.
const GREET = { de: ['Guten Tag', 'Guten Abend'], nl: ['Goedemiddag', 'Goedenavond'], fr: ['Bonjour', 'Bonsoir'], es: ['Buenas tardes', 'Buenas noches'],
  pl: ['Dzień dobry', 'Dobry wieczór'], it: ['Buon pomeriggio', 'Buonasera'], en: ['Good afternoon', 'Good evening'] };
for (const [width, langs] of ROUNDS) {
  for (const lang of langs) {
    for (const [hi, h] of HOURS.entries()) {
      const { page: pp, context, browser } = await open({ width, height: 844, mobile: true, scale: 2, dark: false, theme: 'Casora', lang });
      usePage(pp);
      const t = new Date(); t.setHours(h, 30, 0, 0);
      await context.clock.setFixedTime(t);
      await dashboard(pp, d.phone.url + '/' + (d.phone.config.views[0].path || '0'), 3);
      const want = GREET[lang][hi];
      // Wait for the translated greeting (casora-i18n loads after the first render).
      await pp.waitForFunction((w) => (window.__pierce('span[data-no-i18n]') || []).some((e) => e.textContent === w), want, { timeout: 30000 }).catch(() => {});
      await pp.waitForTimeout(800);
      for (const cond of CONDS) {
        await fakeStates(pp, { [wx]: { state: cond, attributes: { temperature: -10 } } });
        // Wait for the fit (ResizeObserver / setTimeout) instead of a fixed time; a real overlap never clears.
        let m = null;
        for (let i = 0; i < 20; i++) {
          await pp.waitForTimeout(150);
          m = await measure(pp);
          if (m && m.texts.length && m.texts.every((x) => x.l >= m.g.r + 4)) break;
        }
        const tag = `${width} ${lang} ${h}h ${cond}`;
        if (!m) { await check(`${tag}: greeting and weather in the phone header`, false); continue; }
        await check(`${tag}: greeting is "${want}"`, m.text === want, m.text);
        const left = Math.min(...m.texts.map((x) => x.l));
        await check(`${tag}: "${m.text}" ends before the weather text (${m.texts.map((x) => x.text).join(' / ')})`, m.g.r + 4 <= left,
          { greetingRight: Math.round(m.g.r), weatherLeft: Math.round(left), fs: m.fs });
        await check(`${tag}: greeting on one line`, m.lines <= 1, m);
        await check(`${tag}: greeting shown in full, not cut`, !m.cut, m);
        if (SHOT && cond === CONDS[0]) { await pp.waitForTimeout(600); await pp.screenshot({ path: `${SHOT}/${lang}-${width}-${h}.png`, clip: { x: 0, y: 0, width, height: 200 } }); }
      }
      await browser.close();
    }
  }
}
await finish();
