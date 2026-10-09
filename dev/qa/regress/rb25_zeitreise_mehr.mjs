// @zustand: arbeit
// @parallel: frei
// Gemeldet (1.2.1, Website-Bild „Zeitreise“): „+1 more“ unter „Damit gehen verloren“ stand riesig,
// umgebrochen und unterstrichen da – die Zeile hatte die Klasse cv-more und erbte den runden
// 40-px-„…“-Knopf der Liste (20 px Schrift). Und unten lag der Hinweis „Im Dashboard stehen aktive
// Kacheln vorn“ halb unter der Zeitreise-Seite am Bildschirmrand.
// Erwartet: „+N weitere“ in Listenschrift, eine Zeile, nicht unterstrichen; der Hinweis ist bei
// offener Seite nicht zu sehen oder liegt frei (nicht unter der Seite, im Bild).
// Desktop 1440 Chromium hell (Englisch), Handy 393 WebKit dunkel (Deutsch). Schreibt nichts.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);

for (const v of [
  { name: 'Desktop', width: 1440, height: 900, dark: false, lang: 'en', theme: 'Casora' },
  { name: 'Handy', width: 393, height: 852, dark: true, mobile: true, safari: true, theme: 'Casora' },
]) {
  const { page } = await open(v.lang ? { ...v, locale: 'en-US' } : v);
  usePage(page);
  await studio(page, dash);
  await page.evaluate(() => window.__panel()._cvFromMenu());
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => window.__pierce('.cv-row').filter((b) => b.getClientRects().length).length);
  await need(`[${v.name}] Zeitreise mit mindestens zwei Ständen`, rows >= 2, rows);
  // Ältesten Stand wählen (zeigt die Vorschau samt Banner, wie auf dem Website-Bild).
  await page.evaluate(() => { const r = window.__pierce('.cv-row').filter((b) => b.getClientRects().length).pop();
    r.scrollIntoView({ block: 'center' }); r.click(); });
  await page.waitForTimeout(2000);
  // Verlustliste mit mehr als fünf Zeilen sicherstellen: Hat der gewählte Stand keine, eine echte
  // Liste (_cvLossBox) mit acht Zeilen an derselben Stelle anhängen – es zählt das CSS des Studios.
  const m = await page.evaluate(() => {
    const p = window.__panel();
    let b = window.__pierce('.cv-morebtn').find((x) => x.getClientRects().length);
    if (!b) {
      const host = window.__pierce('.cv-act, .cv-wrap').find((x) => x.getClientRects().length);
      if (!host) return null;
      host.prepend(p._cvLossBox(Array.from({ length: 8 }, (_, i) => 'Line ' + (i + 1))));
      b = window.__pierce('.cv-morebtn').find((x) => x.getClientRects().length);
    }
    if (!b) return null;
    const li = b.parentElement, ref = li.previousElementSibling;
    const cs = getComputedStyle(b), lh = parseFloat(getComputedStyle(ref).lineHeight) || 20;
    return { text: b.textContent, fs: cs.fontSize, refFs: getComputedStyle(ref).fontSize, deco: cs.textDecorationLine,
      liH: li.getBoundingClientRect().height, lh, rects: b.getClientRects().length };
  });
  await need(`[${v.name}] „+N weitere“ vorhanden`, m);
  await check(`[${v.name}] „${m.text}“ in Listenschrift (${m.fs})`, m.fs === m.refFs, m);
  await check(`[${v.name}] „${m.text}“ eine Zeile`, m.rects === 1 && m.liH <= m.lh * 1.6, m);
  await check(`[${v.name}] „${m.text}“ nicht unterstrichen`, !/underline/.test(m.deco), m);

  const h = await page.evaluate(() => {
    const hint = window.__pierce('.maprowhint').find((x) => x.getClientRects().length);
    if (!hint || getComputedStyle(hint).visibility === 'hidden') return { shown: false };
    const r = hint.getBoundingClientRect();
    const insp = window.__pierce('.inspector').filter((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden')
      .map((x) => x.getBoundingClientRect());
    const hit = insp.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
    return { shown: true, hit, inView: r.top >= 0 && r.bottom <= innerHeight - 4, r: [r.x, r.y, r.width, r.height] };
  });
  await check(`[${v.name}] Hinweis „aktive Kacheln vorn“ überdeckt nichts`, !h.shown || (!h.hit && h.inView), h);
}
await finish();
