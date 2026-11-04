// Static check: no text from Home Assistant or the user lands in a card config that button-card evaluates.
//   node tools/noeval-check.mjs [file …]
// button-card runs every config string that is, after trim(), exactly "[[[ … ]]]" as JavaScript: name, label,
// state_display, icon, every value inside variables (deeply), the strings of action configs and, unless the custom
// field says do_not_eval, every string of a nested card. A friendly_name, media title or template result shaped like
// that runs in the viewer's session; HTML escaping does not change it (HACS review 5, point 2). So card configs carry
// keys (entity ids, slot keys, refs) and the template looks the text up when it renders.
//
// Scanned: the dashboard scripts, the Studio panel and every [[[ … ]]] expression of the card templates.
// A "card config" is an object literal with type: '<card type>' (custom:…, the stacks and HA's own cards) or with
// template: 'casora_…'. Checked are
//   - in every card config the text keys (name, label, state_display, title, icon, unit …) and everything inside
//     variables, series, entities, tap_action/hold_action/double_tap_action/icon_tap_action (deeply),
//   - in a custom field entry ({ card: { type: 'x' } } without its own type) of a card other than button-card:
//     do_not_eval: true, else the parent evaluates the strings of the nested card,
//   - assignments cfg.name = …, cfg.variables = …, cfg.label = … on objects named like a card config.
// A value is safe when it cannot be a whole "[[[ … ]]]" string of data:
//   - a literal, a number or boolean expression, a function, an object/array literal of safe values,
//   - a concatenation that starts (or ends) with a literal text that is not "[" (or "]") after trimming,
//   - code strings "[[[ … ]]]" whose inserted values are JSON.stringify(…) or safe,
//   - an id-like name (entity, id, key, ref, idx …; entity ids and keys have no brackets), a constant (ALL_CAPS),
//     markup (…Html, …Svg, …Css) or a translation of a literal (T('…')),
//   - a call of a builder that returns Casora's own config or markup (see SAFE_CALLS),
//   - wrapped in casoraNoEval(…) (casora-core.js: a "[[[" at the start gets a zero-width space, shown the same).
// Reviewed exceptions: tools/noeval-allow/*.txt, "file | expression | reason [| count]" as in html-escape-allow.
// Exit code 1 when something is unguarded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lex } from './html-escape-check.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SCRIPT_DIRS = ['custom_components/casora/scripts', 'custom_components/casora/scripts/local', 'custom_components/casora/panel'];
export const TEMPLATES = 'dashboards/casora/button_card_templates.json';
export const ALLOW_DIR = path.join(ROOT, 'tools/noeval-allow');

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = { ')': '(', ']': '[', '}': '{' };
function matchIndex(toks) {
  const m = new Array(toks.length).fill(-1);
  const st = [];
  toks.forEach((t, i) => {
    if (t.t !== 'p') return;
    if (OPEN[t.v]) st.push(i);
    else if (CLOSE[t.v]) { const o = st.pop(); if (o !== undefined) { m[o] = i; m[i] = o; } }
  });
  return m;
}
const exprText = (src, toks) => (toks.length ? src.slice(toks[0].s, toks[toks.length - 1].e) : '').replace(/\s+/g, ' ').trim();
function lineOf(src, pos) { let n = 1; for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; }

// Split a token range at top-level occurrences of the given punctuators.
function splitTop(toks, ops, m) {
  const out = [[]];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'p' && OPEN[t.v]) {
      const e = toks.indexOf(toks[i], 0) >= 0 ? closeOf(toks, i) : -1;
      if (e > i) { out[out.length - 1].push(...toks.slice(i, e + 1)); i = e; continue; }
    }
    if (t.t === 'p' && ops.includes(t.v)) { out.push([]); continue; }
    out[out.length - 1].push(t);
  }
  void m;
  return out;
}
// Matching close bracket inside a token slice (the slice is small, a scan is fine).
function closeOf(toks, i) {
  let d = 0;
  for (let j = i; j < toks.length; j++) {
    const t = toks[j];
    if (t.t !== 'p') continue;
    if (OPEN[t.v]) d++;
    else if (CLOSE[t.v]) { d--; if (d === 0) return j; }
  }
  return -1;
}

