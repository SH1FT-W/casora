// Wortliste §3: Casora's own messages are „Meldungen“ and the bell is „Glocke“; „Benachrichtigung“ only for Home
// Assistant's own notifications. The Studio section about the bell was titled „Benachrichtigungen“ while its entry under
// Settings › Messages said „Glocke auf diesem Dashboard“.   node dev/unit/studio_wording_bell.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const de = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/panel/de.json', import.meta.url), 'utf8'));
assert.equal(de.exact.Notifications, 'Glocke', 'section "Notifications" (the bell on this dashboard)');
const bad = Object.entries(de.exact).concat(de.patterns)
  // Home Assistant's own notifications (its sidebar entry) keep the word.
  .filter(([k, v]) => /Benachrichtigung/.test(v) && !/Home Assistant notifications|see Notifications\$?$/.test(k));
assert.deepEqual(bad, [], '„Benachrichtigung“ for Casora messages');
console.log('studio_wording_bell: ok');
