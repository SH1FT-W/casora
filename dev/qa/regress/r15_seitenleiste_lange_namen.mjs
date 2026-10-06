// @zustand: stress
// Gemeldet (QA-Rundgang, Stresshaus): In der Studio-Seitenleiste wurden lange Raumnamen
// („Wohnzimmer mit Galerie und Leseecke“, „Schlafzimmer Dachgeschoss“) hart abgeschnitten,
// der Inhalt ragte über den Rand der Leiste. Erwartet: einzeilig mit „…“, voller Name als
// title, die Seitenleiste läuft nicht quer über.
import { open, casoraDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).some((v) => String(v.title || '').length >= 24));
await need('Casora-Dashboard mit langen Raumnamen', dash);
// Die Seitenleiste mit der Raumliste gibt es nur im bisherigen Studio (A); das neue (B) ist Standard.
const { page } = await open({ width: 1440, height: 900, studio: 'a' });
await studio(page, dash.url);

const r = await page.evaluate(() => {
  const p = window.__panel();
  const nav = p.shadowRoot.getElementById('sidelist');
  if (!nav || !nav.getBoundingClientRect().width) return null;
  const labels = [...nav.querySelectorAll('.tab .tablabel')].map((l) => {
    const cs = getComputedStyle(l);
    const tab = l.closest('.tab').getBoundingClientRect();
    return { text: l.textContent, title: l.title, over: l.scrollWidth > l.clientWidth + 1,
      ellipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap',
      inside: tab.right <= nav.getBoundingClientRect().right + 1 };
  });
  return { sw: nav.scrollWidth, cw: nav.clientWidth, labels };
});
await need('Studio-Seitenleiste sichtbar', r);
await need('lange Raumnamen in der Seitenleiste', r.labels.some((l) => l.text.length >= 24), r.labels.map((l) => l.text));
const long = r.labels.filter((l) => l.over);
await check(`Seitenleiste läuft nicht quer über (${r.sw}px in ${r.cw}px)`, r.sw <= r.cw + 1);
await check('lange Namen einzeilig mit „…“', long.length > 0 && long.every((l) => l.ellipsis), long.filter((l) => !l.ellipsis).map((l) => l.text));
await check('voller Name als title', r.labels.every((l) => l.title === l.text), r.labels.filter((l) => l.title !== l.text).map((l) => l.text));
await check('alle Zeilen innerhalb der Seitenleiste', r.labels.every((l) => l.inside), r.labels.filter((l) => !l.inside).map((l) => l.text));
await finish();
