// Gemeldet (Design-Audit 10.10.2026, DP-11): Das Popup des Sicherheits-Badges (casora_badge_security)
// zeigte für die Alarmanlage im Weich-Design den alten Kopf „Aktiv · Zuhause“ in 36 px/400 und die
// Modus-Liste nur in der linken Spalte – casora_popup_alarm hatte längst den Weich-Kopf und volle Breite.
// Beide Vorlagen tragen eine Kopie desselben Alarm-Zweigs. Dieser Test hält die Kopien gleich
// (ohne Kommentare verglichen).
import fs from 'node:fs';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const branch = (tpl) => {
  const c = T[tpl].tap_action.casora_popup.content;
  const i = c.indexOf('const _alarm = () =>');
  if (i < 0) throw new Error(tpl + ': kein Alarm-Zweig');
  return c.slice(i).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).join('\n');
};
let bad = 0;
const ok = (name, cond, info = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : ' – ' + info)); if (!cond) bad++; };
const a = branch('casora_popup_alarm'), b = branch('casora_badge_security');
ok('Badge-Alarm-Zweig hat den Weich-Kopf (Unterzeile 17/700)', /const _soft = !!\(UI\.soft && UI\.soft\(\)\);/.test(b) && b.includes('font-size:17px;font-weight:700;'));
ok('Badge-Alarm-Zweig: Modus-Liste volle Breite', b.includes("full: ['modes']") && !b.includes("left: ['modes']"));
if (a !== b) {
  const la = a.split('\n'), lb = b.split('\n'); let k = 0; while (k < la.length && la[k] === lb[k]) k++;
  ok('Alarm-Zweig in casora_badge_security = casora_popup_alarm', false, 'erste Abweichung Zeile ' + (k + 1) + ':\n  popup_alarm: ' + (la[k] || '').slice(0, 160) + '\n  badge:       ' + (lb[k] || '').slice(0, 160));
} else ok('Alarm-Zweig in casora_badge_security = casora_popup_alarm', true);
console.log(bad ? `FAIL popup_badge_alarm (${bad})` : 'PASS popup_badge_alarm');
process.exit(bad ? 1 : 0);
