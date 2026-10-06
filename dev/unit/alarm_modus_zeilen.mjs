// dashfix (06.10.2026): Im Weich-Alarm-Popup lösten die Modus-Zeilen (Abwesend, Nacht …) den Fehler
// „alarm_control_panel/undefined … required key not provided“ aus: Die Zeilen tragen
// {domain, service, data:{entity_id}}, der Tipp-Handler las nur {e, s} vom Haupt-Knopf.
//   node dev/unit/alarm_modus_zeilen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/07-weich-spezial.js', import.meta.url), 'utf8');
const m = src.match(/  AL\.spec = function \(sp\) \{[\s\S]*?\n  \};\n/);
assert.ok(m, 'AL.spec fehlt');
const AL = {};
new Function('AL', m[0])(AL);
assert.deepEqual(AL.spec({ e: 'alarm_control_panel.a', s: 'alarm_disarm' }), { e: 'alarm_control_panel.a', s: 'alarm_disarm' }, 'Haupt-Knopf');
for (const svc of ['alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_arm_vacation', 'alarm_arm_custom_bypass']) {
  assert.deepEqual(AL.spec({ domain: 'alarm_control_panel', service: svc, data: { entity_id: 'alarm_control_panel.a' } }),
    { e: 'alarm_control_panel.a', s: svc }, 'Modus-Zeile ' + svc);
}
assert.deepEqual(AL.spec({ service: 'alarm_arm_away', target: { entity_id: ['alarm_control_panel.a'] } }), { e: 'alarm_control_panel.a', s: 'alarm_arm_away' });
assert.equal(AL.spec({ domain: 'alarm_control_panel' }), null, 'ohne Dienst kein Aufruf');
assert.equal(AL.spec(null), null);
// Der Handler nutzt die angeglichene Form (sonst wieder „undefined“).
assert.ok(/spec = AL\.spec\(spec\); if \(!spec\) return;[\s\S]{0,900}hass\.callService\('alarm_control_panel', spec\.s, data\)/.test(src), 'Handler ruft AL.spec vor callService');
console.log('ok alarm_modus_zeilen');
