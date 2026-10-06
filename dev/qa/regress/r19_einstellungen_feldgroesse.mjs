// @zustand: arbeit
// @parallel: allein   (öffnet das Studio; parallele Tests, die Dashboards anlegen, laden es neu)
// Gemeldet: In Einstellungen → „Haus & Geräte“ waren Beschriftungen, Werte und Felder sichtbar
// größer als im Kachel-Editor (Beschriftung 17 statt 12,5 px, Eingabe 17 px/40 px hoch statt
// 14 px/38 px, Gruppen mit 20 statt 14 px Radius). Erwartet: dieselben Maße (±1 px).
import { open, studioDashboard, studio, studioRetry, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1600, height: 1000 });
await studio(page, dash);

const measure = () => {
  const q = (sel) => window.__pierce(sel).find((e) => e.offsetParent);
  const m = (e) => {
    if (!e) return null;
    const c = getComputedStyle(e);
    return { font: parseFloat(c.fontSize), h: e.getBoundingClientRect().height, radius: parseFloat(c.borderTopLeftRadius) };
  };
  return window.__panel()._csOpen
    ? { label: m(q('.cs-wrap .frow.casora-prow .rtext b')), input: m(q('.cs-wrap .casora-pctl .combo > input')),
      group: m(q('.cs-wrap .fgroup .flist')) }
    : { label: m(q('.inspector .row:has(> .combo) > label')), input: m(q('.inspector .row > .combo > input')),
      group: m(q('.inspector .tile, .inspector .card:not(.map)')) };
};

const { ed, st, opened } = await studioRetry(page, dash, async () => {
  // Kachel-Editor: erste Kachel des ersten Raums öffnen.
  const opened = await page.evaluate(() => {
    const t = window.__panel().$('pane').querySelector('[data-k^="tile-"]');
    if (t) (t.querySelector('.thead') || t).click();
    return !!t;
  });
  await page.waitForTimeout(1500);
  const ed = await page.evaluate(measure);

  await page.evaluate(() => window.__panel()._csOpenPage('home'));
  await page.waitForTimeout(2000);
  const st = await page.evaluate(measure);
  return { ed, st, opened };
});
await need('eine Kachel zum Öffnen', opened);
await need('Kachel-Editor mit Feld', ed.label && ed.input && ed.group, ed);
await need('Haus & Geräte mit Feld', st.label && st.input && st.group, st);

const near = (a, b) => Math.abs(a - b) <= 1;
await check('Feldbeschriftung gleich groß wie im Kachel-Editor', near(st.label.font, ed.label.font), { editor: ed.label, einst: st.label });
await check('Eingabe: gleiche Schrift', near(st.input.font, ed.input.font), { editor: ed.input, einst: st.input });
await check('Eingabe: gleiche Höhe', near(st.input.h, ed.input.h), { editor: ed.input, einst: st.input });
await check('Gruppen: gleicher Radius', near(st.group.radius, ed.group.radius), { editor: ed.group, einst: st.group });
await finish();
