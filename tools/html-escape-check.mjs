// Static check: every value interpolated into an HTML string is escaped.
//   node tools/html-escape-check.mjs [--all] [file …]
// Scans the dashboard scripts, the Studio panel and every [[[ … ]]] expression of the card templates. An "HTML
// string" is a string or template literal holding markup (a tag, an attribute assignment, a closing quote before
// ">"). Every other operand of its "+" chain and every ${…} inside such a template literal must be one of:
//   - wrapped in an escaper (esc(…), UI.esc(…), escAttr(…), safeUrl(…), encodeURIComponent(…) …, see ESCAPERS),
//   - a literal, a number expression (arithmetic, Math.*, Number(…), .toFixed(…), .length …),
//   - markup built in place (the operand itself contains an HTML string, its own parts are checked there),
//   - a value whose name says it is markup (…Html, …Svg, …Markup) or a call of a markup builder (UI.*, see BUILDERS),
//   - listed in tools/html-escape-allow/*.txt: "file | expression | reason" per line; the expression is the exact
//     text (whitespace collapsed) or "re:<regex>"; the file may end in "*" (prefix); "…templates.json#casora_x"
//     covers only that template; an optional last field "| N" is the number of places it covers.
// button-card renders name/label/state_display/custom_fields results as HTML, so those fields' plain
// `return <value>` statements count as sinks too.
// Exit code 1 when something is unescaped; the list says where.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Local escaper names; every definition of one must be a full escaper (checkEscapers).
export const ESC_LOCAL = /^(?:esc\d?|_esc|escAttr|escA|escHtml|escapeHtml|escJs|safeUrl|attrUrl)$/;
export const ESCAPERS = /^(?:[\w$]+\.)*(?:esc\d?|_esc|escAttr|escA|escHtml|escapeHtml|escJs|safeUrl|attrUrl|casoraEsc|casoraEscJs|casoraSafeUrl)$/;
// Functions that return markup built from escaped parts (checked where they are defined).
export const BUILDERS = /^(?:(?:window\.)?(?:_casoraUI|UI|H|L)\.[\w.]+|(?:window\.)?casoraStateFit|(?:window\.)?casoraIconMask|(?:window\.)?_casora\w*(?:Html|Svg|Markup|Icon|Ring|Badge|Mask))$/;
const MARKUP_NAME = /(?:html|Html|HTML|svg|Svg|SVG|markup|Markup)\d*$/;
// ALL_CAPS names (two characters or more) are constants of the code (CSS snippets, colour tables); so are the plain
// members of those and of the design-token objects (T.ink, T2.font, K.ink3). A single capital (C.home) is often data.
const CONST_NAME = /^[A-Z][A-Z0-9_]+$/;
const TOKEN_NS = /^(?:T|T2|TK|K|S|[A-Z][A-Z0-9_]+)$/;
// Translation of a fixed text of the code: _t('Kamera nicht erreichbar').
const TR_CALL = /^(?:_t|t|tr|_tr|casoraTr|window\.casoraTr|T|TR)$/;
const NUM_CALL = /^(?:Math\.\w+|Number|parseInt|parseFloat|isFinite|isNaN|Date\.now|String\(\s*Number)$/;
const NUM_METHOD = /^(?:toFixed|toPrecision|length|indexOf|lastIndexOf|findIndex|getTime|valueOf|size|getHours|getMinutes|getDate|getMonth|getFullYear|charCodeAt)$/;

// ── Lexer ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=',
  '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
const ID = /[\p{L}\p{N}_$\u200c\u200d]/u;

export function lex(src, start = 0, stopAtBrace = false) {
  const toks = [];
  let i = start;
  let depth = 0;
  const prevSig = () => toks[toks.length - 1];
  const regexOk = () => {
    const p = prevSig();
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
    if (p.t === 'id') return KW_BEFORE_REGEX.has(p.v);
    return !(p.v === ')' || p.v === ']' || p.v === '}');
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\u00a0' || c === '\ufeff') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, v = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { v += src[j] + (src[j + 1] || ''); j += 2; continue; }
        if (src[j] === '\n') break;
        v += src[j++];
      }
      toks.push({ t: 'str', v, s: i, e: j + 1 });
      i = j + 1;
      continue;
    }
    if (c === '`') {
      const parts = [], exprs = [];
      let j = i + 1, v = '';
      for (;;) {
        if (j >= src.length) break;
        if (src[j] === '\\') { v += src[j] + (src[j + 1] || ''); j += 2; continue; }
        if (src[j] === '`') { j++; break; }
        if (src[j] === '$' && src[j + 1] === '{') {
          parts.push(v); v = '';
          const inner = lex(src, j + 2, true);
          exprs.push({ toks: inner.toks, s: j + 2, e: inner.end });
          j = inner.end + 1;
          continue;
        }
        v += src[j++];
      }
      parts.push(v);
      toks.push({ t: 'tpl', parts, exprs, s: i, e: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9a-zA-Z_.]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '-' || src[j + 1] === '+')) j++;
        j++;
      }
      toks.push({ t: 'num', v: src.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    if (ID.test(c) || c === '\\') {
      let j = i;
      while (j < src.length && (ID.test(src[j]) || src[j] === '\\')) j++;
      toks.push({ t: 'id', v: src.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    if (c === '/' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < src.length) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') break;
        if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break;
        j++;
      }
      j++;
      while (j < src.length && /[a-z]/.test(src[j])) j++;
      toks.push({ t: 're', v: src.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    if (stopAtBrace) {
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0) return { toks, end: i }; depth--; }
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    const v = p || c;
    toks.push({ t: 'p', v, s: i, e: i + v.length });
    i += v.length;
  }
  return { toks, end: i };
}

// ── Analysis ──────────────────────────────────────────────────────────────────────────────────────────────────────
const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = { ')': '(', ']': '[', '}': '{' };
// Tokens that end an operand of a "+" chain (lower precedence than "+", or statement level).
const BOUND = new Set([',', ';', '?', ':', '=', '+=', '=>', '&&', '||', '??', '==', '===', '!=', '!==', '<', '>', '<=', '>=',
  '-=', '*=', '/=', '||=', '&&=', '??=', '...', '!']);
const BOUND_KW = new Set(['return', 'case', 'throw', 'in', 'of', 'instanceof', 'typeof', 'else', 'yield', 'await', 'new', 'delete', 'void', 'const', 'let', 'var']);

const unescapeStr = (v) => v.replace(/\\(.)/g, '$1');
export function isHtmlText(v) {
  const s = unescapeStr(v);
  return /<\/?[a-zA-Z][\w-]*(?=[\s>\/]|$)/.test(s) || /<!--/.test(s) || /\b[\w-]+=\s*["']$/.test(s) || /^\s*["']\s*(?:>|\/>|[\w-]+=)/.test(s)
    || /^\s*["']\s*$/.test(s) && false || /\/>/.test(s) || /^\s*>/.test(s) && /</.test(s);
}
const tokHtml = (t) => (t.t === 'str' && isHtmlText(t.v)) || (t.t === 'tpl' && t.parts.some(isHtmlText));

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
const containsHtml = (toks) => toks.some((t) => tokHtml(t) || (t.t === 'tpl' && t.exprs.some((x) => containsHtml(x.toks))));

// Split at top-level occurrences of the given punctuators.
function splitTop(toks, ops) {
  const m = matchIndex(toks);
  const out = [[]];
  const at = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'p' && OPEN[t.v] && m[i] > i) { out[out.length - 1].push(...toks.slice(i, m[i] + 1)); i = m[i]; continue; }
    if (t.t === 'p' && ops.includes(t.v)) { at.push(t.v); out.push([]); continue; }
    out[out.length - 1].push(t);
  }
  return { parts: out, ops: at };
}

// Is this operand safe to put into HTML as it is?
export function safeOperand(toks) {
  if (!toks.length) return true;
  // Ternary: both branches.
  const q = splitTop(toks, ['?']);
  if (q.parts.length > 1) {
    const rest = toks.slice(q.parts[0].length + 1);
    // find the matching ':' (nested ternaries)
    const m = matchIndex(rest);
    let d = 0;
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i];
      if (t.t === 'p' && OPEN[t.v] && m[i] > i) { i = m[i]; continue; }
      if (t.t === 'p' && t.v === '?') d++;
      if (t.t === 'p' && t.v === ':') { if (d === 0) return safeOperand(rest.slice(0, i)) && safeOperand(rest.slice(i + 1)); d--; }
    }
    return false;
  }
  const lo = splitTop(toks, ['||', '??']);
  if (lo.parts.length > 1) return lo.parts.every(safeOperand);
  const la = splitTop(toks, ['&&']);
  if (la.parts.length > 1) return safeOperand(la.parts[la.parts.length - 1]);
  // Built in place from checked parts (its own HTML strings are checked where they stand).
  if (containsHtml(toks)) return true;
  const pl = splitTop(toks, ['+']);
  if (pl.parts.length > 1) return pl.parts.every(safeOperand);
  // Arithmetic or comparison: a number or a boolean.
  const ar = splitTop(toks, ['*', '/', '-', '%', '**', '<', '>', '<=', '>=', '===', '!==', '==', '!=', '|', '&', '^', '<<', '>>', '>>>']);
  if (ar.parts.length > 1 && ar.parts.every((p) => p.length)) return true;
  if (toks[0].t === 'p' && (toks[0].v === '-' || toks[0].v === '+' || toks[0].v === '!' || toks[0].v === '~')) return true;
  if (toks[0].t === 'id' && toks[0].v === 'typeof') return true;
  if (toks.length === 1) {
    const t = toks[0];
    if (t.t === 'str' || t.t === 'num' || t.t === 're') return true;
    if (t.t === 'tpl') return t.exprs.every((x) => safeOperand(x.toks) || containsHtml(x.toks));
    if (t.t === 'id') return MARKUP_NAME.test(t.v) || CONST_NAME.test(t.v) || ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'].includes(t.v);
  }
  // Parenthesised.
  const m = matchIndex(toks);
  if (toks[0].t === 'p' && toks[0].v === '(' && m[0] === toks.length - 1) return safeOperand(toks.slice(1, -1));
  // (window.casoraEsc || String)(x): the escaper with a fallback for tests without window.
  if (toks[0].t === 'p' && toks[0].v === '(' && m[0] > 0 && toks[m[0] + 1] && toks[m[0] + 1].v === '(' && m[m[0] + 1] === toks.length - 1) {
    const callee = toks.slice(1, m[0]).map((t) => t.v).join('');
    if (/^(?:window\.)?casoraEsc\|\|String$/.test(callee)) return true;
  }
  // Assignment used as a value (this._lbl = esc(x)): the assigned value counts.
  if (toks.length > 2 && toks[1].t === 'p' && toks[1].v === '=' || (toks.length > 4 && toks[0].v === 'this' && toks[3] && toks[3].v === '=')) {
    const k = toks.findIndex((t) => t.t === 'p' && t.v === '=');
    if (k > 0 && k < 4) return safeOperand(toks.slice(k + 1));
  }
  // Callee/member path: a.b.c(…) or a.b.c
  let i = 0, name = '';
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === 'id' && (name === '' || name.endsWith('.'))) { name += t.v; i++; continue; }
    if (t.t === 'p' && (t.v === '.' || t.v === '?.') && name) { name += '.'; i++; continue; }
    break;
  }
  if (!name) return false;
  if (i === toks.length && name.includes('.') && TOKEN_NS.test(name.split('.')[0]) && !/\(/.test(name)) return true;
  if (i < toks.length && toks[i].t === 'p' && toks[i].v === '(' && m[i] === toks.length - 1) {
    const args = toks.slice(i + 1, -1);
    if (TR_CALL.test(name) && args.length && args.every((a) => a.t === 'str' || (a.t === 'p' && a.v === ','))) return true;
    if (/(?:^|\.)casoraIconUrl$/.test(name) && args.length === 1 && args[0].t === 'str') return true;
    if (ESCAPERS.test(name) || BUILDERS.test(name) || NUM_CALL.test(name)) return true;
    const last = name.split('.').pop();
    if (NUM_METHOD.test(last) || MARKUP_NAME.test(last)) return true;
    if (/^(?:String|Math\.\w+)$/.test(name)) return safeOperand(toks.slice(i + 1, -1)); // String(x) is safe when x is
    return false;
  }
  if (i === toks.length) {
    const last = name.split('.').pop();
    if (NUM_METHOD.test(last) || MARKUP_NAME.test(last)) return true;
  }
  // Method chain ending in a number method: x.y(…).toFixed(1), x.length
  const lastTwo = toks.slice(-2);
  if (lastTwo.length === 2 && lastTwo[0].t === 'p' && (lastTwo[0].v === '.' || lastTwo[0].v === '?.') && lastTwo[1].t === 'id' && NUM_METHOD.test(lastTwo[1].v)) return true;
  if (toks[toks.length - 1].t === 'p' && toks[toks.length - 1].v === ')') {
    const o = m[toks.length - 1];
    if (o > 1 && toks[o - 1].t === 'id' && toks[o - 2].t === 'p' && /^\??\.$/.test(toks[o - 2].v) && NUM_METHOD.test(toks[o - 1].v)) return true;
    if (o > 0 && toks[o - 1].t === 'id' && MARKUP_NAME.test(toks[o - 1].v)) return true;
  }
  return false;
}

