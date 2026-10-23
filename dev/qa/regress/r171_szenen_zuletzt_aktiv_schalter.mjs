// @zustand: arbeit
// @parallel: allein   (startet HA neu)
// @deckt: custom_components/casora/scripts/local/00-finder.js
// Issue #11 im echten HA (bisher nur Unit-Test): Eine Automation schaltet den Status-Schalter einer
// Szene (input_boolean, einziger Eintrag der Szene) statt der Szene selbst. scene.*.state bleibt
// Tage alt. Erwartet: Szenen-Badge und Szenen-Zeile (chipHtml) zeigen „vor N Min.“ ab dem letzten off → on
// des Schalters (Desktop Chromium + Handy WebKit), auch nach einem HA-Neustart (Verlauf statt
// last_changed, der beim Neustart springt). Braucht scene.* mit genau einem input_boolean (arbeit-Haus).
import { execFileSync } from 'node:child_process';
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

let c = await ws();
const states = await c.cmd({ type: 'get_states' });
// Der Schalter muss existieren (arbeit-Haus: nicht jede Szene hat ihren Schalter angelegt
// – sonst schaltet der Test ins Leere und nach dem Neustart fehlt der Schalter ganz). Am liebsten
// eine seit Tagen ruhende Szene; im Gate kann der Klick-Durchlauf sie vorher ausgelöst haben – dann
// reicht „älter als 2 Min.“ (lastActive muss trotzdem auf die Schaltzeit springen, ±15 s).
const withSwitch = (s, age) => s.entity_id.startsWith('scene.') && Array.isArray(s.attributes.entity_id)
  && s.attributes.entity_id.length === 1 && s.attributes.entity_id[0].startsWith('input_boolean.')
  && states.some((x) => x.entity_id === s.attributes.entity_id[0])
  && !(Date.now() - Date.parse(s.state) < age);
const scene = states.find((s) => withSwitch(s, 2 * 86400000)) || states.find((s) => withSwitch(s, 120000));
await need('Szene mit vorhandenem Status-Schalter, nicht gerade ausgelöst', scene);
const SW = scene.attributes.entity_id[0], SID = scene.entity_id;
const svc = (s) => c.cmd({ type: 'call_service', domain: 'input_boolean', service: s, service_data: { entity_id: SW } });
await svc('turn_off'); await new Promise((r) => setTimeout(r, 1500));
const T1 = Date.now();
await svc('turn_on'); await new Promise((r) => setTimeout(r, 2000));
await svc('turn_off');
// Recorder schreibt gesammelt (commit_interval): warten, bis der Wechsel off → on im Verlauf steht.
// Sonst merkt sich die Seite „kein Wechsel“ bis zum nächsten Schalten (lastOn fragt je Zustand einmal).
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const h = await c.cmd({ type: 'history/history_during_period', start_time: new Date(T1 - 60000).toISOString(),
    end_time: new Date().toISOString(), entity_ids: [SW], minimal_response: true, no_attributes: true }).catch(() => null);
  const l = (h && h[SW]) || [];
  if (l.some((x) => x.s === 'on') && i >= 2) break;
}
c.close();

const probe = async (tag) => {
  for (const vp of [{ name: 'Desktop', width: 1440, height: 900 }, { name: 'Handy', width: 393, height: 852, mobile: true, safari: true }]) {
    const { page } = await open({ width: vp.width, height: vp.height, mobile: !!vp.mobile, safari: !!vp.safari, theme: 'Casora' });
    usePage(page);
    await dashboard(page, vp.mobile ? (all.find((d) => d.mobile && d.url === desk.url + '-mobile') || desk).url : desk.url);
    await page.waitForFunction(() => window._casoraSC && window.casoraDevice && window.casoraDevice.lastOn, null, { timeout: 40000 }).catch(() => {});
    const r = await page.evaluate(async ({ SID }) => {
      const ha = document.querySelector('home-assistant');
      const mk = (cfg) => { const el = document.createElement('button-card'); el.setConfig(Object.assign({ type: 'custom:button-card' }, cfg));
        el.hass = ha.hass; document.body.appendChild(el); return el; };
      const one = mk({ template: 'casora_badge_scene', entity: SID });
      const deep = (n) => { let t = ''; for (const c of n.childNodes) t += c.nodeType === 3 ? c.data + ' ' : c.nodeType === 1 && c.tagName !== 'STYLE' ? deep(c) : '';
        if (n.shadowRoot) t += deep(n.shadowRoot); return t; };
      const txt = (el) => (el.shadowRoot ? deep(el.shadowRoot) : '').replace(/\s+/g, ' ').trim();
      let t = 0, a = '', b = '';
      // Der Szenen-Kern lädt erst mit der ersten Szenen-Karte (qa-arbeit-mobile hat auf „home“ keine):
      // die Prüf-Badge oben bringt ihn mit, darauf warten.
      for (let i = 0; i < 80 && !(window._casoraSC && window._casoraSC.lastActive); i++) await new Promise((res) => setTimeout(res, 250));
      // Verlauf wird einmal abgefragt; die Badges zeichnen bei der nächsten hass-Aktualisierung neu.
      for (let i = 0; i < 40; i++) {
        t = window._casoraSC.lastActive(SID, ha.hass.states) || 0;
        // Neues Zustandsobjekt der Szene: Mit identischen Zuständen zeichnet button-card nicht neu
        // (im echten HA übernimmt das triggers_update: all bei der nächsten Zustandsänderung).
        const st = Object.assign({}, ha.hass.states); st[SID] = Object.assign({}, st[SID]);
        one.hass = Object.assign({}, ha.hass, { states: st });
        await new Promise((res) => setTimeout(res, 250));
        a = txt(one); b = window._casoraSC.chipHtml ? window._casoraSC.chipHtml(SID, ha.hass.states, {}).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';
        if (t && /Min\.|gerade/.test(a) && /Min\.|gerade/.test(b)) break;
      }
      one.remove();
      return { t, a, b };
    }, { SID });
    await check(tag + ' ' + vp.name + ': lastActive = Einschaltzeit des Schalters (±15 s)', Math.abs(r.t - T1) < 15000, { t: r.t && new Date(r.t).toISOString(), T1: new Date(T1).toISOString() });
    await check(tag + ' ' + vp.name + ': Szenen-Badge „vor … Min.“', /Min\.|gerade/.test(r.a) && !/Tag/.test(r.a), r.a);
    await check(tag + ' ' + vp.name + ': Szenen-Zeile (Handy-Blatt) „vor … Min.“', /Min\.|gerade/.test(r.b) && !/Tag/.test(r.b), r.b);
  }
};

await probe('vor Neustart');
// HA-Neustart: last_changed des Schalters springt auf die Startzeit.
c = await ws();
// Ergebnis kommt beim Neustart nie an: nicht darauf warten.
c.cmd({ type: 'call_service', domain: 'homeassistant', service: 'restart', service_data: {} }).catch(() => {});
await new Promise((r) => setTimeout(r, 2000));
try { c.close(); } catch (e) { /* Verbindung schon weg */ }
await new Promise((r) => setTimeout(r, 8000));
execFileSync(process.execPath, [new URL('../bereit.mjs', import.meta.url).pathname, '--max', '180'], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 30000)); // Abstand zwischen Neustart und Schaltzeit
c = await ws();
const sw2 = (await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === SW);
c.close();
await check('nach Neustart: last_changed des Schalters ist neuer als die Schaltzeit', Date.parse(sw2.last_changed) > T1 + 20000, sw2.last_changed);
await probe('nach Neustart');
await finish();
