// Parts of a big script file for the patch gate's selection (dev/qa/auswahl.mjs): which named parts does a diff
// touch, and which names outside the file (globals, custom elements, templates) reach those parts?
// Without a JS parser: a small scanner that tracks strings, template literals, comments and regex literals well
// enough to match braces in Casora's own scripts. Anything it cannot place stays "unplaced" and the caller falls
// back to the broad selection.
//
//   units(src)            → [{ name, kind, start, end, outer }]  (1-based lines, start..end inclusive)
//   hunks(diff)           → [{ start, end }] new-file line ranges of a `git diff -U0` (a pure deletion: one line)
//   placed(src, ranges)   → { parts: [unit…], unplaced: [range…] }   innermost unit per range
//   reach(src, parts, exposedOf)   → Set of exposed names (globals/elements) whose code reaches the parts

// Brace depth at the start of every line (index 0 = line 1). Skips strings, template text, comments, regexes.
export function depths(src) {
  const out = [0];
  let d = 0, i = 0, line = 0;
  const n = src.length;
  const tpl = [];             // brace depth at which each open template literal's ${ … } started
  let prevSig = '';           // last significant character (for regex detection)
  let prevWord = '';
  const nl = () => { line++; out[line] = d; };
  const regexOK = () => !prevSig || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig) || /^(return|typeof|case|in|of|delete|void|throw|new|else|do)$/.test(prevWord);
  while (i < n) {
    const c = src[i];
    if (c === '\n') { nl(); i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') nl(); i++; } i += 2; continue; }
    if (c === '"' || c === "'") {
      i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; else if (src[i] === '\n') break; i++; } i++; prevSig = c; prevWord = ''; continue;
    }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === d)) {
      // template text: from a backtick, or back from a ${ … } to the template
      if (c === '}') tpl.pop();
      i++;
      while (i < n) {
        const t = src[i];
        if (t === '\\') { i += 2; continue; }
        if (t === '\n') { nl(); i++; continue; }
        if (t === '`') { i++; break; }
        if (t === '$' && src[i + 1] === '{') { i += 2; tpl.push(d); break; }
        i++;
      }
      prevSig = '`'; prevWord = ''; continue;
    }
    if (c === '/' && regexOK()) {
      i++; let cls = false;
      while (i < n && src[i] !== '\n') { const r = src[i]; if (r === '\\') { i += 2; continue; } if (r === '[') cls = true; else if (r === ']') cls = false; else if (r === '/' && !cls) break; i++; }
      i++; while (i < n && /[a-z]/i.test(src[i])) i++;
      prevSig = '/'; prevWord = ''; continue;
    }
    if (c === '{') d++;
    else if (c === '}') d = Math.max(0, d - 1);
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; prevWord = src.slice(i, j); prevSig = 'a'; i = j; continue; }
    if (!/\s/.test(c)) { prevSig = c; prevWord = ''; }
    i++;
  }
  return out;
}

