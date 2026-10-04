// Netzwerk-Finder ohne Browser: casoraDevice.network() mit nachgebauten Geräten
// verschiedener Hersteller.  node dev/unit/netzwerk_finder.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finden.js', import.meta.url), 'utf8'))();

const hass = { entities: {}, devices: {}, states: {} };
function dev(id, name, manufacturer, model) { hass.devices[id] = { id, name, manufacturer, model }; }
function ent(eid, device_id, platform, { key = null, dc, unit, state = 'x', name } = {}) {
  hass.entities[eid] = { entity_id: eid, device_id, platform, translation_key: key };
  hass.states[eid] = { entity_id: eid, state, attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: name || eid } };
}

// FRITZ!Box (Integration fritz): kein Client-Zähler, aber Neustart, Laufzeit, Update, WLAN-Schalter.
dev('fb', 'FRITZ!Box 7590', 'AVM', 'FRITZ!Box 7590');
ent('button.fritz_box_7590_reboot', 'fb', 'fritz', { key: 'reboot', dc: 'restart' });
ent('sensor.fritz_box_7590_last_restart', 'fb', 'fritz', { key: 'device_uptime', dc: 'timestamp' });
ent('sensor.fritz_box_7590_connection_uptime', 'fb', 'fritz', { key: 'connection_uptime', dc: 'timestamp' });
ent('update.fritz_box_7590_fritz_os', 'fb', 'fritz', { dc: 'firmware', state: 'off' });
ent('binary_sensor.fritz_box_7590_connection', 'fb', 'fritz', { key: 'is_connected', dc: 'connectivity', state: 'on' });
ent('sensor.fritz_box_7590_cpu_temperature', 'fb', 'fritz', { key: 'cpu_temperature', dc: 'temperature', unit: '°C' });
ent('switch.fritz_box_7590_wi_fi_heimnetz', 'fb', 'fritz', { name: 'FRITZ!Box 7590 Wi-Fi Heimnetz', state: 'on' });
ent('switch.fritz_box_7590_wi_fi_gast', 'fb', 'fritz', { name: 'FRITZ!Box 7590 Wi-Fi Gast', state: 'off' });
ent('switch.fritz_box_7590_port_forward_nas', 'fb', 'fritz', { name: 'Port forward NAS' });
// Client der FRITZ!Box mit Internetsperre – kein Netzwerkgerät.
dev('ph', 'Handy', 'AVM', null);
ent('switch.handy_internet_access', 'ph', 'fritz', { key: 'internet_access' });
// FRITZ!DECT-Steckdose (Integration fritzbox) und TP-Link-Kasa-Steckdose mit Neustart + Update.
dev('dect', 'Steckdose Küche', 'AVM', 'FRITZ!DECT 200');
ent('switch.steckdose_kuche', 'dect', 'fritzbox', { state: 'on' });
ent('sensor.steckdose_kuche_leistung', 'dect', 'fritzbox', { dc: 'power', unit: 'W' });
dev('kasa', 'Plug', 'TP-Link', 'KP115');
ent('button.plug_restart', 'kasa', 'tplink', { dc: 'restart' });
ent('update.plug_firmware', 'kasa', 'tplink', { dc: 'firmware' });
// TP-Link Omada Access Point.
dev('eap', 'EAP650', 'TP-Link', 'EAP650');
ent('sensor.eap650_connected_clients', 'eap', 'tplink_omada', { key: 'connected_clients', state: '12' });
ent('sensor.eap650_cpu_usage', 'eap', 'tplink_omada', { key: 'cpu_usage', unit: '%', state: '4' });
ent('sensor.eap650_memory_usage', 'eap', 'tplink_omada', { key: 'mem_usage', unit: '%', state: '40' });
ent('update.eap650_firmware', 'eap', 'tplink_omada', { dc: 'firmware' });

const n = window.casoraDevice.network(hass);
const labels = n.devices.map((d) => d.label);
assert.deepEqual(labels, ['FRITZ!Box 7590', 'EAP650']);
const fb = n.devices[0];
assert.equal(fb.icon, 'network');
assert.equal(fb.restart, 'button.fritz_box_7590_reboot');
assert.equal(fb.uptime, 'sensor.fritz_box_7590_last_restart');
assert.equal(fb.state, 'binary_sensor.fritz_box_7590_connection');
assert.equal(fb.temp, 'sensor.fritz_box_7590_cpu_temperature');
assert.equal(n.devices[1].icon, 'mesh');
assert.equal(n.devices[1].clients, 'sensor.eap650_connected_clients');
assert.deepEqual(n.wlans.map((w) => w.label), ['Wi-Fi Gast', 'Wi-Fi Heimnetz']);
assert.deepEqual(n.latency, []);
console.log('netzwerk_finder: ok', JSON.stringify(n.wlans));
