#!/usr/bin/env node
// Test house extras for the popup gallery (casora-test, state "arbeit"), beyond what the mock registers by itself:
//   1. HA's energy settings like a house with a balcony solar system: grid meter, solar and battery of the made-up
//      Testsolarbank (dev/casora_mock/energie.py, with power sensors, charge level and price) and the aquarium plugs
//      (aquarium.tanks) as individual devices. The energy popup draws its flow and consumers from them; Casora's
//      solar tip (binary_sensor.casora_solar_tipp) computes the free power from them.
//   2. Pulse (battery/radio watchdog, own integration): when its files are in the test HA
//      (config/custom_components/pulse) and no entry exists yet, sets it up through its config flow (one click).
//      Pulse's discovery leaves out every mock device (the mock's config entry has media players, so Pulse takes its
//      devices for media accessories): the made-up aquarium devices are added by hand, as in Pulse's panel.
//
//   node dev/qa/testhaus-extras.mjs [--nur energie|pulse]
// Writes only these two settings. Run after dev/haus.sh sync; CASORA_URL as in ws.mjs.
import { tokens, ws } from './ws.mjs';

const argv = process.argv;
const only = argv.includes('--nur') ? argv[argv.indexOf('--nur') + 1] : null;
const c = await ws();
const S = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));

if (!only || only === 'energie') {
  const B = 'sensor.testsolarbank_', M = 'sensor.teststromzaehler_';
  const need = [B + 'solarleistung', B + 'akkuleistung', B + 'ladestand', M + 'leistung', M + 'gesamtbezug'];
  const miss = need.filter((x) => !S[x]);
  if (miss.length) console.log('Energie: Testsolarbank fehlt (Mock zu alt?): ' + miss.join(', '));
  else {
    const plugs = Object.keys(S).filter((x) => /^sensor\.test(riff|pflanzen|schildi)_[a-z_]+_energy$/.test(x)).sort();
    const device_consumption = plugs.map((x) => ({
      stat_consumption: x, name: S[x].attributes.friendly_name.replace(/ Energie$/, ''),
      ...(S[x.replace(/_energy$/, '_power')] ? { stat_rate: x.replace(/_energy$/, '_power') } : {}) }));
    const energy_sources = [
      { type: 'solar', stat_energy_from: 'sensor.testenergie_solarertrag_gesamt', config_entry_solar_forecast: null,
        stat_rate: B + 'solarleistung' },
      { type: 'battery', stat_energy_from: 'sensor.testenergie_akku_entladen', stat_energy_to: 'sensor.testenergie_akku_aufgeladen',
        stat_rate: B + 'akkuleistung', stat_soc: B + 'ladestand' },
      { type: 'grid', stat_energy_from: M + 'gesamtbezug', stat_energy_to: M + 'gesamteinspeisung', stat_cost: null,
        stat_compensation: null, entity_energy_price: null, number_energy_price: 0.36, entity_energy_price_export: null,
        number_energy_price_export: null, cost_adjustment_day: 0, stat_rate: M + 'leistung' },
    ];
    try {
      await c.cmd({ type: 'energy/save_prefs', energy_sources, device_consumption });
    } catch (e) {
      // Older HA without stat_rate/stat_soc on sources: the same without them.
      console.log('Energie: ' + e.message + ' – ohne Leistungssensoren');
      await c.cmd({ type: 'energy/save_prefs', device_consumption,
        energy_sources: energy_sources.map(({ stat_rate, stat_soc, ...s }) => s) });
    }
    console.log(`Energie: Netz, Solar, Akku (Testsolarbank) und ${device_consumption.length} Geräte eingetragen`);
  }
}

if (!only || only === 'pulse') {
  const entries = await c.cmd({ type: 'config_entries/get', domain: 'pulse' }).catch(() => []);
  if (entries.length) console.log('Pulse: schon eingerichtet (' + entries[0].state + ')');
  else {
    const flows = await c.cmd({ type: 'config_entries/flow/progress' }).catch(() => []);
    const { access_token } = await tokens();
    const base = process.env.CASORA_URL || 'http://localhost:8124';
    const post = (p, body) => fetch(base + p, { method: 'POST', headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }));
    const start = flows.find((f) => f.handler === 'pulse') ? { ok: true, json: flows.find((f) => f.handler === 'pulse') }
      : await post('/api/config/config_entries/flow', { handler: 'pulse', show_advanced_options: false });
    if (!start.ok) console.log('Pulse: nicht installiert (config/custom_components/pulse fehlt?) – ' + start.status + ' ' + JSON.stringify(start.json).slice(0, 160));
    else {
      const done = await post('/api/config/config_entries/flow/' + start.json.flow_id, {});
      console.log('Pulse: ' + (done.json.type === 'create_entry' ? 'eingerichtet' : JSON.stringify(done.json).slice(0, 200)));
    }
  }
  // Devices by hand: the aquarium devices of dev/casora_mock/aquarium.py (tanks()), the test plug and router.
  const cand = await c.cmd({ type: 'pulse/manual_candidates' }).then((r) => r.devices || [], () => null);
  if (cand) {
    const pick = cand.filter((d) => /^(Testriff|Testpflanzenbecken|Testschildkrötenbecken|Testdosierpumpe|Teststeckdose$|Testrouter$)/.test(d.name || ''));
    for (const d of pick) await c.cmd({ type: 'pulse/manual_device', device_id: d.id, add: true });
    console.log(`Pulse: ${pick.length} Testgeräte von Hand hinzugefügt`);
  }
}
c.close();
