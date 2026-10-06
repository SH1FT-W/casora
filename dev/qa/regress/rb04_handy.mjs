// @zustand: arbeit
// @parallel: ui
// Neues Studio (B) am Handy, Chromium und WebKit. Erwartet: Die Vorschau ist sichtbar (nicht die
// alte Liste), unten eine Leiste mit Räume, Inhalt, Kachel hinzufügen, Dashboard, Zuhause.
// Antippen einer Kachel öffnet ihren Editor als Blatt von unten, Abdunkelung und Schließen
// machen es zu; „Inhalt“ zeigt die Raumansicht im Blatt; „Zuhause“ öffnet Haus & Geräte.
// Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

for (const safari of [false, true]) {
  const tag = safari ? 'WebKit' : 'Chromium';
  const o = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, studio: 'b', safari });
  usePage(o.page);
  await studio(o.page, dash.url);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await H(() => window.__panel()._bClose());
  // Die Vorschau passt sich nach dem Schließen neu ein (Größe, Lage) – erst danach antippen.
  await o.page.waitForTimeout(2200);

  const s0 = await H(() => { const p = window.__panel(); const r = p.shadowRoot;
    const vis = (s) => { const e = r.querySelector(s); return !!(e && e.getClientRects().length); };
    const map = r.querySelector('.card.map');
    return { phone: p.classList.contains('phone'), map: vis('.card.map') && getComputedStyle(map).visibility !== 'hidden',
      bar: [...r.querySelectorAll('.bbar button')].filter((b) => b.getClientRects().length).map((b) => b.dataset.b),
      insp: vis('.inspector') }; });
  await check(tag + ': Vorschau sichtbar statt Liste', s0.phone && s0.map && !s0.insp, s0);
  await check(tag + ': untere Leiste vollständig', ['rooms', 'list', 'add', 'dash', 'home'].every((k) => s0.bar.includes(k)), s0.bar);

  // Kachel der Vorschau (Tablet- oder Mobil-Vorschau) in der Mitte antippen.
  const at = await H(() => { const p = window.__panel();
    const t = [...p.shadowRoot.querySelectorAll('.card.map [data-mk^="t:"]:not(.ghost)')]
      .find((x) => { const b = x.getBoundingClientRect(); return b.width > 20 && b.height > 20 && b.top > 0 && b.bottom < innerHeight - 90; });
    if (!t) return null; const b = t.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, t.dataset.mk]; });
  await need(tag + ': Kachel in der Vorschau', at);
  await o.page.touchscreen.tap(at[0], at[1]);
  await o.page.waitForTimeout(1300);
  const s1 = await H(() => { const p = window.__panel(); const i = p.shadowRoot.querySelector('.inspector'); const b = i.getBoundingClientRect();
    return { open: p.classList.contains('binsp'), sel: p._sel && p._sel.group, bottom: Math.round(b.bottom), h: innerHeight, top: Math.round(b.top),
      color: getComputedStyle(i.querySelector('.insphead h3, .insphead .detailbar h3') || i).color }; });
  await check(tag + ': Antippen öffnet den Editor als Blatt von unten', s1.open && s1.sel === 'tiles' && s1.bottom >= s1.h - 2 && s1.top > 60, { ...s1, tile: at[2] });
  await check(tag + ': Blatt-Titel in Textfarbe (nicht weiß)', !/255, 255, 255/.test(s1.color), s1.color);

  await o.page.locator('.bclose').tap();
  await o.page.waitForTimeout(900);
  await check(tag + ': Schließen macht das Blatt zu', !(await H(() => window.__panel().classList.contains('binsp'))));

  await o.page.locator('.bbar [data-b=list]').tap();
  await o.page.waitForTimeout(1200);
  const s2 = await H(() => { const p = window.__panel(); return { open: p.classList.contains('binsp'), stack: !p._sel }; });
  await check(tag + ': „Inhalt“ zeigt die Raumansicht im Blatt', s2.open && s2.stack, s2);
  // Abdunkelung oberhalb des Blatts antippen
  await o.page.mouse.click(196, 40);
  await o.page.waitForTimeout(900);
  await check(tag + ': Antippen der Abdunkelung schließt', !(await H(() => window.__panel().classList.contains('binsp'))));

  await o.page.locator('.bbar [data-b=home]').tap();
  await o.page.waitForTimeout(700);
  const opt = o.page.locator('.combo-opt', { hasText: /Haus & Geräte|Home & Devices/ }).first();
  await opt.tap();
  await o.page.waitForTimeout(2500);
  const s3 = await H(() => { const p = window.__panel(); return { page: !!p._csOpen, open: p.classList.contains('binsp') }; });
  await check(tag + ': Zuhause → Haus & Geräte öffnet die Einstellungsseite', s3.page && s3.open, s3);
  await o.browser.close();
}
await finish();
