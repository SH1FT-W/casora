// Network finder without a browser: casoraDevice.network(), netRate() and netFields() with mocked devices
// of several makers.  node dev/unit/network_finder.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();
const CD = window.casoraDevice;

function makeHass() {
  const hass = { entities: {}, devices: {}, states: {} };
  hass.dev = (id, name, manufacturer, model) => { hass.devices[id] = { id, name, manufacturer, model }; };
  hass.ent = (eid, device_id, platform, { key = null, dc, unit, state = 'x', name, attrs = {}, category = null } = {}) => {
    hass.entities[eid] = { entity_id: eid, device_id, platform, translation_key: key, entity_category: category };
    hass.states[eid] = { entity_id: eid, state,
      attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: name || eid, ...attrs } };
  };
  return hass;
}

// ── network(): devices, WLANs, latency ─────────────────────────────────────
{
  const h = makeHass();
  // FRITZ!Box (integration fritz): no client counter, but restart, uptime, update, Wi-Fi switches.
  h.dev('fb', 'FRITZ!Box 7590', 'AVM', 'FRITZ!Box 7590');
  h.ent('button.fritz_box_7590_reboot', 'fb', 'fritz', { key: 'reboot', dc: 'restart' });
  h.ent('sensor.fritz_box_7590_last_restart', 'fb', 'fritz', { key: 'device_uptime', dc: 'timestamp' });
  h.ent('sensor.fritz_box_7590_connection_uptime', 'fb', 'fritz', { key: 'connection_uptime', dc: 'timestamp' });
  h.ent('update.fritz_box_7590_fritz_os', 'fb', 'fritz', { dc: 'firmware', state: 'off' });
  h.ent('binary_sensor.fritz_box_7590_connection', 'fb', 'fritz', { key: 'is_connected', dc: 'connectivity', state: 'on' });
  h.ent('sensor.fritz_box_7590_cpu_temperature', 'fb', 'fritz', { key: 'cpu_temperature', dc: 'temperature', unit: '°C' });
  h.ent('switch.fritz_box_7590_wi_fi_heimnetz', 'fb', 'fritz', { name: 'FRITZ!Box 7590 Wi-Fi Heimnetz', state: 'on' });
  h.ent('switch.fritz_box_7590_wi_fi_gast', 'fb', 'fritz', { name: 'FRITZ!Box 7590 Wi-Fi Gast', state: 'off' });
  h.ent('switch.fritz_box_7590_port_forward_nas', 'fb', 'fritz', { name: 'Port forward NAS' });
  // A FRITZ!Box client with internet lock – no network device.
  h.dev('ph', 'Handy', 'AVM', null);
  h.ent('switch.handy_internet_access', 'ph', 'fritz', { key: 'internet_access' });
  // FRITZ!DECT plug (integration fritzbox) and a TP-Link Kasa plug with restart + update.
  h.dev('dect', 'Steckdose Küche', 'AVM', 'FRITZ!DECT 200');
  h.ent('switch.steckdose_kuche', 'dect', 'fritzbox', { state: 'on' });
  h.ent('sensor.steckdose_kuche_leistung', 'dect', 'fritzbox', { dc: 'power', unit: 'W' });
  h.dev('kasa', 'Plug', 'TP-Link', 'KP115');
  h.ent('button.plug_restart', 'kasa', 'tplink', { dc: 'restart' });
  h.ent('update.plug_firmware', 'kasa', 'tplink', { dc: 'firmware' });
  // Pulse watches the plug too – a plug stays no network device.
  h.ent('sensor.plug_pulse_status', 'kasa', 'pulse', { key: 'status', state: 'ok' });
  // TP-Link Omada access point.
  h.dev('eap', 'EAP650', 'TP-Link', 'EAP650');
  h.ent('sensor.eap650_connected_clients', 'eap', 'tplink_omada', { key: 'connected_clients', state: '12' });
  h.ent('sensor.eap650_cpu_usage', 'eap', 'tplink_omada', { key: 'cpu_usage', unit: '%', state: '4' });
  h.ent('sensor.eap650_memory_usage', 'eap', 'tplink_omada', { key: 'mem_usage', unit: '%', state: '40' });
  h.ent('update.eap650_firmware', 'eap', 'tplink_omada', { dc: 'firmware' });

  const n = CD.network(h);
  assert.deepEqual(n.devices.map((d) => d.label), ['FRITZ!Box 7590', 'EAP650']);
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
}

