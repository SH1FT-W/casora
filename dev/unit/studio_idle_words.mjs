// Studio's raw-state fallback uses the idle word in every shipped language.
import assert from 'node:assert/strict';
globalThis.window = globalThis;
await import(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url));
const words = { de: 'Inaktiv', en: 'Inactive', es: 'Inactivo', fr: 'Inactif', it: 'Inattivo',
  nl: 'Inactief', pl: 'Nieakt.', pt: 'Inativo', nb: 'Inaktiv' };
for (const [language, expected] of Object.entries(words)) {
  for (const state of ['idle', 'inactive']) {
    const word = window.casoraTileState({ template: 'casora_waschmaschine' },
      { entity_id: 'sensor.example', state, attributes: {} }, { locale: { language } }, {});
    assert.equal(word, expected, `${language}: ${state}`);
  }
}
console.log('ok studio_idle_words (9 languages)');
