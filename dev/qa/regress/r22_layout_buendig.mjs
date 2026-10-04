// @zustand: arbeit
// @parallel: allein   (öffnet das Studio; parallele Tests, die Dashboards anlegen, laden es neu)
// Gemeldet: In der Studio-Seitenleiste begannen „Design & Bedienung“ und „Benachrichtigungen“
// (Einträge mit grauer Unterzeile) 4 px weiter links als die übrigen und saßen nicht mittig zum
// Symbol. Das Gate prüfte nur Funktion und Lesbarkeit, nicht Bündigkeit.
// Erwartet in allen Studio-Listen (Seitenleiste, Raumliste, Einstellungs-Gruppen), hell und dunkel,
// Desktop und Handy: gleiche linke Textkante je Liste (±1 px), Text mittig zum Symbol (±2 px),
// jedes Symbol hat eine Grafik, kein Text ist ohne „…“ abgeschnitten.
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);

const audit = () => {
  const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const out = { edges: [], center: [], icons: [], clipped: [] };
  // Listen: Zeilen derselben Art im selben Elternelement.
  const lists = [
    ['Seitenleiste', '.sidelist .siderow:not(.sidesub)', '.sidelabel', '.sicon, .sideglyph'],
    ['Raumliste', '#rooms .tab', '.tablabel', '.roomglyph, .sicon'],
    ['Einstellungen', '.fgroup .frow', '.rtext > b, .rtext > span:first-child', '.rico, .sicon, .rmask'],
  ];
  lists.forEach(([name, rowSel, labSel, icSel]) => {
    const byParent = new Map();
    window.__pierce(rowSel).filter(vis).forEach((r) => {
      const k = r.parentElement; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(r);
    });
    byParent.forEach((rows) => {
      const xs = [];
      rows.forEach((r) => {
        const lab = r.querySelector(labSel);
        if (!vis(lab)) return;
        const lb = lab.getBoundingClientRect();
        const txt = lab.textContent.trim().slice(0, 30);
        const ic = r.querySelector(icSel);
        // Zeilen mit und ohne Symbol haben (wie in den iOS-Einstellungen) verschiedene Textkanten.
        xs.push([Math.round(lb.left), txt, !!vis(ic)]);
        if (vis(ic)) {
          const ib = ic.getBoundingClientRect();
          // Textblock: Beschriftung plus etwaige Unterzeile direkt dahinter.
          const sub = lab.nextElementSibling && vis(lab.nextElementSibling) ? lab.nextElementSibling.getBoundingClientRect() : null;
          const top = lb.top, bot = sub && sub.top >= lb.bottom - 2 ? sub.bottom : lb.bottom;
          const dy = (top + bot) / 2 - (ib.top + ib.bottom) / 2;
          if (Math.abs(dy) > 2) out.center.push(`${name}: „${txt}“ ${dy.toFixed(1)} px`);
          // Grafik vorhanden: Maske oder Bild am Symbol bzw. seinem ::after/::before.
          const has = [ic, ...ic.querySelectorAll('*')].some((e) => ['', '::after', '::before'].some((p) => {
            const c = getComputedStyle(e, p || null);
            return (c.maskImage && c.maskImage !== 'none') || (c.webkitMaskImage && c.webkitMaskImage !== 'none')
              || (c.backgroundImage && c.backgroundImage !== 'none') || e.tagName === 'svg' || e.tagName === 'IMG' || e.tagName === 'HA-ICON';
          }));
          if (!has || ib.width < 8) out.icons.push(`${name}: „${txt}“ ohne Grafik`);
        }
        const cs = getComputedStyle(lab);
        if (lab.scrollWidth > lab.clientWidth + 1 && cs.textOverflow !== 'ellipsis') out.clipped.push(`${name}: „${txt}“`);
      });
      [true, false].forEach((withIcon) => {
        const same = xs.filter((x) => x[2] === withIcon);
        if (same.length < 2) return;
        const ref = same[0][0];
        same.filter(([x]) => Math.abs(x - ref) > 1).forEach(([x, t]) => out.edges.push(`${name}: „${t}“ bei ${x} statt ${ref}`));
      });
    });
  });
  return out;
};

for (const [label, opts] of [
  ['Desktop dunkel', { width: 1440, height: 900, dark: true }],
  ['Desktop hell', { width: 1440, height: 900, dark: false }],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, dark: true }],
]) {
  const { page, browser } = await open(opts);
  await studio(page, dash);
  const pages = [['Raum', null]];
  if (!opts.mobile) pages.push(['Einstellungen Haus & Geräte', 'home'], ['Einstellungen KI', 'ai']);
  for (const [where, csPage] of pages) {
    if (csPage) { await page.evaluate((p) => window.__panel()._csOpenPage(p), csPage); await page.waitForTimeout(1800); }
    const a = await page.evaluate(audit);
    await check(`${label} · ${where}: gleiche Textkante`, !a.edges.length, a.edges.slice(0, 6));
    await check(`${label} · ${where}: Text mittig zum Symbol`, !a.center.length, a.center.slice(0, 6));
    await check(`${label} · ${where}: alle Symbole mit Grafik`, !a.icons.length, a.icons.slice(0, 6));
    await check(`${label} · ${where}: kein Text ohne „…“ abgeschnitten`, !a.clipped.length, a.clipped.slice(0, 6));
  }
  await browser.close();
}
await finish();