// ── #98: FRITZ!Portal over MQTT, a switch only Pulse watches, a Synology NAS ──
{
  const h = makeHass();
  h.dev('fp', 'FRITZ!Portal', 'FRITZ!Portal', 'FRITZ!Box');
  const fp = (eid, o) => h.ent(eid, 'fp', 'mqtt', o);
  fp('binary_sensor.fp_internetverbindung', { dc: 'connectivity', state: 'on', name: 'FRITZ!Portal Internetverbindung',
    attrs: { status: 'Connected', access_type: 'Glasfaser', provider: 'Example Telecom', external_ip: '203.0.113.7', external_ipv6: '' } });
  fp('binary_sensor.fp_firmware_update', { dc: 'update', state: 'off', name: 'FRITZ!Portal Firmware-Update' });
  fp('sensor.fp_anschlussart', { state: 'Glasfaser', name: 'FRITZ!Portal Anschlussart' });
  fp('sensor.fp_cpu_auslastung', { unit: '%', state: '4', name: 'FRITZ!Portal CPU-Auslastung' });
  fp('sensor.fp_ram_auslastung', { unit: '%', state: '58', name: 'FRITZ!Portal RAM-Auslastung' });
  fp('sensor.fp_cpu_temperatur', { dc: 'temperature', unit: '°C', state: '51', name: 'FRITZ!Portal CPU-Temperatur' });
  fp('sensor.fp_download_aktuell', { dc: 'data_rate', unit: 'MB/s', state: '0.4', name: 'FRITZ!Portal Download aktuell' });
  fp('sensor.fp_upload_aktuell', { dc: 'data_rate', unit: 'MB/s', state: '0.1', name: 'FRITZ!Portal Upload aktuell' });
  fp('sensor.fp_upload_heute', { dc: 'data_size', unit: 'MB', state: '800', name: 'FRITZ!Portal Upload Heute' });
  fp('sensor.fp_externe_ip', { state: '203.0.113.7', name: 'FRITZ!Portal Externe IP' });
  fp('sensor.fp_gerate_online', { state: '4', name: 'FRITZ!Portal Geräte online' });
  fp('switch.fp_wlan_gastzugang', { state: 'off', name: 'FRITZ!Portal WLAN Gastzugang (2,4 GHz)' });
  // Managed switch without an integration of its own: only Pulse's status sensor on it.
  h.dev('sw', 'Switch Keller', 'ZyXEL', 'XMG1915-10E');
  h.ent('sensor.switch_keller_pulse_status', 'sw', 'pulse', { key: 'status', state: 'ok' });
  h.ent('sensor.switch_keller_port_1', 'sw', 'snmp', { state: 'up' });
  // Synology NAS (synology_dsm) with Pulse: no network device (#98).
  h.dev('nas', 'NAS', 'Synology', 'DS920+');
  h.ent('sensor.nas_cpu_utilization_total', 'nas', 'synology_dsm', { key: 'cpu_total_load', unit: '%', state: '3' });
  h.ent('sensor.nas_memory_usage_real', 'nas', 'synology_dsm', { key: 'memory_real_usage', unit: '%', state: '20' });
  h.ent('sensor.nas_download_throughput', 'nas', 'synology_dsm', { key: 'network_down', dc: 'data_rate', unit: 'kB/s', state: '4500' });
  h.ent('sensor.nas_pulse_status', 'nas', 'pulse', { key: 'status', state: 'check' });

  const n = CD.network(h);
  assert.deepEqual(n.devices.map((d) => d.label).sort(), ['FRITZ!Portal', 'Switch Keller']);
  const portal = n.devices.find((d) => d.label === 'FRITZ!Portal');
  assert.equal(portal.state, 'binary_sensor.fp_internetverbindung');
  assert.equal(portal.cpu, 'sensor.fp_cpu_auslastung');
  assert.equal(portal.mem, 'sensor.fp_ram_auslastung', 'RAM from "ram_auslastung"');
  assert.equal(portal.update, 'binary_sensor.fp_firmware_update');
  assert.equal(portal.clients, 'sensor.fp_gerate_online');
  assert.deepEqual(n.wlans.map((w) => w.sw), ['switch.fp_wlan_gastzugang'], 'WLAN switch of a maker device with an internet connection');

  // The Pulse status is no device state: the switch is rated with Pulse's own word, not "Problem".
  const sw = n.devices.find((d) => d.label === 'Switch Keller');
  assert.equal(sw.state, undefined);
  assert.equal(sw.pulse, 'sensor.switch_keller_pulse_status');
  let r = CD.netRate(h.states, sw);
  assert.equal(r.word, 'Gut');
  assert.equal(r.tone, 'good');
  assert.equal(r.text, 'Pulse: Gut');
  assert.equal(r.entity, 'sensor.switch_keller_pulse_status');
  h.states['sensor.switch_keller_pulse_status'].state = 'check';
  r = CD.netRate(h.states, sw);
  assert.equal(r.word, 'Prüfen');
  assert.equal(r.tone, 'warn');
  h.states['sensor.switch_keller_pulse_status'].state = 'failed';
  assert.equal(CD.netRate(h.states, sw).tone, 'bad');

  // Own states.
  assert.equal(CD.netRate(h.states, portal).word, 'Online');
  h.states['binary_sensor.fp_firmware_update'].state = 'on';
  assert.equal(CD.netRate(h.states, portal).word, 'Update verfügbar');
  h.states['binary_sensor.fp_internetverbindung'].state = 'off';
  assert.equal(CD.netRate(h.states, portal).word, 'Offline');
  h.states['binary_sensor.fp_internetverbindung'].state = 'on';
  // UniFi device_state: a known trouble state is "Problem", a passing one is named.
  const uni = { state: 'sensor.ap_state' };
  h.states['sensor.ap_state'] = { state: 'heartbeat_missed', attributes: {} };
  assert.equal(CD.netRate(h.states, uni).word, 'Problem');
  h.states['sensor.ap_state'].state = 'upgrading';
  assert.equal(CD.netRate(h.states, uni).word, 'Update läuft');
  assert.equal(CD.netRate(h.states, uni).tone, 'warn');
  // "ok" as an own state (some integrations) is fine, not a problem.
  h.states['sensor.ap_state'].state = 'ok';
  assert.equal(CD.netRate(h.states, uni).word, 'Online');

  // netFields from the download sensor: upload twin, status, provider as attribute, access type, IPv4.
  const f = CD.netFields(h, 'sensor.fp_download_aktuell');
  assert.equal(f.upload, 'sensor.fp_upload_aktuell');
  assert.equal(f.status, 'binary_sensor.fp_internetverbindung');
  assert.equal(f.isp, 'binary_sensor.fp_internetverbindung');
  assert.equal(f.isp_attr, 'provider');
  assert.equal(f.wan_name, 'sensor.fp_anschlussart');
  assert.equal(f.wan_name_attr, undefined);
  assert.equal(f.ipv4, 'sensor.fp_externe_ip');
  assert.equal(f.ipv6, undefined, 'an empty IPv6 attribute is no value');
  assert.equal(CD.netValue(h.states, f.isp, f.isp_attr), 'Example Telecom');
  assert.equal(CD.netValue(h.states, f.ipv4, null), '203.0.113.7');
  assert.equal(CD.netValue(h.states, f.isp, 'missing'), null);
}

