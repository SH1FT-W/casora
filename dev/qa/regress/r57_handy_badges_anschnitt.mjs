// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026): Die Badge-Reihe am Handy lässt sich wischen. Endete ein Badge genau am
// Bildschirmrand (z. B. iPhone mit 430 px), sah man nicht, dass weitere folgen.
// Erwartet im Casora-Look (hell): Ist die Reihe breiter als der Bildschirm, ragt in Ruhestellung ein
// Badge deutlich über den rechten Rand – mindestens 18 px davon sichtbar und 18 px verdeckt –
// bei 375, 390, 393 und 430 px.
import { open, casoraDashboards, dashboard, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const phone = all.find((d) => d.mobile && JSON.stringify(d.config).includes('casora_mobile_filter_badges'));
await need('Handy-Dashboard mit Badge-Reihe', phone);

for (const w of [375, 390, 393, 430]) {
  const { page } = await open({ width: w, height: 900, mobile: true, scale: 2, dark: false, theme: 'Casora' });
  await dashboard(page, phone.url, 3);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const soft = !!(window._casoraSoft && window._casoraSoft(true));
    const row = window.__pierce('#badges').find((x) => x.getBoundingClientRect().width > 0);
    if (!row) return { soft, row: false };
    const edge = row.getBoundingClientRect().left + row.clientLeft + row.clientWidth;
    const bs = window.__pierce('button-card', row).map((b) => b.getBoundingClientRect()).filter((q) => q.width > 0)
      .sort((a, b) => a.left - b.left).map((q) => ({ l: Math.round(q.left), r: Math.round(q.right) }));
    const over = bs.length && bs[bs.length - 1].r > edge + 1;
    const cut = bs.find((q) => edge - q.l >= 18 && q.r - edge >= 18);
    return { soft, row: true, over, cut: !!cut, edge: Math.round(edge), bs };
  });
  await check(w + ' px: Casora-Look aktiv', r.soft, r);
  if (!r.row || !r.over) { await check(w + ' px: Reihe passt ganz (nichts angeschnitten nötig)', r.row, r); continue; }
  await check(w + ' px: ein Badge ragt sichtbar über den Rand', r.cut, r);
}
await finish();