// Collect unsafe operands in a token list (and, recursively, inside template literals).
function scan(src, toks, report) {
  const m = matchIndex(toks);
  const seen = new Set();
  const operandStartBack = (i) => { // i = index of last token of operand; returns first index
    let j = i;
    for (;;) {
      const t = toks[j];
      if (t.t === 'p' && CLOSE[t.v] && m[j] >= 0) { j = m[j]; }
      if (j === 0) return 0;
      const p = toks[j - 1];
      if (p.t === 'p' && (p.v === '+' || BOUND.has(p.v) || OPEN[p.v])) return j;
      if (p.t === 'id' && BOUND_KW.has(p.v)) return j;
      if (p.t === 'p' && p.v === '}') return j;
      // a value directly before another value = statement boundary (ASI)
      if ((p.t !== 'p') && (toks[j].t !== 'p') && !(p.t === 'id' && toks[j].t === 'tpl')) return j;
      j--;
    }
  };
  const operandEndFwd = (i) => { // i = first token of operand; returns last index
    let j = i;
    for (;;) {
      const t = toks[j];
      if (t.t === 'p' && OPEN[t.v] && m[j] > j) j = m[j];
      if (j >= toks.length - 1) return toks.length - 1;
      const n = toks[j + 1];
      if (n.t === 'p' && (n.v === '+' || BOUND.has(n.v) || CLOSE[n.v])) return j;
      if (n.t === 'id' && BOUND_KW.has(n.v)) return j;
      if (n.t !== 'p' && toks[j].t !== 'p' && !(toks[j].t === 'id' && n.t === 'tpl')) return j;
      if (n.t === 'p' && n.v === '{' && !(toks[j].t === 'p')) return j;
      j++;
    }
  };
  // End of an expression starting at s0: up to ";", "," or a closing bracket at this level, or a new line that
  // starts a new statement.
  const exprEnd = (s0) => {
    let j = s0;
    for (; j < toks.length; j++) {
      const u = toks[j];
      if (u.t === 'p' && OPEN[u.v] && m[j] > j) { j = m[j]; continue; }
      if (u.t === 'p' && (u.v === ';' || u.v === ',' || CLOSE[u.v])) break;
      if (j > s0 && u.t !== 'p' && toks[j - 1].t !== 'p' && /\n/.test(src.slice(toks[j - 1].e, u.s))) break;
    }
    return j - 1;
  };
  // Innermost open bracket around each token.
  const parent = new Array(toks.length).fill(-1);
  {
    const st = [];
    toks.forEach((t, i) => {
      parent[i] = st.length ? st[st.length - 1] : -1;
      if (t.t === 'p' && OPEN[t.v] && m[i] > i) st.push(i);
      else if (t.t === 'p' && CLOSE[t.v] && st.length && m[i] === st[st.length - 1]) { st.pop(); parent[i] = st.length ? st[st.length - 1] : -1; }
    });
  }
  const SELECTOR_FN = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches']);
  const inSelectorCall = (i) => {
    const p = parent[i];
    return p > 0 && toks[p].v === '(' && toks[p - 1].t === 'id' && SELECTOR_FN.has(toks[p - 1].v);
  };
  // Names that hold markup: assigned or extended with an HTML string somewhere in this code.
  const htmlVars = new Set();
  for (let i = 0; i + 2 < toks.length; i++) {
    const t = toks[i], o = toks[i + 1];
    if (t.t !== 'id' || o.t !== 'p' || (o.v !== '=' && o.v !== '+=')) continue;
    const e0 = exprEnd(i + 2);
    if (containsHtml(toks.slice(i + 2, e0 + 1))) htmlVars.add(t.v);
  }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'tpl') {
      const html = t.parts.some(isHtmlText);
      t.exprs.forEach((x) => {
        if (html && !safeOperand(x.toks)) report(x.toks);
        scan(src, x.toks, report);
      });
    }
    // Direct sinks without a literal: el.innerHTML = x, el.insertAdjacentHTML(p, x), unsafeHTML(x), acc += x
    // (acc holds markup elsewhere in this code).
    if (t.t === 'id' && (t.v === 'innerHTML' || t.v === 'outerHTML') && toks[i + 1] && toks[i + 1].t === 'p'
      && (toks[i + 1].v === '=' || toks[i + 1].v === '+=')) {
      const s0 = i + 2, e0 = exprEnd(s0);
      const op = toks.slice(s0, e0 + 1);
      if (op.length && !safeOperand(op)) report(op);
    }
    if (t.t === 'id' && (t.v === 'insertAdjacentHTML' || t.v === 'unsafeHTML') && toks[i + 1] && toks[i + 1].v === '(' && m[i + 1] > i) {
      const args = splitTop(toks.slice(i + 2, m[i + 1]), [',']).parts;
      const op = args[args.length - 1];
      if (op && op.length && !safeOperand(op)) report(op);
    }
    if (t.t === 'id' && htmlVars.has(t.v) && toks[i + 1] && toks[i + 1].t === 'p' && toks[i + 1].v === '+='
      && !(toks[i - 1] && toks[i - 1].t === 'p' && /^\??\.$/.test(toks[i - 1].v))) {
      const s0 = i + 2, e0 = exprEnd(s0);
      const op = toks.slice(s0, e0 + 1);
      if (op.length && !containsHtml(op) && !safeOperand(op)) report(op);
    }
    if (!tokHtml(t) || seen.has(i)) continue;
    // A CSS selector ('[data-k="' + k + '"]' in querySelector/closest/matches) is no HTML.
    if (inSelectorCall(i)) continue;
    // Walk the "+" chain this literal is part of.
    let a = operandStartBack(i);
    while (a > 0 && toks[a - 1].t === 'p' && toks[a - 1].v === '+') a = operandStartBack(a - 2);
    // "x += '<b>' + y": the chain starts after "+=" anyway.
    let b = i;
    const ops = [];
    let k = a;
    for (;;) {
      const e = operandEndFwd(k);
      ops.push([k, e]);
      if (e + 1 < toks.length && toks[e + 1].t === 'p' && toks[e + 1].v === '+' && e + 2 < toks.length) { k = e + 2; continue; }
      b = e;
      break;
    }
    for (const [s, e] of ops) {
      const op = toks.slice(s, e + 1);
      if (op.length === 1 && tokHtml(op[0])) { seen.add(s); continue; }
      if (!safeOperand(op)) report(op);
    }
    void b;
  }
}

