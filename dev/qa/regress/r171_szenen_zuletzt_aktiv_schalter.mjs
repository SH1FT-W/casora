// @zustand: arbeit
// @parallel: allein   (startet HA neu)
// @deckt: custom_components/casora/scripts/local/00-finden.js
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
const scene = states.find((s) => s.entity_id.startsWith('scene.') && Array.isArray(s.attributes.entity_id)
  && s.attributes.entity_id.length === 1 && s.attributes.entity_id[0].startsWith('input_boolean.')
  && Date.now() - Date.parse(s.state) > 2 * 86400000);
await need('Szene mit Status-Schalter, älter als 2 Tage', scene);
const SW = scene.attributes.entity_id[0], SID = scene.entity_id;
const svc = (s) => c.cmd({ type: 'call_service', domain: 'input_boolean', service: s, service_data: { entity_id: SW } });
await svc('turn_off'); await new Promise((r) => setTimeout(r, 1500));
const T1 = Date.now();
await svc('turn_on'); await new Promise((r) => setTimeout(r, 2000));
await svc('turn_off'); await new Promise((r) => setTimeout(r, 8000)); // Recorder schreibt gesammelt (commit_interval)
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
      // Verlauf wird einmal abgefragt; die Badges zeichnen bei der nächsten hass-Aktualisierung neu.
      for (let i = 0; i < 40; i++) {
        t = window._casoraSC.lastActive(SID, ha.hass.states) || 0;
        one.hass = Object.assign({}, ha.hass);
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
