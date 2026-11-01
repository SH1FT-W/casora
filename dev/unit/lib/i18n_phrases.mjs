// Phrase tables of the dashboard translation as the browser gets them: casora-i18n.js carries only German,
// every other language is its own file (scripts/i18n/<lang>.json, built by tools/build-i18n.py) that the
// runtime fetches. Tests hand them in up front: window.__casoraI18nPhrases = phrases().
import fs from 'node:fs';

const DIR = new URL('../../../custom_components/casora/scripts/i18n/', import.meta.url);

export function phrases() {
  const out = {};
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.json')) out[f.slice(0, -5)] = fs.readFileSync(new URL(f, DIR), 'utf8');
  return out;
}

export function phraseTable(lang) {
  return JSON.parse(fs.readFileSync(new URL(lang + '.json', DIR), 'utf8'));
}