// ── Sources ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const SCRIPT_GLOBS = ['custom_components/casora/scripts', 'custom_components/casora/scripts/local', 'custom_components/casora/panel'];
export const TEMPLATES = 'dashboards/casora/button_card_templates.json';
// Fields whose plain string result button-card renders as HTML.
const HTML_FIELDS = /(?:^|\.)(?:name|label|state_display|custom_fields\.[\w-]+|state\[\d+\]\.(?:name|label|state_display))$/;

function lineOf(src, pos) { let n = 1; for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; }

export const ALLOW_DIR = path.join(ROOT, 'tools/html-escape-allow');
export function loadAllow(dir = ALLOW_DIR) {
  if (!fs.existsSync(dir)) return [];
  const text = fs.readdirSync(dir).sort().filter((f) => f.endsWith('.txt')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const parts = l.split(' | ').map((x) => (x || '').trim());
    // Optional last field: how many places the entry covers ("| 2"); one more place is reported.
    const max = parts.length >= 4 && /^\d+$/.test(parts[parts.length - 1]) ? Number(parts.pop()) : null;
    const [f, expr] = parts;
    const reason = parts.slice(2).join(' | ');
    if (!f || !expr || !reason) throw new Error('html-escape-allow: "file | expression | reason [| count]" expected: ' + l);
    const re = expr.startsWith('re:') ? new RegExp(expr.slice(3)) : null;
    return { f, expr, re, reason, max, used: 0, line: l };
  });
}