// ── What a card config is ─────────────────────────────────────────────────────────────────────────────────────────
// HA's own card types (domain-like names such as light or sensor are left out: they are also entry kinds of the code).
const HUI_TYPES = new Set(['vertical-stack', 'horizontal-stack', 'grid', 'picture-entity', 'picture-glance', 'picture', 'map', 'entities',
  'history-graph', 'statistics-graph', 'markdown', 'tile', 'todo-list', 'glance', 'gauge', 'conditional', 'iframe', 'media-control',
  'weather-forecast', 'alarm-panel', 'logbook', 'plant-status', 'shopping-list', 'heading']);
const isCardType = (v) => /^custom:/.test(v) || /^casora-[\w-]+$/.test(v) || HUI_TYPES.has(v);
const isButtonType = (v) => v === 'custom:button-card';

// Keys whose value button-card (or a nested card evaluated by it) shows or uses as text.
const TEXT_KEYS = new Set(['name', 'label', 'state_display', 'title', 'subtitle', 'header', 'footer', 'content', 'text', 'value',
  'primary', 'secondary', 'eyebrow', 'caption', 'message', 'placeholder', 'unit', 'icon', 'entity_picture', 'image', 'camName',
  'cam2Name', 'tooltip', 'units', 'state_content', 'theme', 'color', 'hint', 'sub', 'subtitle_text']);
// Keys checked deeply (every value inside).
const DEEP_KEYS = new Set(['variables', 'series', 'entities', 'tap_action', 'hold_action', 'double_tap_action', 'icon_tap_action',
  'icon_hold_action', 'icon_double_tap_action', 'state', 'confirmation']);

// ── Safe values ───────────────────────────────────────────────────────────────────────────────────────────────────
const ID_LIKE = /^(?:id|ids|eid|eids|entity|entities|entityId|entity_id|entityIds|ent|ents|key|keys|k|ref|slot|slot_id|idx|index|i|j|n|nr|num|count|cnt|pct|percent|h|w|px|size|span|kind|mode|domain|place|part|uid|tpl|cam|cam2|camera|area_id|device_id|floor_id|dev|watch|sec|col|cols|rows|side|step|min|max|lo|hi|height|width|gap|pos|at|ms|until|since|start|end|delay|dur|duration|hours|days|day|hour|level|vol|volume|brightness|temp|setpoint|tone|toneKey|accent|variant|layout|theme|dark|on|off|open|wide|narrow|compact|big|small|talk|audio|privacy|stream|siren|bell|two|fav|rv|ev|clip|inst|back|newer|older|readout|plate|switchable|v3|soft|members|sensors|lights|covers|url|href|navigation_path|service|action|haptic|shape|glyph|primaryKey)$/;
const ID_SUFFIX = /(?:Sensor|Sensors|Id|_id|Ids|_ids|Entity|_entity|Entities|Key|_key|Keys|Idx|_idx|Count|_count|Pct|Ref|_ref|Slot|Px|Ms|Num|Index)$/;
const CONST_NAME = /^[A-Z][A-Z0-9_]+$/;
const MARKUP_NAME = /(?:Html|HTML|html|Svg|SVG|svg|Css|CSS|css|Style|Styles|style|styles|Markup|markup)\d*$/;
// Calls whose result is Casora's own config, markup (starts with "<"), a number, a translation of a literal or guarded.
export const SAFE_CALLS = /^(?:(?:window\.)?casoraNoEval|_casoraNoEval|noEval|own|own2|bare|secCard|K\.\w+|E\.kit\.\w+|(?:window\.)?_casoraSoftKit\.\w+|UI\.\w+|(?:window\.)?_casoraUI\.\w+|H\.\w+|L\.\w+|JSON\.stringify|Number|parseInt|parseFloat|Boolean|isFinite|Math\.\w+|Date\.now|encodeURIComponent|(?:window\.)?casoraIconUrl|(?:window\.)?casoraRunService|(?:window\.)?_casoraNPRef|(?:window\.)?_casoraCustomBadge\.ref|chartCard|metricCard|col|colCard|makeCol|fld|sec|gap|pill|stageCard|(?:window\.)?casoraPopupAction)$/;
const ESCAPER = /^(?:(?:window\.)?casoraEsc|esc\d?|_esc|escAttr|escHtml|UI\.esc|(?:window\.)?_casoraUI\.esc)$/;
const TR_CALL = /^(?:_t|t|tr|_tr|T|TR|casoraTr|window\.casoraTr)$/;
const NUM_METHOD = /^(?:toFixed|toPrecision|length|indexOf|lastIndexOf|findIndex|getTime|valueOf|size|getHours|getMinutes|getDate|getMonth|getFullYear|charCodeAt|round|floor|ceil|test|includes|some|every|has|startsWith|endsWith)$/;
const SAFE_KW = new Set(['true', 'false', 'null', 'undefined', 'this', 'NaN', 'Infinity']);