// ── netFields: FRITZ!Box (core fritz) by translation_key, UniFi gateway ping ──
{
  const h = makeHass();
  h.dev('fb', 'FRITZ!Box 6690', 'AVM', 'FRITZ!Box 6690 Cable');
  h.ent('sensor.fb_download_throughput', 'fb', 'fritz', { key: 'kb_s_received', dc: 'data_rate', unit: 'kB/s', state: '10' });
  h.ent('sensor.fb_upload_throughput', 'fb', 'fritz', { key: 'kb_s_sent', dc: 'data_rate', unit: 'kB/s', state: '2' });
  h.ent('sensor.fb_max_connection_upload_throughput', 'fb', 'fritz', { key: 'max_kb_s_sent', dc: 'data_rate', unit: 'kB/s', state: '50000' });
  h.ent('binary_sensor.fb_wireguard_peer', 'fb', 'fritz', { dc: 'connectivity', state: 'off', name: 'WireGuard Peer' });
  h.ent('binary_sensor.fb_connection', 'fb', 'fritz', { key: 'is_connected', dc: 'connectivity', state: 'on' });
  h.ent('sensor.fb_external_ip', 'fb', 'fritz', { key: 'external_ip', state: '198.51.100.2' });
  h.ent('sensor.fb_external_ipv6', 'fb', 'fritz', { key: 'external_ipv6', state: '2001:db8::1' });
  const f = CD.netFields(h, 'sensor.fb_download_throughput');
  assert.equal(f.upload, 'sensor.fb_upload_throughput');
  assert.equal(f.status, 'binary_sensor.fb_connection');
  assert.equal(f.ipv4, 'sensor.fb_external_ip');
  assert.equal(f.ipv6, 'sensor.fb_external_ipv6');
  assert.equal(f.isp, undefined);

  const u = makeHass();
  u.dev('gw', 'Dream Machine', 'Ubiquiti Networks', 'UDM-Pro');
  u.ent('sensor.gw_wan_rx', 'gw', 'unifi', { dc: 'data_rate', unit: 'Mbit/s', state: '20', name: 'Dream Machine WAN RX' });
  u.ent('sensor.gw_wan_tx', 'gw', 'unifi', { dc: 'data_rate', unit: 'Mbit/s', state: '3', name: 'Dream Machine WAN TX' });
  u.ent('sensor.gw_wan_latency', 'gw', 'unifi', { key: 'wan_latency', dc: 'duration', unit: 'ms', state: '9' });
  const g = CD.netFields(u, 'sensor.gw_wan_rx');
  assert.equal(g.upload, 'sensor.gw_wan_tx');
  assert.equal(g.ping, 'sensor.gw_wan_latency');
}

console.log('network_finder: ok');
