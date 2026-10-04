// @zustand: frisch
// Gemeldet: „Versionen“ wurde mit „Updates“ verwechselt. Die Seite heißt auf Deutsch
// „Zeitreise“, auf Englisch „Rewind“ – in der Seitenleiste und als Seitentitel.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
for (const [lang, want, not] of [['de', 'Zeitreise', /Versionen/], ['en', 'Rewind', /Versions/]]) {
  const { page } = await open(lang === 'en' ? { lang: 'en', locale: 'en-US' } : {});
  usePage(page);
  await studio(page, dash);
  const r = await page.evaluate(() => {
    const b = window.__pierce('.cv-side')[0];
    return { label: b ? b.textContent.replace(/\s+/g, ' ').trim() : null,
      side: window.__pierce('#sidesections .sidelabel').map((x) => x.textContent.trim()) };
  });
  await check(`[${lang}] Seitenleiste zeigt „${want}“`, r.label === want, r);
  await check(`[${lang}] kein „Versionen/Versions“ in der Seitenleiste`, !r.side.some((x) => not.test(x)), r.side);
  await page.evaluate(() => window.__pierce('.cv-side')[0]?.click());
  await page.waitForTimeout(2500);
  const title = await page.evaluate(() => window.__pierce('h3').filter((h) => h.offsetParent).map((h) => h.textContent.trim()));
  await check(`[${lang}] Seitentitel „${want}“`, title.includes(want), title);
}
await finish();