const litText = (t) => (t.t === 'str' ? t.v.replace(/\\(.)/g, '$1') : t.t === 'tpl' ? t.parts[0] : null);
const litEnd = (t) => (t.t === 'str' ? t.v.replace(/\\(.)/g, '$1') : t.t === 'tpl' ? t.parts[t.parts.length - 1] : null);
// A text that can never be the whole of a "[[[ … ]]]" string once trimmed.
const fencesStart = (s) => s != null && s.trim() !== '' && s.trimStart()[0] !== '[';
const fencesEnd = (s) => s != null && s.trim() !== '' && s.trimEnd().slice(-1) !== ']';
const isCode = (s) => s != null && /^\s*\[\[\[/.test(s);

// Last name of a member chain (a.b.c → c, a['x'] → null).
function memberName(op) {
  if (!op.length) return null;
  for (const t of op) if (!(t.t === 'id' || (t.t === 'p' && (t.v === '.' || t.v === '?.')))) return null;
  const last = op[op.length - 1];
  return last.t === 'id' ? last.v : null;
}

export function safeExpr(src, toks, ctx) {
  // Strip outer parens.
  while (toks.length >= 2 && toks[0].t === 'p' && toks[0].v === '(' && closeOf(toks, 0) === toks.length - 1) toks = toks.slice(1, -1);
  if (!toks.length) return true;
  // Leading unary / keyword operators that make a number or boolean.
  const f0 = toks[0];
  if (f0.t === 'p' && (f0.v === '!' || f0.v === '-' || f0.v === '+' || f0.v === '~')) return true;
  if (f0.t === 'id' && (f0.v === 'typeof' || f0.v === 'void' || f0.v === 'delete')) return true;
  if (f0.t === 'id' && (f0.v === 'function' || f0.v === 'async' || f0.v === 'class')) return true;
  // Arrow function anywhere at the top level.
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'p' && OPEN[t.v]) { const e = closeOf(toks, i); if (e > i) { i = e; continue; } }
    if (t.t === 'p' && t.v === '=>') return true;
  }
  // Ternary: both branches.
  {
    let q = -1, c = -1, d = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'p' && OPEN[t.v]) { const e = closeOf(toks, i); if (e > i) { i = e; continue; } }
      if (t.t === 'p' && t.v === '?') { if (q < 0) q = i; d++; }
      else if (t.t === 'p' && t.v === ':' && q >= 0) { d--; if (d === 0) { c = i; break; } }
    }
    if (q > 0 && c > q) return safeExpr(src, toks.slice(q + 1, c), ctx) && safeExpr(src, toks.slice(c + 1), ctx);
  }
  // Comparisons give booleans.
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'p' && OPEN[t.v]) { const e = closeOf(toks, i); if (e > i) { i = e; continue; } }
    if (t.t === 'p' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(t.v)) return true;
    if (t.t === 'id' && (t.v === 'instanceof' || t.v === 'in')) return true;
  }
  // a || b, a && b, a ?? b: every operand.
  const ors = splitTop(toks, ['||', '&&', '??']);
  if (ors.length > 1) return ors.every((p) => safeExpr(src, p, ctx));
  // Arithmetic other than "+": numbers.
  const arith = splitTop(toks, ['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>']);
  if (arith.length > 1 && arith.every((p) => p.length)) return true;
  // "+" chains.
  const plus = splitTop(toks, ['+']);
  if (plus.length > 1) return safeChain(src, plus, ctx);
  return safeOperand(src, toks, ctx);
}

