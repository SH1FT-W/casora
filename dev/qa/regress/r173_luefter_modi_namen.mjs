// @zustand: arbeit
// @parallel: ui
// DP-20 (10.10.2026): Das Lüfter-Popup (casora_fan) zeigte die Modi roh („auto“, „sleep“), wenn die
// Integration keine Übersetzung liefert. Erwartet wie beim Luftreiniger: gängige Namen (Auto, Schlaf;
// englisch Auto, Sleep), keine Rohwerte, keine Konsolenfehler. Deutsch und Englisch.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
for (const lang of [null, 'en']) {
  const { page } = await open({ width: 1440, height: 900, theme: 'Casora', lang: lang || undefined });
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && /casora|button-card|TypeError/i.test(m.text())) errs.push(m.text()); });
  await dashboard(page, desk.url);
  const r = await page.evaluate(async () => {
    const ha = document.querySelector('home-assistant');
    const fid = Object.keys(ha.hass.states).find((k) => k.startsWith('fan.') && ['auto', 'sleep'].every((p) => (ha.hass.states[k].attributes.preset_modes || []).includes(p)));
    if (!fid) return null;
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 120 && x.width < 420 && x.height > 60 && x.top > 100; });
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: 'casora_fan', entity: fid });
    el.hass = ha.hass; old.parentNode.insertBefore(el, old);
    await new Promise((res) => setTimeout(res, 800));
    // Mit gewähltem Modus „sleep“ und eingeschaltet, nur im Browser.
    const st = ha.hass.states[fid];
    const fake = Object.assign({}, ha.hass.states, { [fid]: Object.assign({}, st, { state: 'on', attributes: Object.assign({}, st.attributes, { preset_mode: 'sleep' }) }) });
    el.hass = Object.assign({}, ha.hass, { states: fake });
    await new Promise((res) => setTimeout(res, 500));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && (ev.detail.config.icon_tap_action || ev.detail.config.tap_action);
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    for (let i = 0; i < 30 && !(window.casoraPopup && window.casoraPopup.surface && window.__pierce('.hui-sg', window.casoraPopup.surface).length); i++) await new Promise((res) => setTimeout(res, 200));
    await new Promise((res) => setTimeout(res, 800));
    const s = window.casoraPopup && window.casoraPopup.surface;
    const segs = s ? window.__pierce('.hui-sg', s).map((e) => e.textContent.replace(/\s+/g, ' ').trim()) : [];
    if (window.casoraPopup) window.casoraPopup.close();
    el.remove();
    return { fid, segs };
  });
  const tag = lang ? 'en' : 'de';
  await need(tag + ': Lüfter mit Modi auto + sleep', r && r.fid, r);
  await check(tag + ': Modi-Schalter vorhanden', r.segs.length >= 2, r.segs);
  await check(tag + ': keine Rohwerte auto/sleep', !r.segs.some((t) => /^(auto|sleep)$/.test(t)), r.segs);
  await check(tag + ': Schlaf-Modus benannt', r.segs.includes(lang ? 'Sleep' : 'Schlaf'), r.segs);
  await check(tag + ': Auto nicht „Car“', r.segs.includes('Auto') && !r.segs.includes('Car'), r.segs);
  await check(tag + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 2));
}
await finish();
