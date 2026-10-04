// Casora-KI: Knöpfe im Dashboard rufen casora.* (ohne eigene Skripte), Optionen-Dialog öffnet, Sensoren vorhanden.
import { open, ready } from './harness.mjs';
const { browser, page, errors } = await open();
await ready(page, '/dashboard-hemma/home', () => !!window.casoraSvc, 60000); // Adresse des Test-Dashboards
const r = await page.evaluate(async () => {
  const h = document.querySelector('home-assistant').hass;
  const svc = ['casora_energie_coach', 'casora_heizungs_coach', 'casora_lueftungs_coach', 'casora_rezept_neu', 'casora_kamera_beschreiben', 'casora_pflanzen_doktor', 'casora_update_ki_pruefen']
    .map((s) => { const x = window.casoraSvc(s); return s + ' → ' + x.domain + '.' + x.service; });
  const sensoren = ['casora_energie_coach', 'casora_heizungs_coach', 'casora_lueftungs_coach', 'casora_rezept_der_woche', 'casora_kamera_ki', 'casora_pflanzen_ki', 'casora_update_ki_analyse']
    .map((s) => s + ': ' + (h.states['sensor.' + s] ? 'da' : 'FEHLT'));
  const entries = await h.callWS({ type: 'config_entries/get', domain: 'casora' });
  const flow = await h.callApi('POST', 'config/config_entries/options/flow', { handler: entries[0].entry_id });
  await h.callApi('DELETE', 'config/config_entries/options/flow/' + flow.flow_id).catch(() => {});
  return { svc, sensoren, optionen: flow.type + ' · Felder: ' + (flow.data_schema || []).map((f) => f.name).join(', ') };
});
console.log('KI:', JSON.stringify(r, null, 1));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
