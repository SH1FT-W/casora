// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/41-display-diag.js
// Wanted (issue #123, 04.11.2026): display bugs come from devices the Studio diagnosis never sees (9.7" Android tablet
// 1280×800 in Fully Kiosk: badge row too low, second row over the tiles, badge texts in different sizes). A display
// diagnosis opens on the affected device inside the dashboard: ?casora_diag in the address, or five quick taps on the
// page title. Expected (tablet 1280×800 with touch, iPhone 393×852): the sheet opens with a painted plain-text block whose
// lines carry the English keys (viewport, text zoom, layout, measured heights, overlap …), the viewport line matches
// the window, nothing private is in it (no entity ids), "Kopieren" copies exactly that text, "Schließen" closes the
// sheet, and five quick taps on the title open it again (four do not).
import { open, casoraDashboard, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard with a phone layout', dash && dash.phone);

const KEYS = ['casora_display_diagnosis', 'casora', 'home_assistant', 'language', 'dashboard', 'layout_rules', 'hero_fit',
  'viewport', 'visual_viewport', 'screen', 'device_pixel_ratio', 'orientation', 'pointer', 'text_zoom', 'root_font',
  'text_size_adjust', 'reduced_motion', 'color_scheme', 'theme', 'ha_header', 'safe_area', 'app', 'user_agent',
  'height_head', 'height_badges', 'height_sub_badges', 'height_tiles', 'gap_badges_tiles', 'overlap'];

// The sheet (<casora-display-diag> on <body>): open, its text, whether the text is painted on top, its buttons.
const sheet = (page) => page.evaluate(() => {
  const el = document.querySelector('casora-display-diag');
  const pre = el && el.shadowRoot && el.shadowRoot.querySelector('pre');
  if (!pre) return { open: false };
  const btn = (k) => { const b = el.shadowRoot.querySelector('[data-casora-diag="' + k + '"]'); if (!b) return null;
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, inView: r.bottom <= innerHeight, text: b.textContent }; };
  const r = pre.getBoundingClientRect();
  // Painted: visible by CSS and the topmost element at the text's first line (nothing over it, not held invisible).
  const cx = r.x + Math.min(r.width / 2, 80), cy = r.y + 20;
  const top = document.elementFromPoint(cx, cy) === el && el.shadowRoot.elementFromPoint(cx, cy) === pre;
  const shown = !pre.checkVisibility || pre.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  return { open: true, text: pre.textContent, preW: r.width, painted: top && shown, copy: btn('copy'), close: btn('close') };
});
const waitOpen = (page, ms = 25000) => page.waitForFunction(() => {
  const el = document.querySelector('casora-display-diag');
  return !!(el && el.shadowRoot && el.shadowRoot.querySelector('pre'));
}, null, { timeout: ms }).then(() => true, () => false);
const waitClosed = (page) => page.waitForFunction(() => !document.querySelector('casora-display-diag'),
  null, { timeout: 5000 }).then(() => true, () => false);
const tap = async (page, mobile, x, y) => { if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };

// The page title (room card #name / #n, phone head #name), its middle in the window.
const titleAt = (page) => page.evaluate(() => {
  for (const b of window.__pierce('button-card')) {
    const t = [].concat((b._config || {}).template || []).join(' ');
    if (!/casora_room|casora_mobile_weather/.test(t) || !b.shadowRoot) continue;
    for (const id of ['name', 'n']) {
      const e = b.shadowRoot.getElementById(id);
      const r = e && e.getBoundingClientRect();
      if (r && r.width > 20 && r.height > 10 && r.top >= 0 && r.bottom <= innerHeight) {
        const hit = e.ownerDocument.elementFromPoint(r.x + Math.min(r.width / 2, 60), r.y + r.height / 2);
        return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2, hit: !!hit };
      }
    }
  }
  return null;
});