function safeChain(src, ops, ctx) {
  const first = ops[0].length === 1 ? litText(ops[0][0]) : null;
  const last = ops[ops.length - 1].length === 1 ? litEnd(ops[ops.length - 1][0]) : null;
  if (isCode(first)) {
    // Code: values must be inserted as JS literals.
    return ops.every((op) => (op.length === 1 && (op[0].t === 'str' || op[0].t === 'num'))
      || (op[0] && op[0].t === 'id' && /^(?:JSON|window)$/.test(op[0].v) && /^JSON\.stringify\(/.test(exprText(src, op).replace(/^window\./, '')))
      || safeExpr(src, op, ctx));
  }
  if (fencesStart(first) || fencesEnd(last)) return true;
  // Also a template literal with a fixed start inside the chain start.
  return ops.every((op) => safeExpr(src, op, ctx));
}

function safeOperand(src, toks, ctx) {
  const t = toks[0];
  if (toks.length === 1) {
    if (t.t === 'num' || t.t === 're') return true;
    if (t.t === 'str') return true;
    if (t.t === 'tpl') {
      if (!t.exprs.length) return true;
      if (isCode(t.parts[0])) return t.exprs.every((x) => /^JSON\.stringify\(/.test(exprText(src, x.toks)) || safeExpr(src, x.toks, ctx));
      if (fencesStart(t.parts[0]) || fencesEnd(t.parts[t.parts.length - 1])) return true;
      return t.exprs.every((x) => safeExpr(src, x.toks, ctx));
    }
    if (t.t === 'id' && SAFE_KW.has(t.v)) return true;
  }
  // Object / array literal: every value.
  if (t.t === 'p' && (t.v === '{' || t.v === '[') && closeOf(toks, 0) === toks.length - 1) {
    const out = [];
    walkLiteral(src, toks, 0, ctx, out, true);
    return out.length === 0;
  }
  // new X(…)
  if (t.t === 'id' && t.v === 'new') return true;
  // (window.casoraNoEval || <the same guard inline>)(x) – the templates' form; dev/unit/no_eval.mjs checks the inline guard.
  if (t.t === 'p' && t.v === '(') {
    const k = closeOf(toks, 0);
    if (k > 0 && toks[k + 1] && toks[k + 1].v === '(' && closeOf(toks, k + 1) === toks.length - 1
      && /^\(\s*window\.casoraNoEval\s*\|\|/.test(src.slice(t.s, toks[k].e))) return true;
  }
  // Calls: callee(…) possibly followed by members.
  const callee = [];
  let i = 0;
  while (i < toks.length && (toks[i].t === 'id' || (toks[i].t === 'p' && (toks[i].v === '.' || toks[i].v === '?.')))) callee.push(toks[i++]);
  if (i < toks.length && toks[i].t === 'p' && toks[i].v === '(' && callee.length) {
    const close = closeOf(toks, i);
    const name = callee.map((x) => x.v).join('').replace(/\?\./g, '.');
    const rest = toks.slice(close + 1);
    // Method on a value: .toFixed(), .length …
    const lastName = callee[callee.length - 1].v;
    if (!rest.length) {
      if (SAFE_CALLS.test(name) || TR_CALL.test(name) && isTrOfLiteral(toks.slice(i + 1, close))) return true;
      // HTML escaping keeps brackets: esc(x) is a template exactly when x is one.
      if (ESCAPER.test(name)) return splitTop(toks.slice(i + 1, close), [',']).every((p) => safeExpr(src, p, ctx));
      if (NUM_METHOD.test(lastName)) return true;
      if (/^String$/.test(name)) return safeExpr(src, toks.slice(i + 1, close), ctx);
      if (/^(?:Object\.assign)$/.test(name)) return splitTop(toks.slice(i + 1, close), [',']).every((p) => safeExpr(src, p, ctx));
      // .map(fn) / .filter(fn) on arrays: the elements are checked where the literals are built.
      if (/^(?:map|filter|concat|slice|flat|flatMap|sort|reverse)$/.test(lastName) && ctx && ctx.structural) return true;
      return false;
    }
    // f(…).length, f(…).toFixed(1)
    const rn = memberName(rest.slice(1));
    if (rest[0].t === 'p' && rest[0].v === '.' && rn && NUM_METHOD.test(rn)) return true;
    if (rest[0].t === 'p' && rest[0].v === '(' ) return false;
    if (SAFE_CALLS.test(name) && rest[0].t === 'p' && rest[0].v === '.') return true;
    return false;
  }
  // Member chain or identifier.
  let name = memberName(toks);
  if (!name) {
    // a[b] → look at the object name (rows[i] of a list of ids …)
    const simple = toks.filter((x) => !(x.t === 'p' && (x.v === '[' || x.v === ']')));
    void simple;
    // x.y[0]
    const bi = toks.findIndex((x) => x.t === 'p' && x.v === '[');
    if (bi > 0 && closeOf(toks, bi) === toks.length - 1) name = memberName(toks.slice(0, bi));
    if (name && /s$/.test(name) && ID_LIKE.test(name.replace(/s$/, ''))) return true;
    if (name && ID_SUFFIX.test(name)) return true;
    return false;
  }
  if (SAFE_KW.has(name)) return true;
  // const x = JSON.stringify(…) in the same source: a JS literal (only in code strings it matters, never a template).
  if (toks.length === 1 && JSON_VARS.has(name)) return true;
  name = name.replace(/^_+/, '') || name;
  if (ID_LIKE.test(name) || ID_SUFFIX.test(name) || CONST_NAME.test(name) || MARKUP_NAME.test(name)) return true;
  if (NUM_METHOD.test(name)) return true;
  // Constants of the code: members of ALL_CAPS objects (COLORS.red).
  if (toks[0].t === 'id' && CONST_NAME.test(toks[0].v)) return true;
  return false;
}
const isTrOfLiteral = (args) => args.length === 1 && (args[0].t === 'str' || (args[0].t === 'tpl' && !args[0].exprs.length));

// ── Object literals ───────────────────────────────────────────────────────────────────────────────────────────────
// Properties of an object literal as { key, valToks, keyTok }.
function props(toks, open) {
  const close = closeOf(toks, open);
  const inner = toks.slice(open + 1, close);
  const out = [];
  for (const part of splitTop(inner, [','])) {
    if (!part.length) continue;
    const k = part[0];
    if (k.t === 'p' && k.v === '...') { out.push({ spread: true, valToks: part.slice(1), keyTok: k }); continue; }
    // key: value
    if (part[1] && part[1].t === 'p' && part[1].v === ':' && (k.t === 'id' || k.t === 'str' || k.t === 'num')) {
      out.push({ key: k.t === 'str' ? k.v : k.v, valToks: part.slice(2), keyTok: k });
      continue;
    }
    // [computed]: value
    if (k.t === 'p' && k.v === '[') {
      const e = closeOf(part, 0);
      if (part[e + 1] && part[e + 1].v === ':') { out.push({ key: null, valToks: part.slice(e + 2), keyTok: k }); continue; }
    }
    // shorthand "name" or method
    if (part.length === 1 && k.t === 'id') { out.push({ key: k.v, valToks: [k], keyTok: k, shorthand: true }); continue; }
    out.push({ key: null, valToks: [], keyTok: k, method: true });
  }
  return { list: out, close };
}

const propStr = (p) => {
  if (!p || p.valToks.length !== 1) return null;
  const t = p.valToks[0];
  return t.t === 'str' ? t.v : null;
};
const cardKind = (list) => {
  const type = list.find((p) => p.key === 'type');
  const tv = propStr(type);
  if (tv != null) return isCardType(tv) ? (isButtonType(tv) ? 'button' : 'other') : null;
  const tpl = list.find((p) => p.key === 'template');
  if (tpl) {
    const s = exprTextOf(tpl.valToks);
    if (/['"]casora_/.test(s)) return 'button';
  }
  return null;
};
let CUR_SRC = '';
let JSON_VARS = new Set();
const exprTextOf = (toks) => exprText(CUR_SRC, toks);

// Walk an object/array literal starting at toks[open]. deep: every value is a sink (inside variables …).
function walkLiteral(src, toks, open, ctx, out, deep) {
  const t = toks[open];
  if (t.v === '[') {
    const close = closeOf(toks, open);
    for (const part of splitTop(toks.slice(open + 1, close), [','])) {
      if (!part.length) continue;
      // A plain list (cards: [a, b]): only its literals are cards to check; in a deep value every element counts.
      if (!deep && !(part[0].t === 'p' && (part[0].v === '{' || part[0].v === '[') && closeOf(part, 0) === part.length - 1)) continue;
      checkValue(src, part, ctx, out, deep, null);
    }
    return;
  }
  const { list } = props(toks, open);
  const kind = cardKind(list);
  for (const p of list) {
    if (p.method || !p.valToks.length) continue;
    if (p.spread) { if (deep || kind) checkValue(src, p.valToks, ctx, out, true, '...'); continue; }
    const k = p.key;
    if (deep) { checkValue(src, p.valToks, ctx, out, true, k); continue; }
    if (kind && k && (TEXT_KEYS.has(k) || DEEP_KEYS.has(k))) { checkValue(src, p.valToks, ctx, out, true, k); continue; }
    // Recurse into nested literals (cards inside cards, custom_fields …).
    const v = p.valToks;
    if (v[0] && v[0].t === 'p' && (v[0].v === '{' || v[0].v === '[') && closeOf(v, 0) === v.length - 1) walkLiteral(src, v, 0, ctx, out, false);
  }
  // A custom field entry { card: <literal of another card type> } evaluated by its parent.
  if (!kind) {
    const card = list.find((p) => p.key === 'card');
    if (card && !list.some((p) => p.key === 'type' || p.key === 'conditions') && card.valToks[0] && card.valToks[0].v === '{') {
      const inner = props(card.valToks, 0).list;
      const ik = cardKind(inner);
      const dne = list.find((p) => p.key === 'do_not_eval');
      if (ik === 'other' && !(dne && dne.valToks.length === 1 && dne.valToks[0].v === 'true')) {
        out.push({ tok: card.keyTok, text: 'custom field card ' + (propStr(inner.find((p) => p.key === 'type')) || '?') + ' without do_not_eval: true' });
      }
    }
  }
}

// Keys whose value is an entity id or a key of the code (no brackets possible).
const ID_KEY = /^(?:entity|entity_id|entities_ids|device_id|area_id|floor_id|area|id|key|slot_id|index|idx|place|kind|mode|span|source|haptic|action|service|perform_action|navigation_path|url_path|decimals|height|width|readout|plate|switch|color|[\w]+_entity|[\w]+_id)$/;
function checkValue(src, toks, ctx, out, deep, key) {
  if (!toks.length) return;
  if (key && ID_KEY.test(key) && !(toks[0].t === 'p' && (toks[0].v === '{' || toks[0].v === '['))) return;
  // list.map(function (x) { return { … }; }) and friends: the literals the callback returns are the values.
  if (deep && mapCall(src, toks, ctx, out)) return;
  const t = toks[0];
  if (t.t === 'p' && (t.v === '{' || t.v === '[') && closeOf(toks, 0) === toks.length - 1) { walkLiteral(src, toks, 0, ctx, out, deep); return; }
  if (safeExpr(src, toks, ctx)) return;
  out.push({ tok: t, text: (key ? key + ': ' : '') + exprText(src, toks) });
}

function mapCall(src, toks, ctx, out) {
  let i = toks.length - 1;
  if (!(toks[i].t === 'p' && toks[i].v === ')')) return false;
  let o = -1, d = 0;
  for (let j = i; j >= 0; j--) {
    if (toks[j].t !== 'p') continue;
    if (CLOSE[toks[j].v]) d++;
    else if (OPEN[toks[j].v]) { d--; if (d === 0) { o = j; break; } }
  }
  const name = o > 0 && toks[o - 1].t === 'id' ? toks[o - 1].v : '';
  if (!/^(?:map|concat|filter|flatMap)$/.test(name)) return false;
  // The receiver (a.b.map) and every argument: literals returned by callbacks are checked, other args must be safe.
  const recv = toks.slice(0, o - 2);
  if (recv.length && !safeExpr(src, recv, ctx) && !mapCall(src, recv, ctx, out) && !/^(?:filter)$/.test(name)) {
    // The receiver is the list itself: e.g. ids.map(…) – an id list is fine, other lists are reported by their literal.
    if (!(memberName(recv) && (ID_LIKE.test(memberName(recv).replace(/s$/, '')) || /(?:ids|Ids|zones|curves|list|items|rows|series)$/.test(memberName(recv))))) {
      out.push({ tok: recv[0], text: exprText(src, toks) });
      return true;
    }
  }
  for (const arg of splitTop(toks.slice(o + 1, i), [','])) {
    if (!arg.length) continue;
    const fn = arg[0].t === 'id' && arg[0].v === 'function' || arg.some((x) => x.t === 'p' && x.v === '=>');
    if (!fn) { checkValue(src, arg, ctx, out, true, null); continue; }
    // Object literals after "return" or "=> (" inside the callback.
    for (let j = 0; j < arg.length; j++) {
      const t = arg[j];
      const p = arg[j - 1];
      if (t.t === 'p' && t.v === '{' && p && ((p.t === 'id' && p.v === 'return') || (p.t === 'p' && p.v === '(' && arg[j - 2] && arg[j - 2].v === '=>'))) {
        const e = closeOf(arg, j);
        if (e > j) walkLiteral(src, arg.slice(j, e + 1), 0, ctx, out, true);
      }
    }
  }
  return true;
}

// Assignments to config objects: cfg.name = …, card.variables = {…}, Object.assign(cfg.variables, {…}).
const CFG_OBJ = /^(?:cfg|card|conf|config|bc|cardCfg|cardConfig|c|found|tile|t|out|it\.cfg)$/;
function scanAssignments(src, toks, ctx, out) {
  for (let i = 2; i < toks.length - 1; i++) {
    const t = toks[i];
    if (!(t.t === 'p' && t.v === '=')) continue;
    const key = toks[i - 1], dot = toks[i - 2], obj = toks[i - 3];
    if (!key || key.t !== 'id' || !dot || dot.v !== '.' || !obj || obj.t !== 'id') continue;
    if (!CFG_OBJ.test(obj.v) || !(TEXT_KEYS.has(key.v) && /^(?:name|label|state_display|icon|title)$/.test(key.v) || key.v === 'variables')) continue;
    // Value up to ; or newline at depth 0.
    let e = i + 1;
    while (e < toks.length) {
      const u = toks[e];
      if (u.t === 'p' && OPEN[u.v]) { const c = closeOf(toks, e); if (c > e) { e = c + 1; continue; } }
      if (u.t === 'p' && (u.v === ';' || u.v === ',' || CLOSE[u.v])) break;
      if (e > i + 1 && /\n/.test(src.slice(toks[e - 1].e, u.s)) && toks[e - 1].t !== 'p' && u.t !== 'p') break;
      e++;
    }
    checkValue(src, toks.slice(i + 1, e), ctx, out, true, obj.v + '.' + key.v);
  }
}

// ── Allow list ────────────────────────────────────────────────────────────────────────────────────────────────────
export function loadAllow(dir = ALLOW_DIR) {
  if (!fs.existsSync(dir)) return [];
  const text = fs.readdirSync(dir).sort().filter((f) => f.endsWith('.txt')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const parts = l.split(' | ').map((x) => (x || '').trim());
    const max = parts.length >= 4 && /^\d+$/.test(parts[parts.length - 1]) ? Number(parts.pop()) : null;
    const [f, expr] = parts;
    const reason = parts.slice(2).join(' | ');
    if (!f || !expr || !reason) throw new Error('noeval-allow: "file | expression | reason [| count]" expected: ' + l);
    const re = expr.startsWith('re:') ? new RegExp(expr.slice(3)) : null;
    return { f, expr, re, reason, max, used: 0, line: l };
  });
}
function allowed(allow, file, text, where = '') {
  const tpl = where ? file + '#' + where.split(/[.[]/)[0] : null;
  for (const a of allow) {
    const fileOk = a.f === file || (tpl && a.f === tpl) || (a.f.endsWith('*') && file.startsWith(a.f.slice(0, -1)));
    if (!fileOk) continue;
    if (a.re ? a.re.test(text) : a.expr === text) {
      a.used++;
      if (a.max != null && a.used > a.max) { a.over = true; return false; }
      return true;
    }
  }
  return false;
}

// ── Scan ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function checkSource(file, src, allow, out, where = '') {
  let toks;
  try { toks = lex(src).toks; } catch (e) { out.push({ file, line: 0, where, expr: 'LEX ERROR ' + e.message }); return; }
  CUR_SRC = src;
  JSON_VARS = new Set([...src.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*JSON\.stringify\(/g)].map((x) => x[1]));
  const found = [];
  const ctx = { structural: true };
  // Every object literal that is a card config (nested ones are visited by walkLiteral of the outer one, but an
  // outer literal is not always a card: visit every "{" whose literal is a card or a custom field entry).
  const m = matchIndex(toks);
  const seen = new Set();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(t.t === 'p' && t.v === '{') || m[i] < 0) continue;
    // An object literal (not a block): previous token is an operator, "(", ",", ":", "[", "return", "=" …
    const p = toks[i - 1];
    const isLit = !p || (p.t === 'p' && ['(', ',', ':', '[', '=', '?', '||', '&&', '??', '=>', '+', '...', '!'].includes(p.v) && !(p.v === '=>' && false))
      || (p.t === 'id' && ['return', 'yield', 'await', 'case'].includes(p.v));
    if (!isLit) continue;
    // "=> {" is a function body, not a literal.
    if (p && p.t === 'p' && p.v === '=>') continue;
    const sub = toks.slice(i, m[i] + 1);
    const { list } = props(sub, 0);
    const kind = cardKind(list);
    const isEntry = list.some((x) => x.key === 'card') && !list.some((x) => x.key === 'type');
    if (!kind && !isEntry) continue;
    const res = [];
    walkLiteral(src, sub, 0, ctx, res, false);
    for (const r of res) {
      const key = r.tok.s + '|' + r.text;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(r);
    }
  }
  scanAssignments(src, toks, ctx, found);
  for (const r of found) {
    const text = r.text.replace(/\s+/g, ' ');
    if (allowed(allow, file, text, where)) continue;
    out.push({ file, line: lineOf(src, r.tok.s), where, expr: text });
  }
}

export function checkTemplates(file, allow, out) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s.startsWith('[[[') || !s.endsWith(']]]')) return;
      checkSource(file, s.slice(3, -3), allow, out, where);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k);
  };
  walk(doc, '');
}