// where: for card templates the field path; an entry "file#casora_x" only covers template casora_x.
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

export function checkSource(file, src, allow, out, base = 0, where = '') {
  let toks;
  try { toks = lex(src).toks; } catch (e) { out.push({ file, line: 0, expr: 'LEX ERROR ' + e.message }); return; }
  scan(src, toks, (op) => {
    const text = exprText(src, op);
    if (allowed(allow, file, text, where)) return;
    out.push({ file, line: lineOf(src, op[0].s) + base, where, expr: text });
  });
}

// Every definition of an escaper name must escape & < > " ' (a partial one, e.g. quotes only, is what the
// review found). Definitions that are not HTML escapers at all (a keydown handler called esc) go in the allow
// list as "def <name>".
const CANON = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PROBE = '<img src=x onerror="a(1)">&\'';
export function checkEscapers(file, src, allow, out, where = '') {
  let toks;
  try { toks = lex(src).toks; } catch (e) { return; }
  const m = matchIndex(toks);
  const fakeWin = { casoraEsc: CANON, _casoraUI: { esc: CANON } };
  fakeWin.casoraEscJs = (v) => CANON(String(v));
  fakeWin.casoraSafeUrl = CANON;
  // The canonical block itself is checked by dev/unit/html_escape.mjs.
  const b0 = src.indexOf('// casora-esc:begin'), b1 = src.indexOf('// casora-esc:end');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (b0 >= 0 && t.s > b0 && t.s < b1) continue;
    let name = null, text = null;
    if (t.t === 'id' && t.v === 'function' && toks[i + 1] && toks[i + 1].t === 'id' && ESC_LOCAL.test(toks[i + 1].v)) {
      name = toks[i + 1].v;
      let j = i + 2;
      if (toks[j] && toks[j].v === '(') j = m[j] + 1;
      if (!toks[j] || toks[j].v !== '{' || m[j] < 0) continue;
      text = src.slice(t.s, toks[m[j]].e);
    } else if (t.t === 'id' && ESC_LOCAL.test(t.v) && toks[i + 1] && toks[i + 1].t === 'p' && toks[i + 1].v === '=' ) {
      name = t.v;
      let j = i + 2, e = j;
      for (; e < toks.length; e++) {
        const u = toks[e];
        if (u.t === 'p' && OPEN[u.v] && m[e] > e) { e = m[e]; continue; }
        if (u.t === 'p' && (u.v === ';' || u.v === ',' || CLOSE[u.v])) break;
        if (e > j && u.t !== 'p' && toks[e - 1].t !== 'p' && /\n/.test(src.slice(toks[e - 1].e, u.s))) break;
      }
      if (e === j) continue;
      text = src.slice(toks[j].s, toks[e - 1].e);
    } else continue;
    if (allowed(allow, file, 'def ' + name, where)) continue;
    let ok = false;
    try {
      const f = new Function('window', 'UI', 'H', 'T', 'return (' + text + ');')(fakeWin, { esc: CANON }, { esc: CANON }, {});
      const r = typeof f === 'function' ? f(PROBE) : null;
      ok = r === CANON(PROBE) || (name === 'escJs' && typeof r === 'string' && !/[<>"']/.test(r));
    } catch (e) { ok = false; }
    if (!ok) out.push({ file, line: lineOf(src, t.s), where, expr: 'escaper "' + name + '" does not escape & < > " \' fully: ' + text.replace(/\s+/g, ' ').slice(0, 160) });
  }
}

// Template fields rendered as HTML: "return <expr>;" with an unescaped value.
function checkReturns(file, body, allow, out, base, where) {
  const toks = lex(body).toks;
  const m = matchIndex(toks);
  // Only top-level returns (depth of braces 0 relative to the body, skip nested functions/arrows).
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'p' && t.v === '{') depth++;
    if (t.t === 'p' && t.v === '}') depth--;
    if (!(t.t === 'id' && t.v === 'return')) continue;
    // Inside a nested function? Approximation: a "=>" or "function" before an open "{" at this depth.
    let fn = false, d = 0;
    for (let j = i - 1; j >= 0; j--) {
      const u = toks[j];
      if (u.t === 'p' && u.v === '}' && m[j] >= 0) { j = m[j]; continue; }
      if (u.t === 'p' && u.v === ')' && m[j] >= 0) { j = m[j]; continue; }
      if (u.t === 'p' && u.v === '{') {
        const p = toks[j - 1], pp = toks[j - 2];
        if (p && p.t === 'p' && p.v === '=>') { fn = true; break; }
        if (p && p.t === 'p' && p.v === ')') {
          const o = m[j - 1];
          const before = toks[o - 1];
          if (before && before.t === 'id' && !['if', 'for', 'while', 'switch', 'catch', 'with'].includes(before.v)) { fn = true; break; }
          if (before && before.t === 'id' && before.v === 'function') { fn = true; break; }
          const b2 = toks[o - 2];
          if (b2 && b2.t === 'id' && b2.v === 'function') { fn = true; break; }
        }
        void pp; d++;
      }
    }
    void d;
    if (fn) continue;
    let e = i + 1;
    while (e < toks.length && !(toks[e].t === 'p' && (toks[e].v === ';' || toks[e].v === '}')) && !(toks[e].t === 'id' && e > i + 1 && toks[e - 1].t !== 'p' && toks[e].t !== 'p' && false)) {
      if (toks[e].t === 'p' && OPEN[toks[e].v] && m[e] > e) { e = m[e] + 1; continue; }
      // ASI: next line starts a new statement
      if (e > i + 1 && /\n/.test(body.slice(toks[e - 1].e, toks[e].s)) && toks[e - 1].t !== 'p' && toks[e].t !== 'p') break;
      e++;
    }
    const op = toks.slice(i + 1, e);
    if (!op.length) continue;
    // An object/array result is a card config, not HTML.
    if (op[0].t === 'p' && (op[0].v === '{' || op[0].v === '[')) continue;
    if (safeOperand(op)) continue;
    const text = exprText(body, op);
    if (allowed(allow, file, 'return ' + text, where) || allowed(allow, file, text, where)) continue;
    out.push({ file, line: lineOf(body, op[0].s) + base, where, expr: 'return ' + text });
  }
}

