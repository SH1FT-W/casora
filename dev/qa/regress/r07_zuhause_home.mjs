// @zustand: arbeit
// Gemeldet: Der Übersichtsraum hieß auf Deutsch „Home“. Erwartet: „Zuhause“ bei deutscher,
// „Home“ bei englischer Oberfläche – im Studio, in der Dashboard-Leiste und als Titel.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const view = dash.config.views[0].path || '0';

for (const [lang, want, other] of [['de', 'Zuhause', 'Home'], ['en', 'Home', 'Zuhause']]) {
  const o = lang === 'en' ? { lang: 'en', locale: 'en-US' } : {};
  const { page } = await open(o);
  usePage(page);
  await studio(page, dash.url);
  const st = await page.evaluate(() => {
    const p = window.__panel(), I = window.__casoraPanelInternals;
    const home = p._state.compact.rooms.find((r) => I.isHomeRoom(r));
    return { label: home ? p._roomLabel(home) : null,
      side: window.__pierce('.tablabel').map((x) => x.textContent.trim()).slice(0, 3) };
  });
  await check(`[${lang}] Studio: Übersichtsraum heißt „${want}“`, st.label === want, st);

  await dashboard(page, dash.url + '/' + view);
  const texts = await page.evaluate(() => {
    const out = [];
    window.__pierce('span, div').forEach((e) => {
      if (e.children.length || !e.offsetParent) return;
      const r = e.getBoundingClientRect();
      if (r.y >= 0 && r.y < 360 && r.width > 0) out.push(e.textContent.trim());
    });
    return out.filter(Boolean);
  });
  await check(`[${lang}] Dashboard: Leiste/Titel zeigen „${want}“`, texts.includes(want), texts.slice(0, 20));
  await check(`[${lang}] Dashboard: kein „${other}“ als Raumname`, !texts.includes(other), texts.slice(0, 20));
}
await finish();
