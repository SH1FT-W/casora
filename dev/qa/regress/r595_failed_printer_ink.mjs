// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/theme_weich.yaml,dashboards/casora/button_card_templates.json#casora_3d_printer,custom_components/casora/scripts/casora-core.js#_paintSoft,ringFor
// User test 07.11.2026, dark design: a failed 3D printer wrote „Fehlgeschlagen“ in the light red for dark rows
// (#F08A7E) on the light sand plate of the active tile – 1,8 : 1. Its popup then drew the switches that are on
// (camera, power) in the error red as well, so „on“ looked like an error. Expected: the state text keeps ≥ 4,5 : 1
// on the active plate (light and dark), and the popup accent (switches) stays the device colour while the head
// ring and the stage show the error.
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates, stable, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile && JSON.stringify(d.config).includes('casora_3d_printer'));
await need('ein Casora-Dashboard mit 3D-Drucker', dash);

for (const dark of [false, true]) {
  const mode = dark ? 'dunkel' : 'hell';
  const { page } = await open({ width: 1440, height: 900, dark });
  usePage(page);
  let hit = null;
  for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
    await dashboard(page, dash.url + '/' + v, 3);
    hit = await page.evaluate(() => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_3d_printer')
        && x.getBoundingClientRect().width > 40);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      return { id: b._config.entity };
    });
    if (hit) break;
  }
  await need(`Druckerkachel (${mode})`, hit && hit.id);
  await fakeStates(page, { [hit.id]: { state: 'failed' } }, { sticky: true });

  // Contrast of the state line against the tile plate (composited over the page background).
  const tile = await stable(page, () => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_3d_printer')
      && x.getBoundingClientRect().width > 40);
    const st = b && b.shadowRoot && b.shadowRoot.querySelector('#state');
    const card = b && b.shadowRoot && b.shadowRoot.querySelector('ha-card');
    if (!st || !card) return null;
    // color-mix() (the designs' tile tone) computes to color(srgb r g b / a) with channels 0..1.
    const rgba = (s) => { const c = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/.exec(s || '');
      if (c) return [c[1] * 255, c[2] * 255, c[3] * 255, c[4] == null ? 1 : +c[4]];
      const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
    const over = (f, b2) => [0, 1, 2].map((i) => f[i] * f[3] + b2[i] * (1 - f[3]));
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const page0 = rgba(getComputedStyle(document.documentElement).getPropertyValue('--primary-background-color').trim()
      || getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
    // Active tiles lay their light plate as ha-card::after (overlay tint × overlay opacity) over the card.
    const af = getComputedStyle(card, '::after'), tint = rgba(af.backgroundColor) || [0, 0, 0, 0];
    tint[3] *= Number(af.opacity) || 0;
    const plate = over(tint, over(rgba(getComputedStyle(card).backgroundColor) || [0, 0, 0, 0], page0));
    const ink = over(rgba(getComputedStyle(st).color), plate);
    const a = L(ink), c = L(plate);
    return { text: st.innerText.trim(), color: getComputedStyle(st).color, plate: plate.map(Math.round),
      ratio: Math.round(((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)) * 100) / 100 };
  }, null, { max: 8000 });
  await need(`Zustandszeile der Kachel (${mode})`, tile && /Fehlgeschlagen|Failed/i.test(tile.text), tile);
  await check(`„Fehlgeschlagen“ auf der aktiven Kachel ≥ 4,5 : 1 (${mode})`, tile.ratio >= 4.5, tile);

  // Popup: switches in the device colour, not in the error red; the head ring keeps the error.
  await page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_3d_printer')
      && x.getBoundingClientRect().width > 40);
    b.shadowRoot.querySelector('ha-card').click();
  });
  const pop = await stable(page, () => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    if (!p) return null;
    const probe = document.createElement('span');
    p.shadowRoot.appendChild(probe);
    const colOf = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
    const out = { accent: colOf('var(--casora-popup-accent)'), red: colOf('var(--casora-color-red)'),
      ring: colOf(p.style.getPropertyValue('--casora-popup-accent') ? 'var(--casora-popup-accent)' : 'transparent') };
    const hr = p.shadowRoot.querySelector('[style*="--ring"]');
    out.ringHue = hr ? colOf(hr.style.getPropertyValue('--ring')) : null;
    probe.remove();
    return out;
  }, null, { max: 8000 });
  await need(`Drucker-Popup offen (${mode})`, pop && pop.accent, pop);
  await check(`Kopf-Ring zeigt den Fehler in Rot (${mode})`, pop.ringHue === pop.red, pop);
  await check(`Popup-Akzent (Schalter) bleibt Gerätefarbe, nicht Fehler-Rot (${mode})`, pop.accent !== pop.red, pop);
  await page.keyboard.press('Escape');
}
await finish();