export function listScripts() {
  const files = [];
  for (const d of SCRIPT_DIRS) for (const f of fs.readdirSync(path.join(ROOT, d)).sort()) if (f.endsWith('.js')) files.push(d + '/' + f);
  return files;
}

export function run(files) {
  const allow = loadAllow();
  const out = [];
  const list = files && files.length ? files : listScripts().concat([TEMPLATES]);
  for (const f of list) {
    if (f.endsWith('.json')) checkTemplates(f, allow, out);
    else checkSource(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), allow, out);
  }
  const unused = files && files.length ? [] : allow.filter((a) => !a.used || (a.max != null && a.used < a.max));
  const over = allow.filter((a) => a.over);
  return { out, unused, over, allow };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const { out, unused, over } = run(args);
  for (const o of out) console.log(`${o.file}:${o.line}${o.where ? ' [' + o.where + ']' : ''}: ${o.expr}`);
  for (const a of over) console.log(`more places than the allow entry covers (${a.max}, now ${a.used}): ${a.f} | ${a.expr}`);
  for (const a of unused) console.log('allow list entry not used any more' + (a.used ? ` (covers ${a.max}, used ${a.used})` : '') + `: ${a.f} | ${a.expr}`);
  console.log(`${out.length} unguarded value(s) in card configs` + (unused.length ? `, ${unused.length} stale allow entr(y/ies)` : ''));
  process.exit(out.length || unused.length ? 1 : 0);
}