// Definitions a test can reach by name, and the internal ones that only code in the file calls.
const DEFS = [
  [/^\s*customElements\.define\(\s*['"]([a-z0-9-]+)['"]/, 'element'],
  [/^\s*(?:if\s*\(![^)]*\)\s*)?window\.([A-Za-z_$][\w$]*)\s*=(?!=)/, 'global'],
  [/^\s*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/, 'function'],
  [/^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>|\{|\[|new\s|class\b)/, 'function'],
  [/^\s*class\s+([A-Za-z_$][\w$]*)/, 'class'],
  [/^\s*([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/, 'member'],
  [/^\s{2,8}(?:static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/, 'method'],
  [/^\s*[;!]?\s*\(\s*(?:async\s+)?(?:function\s*\(|\(\)\s*=>)/, 'iife'],
  [/^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=(?!=)/, 'value'],
];

export function units(src) {
  const lines = src.split('\n');
  const dep = depths(src);
  const out = [];
  // Marker regions: "// name:start" … "// name:end".
  const open = new Map();
  lines.forEach((l, k) => {
    const m = l.match(/^\s*\/\/\s*([a-z0-9-]+):(start|end)\b/);
    if (!m) return;
    if (m[2] === 'start') open.set(m[1], k + 1);
    else if (open.has(m[1])) { out.push({ name: m[1], kind: 'marker', start: open.get(m[1]), end: k + 1 }); open.delete(m[1]); }
  });
  lines.forEach((l, k) => {
    for (const [re, kind] of DEFS) {
      const m = l.match(re);
      if (!m) continue;
      if (kind === 'method' && /^(if|for|while|switch|catch|function|return|else)$/.test(m[1])) continue;
      if (kind === 'iife') m[1] = 'iife@' + (k + 1);
      const d0 = dep[k];
      // The definition ends where the depth falls back to d0 after the line, or on its own line when it opens
      // nothing (a one-line assignment).
      let end = k + 1;
      if ((dep[k + 1] ?? d0) > d0) { let j = k + 1; while (j < lines.length && dep[j] > d0) j++; end = j; }
      else if (!/;\s*(\/\/.*)?$/.test(lines[k])) {
        // a statement over several lines without braces ("var CSS = '…'\n + '…';"): up to its semicolon
        let j = k + 1; while (j < lines.length && j < k + 400 && dep[j] === d0 && !/;\s*(\/\/.*)?$/.test(lines[j])) j++;
        if (j < lines.length && dep[j] === d0) end = j + 1;
      }
      out.push({ name: m[1], kind, start: k + 1, end, depth: d0 });
      break;
    }
  });
  // Locals inside a function are part of that function, not parts of their own.
  for (let i = out.length - 1; i >= 0; i--) {
    const v = out[i];
    if (v.kind === 'value' && out.some((u) => u !== v && u.kind !== 'iife' && u.kind !== 'marker' && u.start <= v.start && v.end <= u.end && (u.end - u.start) > (v.end - v.start))) out.splice(i, 1);
  }
  // Keys of a global object literal ("window.casoraDevice = { waste: function … }"): parts "casoraDevice.waste".
  for (const g of out.filter((u) => u.kind === 'global' && u.end > u.start && /=\s*(?:[\w.$]+\s*\|\|\s*)?\{\s*$/.test(lines[u.start - 1]))) {
    for (let k = g.start; k < g.end - 1; k++) {
      if (dep[k] !== g.depth + 1) continue;
      const m = lines[k].match(/^\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*(?::|\([^)]*\)\s*\{)/);
      if (!m) continue;
      let j = k + 1; while (j < lines.length && dep[j] > dep[k]) j++;
      out.push({ name: g.name + '.' + m[1], kind: 'prop', start: k + 1, end: Math.max(k + 1, j), depth: dep[k] });
    }
  }
  return out;
}

export function hunks(diff) {
  const out = [];
  for (const m of diff.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = +m[2], len = m[3] === undefined ? 1 : +m[3];
    out.push(len ? { start, end: start + len - 1 } : { start: Math.max(1, start), end: Math.max(1, start), deleted: true });
  }
  return out;
}

// Innermost unit around each range (a range spanning two units is split per line).
export function placed(src, ranges, all = units(src)) {
  const parts = new Map(), unplaced = [];
  const lines = src.split('\n');
  const quiet = (ln) => /^\s*(\/\/.*|\/?\*.*|\*\/\s*)?$/.test(lines[ln - 1] ?? '');
  for (const r of ranges) {
    for (let ln = r.start; ln <= r.end; ln++) {
      if (!r.deleted && quiet(ln)) continue;
      const around = all.filter((u) => u.start <= ln && ln <= u.end);
      if (!around.length) { unplaced.push({ start: ln, end: ln }); continue; }
      around.sort((a, b) => (a.end - a.start) - (b.end - b.start));
      const u = around[0];
      parts.set(u.kind + ':' + u.name + ':' + u.start, u);
    }
  }
  return { parts: [...parts.values()], unplaced };
}

// Names outside the file that reach a set of parts. Exposed parts (element, global) are their own name; a marker region
// exposes what it defines; an internal part is reached through the innermost exposed unit around it (a method of a
// class registered as an element, a helper inside a global's body), otherwise through the units that call it by a
// name unique in the file (transitively). An IIFE reaches everything it exposes. Returns null when a part leads to
// no exposed name or to too many (the caller then selects broadly). Names reached only through the IIFE fallback are
// in result.weak (the caller keeps only the specific ones).
export const COMMON = /^(setTimeout|setInterval|requestAnimationFrame|addEventListener|then|open|close|start|end|move|live|run|go|set|get|add|del|keys|key|next|prev|init|load|show|hide|draw|paint|render|update|sync|apply|tick|fire|ask|row|rows|sec|list|item|items|value|name|label|text|html|el|els|tr|h|S|U|B|K|Z|C|L|AL|M|P|R|T|UI)$/;
export function reach(src, parts, all = units(src), max = 40) {
  const lines = src.split('\n');
  const text = (u) => lines.slice(u.start - 1, u.end).join('\n');
  const exposed = all.filter((u) => u.kind === 'element' || u.kind === 'global');
  const defCount = new Map();
  all.forEach((u) => { if (u.kind === 'prop') return; const s = u.name.split('.').pop(); defCount.set(s, (defCount.get(s) || 0) + 1); });
  const names = new Set();
  const weak = new Set();   // reached only as "something else in the same module" (IIFE fallback)
  const seen = new Set();
  // Local names for globals: "var S = window._casoraX = …", "const U = window._casoraUI".
  const aliases = [];
  lines.forEach((l, k) => { const m = l.match(/^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.([A-Za-z_$][\w$]*)/); if (m) aliases.push({ local: m[1], global: m[2], line: k + 1 }); });
  const word = (n) => new RegExp('(?<![\\w$])' + n.replace(/[.$]/g, '\\$&') + '(?![\\w$])');
  const queue = parts.map((u) => [u, 0, false]);
  while (queue.length) {
    const [u, depth, viaModule] = queue.shift();
    const into = viaModule ? weak : names;
    const key = u.kind + ':' + u.name + ':' + u.start;
    if (seen.has(key)) continue;
    seen.add(key);
    if (u.kind === 'element' || u.kind === 'global' || u.kind === 'prop') { into.add(u.name); continue; }
    if (u.kind === 'marker' || u.kind === 'iife') {
      const inner = exposed.filter((e) => e.start >= u.start && e.end <= u.end).map((e) => e.name)
        .concat(aliases.filter((x) => x.line >= u.start && x.line <= u.end).map((x) => x.global));
      if (!inner.length) return null;
      // A changed line right in a module's body (not inside one of its definitions) counts like a change of each of
      // them; a part only reached as "same module" is weak.
      const tgt = u.kind === 'iife' && !viaModule && !parts.includes(u) ? weak : into;
      inner.forEach((n) => tgt.add(n));
      if (u.kind === 'marker') into.add(u.name);
      continue;
    }
    const around = all.filter((e) => (e.kind === 'element' || e.kind === 'global' || e.kind === 'prop') && e.start <= u.start && u.end <= e.end && e !== u).sort((a, b) => (a.end - a.start) - (b.end - b.start));
    if (around.length) { queue.push([around[0], depth, viaModule]); continue; }
    // Nested in another definition (a method in its class, a helper in a function): reached through that one.
    const outer = all.filter((e) => e !== u && e.kind !== 'iife' && e.kind !== 'marker' && e.start <= u.start && u.end <= e.end
      && (e.end - e.start) > (u.end - u.start)).sort((a, b) => (a.end - a.start) - (b.end - b.start));
    if (outer.length) { queue.push([outer[0], depth, viaModule]); continue; }
    if (u.kind === 'class') {
      const reg = exposed.filter((e) => e.kind === 'element' && word(u.name).test(text(e)));
      if (reg.length) { reg.forEach((e) => queue.push([e, depth, viaModule])); continue; }
    }
    // A member of an object that is a global under another name ("var S = window._casoraLightSoft = …; S.foo = …").
    // … and still through its callers below (other code of the module may expose it under another name).
    let aliased = false;
    if (u.kind === 'member') {
      const obj = u.name.split('.')[0];
      const al = aliases.filter((x) => x.local === obj && x.line <= u.start).pop();
      if (al) { into.add(al.global); aliased = true; }
    }
    const iife = all.filter((e) => e.kind === 'iife' && e.start <= u.start && u.end <= e.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    const short = u.name.split('.').pop();
    let callers = [];
    if (depth < 4 && !COMMON.test(short) && short.length >= 4 && (defCount.get(short) || 0) <= 1) {
      const re = u.kind === 'member' || u.kind === 'method' ? new RegExp('\\.' + short.replace(/\$/g, '\\$') + '(?![\\w$])') : word(u.name);
      callers = all.filter((c) => c !== u && c.kind !== 'iife' && c.kind !== 'marker' && !(c.start <= u.start && u.end <= c.end) && re.test(text(c)));
      // Callers nested in one another: the innermost one is enough.
      callers = callers.filter((c) => !callers.some((o) => o !== c && c.start <= o.start && o.end <= c.end));
    }
    if (callers.length) { callers.forEach((c) => queue.push([c, depth + 1, viaModule])); continue; }
    if (aliased) continue;
    // No caller by a unique name: everything its module (the IIFE around it) exposes – weakly.
    if (iife) { queue.push([iife, depth, true]); continue; }
    return null;
  }
  if (names.size > max) return null;
  for (const n of names) weak.delete(n);
  names.weak = weak;
  return names;
}
