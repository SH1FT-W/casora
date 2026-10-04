// Kamera-Privatsphäre ist raus (03.10.2026): Kachel, Kamera-/Sicherheits-Badges und Raum werten
// keinen Privatsphäre-Schalter mehr aus. Eine ausgeschaltete Kamera ist „Aus“, eine nicht
// erreichbare „Offline“ – für jede Kamera-Integration gleich. Alte toggle_entity-Werte stören nicht.
//   node dev/unit/kamera_ohne_privatsphaere.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const body = (s) => String(s).replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (src, ctx) => new Function('entity', 'states', 'variables', 'hass', body(src))(ctx.entity, ctx.states, ctx.variables, ctx.hass);

globalThis.window = { casoraIconUrl: (n) => 'icon:' + n, casoraStateFit: (t) => t };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.document = { documentElement: {} };

for (const f of ['../../dashboards/casora/button_card_templates.json', '../../custom_components/casora/panel/casora-templates.json']) {
  const raw = JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
  const T = raw.templates || raw;
  for (const name of ['casora_camera', 'casora_badge_camera_group', 'casora_badge_security_group', 'casora_room']) {
    const j = JSON.stringify(T[name]);
    assert.ok(!/privacy|Privatsph/i.test(j), `${f}: ${name} ohne Privatsphäre`);
  }
  const cam = T.casora_camera;
  assert.ok(!JSON.stringify(cam).includes('toggle_entity'), f + ': Kamera-Kachel kennt keinen toggle_entity mehr');
  assert.equal(cam.variables.show_toggle, false, f + ': kein Schalter auf der Kamera-Kachel');

  // Alter Privatsphäre-Schalter „an“ wird ignoriert: die Kamera selbst entscheidet.
  const states = { 'switch.alt_schalter': { state: 'on' } };
  const variables = { toggle_entity: 'switch.alt_schalter' };
  const mk = (state, pic = '/api/camera_proxy/camera.test?token=x') => ({ entity_id: 'camera.test', state, attributes: pic ? { entity_picture: pic } : {} });
  assert.equal(run(cam.state_display, { entity: mk('idle'), states, variables }), 'Live', f + ': idle = Live');
  assert.equal(run(cam.state_display, { entity: mk('off'), states, variables }), 'Aus', f + ': off = Aus');
  assert.equal(run(cam.state_display, { entity: mk('unavailable'), states, variables }), 'Offline', f + ': unavailable = Offline');
  assert.equal(run(cam.entity_picture, { entity: mk('off'), states, variables }), 'icon:camera', f + ': aus → Kamerasymbol');
  assert.equal(run(cam.entity_picture, { entity: mk('idle'), states, variables }), null, f + ': an → Standbild');
  assert.equal(run(cam.state[0].value, { entity: mk('idle'), states, variables }), true, f + ': an = aktiv');
  assert.equal(run(cam.state[0].value, { entity: mk('off'), states, variables }), false, f + ': aus = inaktiv');

  // Kamera-Gruppe: eine nicht erreichbare Kamera ist offline, auch wenn früher ein Schalter „an“ war.
  const grp = T.casora_badge_camera_group;
  const gStates = { 'camera.a': { state: 'unavailable', attributes: {} }, 'switch.alt_schalter': { state: 'on' } };
  const gVars = { cameras: ['camera.a'], privacy_entities: ['switch.alt_schalter'] };
  const html = run(grp.name, { entity: null, states: gStates, variables: gVars, hass: { states: gStates } });
  assert.ok(html.includes('Offline'), f + ': Kamera-Gruppe zeigt Offline');
  assert.ok(String(run(grp.styles.card[1]['--casora-badge-icon-color'], { states: gStates, variables: gVars })).includes('alert'), f + ': Kamera-Gruppe warnt');
}
console.log('ok kamera_ohne_privatsphaere');