export function checkTemplates(file, allow, out) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s.startsWith('[[[') || !s.endsWith(']]]')) return;
      const body = s.slice(3, -3);
      const w = where;
      checkSource(file, body, allow, out, 0, w);
      checkEscapers(file, body, allow, out, w);
      // Variables are no sink themselves (the template that shows them is checked).
      if (HTML_FIELDS.test(w.replace(/^[^.]+\./, '')) && !/\.variables\./.test(w)) checkReturns(file, body, allow, out, 0, w);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k);
  };
  walk(doc, '');
}

export function listScripts() {
  const files = [];
  for (const d of SCRIPT_GLOBS) {
    for (const f of fs.readdirSync(path.join(ROOT, d)).sort()) if (f.endsWith('.js')) files.push(d + '/' + f);
  }
  return files;
}

export function run(files) {
  const allow = loadAllow();
  const out = [];
  const list = files && files.length ? files : listScripts().concat([TEMPLATES]);
  for (const f of list) {
    if (f.endsWith('.json')) checkTemplates(f, allow, out);
    else {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      checkSource(f, src, allow, out);
      checkEscapers(f, src, allow, out);
    }
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
  for (const a of unused) console.log(`allow list entry not used any more` + (a.used ? ` (covers ${a.max}, used ${a.used})` : '') + `: ${a.f} | ${a.expr}`);
  console.log(`${out.length} unescaped value(s) in HTML strings` + (unused.length ? `, ${unused.length} stale allow entr(y/ies)` : ''));
  process.exit(out.length || unused.length ? 1 : 0);
}