const TABLET_UA = 'Mozilla/5.0 (Linux; Android 11; Tablet; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Safari/537.36';
for (const [tag, opts, url] of [
  ['tablet 1280×800', { width: 1280, height: 800, touch: true, userAgent: TABLET_UA, scale: 1.5 }, dash.url],
  ['phone 393×852', { width: 393, height: 852, mobile: true, scale: 3 }, dash.phone.url],
]) {
  const o = await open(opts);
  const { page, context } = o;
  usePage(page);
  const mobile = !!opts.mobile;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await dashboard(page, url + '?casora_diag', 3);
  const opened = await waitOpen(page);
  if (!(await check(`${tag}: ?casora_diag opens the display diagnosis`, opened))) continue;
  await page.waitForTimeout(800);
  const s = await sheet(page);
  console.log(s.text.split('\n').map((l) => '    | ' + l).join('\n'));
  await shot(tag.startsWith('tablet') ? 'tablet_sheet' : 'phone_sheet');
  // A first version inside casora-popup kept its content held invisible (layout and taps worked, nothing painted).
  await check(`${tag}: the text is painted on top, buttons in view`, s.painted && s.copy.inView && s.close.inView, s);
  const lines = s.text.split('\n');
  const keys = lines.map((l) => l.split(':')[0]);
  const missing = KEYS.filter((k) => !keys.includes(k));
  await check(`${tag}: every line "key: value", all keys there`, !missing.length && lines.every((l) => /^[a-z_]+: /.test(l)), missing);
  await check(`${tag}: viewport line = the window`, lines.includes(`viewport: ${opts.width}x${opts.height}`), lines.find((l) => l.startsWith('viewport')));
  await check(`${tag}: dashboard kind`, new RegExp('^dashboard: ' + (mobile ? 'phone' : 'desktop')).test(lines.find((l) => l.startsWith('dashboard:')) || ''),
    lines.find((l) => l.startsWith('dashboard:')));
  await check(`${tag}: text zoom measured (1.00 in the test browser)`, /^text_zoom: 1\.00 /.test(lines.find((l) => l.startsWith('text_zoom')) || ''));
  await check(`${tag}: badge row and first tile row measured`,
    /^height_badges: \d+px$/.test(lines.find((l) => l.startsWith('height_badges')) || '')
    && /^height_tiles: \d+px/.test(lines.find((l) => l.startsWith('height_tiles')) || ''), lines.filter((l) => l.startsWith('height')));
  await check(`${tag}: nothing private (no entity ids, no hosts)`,
    !/\b(sensor|light|switch|binary_sensor|person|media_player|climate|cover)\.[a-z0-9_]/.test(s.text) && !/localhost|https?:/.test(s.text), s.text);
  await check(`${tag}: text block fits the sheet`, s.preW > 200 && s.preW <= opts.width, s.preW);

  // Kopieren: the clipboard holds exactly the text.
  await tap(page, mobile, s.copy.x, s.copy.y);
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  const copied = await page.evaluate(() => window._casoraDisplayDiag.copied);
  await check(`${tag}: "Kopieren" copies the text`, clip === s.text || (clip === null && copied === true), { copied, same: clip === s.text });

  // Schließen closes.
  const s2 = await sheet(page);
  await tap(page, mobile, s2.close.x, s2.close.y);
  await check(`${tag}: "Schließen" closes the sheet`, await waitClosed(page));
  await page.waitForTimeout(800);

  // Gesture: four quick taps do nothing, five open it.
  const t = await titleAt(page);
  if (!(await check(`${tag}: page title on screen`, t, t))) continue;
  for (let i = 0; i < 4; i++) { await tap(page, mobile, t.x, t.y); await page.waitForTimeout(150); }
  await page.waitForTimeout(900);
  await check(`${tag}: four taps on the title do not open it`, !(await sheet(page)).open);
  for (let i = 0; i < 5; i++) { await tap(page, mobile, t.x, t.y); await page.waitForTimeout(150); }
  await check(`${tag}: five quick taps on the title open it`, await waitOpen(page, 6000));
  const s3 = await sheet(page);
  await tap(page, mobile, s3.close.x, s3.close.y);
  await waitClosed(page);

  // Overlap is named: the first tiles pushed up into the badge row (as in #123) → "overlap: badges_over_tiles N px".
  if (mobile) continue;
  const moved = await page.evaluate(() => {
    const row = window.__pierce('casora-smart-row').find((r) => r._scrollMode === false && r.getBoundingClientRect().height > 0);
    const b = window.__pierce('#badges').find((e) => e.getBoundingClientRect().height > 0);
    const w = row && (row._wrappers || []).find((x) => x && x.getBoundingClientRect().height > 0);
    if (!row || !b || !w) return null;
    const dy = Math.round(w.getBoundingClientRect().top - b.getBoundingClientRect().top - 20);
    row.style.transform = 'translateY(-' + dy + 'px)';
    return dy;
  });
  await page.evaluate(() => window._casoraDisplayDiag.open());
  await waitOpen(page, 6000);
  const ov = ((await sheet(page)).text || '').split('\n').find((l) => l.startsWith('overlap:'));
  await check(`${tag}: tiles over the badge row are reported as overlap`, moved && /^overlap: badges_over_tiles \d+px$/.test(ov || ''), { moved, ov });
}
await finish();
