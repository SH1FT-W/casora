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

// ── #226: udr7 (UniFi Router Testhaus integration): SSIDs as switches on the router, APs and switches below it ──
// @deckt: 00-finder.js#network
function udr7House({ en = false } = {}) {
  const h = makeHass();
  const P = 'udr7';
  // Hub: values of the whole network plus the router's own device entities.
  h.dev('gw', 'Router Testhaus', 'Ubiquiti', 'UDR7');
  const gw = 'router_testhaus';
  h.ent(`binary_sensor.${gw}_internet`, 'gw', P, { key: 'internet', dc: 'connectivity', state: 'on' });
  h.ent(`binary_sensor.${gw}_${en ? 'wan_connected' : 'wan_verbunden'}`, 'gw', P, { key: 'wan_up', dc: 'connectivity', state: 'on' });
  h.ent(`binary_sensor.${gw}_online`, 'gw', P, { key: 'online', dc: 'connectivity', state: 'on' });
  h.ent(`sensor.${gw}_clients`, 'gw', P, { key: 'clients', state: '52' });
  h.ent(`sensor.${gw}_${en ? 'wifi_clients' : 'wlan_clients'}`, 'gw', P, { key: 'wlan_clients', state: '37' });
  h.ent(`sensor.${gw}_lan_clients`, 'gw', P, { key: 'lan_clients', state: '15' });
  h.ent(`sensor.${gw}_${en ? 'guests' : 'gaste'}`, 'gw', P, { key: 'guest_clients', state: '0' });
  h.ent(`sensor.${gw}_vpn_clients`, 'gw', P, { key: 'vpn_clients', state: '0' });
  h.ent(`sensor.${gw}_${en ? 'internet_latency' : 'internet_latenz'}`, 'gw', P, { key: 'internet_latency', dc: 'duration', unit: 'ms', state: '9',
    name: en ? 'Router Testhaus Internet latency' : 'Router Testhaus Internet-Latenz' });
  h.ent(`sensor.${gw}_${en ? 'last_internet_outage' : 'letzter_internetausfall'}`, 'gw', P, { key: 'internet_last_outage', dc: 'timestamp' });
  h.ent(`sensor.${gw}_${en ? 'last_speed_test' : 'letzter_speedtest'}`, 'gw', P, { key: 'speedtest_last', dc: 'timestamp' });
  h.ent(`sensor.${gw}_speedtest_ping`, 'gw', P, { key: 'speedtest_ping', dc: 'duration', unit: 'ms', state: '11' });
  h.ent(`sensor.${gw}_${en ? 'internet_availability' : 'internet_verfugbarkeit'}`, 'gw', P, { key: 'wan_availability', unit: '%', state: '100' });
  h.ent(`update.${gw}_unifi_network`, 'gw', P, { key: 'network_app', state: 'off' });
  h.ent(`switch.${gw}_${en ? 'wifi' : 'wlan'}_seestern`, 'gw', P, { key: 'wlan', state: 'on',
    name: `Router Testhaus ${en ? 'WiFi' : 'WLAN'} Seestern`, attrs: { ssid: 'Seestern', security: 'wpapsk', hidden: false, guest: false } });
  h.ent(`switch.${gw}_${en ? 'wifi' : 'wlan'}_seestern_iot`, 'gw', P, { key: 'wlan', state: 'on',
    name: `Router Testhaus ${en ? 'WiFi' : 'WLAN'} Seestern_IoT`, attrs: { ssid: 'Seestern_IoT', security: 'wpapsk', hidden: false, guest: false } });
  // Rule switches sit on the router too; their names may say "Gast"/"WLAN" without being a Wi-Fi network.
  h.ent(`switch.${gw}_firewall_gast_wlan_sperren`, 'gw', P, { key: 'firewall_policy', state: 'on', name: 'Router Testhaus Firewall Gast-WLAN sperren' });
  h.ent(`switch.${gw}_upnp`, 'gw', P, { key: 'upnp', state: 'off' });
  // Per device (router, access point, switch): online, restart, started, firmware; CPU/RAM/clients where the device has them.
  const perDevice = (id, slug, { load = true, radios = false, poe = false } = {}) => {
    if (id !== 'gw') h.ent(`binary_sensor.${slug}_online`, id, P, { key: 'online', dc: 'connectivity', state: 'on' });
    h.ent(`button.${slug}_${en ? 'restart' : 'neu_starten'}`, id, P, { key: 'restart', dc: 'restart' });
    h.ent(`sensor.${slug}_${en ? 'started' : 'gestartet'}`, id, P, { key: 'started', dc: 'timestamp' });
    h.ent(`update.${slug}_firmware`, id, P, { key: 'firmware', dc: 'firmware', state: 'off' });
    h.ent(`switch.${slug}_${en ? 'locate' : 'gerat_suchen'}`, id, P, { key: 'locate', state: 'off' });
    h.ent(`sensor.${slug}_port_1_${en ? 'link_speed' : 'verbindung'}`, id, P, { key: 'port_link_speed', dc: 'data_rate', unit: 'Mbit/s', state: '1000' });
    if (load) {
      h.ent(`sensor.${slug}_${en ? 'cpu_load' : 'cpu_auslastung'}`, id, P, { key: 'cpu_load', unit: '%', state: '7' });
      h.ent(`sensor.${slug}_${en ? 'memory_usage' : 'arbeitsspeicher'}`, id, P, { key: 'memory_usage', unit: '%', state: '41' });
      h.ent(`sensor.${slug}_${en ? 'connected_clients' : 'verbundene_clients'}`, id, P, { key: 'connected_clients', state: '12' });
    }
    if (radios) {
      h.ent(`sensor.${slug}_2_4_ghz_clients`, id, P, { key: 'radio_clients', state: '5' });
      h.ent(`sensor.${slug}_5_ghz_clients`, id, P, { key: 'radio_clients', state: '7' });
      h.ent(`sensor.${slug}_2_4_ghz_${en ? 'channel_utilization' : 'kanalauslastung'}`, id, P, { key: 'radio_utilization', unit: '%', state: '20' });
    }
    if (poe) {
      h.ent(`button.${slug}_port_4_${en ? 'power_cycle' : 'poe_neu_starten'}`, id, P, { key: 'port_power_cycle', dc: 'restart' });
      h.ent(`switch.${slug}_port_4_poe`, id, P, { key: 'port_poe', dc: 'outlet', state: 'on' });
    }
  };
  perDevice('gw', gw, { radios: true, poe: true });
  h.ent(`sensor.${gw}_${en ? 'cpu_temperature' : 'cpu_temperatur'}`, 'gw', P, { key: 'cpu_temperature', dc: 'temperature', unit: '°C', state: '55' });
  h.dev('ap', 'AP Flur', 'Ubiquiti', 'U7LITE');
  perDevice('ap', 'ap_flur', { radios: true });
  h.dev('s1', 'Switch Keller', 'Ubiquiti', 'USMINI');
  perDevice('s1', 'switch_keller', { load: false });
  h.dev('s2', 'Switch Buero', 'Ubiquiti', 'USMINI');
  perDevice('s2', 'switch_buero', { load: false });
  ['ap', 's1', 's2'].forEach((id) => { h.devices[id].via_device_id = 'gw'; });
  // A tracked client: a device of its own (by MAC), no network device.
  h.dev('cl', 'Tablet Flur', null, null);
  h.devices.cl.via_device_id = 'gw';
  h.ent('device_tracker.tablet_flur', 'cl', P, { key: 'client', state: 'home' });
  h.ent(`button.tablet_flur_${en ? 'reconnect' : 'neu_verbinden'}`, 'cl', P, { key: 'client_reconnect' });
  h.ent(`sensor.tablet_flur_${en ? 'connected_since' : 'verbunden_seit'}`, 'cl', P, { key: 'client_connected_since', dc: 'timestamp' });
  h.ent(`switch.tablet_flur_${en ? 'internet_access' : 'internetzugang'}`, 'cl', P, { key: 'client_allowed', state: 'on' });
  return h;
}
for (const en of [false, true]) {
  const h = udr7House({ en });
  const n = CD.network(h);
  // WLAN: one row per SSID, named after the SSID; the router's Wi-Fi total is not one SSID's count.
  assert.deepEqual(n.wlans.map((w) => w.label), ['Seestern', 'Seestern_IoT'], 'rows named after the SSIDs');
  assert.deepEqual(n.wlans.map((w) => w.clients), [null, null], 'no per-SSID counter: no count instead of the total twice');
  assert.equal(n.wlans.every((w) => w.total === (en ? 'sensor.router_testhaus_wifi_clients' : 'sensor.router_testhaus_wlan_clients')), true);
  assert.equal(n.wlans.some((w) => /firewall/.test(w.sw)), false, 'a firewall rule named "Gast-WLAN" is no Wi-Fi network');
  // Devices: router, access point, switches, each once.
  assert.deepEqual(n.devices.map((d) => d.label), ['Router Testhaus', 'AP Flur', 'Switch Buero', 'Switch Keller']);
  assert.deepEqual(n.devices.map((d) => d.icon), ['network', 'mesh', 'access_point', 'access_point']);
  const [router, ap, sw] = n.devices;
  const de = (a, b) => (en ? b : a);
  assert.equal(router.state, 'binary_sensor.router_testhaus_online', 'the router\'s own online sensor, not the internet one');
  assert.equal(router.clients, de('sensor.router_testhaus_verbundene_clients', 'sensor.router_testhaus_connected_clients'));
  assert.equal(router.restart, de('button.router_testhaus_neu_starten', 'button.router_testhaus_restart'), 'never the PoE power cycle button');
  assert.equal(router.uptime, de('sensor.router_testhaus_gestartet', 'sensor.router_testhaus_started'));
  assert.equal(router.update, 'update.router_testhaus_firmware');
  assert.equal(router.temp, de('sensor.router_testhaus_cpu_temperatur', 'sensor.router_testhaus_cpu_temperature'));
  assert.equal(ap.clients, de('sensor.ap_flur_verbundene_clients', 'sensor.ap_flur_connected_clients'), 'not one radio\'s clients');
  assert.equal(ap.cpu, de('sensor.ap_flur_cpu_auslastung', 'sensor.ap_flur_cpu_load'));
  assert.equal(sw.state, 'binary_sensor.switch_buero_online');
  assert.equal(sw.uptime, de('sensor.switch_buero_gestartet', 'sensor.switch_buero_started'));
  assert.equal(sw.clients, undefined);
  assert.deepEqual(n.latency, [[de('sensor.router_testhaus_internet_latenz', 'sensor.router_testhaus_internet_latency'), 'Internet']]);

  // Renamed devices keep their place: the kind comes from the entities, not from the name.
  h.devices.ap.name_by_user = 'Diele';
  h.devices.s1.name_by_user = 'Abstellraum';
  h.devices.gw.name_by_user = 'Zentrale';
  const r = CD.network(h);
  assert.deepEqual(r.devices.map((d) => d.label + ':' + d.icon), ['Zentrale:network', 'Diele:mesh', 'Abstellraum:access_point', 'Switch Buero:access_point']);
  ['ap', 's1', 'gw'].forEach((id) => { delete h.devices[id].name_by_user; });
  // SSID renamed in UniFi: the row follows the switch's ssid attribute.
  const sid = de('switch.router_testhaus_wlan_seestern', 'switch.router_testhaus_wifi_seestern');
  h.states[sid].attributes.ssid = 'Qualle';
  assert.deepEqual(CD.network(h).wlans.map((w) => w.label), ['Qualle', 'Seestern_IoT']);
  // Without the attribute the name of the switch gives the SSID (device name and the leading "WLAN" removed).
  delete h.states[sid].attributes.ssid;
  assert.deepEqual(CD.network(h).wlans.map((w) => w.label), ['Seestern', 'Seestern_IoT']);
  // Only one SSID left: the router's Wi-Fi total is that SSID's count.
  h.states[sid].attributes.ssid = 'Seestern';
  const iot = sid + '_iot';
  delete h.states[iot]; delete h.entities[iot];
  const one = CD.network(h).wlans;
  assert.deepEqual(one.map((w) => [w.label, w.clients]), [['Seestern', de('sensor.router_testhaus_wlan_clients', 'sensor.router_testhaus_wifi_clients')]]);
}

