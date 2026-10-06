// Übersetzer für das Casora-Panel.
//
// Das Panel (casora-panel.js) schreibt seine Texte auf Englisch. Dieser Teil
// folgt der HA-Sprache des Benutzers und ersetzt sichtbare Texte anhand der
// Tabellen – nur exakte UI-Texte, nie Werte von Eingabefeldern (deren
// Platzhalter, Titel und aria-label schon). Die Originale werden
// gemerkt, damit ein Sprachwechsel ohne Neuladen zurückschalten kann.
//
// Fehlende Texte sammeln: in der Browser-Konsole casoraI18nMissing() aufrufen.
(() => {
  if (window.__casoraPanelI18n) return;
  window.__casoraPanelI18n = true;

  const TABLES = /*__TABLES__*/{};
  const ATTRS = ["placeholder", "title", "aria-label", "label", "helper", "heading"];
  const PROPS = ["label", "helper", "heading", "placeholder"];
  const SKIP = new Set(["INPUT", "TEXTAREA", "SCRIPT", "STYLE", "CODE", "PRE"]);

  const orig = new WeakMap();   // Textknoten → Originaltext
  const wrote = new WeakMap();  // Textknoten → was wir zuletzt geschrieben haben
  const attrOrig = new WeakMap(); // Element → {name: original}
  const attrWrote = new WeakMap();
  const missing = new Set();
  let lang = "en";
  let compiled = null;
  let root = null;
  let queued = false;
  const dirty = new Set();

  function table() {
    if (compiled && compiled.lang === lang) return compiled.t;
    const t = TABLES[lang] || TABLES[lang.split("-")[0]] || null;
    compiled = { lang, t: t && { exact: t.exact, patterns: (t.patterns || []).map(([re, rep]) => [new RegExp(re), rep]) } };
    return compiled.t;
  }

  // Ergebnis je Text für die aktuelle Sprache: dieselben Texte kommen bei jedem Neuzeichnen
  // wieder, die Muster (reguläre Ausdrücke) liefen sonst jedes Mal für jeden Text durch.
  let memo = null;

  // Übersetzung für einen sichtbaren Text, oder null, wenn keine vorliegt.
  function tr(text) {
    const key = text.trim();
    if (!key || !/[A-Za-z]{2}/.test(key)) return null;
    const t = table();
    if (!t) return null;
    if (!memo || memo.lang !== lang || memo.m.size > 5000) memo = { lang, m: new Map() };
    if (memo.m.has(key)) {
      const hit = memo.m.get(key);
      return hit == null ? null : text.replace(key, hit);
    }
    const v = lookup(t, key);
    memo.m.set(key, v);
    return v == null ? null : text.replace(key, v);
  }

  function lookup(t, key) {
    let v = Object.prototype.hasOwnProperty.call(t.exact, key) ? t.exact[key] : null;
    if (v == null) {
      // Muster: {1}, {2} … sind die Gruppen des Ausdrucks; sie werden selbst
      // übersetzt, wenn es dafür einen Eintrag gibt („Expand Climate“ → „Klima aufklappen“).
      for (const [re, rep] of t.patterns) {
        const m = key.match(re);
        if (!m) continue;
        v = rep.replace(/\{(\d+)\}/g, (_, i) => {
          const g = m[+i] || "";
          return Object.prototype.hasOwnProperty.call(t.exact, g) ? t.exact[g] : g;
        });
        break;
      }
    }
    if (v == null) {
      if (lang !== "en" && key.length < 200) missing.add(key);
      return null;
    }
    return v;
  }

  function skipped(node) {
    for (let p = node.parentNode; p && p !== root; p = p.parentNode) {
      if (p.nodeType !== 1) break;
      if (SKIP.has(p.tagName) || p.isContentEditable || p.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  }

  // skip: schon bekannt (beim Durchgehen vom Elternteil geerbt), sonst selbst nachsehen.
  function doText(n, skip) {
    if (skip === undefined ? skipped(n) : skip) return;
    // Hat das Panel den Text selbst geändert, ist das der neue Originaltext.
    if (!orig.has(n) || n.nodeValue !== wrote.get(n)) orig.set(n, n.nodeValue);
    const o = orig.get(n);
    const want = tr(o) ?? o;
    wrote.set(n, want);
    if (n.nodeValue !== want) n.nodeValue = want;
  }

  function doAttrs(el) {
    let o = attrOrig.get(el);
    let w = attrWrote.get(el);
    if (!o) { o = {}; w = {}; attrOrig.set(el, o); attrWrote.set(el, w); }
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      if (!(a in o) || cur !== w[a]) o[a] = cur;
      const want = tr(o[a]) ?? o[a];
      w[a] = want;
      if (cur !== want) el.setAttribute(a, want);
    }
    // HA-Komponenten (ha-textfield, ha-select …) bekommen Beschriftungen als Eigenschaft.
    if (el.tagName.includes("-")) {
      for (const p of PROPS) {
        const cur = el[p];
        if (typeof cur !== "string" || !cur) continue;
        const k = "prop:" + p;
        if (!(k in o) || cur !== w[k]) o[k] = cur;
        const want = tr(o[k]) ?? o[k];
        w[k] = want;
        if (cur !== want) el[p] = want;
      }
    }
  }

  // skip: Texte darunter nicht übersetzen – für den Startknoten einmal über die Vorfahren
  // ermittelt und dann vererbt (vorher lief jeder Textknoten selbst bis zur Wurzel hoch).
  function walk(node, skip) {
    if (!node) return;
    if (node.nodeType === 3) { doText(node, skip); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      // Eingabefelder: nie den Wert, aber Platzhalter/Titel/aria-label schon.
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
        if (!node.hasAttribute("data-no-i18n")) doAttrs(node);
        return;
      }
      if (SKIP.has(node.tagName) && node.tagName !== "PRE") return;
      doAttrs(node);
    }
    let s = skip === undefined ? (node.nodeType === 1 && skipped(node)) : skip;
    if (!s && node.nodeType === 1) s = SKIP.has(node.tagName) || node.isContentEditable || node.hasAttribute("data-no-i18n");
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c, s);
  }

  function flush() {
    queued = false;
    const nodes = [...dirty];
    dirty.clear();
    nodes.forEach((n) => walk(n));
  }

  // Gleich nach dem Einfügen übersetzen (Mikrotask), nicht erst im nächsten Frame:
  // Rendert das Panel selbst in einem requestAnimationFrame, käme ein Frame-Rückruf von
  // hier erst einen Frame später – dazwischen stünde kurz der englische Text.
  function queue(n) {
    dirty.add(n);
    if (!queued) { queued = true; queueMicrotask(flush); }
  }

  function attach(sr) {
    if (!sr || sr.__casoraI18n) return;
    sr.__casoraI18n = true;
    root = sr;
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList") m.addedNodes.forEach(queue);
        else if (m.type === "characterData") queue(m.target);
        else if (m.type === "attributes") queue(m.target);
      }
    }).observe(sr, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(sr);
  }

  customElements.whenDefined("casora-panel").then(() => {
    const C = customElements.get("casora-panel");
    const desc = Object.getOwnPropertyDescriptor(C.prototype, "hass");
    if (!desc || !desc.set || C.prototype.__casoraI18nHooked) return;
    C.prototype.__casoraI18nHooked = true;
    Object.defineProperty(C.prototype, "hass", {
      configurable: true,
      get: desc.get,
      set(h) {
        desc.set.call(this, h);
        const next = (h && ((h.locale && h.locale.language) || h.language)) || "en";
        attach(this.shadowRoot);
        if (next !== lang) {
          lang = next;
          if (this.shadowRoot) walk(this.shadowRoot);
        }
      },
    });
  });

  window.casoraI18nMissing = () => [...missing].sort();
  // Für Casora-Erweiterungen: einzelnen Text in der aktuellen Sprache (sonst unverändert).
  window.casoraI18n = { t: (s) => (s && tr(String(s))) || s };
})();
