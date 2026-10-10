// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Gemeldet (Personas 10.10.2026, per-05): ⋯-Menü in englischer Oberfläche deutsch – „Aktualisieren“,
// „Dashboard bearbeiten“. Das Menü hängt an document.body, außerhalb der Seiten-Übersetzung.
// Erwartet (englisch): keine deutschen Einträge, „Edit dashboard“ steht drin.
// CASORA_LOCAL=1: casora_settings_button aus diesem Checkout nur im Browser unterschieben.
import fs from 'node:fs';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile && JSON.stringify(d.config).includes('casora_settings_button'));
await need('Casora-Dashboard mit ⋯-Knopf', dash);
const LOCAL_TPL = process.env.CASORA_LOCAL
  ? JSON.parse(fs.readFileSync(new URL('../../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'))
  : null;

const { page } = await open({ width: 1440, height: 900, lang: 'en' });
usePage(page);
await dashboard(page, dash.url);
if (LOCAL_TPL) {
  await page.evaluate((T) => {
    const pl = window.__pierce('ha-panel-lovelace')[0];
    const L = pl.lovelace;
    pl._setLovelaceConfig({ ...L.config, button_card_templates: { ...(L.config.button_card_templates || {}), casora_settings_button: T.casora_settings_button } }, L.rawConfig, L.mode);
  }, LOCAL_TPL);
  await page.waitForTimeout(2500);
}
const p = await page.evaluate(() => {
  const c = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_settings_button')
    && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top < 220);
  if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('⋯-Knopf sichtbar', p);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(1200);
const texts = await page.evaluate(() => {
  const m = document.querySelector('.casora-settings-menu');
  return m ? [...m.querySelectorAll('span')].map((s) => s.textContent.trim()).filter(Boolean) : null;
});
await need('⋯-Menü offen', texts && texts.length, texts);
await check('keine deutschen Einträge (' + texts.join(', ') + ')', !texts.some((t) => /Aktualisieren|bearbeiten/.test(t)), texts);
await check('„Edit dashboard“ im Menü', texts.includes('Edit dashboard'), texts);
await finish();