// ── #226: the popup with SSIDs sharing one counter: rows "Aktiv", the head line counts the Wi-Fi total once ──
// @deckt: 05-weich-mehr.js#_casoraSoftNet
{
  document.addEventListener = () => {};
  new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8'))();
  window._casoraUI = {
    line: (text, parts) => [text].concat(parts || []).join(' · '),
    row: { toggle: (o) => o },
    group: (rows, label) => label + ': ' + rows.map((r) => r.label + '|' + r.sub).join(' ; '),
  };
  const h = udr7House();
  const C = { wlans: CD.network(h).wlans };
  const N = window._casoraSoftNet;
  assert.equal(N.sec('wl', C, h.states, h), 'WLAN: Seestern|Aktiv ; Seestern_IoT|Aktiv');
  assert.equal(N.sec('line', C, h.states, h), '2 WLANs an · 37 Geräte');
  h.states['switch.router_testhaus_wlan_seestern_iot'].state = 'off';
  assert.equal(N.sec('wl', C, h.states, h), 'WLAN: Seestern|Aktiv ; Seestern_IoT|Ausgeschaltet');
  assert.equal(N.sec('line', C, h.states, h), '1 WLAN an · 37 Geräte');
  // Own counters per WLAN (core unifi, fixed dashboard variables) still add up.
  const S = { 'switch.a': { state: 'on', attributes: {} }, 'switch.b': { state: 'on', attributes: {} },
    'sensor.a': { state: '21', attributes: {} }, 'sensor.b': { state: '3', attributes: {} } };
  const own = { wlans: [{ sw: 'switch.a', clients: 'sensor.a', label: 'A' }, { sw: 'switch.b', clients: 'sensor.b', label: 'B' }] };
  assert.equal(N.sec('line', own, S, h), '2 WLANs an · 24 Geräte');
  assert.equal(N.sec('wl', own, S, h), 'WLAN: A|21 Clients ; B|3 Clients');
  delete window._casoraUI;
}

