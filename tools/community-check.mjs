// Community-Karten (1.5): Prüfung in der GitHub-Action – derselbe Prüfer wie im Studio.
//   node tools/community-check.mjs pruefen  <issue.json>        → Exit 0 = gültig, Gründe auf stdout
//   node tools/community-check.mjs aufnehmen <issue.json>       → trägt die Karte in community/karten.json ein
// issue.json: das Issue-Objekt aus dem GitHub-Ereignis (number, title, body, user.login).
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const src = fs.readFileSync(new URL('custom_components/casora/panel/casora-panel-community.js', root), 'utf8');
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const C = mod.exports;

const [cmd, file] = process.argv.slice(2);
const issue = JSON.parse(fs.readFileSync(file, 'utf8'));
const body = String(issue.body || '');
const m = /```casora-karte\s*\n([\s\S]*?)\n```/.exec(body);
const desc = (/### Kurzbeschreibung\s*\n([^\n]*)/.exec(body) || [])[1] || '';
let card = null, why = [];
if (!m) why.push('Kein Block ```casora-karte``` gefunden.');
else { try { card = JSON.parse(m[1]); } catch (e) { why.push('Karte ist kein gültiges JSON.'); } }
if (card) why = why.concat(C.validate(card).errors);
const txt = (s) => typeof s === 'string' && s.length <= 200 && !/[<>]|\[\[\[|https?:\/\/|\{\{|\$\{/i.test(s);
if (!txt(desc) || !desc.trim()) why.push('Kurzbeschreibung fehlt oder enthält nicht erlaubte Zeichen.');

if (why.length) { console.log(why.map((x) => '- ' + x).join('\n')); process.exit(1); }
if (cmd === 'aufnehmen') {
  const p = new URL('community/karten.json', root);
  const cat = JSON.parse(fs.readFileSync(p, 'utf8'));
  cat.cards = (cat.cards || []).filter((c) => c.issue !== issue.number);
  cat.cards.push({ id: 'k' + issue.number, issue: issue.number, title: card.name, desc: desc.trim(),
    by: String((issue.user && issue.user.login) || '').replace(/[^A-Za-z0-9-]/g, ''), card });
  fs.writeFileSync(p, JSON.stringify(cat, null, 1) + '\n');
}
console.log('ok');
