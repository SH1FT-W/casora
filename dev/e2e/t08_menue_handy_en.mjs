// Echte Bedienung: Menü „⋯“ → Geräte-Assistent; Studio am Handy; englische Oberfläche.
import { open, ready, shot } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';
const run = async (label, opts, lang) => {
  const { browser, context, page, errors } = await open(opts);
  if (lang) await context.addInitScript((l) => localStorage.setItem('selectedLanguage', JSON.stringify(l)), lang);
  await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
  await page.evaluate(async () => { const p = window.__panel(); p._setDash('test-neu'); p._remember('test-neu'); await p._load(); });
  await page.waitForTimeout(2500);
  const lng = await page.evaluate(() => window.__panel()._hass.language);
  // ⋯ öffnen und Menüeinträge lesen
  await page.evaluate(() => window.__pierce('#more')[0].click());
  await page.waitForTimeout(800);
  const items = await page.evaluate(() => window.__pierce('.combo-menu .combo-opt .lbl').map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
  console.log(`[${label}] Sprache ${lng} – Menü:`, items.join(' | '));
  await shot(page, `m8_${label}_menu`);
  const entry = items.find((t) => /Geräte-Assistent|Device assistant/.test(t));
  if (lang) check(`[${label}] Sprache ${lang}`, lng === lang, lng);
  if (!check(`[${label}] Menü hat den Geräte-Assistenten`, !!entry, items)) { await browser.close(); return; }
  await page.locator('.combo-menu .combo-opt', { hasText: entry }).first().click();
  await page.waitForTimeout(1500);
  const sheet = await page.evaluate(() => ({ title: window.__pierce('.flowin .ftitle')[0]?.textContent, lede: window.__pierce('.flowin .flede')[0]?.textContent?.slice(0, 80), ph: window.__pierce('.flowin input.fin')[0]?.placeholder, btn: window.__pierce('button').filter((b) => b.offsetParent && /Kachel|tile/i.test(b.textContent)).map((b) => b.textContent.trim()) }));
  console.log(`[${label}] Assistent:`, JSON.stringify(sheet));
  check(`[${label}] Assistent geöffnet`, !!sheet.title && !!sheet.ph, sheet);
  if (lang === 'en') check(`[${label}] Assistent englisch`, /Device/.test(sheet.title || ''), sheet.title);
  console.log('  📸', await shot(page, `m8_${label}_assist`));
  console.log(`[${label}] Browser-Fehler:`, errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 4));
  check(`[${label}] keine Browser-Fehler`, !echteFehler(errors).length, echteFehler(errors));
  await browser.close();
};
await run('desktop', {});
await run('handy', { width: 390, height: 844, mobile: true });
await run('englisch', {}, 'en');
ende();