// ── #226: HA core unifi stays as it is: every WLAN a device of its own with its own client counter ──
// @deckt: 00-finder.js#network
{
  const h = makeHass();
  h.dev('udm', 'Dream Machine', 'Ubiquiti Networks', 'UDM-Pro');
  h.ent('sensor.dream_machine_state', 'udm', 'unifi', { key: 'device_state', state: 'connected' });
  h.ent('sensor.dream_machine_clients', 'udm', 'unifi', { key: 'device_clients', state: '9' });
  h.ent('sensor.dream_machine_cpu_utilization', 'udm', 'unifi', { key: 'device_cpu_utilization', unit: '%', state: '5' });
  h.ent('sensor.dream_machine_uptime', 'udm', 'unifi', { key: 'device_uptime', dc: 'timestamp' });
  h.ent('button.dream_machine_restart', 'udm', 'unifi', { dc: 'restart' });
  h.ent('button.dream_machine_port_2_power_cycle', 'udm', 'unifi', { dc: 'restart' });
  h.ent('update.dream_machine', 'udm', 'unifi', { dc: 'firmware', state: 'off' });
  for (const [id, name, n] of [['w1', 'Koralle', '21'], ['w2', 'Koralle Gast', '3']]) {
    const slug = name.toLowerCase().replace(' ', '_');
    h.dev(id, name, 'Ubiquiti Networks', 'UniFi WLAN');
    h.ent(`switch.${slug}`, id, 'unifi', { key: 'wlan_control', state: 'on', name });
    h.ent(`sensor.${slug}`, id, 'unifi', { key: 'wlan_clients', state: n, name });
    h.ent(`button.${slug}_regenerate_password`, id, 'unifi', { key: 'wlan_regenerate_password' });
  }
  const n = CD.network(h);
  assert.deepEqual(n.devices.map((d) => d.label), ['Dream Machine'], 'a WLAN device is no network device');
  assert.equal(n.devices[0].restart, 'button.dream_machine_restart');
  assert.deepEqual(n.wlans.map((w) => [w.label, w.sw, w.clients]),
    [['Koralle', 'switch.koralle', 'sensor.koralle'], ['Koralle Gast', 'switch.koralle_gast', 'sensor.koralle_gast']]);
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
