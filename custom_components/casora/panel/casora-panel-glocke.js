// Studio → Einstellungen → Glocke & Meldungen: „Nicht melden“ (1.1.2)
//
// Geräte/Sensoren, die nie einen Eintrag in der Glocke erzeugen sollen. Gespeichert als
// Casora-Einstellung notify.exclude (casora/settings/*, window.CASORA_SETTINGS) – gilt für alle
// Dashboards, Desktop und Handy. Die Glocke (casora-core.js, excludes) lässt diese Entitäten aus,
// auch im Zähler. Zur Auswahl stehen nur Entitäten, die überhaupt melden können
// (window.casoraNotifySources aus scripts/local/00-finden.js) – nach Raum, mit Suche, Meldungsart
// und ob sie gerade melden. Eigener Abschnitt unter dem Bereich „Benachrichtigungen“.
(function () {
  const W = window;
  const tr = (s) => (W.casoraI18n ? W.casoraI18n.t(s) : s);
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m));

  // Meldungsart je Quelle (Schlüssel aus casoraNotifySources).
  const KIND = {
    window: "Window open", door: "Door open", garage: "Garage open", battery: "Low battery",
    lock: "Lock", alarm: "Alarm", doorbell: "Doorbell", person: "Arrivals and departures",
    vacuum: "Vacuum", appliance: "Appliance done", update: "Update", water: "Water detected",
    smoke: "Smoke detected", gas: "Gas detected", co: "Carbon monoxide", safety: "Safety warning",
    co2: "High carbon dioxide", plant: "Plant care", mail: "Mailbox", warning: "Weather warning",
    care: "Appliance care",
  };
  const kinds = (x) => x.kinds.map((k) => tr(KIND[k] || k)).join(", ");

  const CSS = ".gx-add .mbox{max-height:min(78vh, 680px)}"
    + ".gx-add .gxh{padding:16px 16px 0;font-size:var(--t-callout, 15px);font-weight:650}"
    + ".gx-add .gxh span{display:block;margin-top:3px;font-size:var(--t-foot, 13px);font-weight:400;color:var(--ink-2, #8a8a8e)}"
    + ".gx-add .mrow .mtx{display:flex;flex-direction:column;align-items:flex-start;gap:1px}"
    + ".gx-add .mrow .mtx b{max-width:100%;overflow:hidden;text-overflow:ellipsis}"
    + ".gx-add .mrow .msub{margin-left:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}"
    + ".gx-add .mrow .mkind.gx-now{color:var(--casora-studio-warn, #ff9f0a);font-weight:600}"
    + ".frow.gx-row .rtext{flex:1 1 auto;min-width:0}"
    + ".frow.gx-row .casora-x{margin-left:auto}"
    + ":host(.is-light) .gx-add .mrow .mkind.gx-now{color:#b25000}";

  const areaName = (hass, id) => {
    const R = hass.entities || {}, D = hass.devices || {}, A = hass.areas || {};
    const e = R[id];
    const aid = e && (e.area_id || (D[e.device_id] || {}).area_id);
    return (aid && A[aid] && A[aid].name) || "";
  };
  const nameOf = (hass, id) => {
    const st = (hass.states || {})[id];
    return (st && st.attributes && st.attributes.friendly_name) || id;
  };

  // Geräte, die die Glocke dieses Dashboards zusätzlich beobachtet (Studio „Benachrichtigungen“).
  const dashAppliances = (panel) => {
    const out = [];
    const rooms = (panel._state && panel._state.compact && panel._state.compact.rooms) || [];
    rooms.forEach((r) => {
      const v = (r && r.variables && r.variables.notification_appliances) || [];
      (Array.isArray(v) ? v : []).forEach((id) => { if (typeof id === "string" && !out.includes(id)) out.push(id); });
    });
    return out;
  };

  // Alle meldefähigen Entitäten mit Name, Raum, Arten – ohne die schon ausgenommenen.
  const candidates = (panel, S) => {
    const hass = panel._hass || {};
    if (typeof W.casoraNotifySources !== "function") return [];
    const ex = (S.notify && S.notify.exclude) || [];
    return W.casoraNotifySources(hass, { appliances: dashAppliances(panel), notify: S.notify || {} })
      .filter((x) => !ex.includes(x.entity))
      .map((x) => ({ ...x, name: nameOf(hass, x.entity), room: areaName(hass, x.entity), what: kinds(x) }));
  };

  // Auswahl wie „Was soll aufs Dashboard?“ (casora-panel-b-ux.js): Suchfeld, Liste nach Raum.
  const css = (panel) => {
    const root = panel.shadowRoot;
    if (root && !root.getElementById("gx-css")) {
      const st = document.createElement("style");
      st.id = "gx-css";
      st.textContent = CSS;
      root.appendChild(st);
    }
  };

  function openPicker(panel, S, render) {
    const root = panel.shadowRoot;
    if (panel._mCss) panel._mCss();
    css(panel);
    if (root.querySelector(".gx-add")) { root.querySelector(".gx-add input").focus(); return; }
    const phone = panel.classList.contains("phone");
    const from = root.activeElement;
    const all = candidates(panel, S);
    const box = document.createElement("div");
    box.className = "msearch gx-add";
    box.setAttribute("data-no-i18n", "");
    box.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><div class="gxh"><b></b><span></span></div><div class="mfield">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'
      + '<input type="text" enterkeyhint="go" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="gxres" aria-autocomplete="list">'
      + '<span class="mesc">esc</span></div><div class="mres" id="gxres" role="listbox"></div></div>';
    const title = tr("Which device should the bell ignore?");
    box.querySelector(".gxh b").textContent = title;
    box.querySelector(".gxh span").textContent = tr("Only devices that can create an entry in the bell.");
    box.querySelector(".mbox").setAttribute("aria-label", title);
    const input = box.querySelector("input");
    input.placeholder = tr("Search a device, room or message");
    input.setAttribute("aria-label", tr("Search a device"));
    if (phone) box.querySelector(".mesc").remove();
    const res = box.querySelector(".mres");
    let list = [], at = 0;
    const esc = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(true); } };
    const close = (refocus) => {
      document.removeEventListener("keydown", esc, true);
      box.remove();
      if (refocus && from && from.focus) from.focus();
    };
    const pick = (c) => {
      close(false);
      S.notify = S.notify || {};
      S.notify.exclude = Array.isArray(S.notify.exclude) ? S.notify.exclude : [];
      if (!S.notify.exclude.includes(c.entity)) S.notify.exclude.push(c.entity);
      render();
    };
    const mark = () => {
      res.querySelectorAll(".mrow").forEach((b, k) => { b.classList.toggle("on", k === at); b.setAttribute("aria-selected", k === at ? "true" : "false"); });
      input.setAttribute("aria-activedescendant", "gxopt" + at);
      const cur = res.querySelector("#gxopt" + at);
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
    };
    const row = (c, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mrow" + (k === at ? " on" : "");
      b.id = "gxopt" + k;
      b.dataset.entity = c.entity;
      b.setAttribute("role", "option");
      b.innerHTML = '<span class="mtx"><b></b><span class="msub"></span></span><span class="mkind"></span>';
      b.querySelector("b").textContent = c.name;
      b.querySelector(".msub").textContent = c.what;
      const now = b.querySelector(".mkind");
      if (c.active) { now.textContent = tr("Reports now"); now.classList.add("gx-now"); }
      // Für Profis: die Entitäts-ID beim Zeigen.
      b.title = c.entity;
      b.onpointermove = () => { if (at !== k) { at = k; mark(); } };
      b.onclick = () => pick(c);
      res.appendChild(b);
    };
    const paint = () => {
      res.innerHTML = "";
      const q = input.value.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      const hit = (c) => {
        const hay = (c.name + " " + c.room + " " + c.what + " " + c.entity).toLowerCase();
        return words.every((w) => hay.includes(w));
      };
      const shown = all.filter(hit);
      // Nach Raum (alphabetisch, ohne Raum zuletzt); im Raum: was gerade meldet zuerst, dann Name.
      const rooms = [...new Set(shown.map((c) => c.room))]
        .sort((a, b) => (!a) - (!b) || a.localeCompare(b));
      list = [];
      rooms.forEach((r) => {
        const head = document.createElement("div");
        head.className = "mhead";
        head.textContent = r || tr("No area");
        res.appendChild(head);
        shown.filter((c) => c.room === r)
          .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name))
          .forEach((c) => { list.push(c); row(c, list.length - 1); });
      });
      if (!list.length) {
        const e = document.createElement("div");
        e.className = "mempty";
        e.textContent = all.length ? tr("No device found. Try another word.")
          : tr("No device here can create an entry in the bell.");
        res.appendChild(e);
      }
      at = Math.min(at, Math.max(0, list.length - 1));
      mark();
    };
    input.addEventListener("input", () => { at = 0; paint(); });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!list.length) return;
        at = (at + (ev.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
        mark();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (list[at]) pick(list[at]);
      }
    });
    document.addEventListener("keydown", esc, true);
    box.addEventListener("pointerdown", (ev) => { if (ev.target === box) close(true); });
    root.appendChild(box);
    paint();
    // Am Handy nicht gleich die Tastatur: erst die Liste sehen.
    if (!phone) setTimeout(() => input.focus(), 20);
  }

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraGlocke) return;
    P.__casoraGlocke = true;
    // Gleicher Finder wie im Dashboard; im Studio sonst erst über casora-panel-types.js geladen.
    if (!W.casoraNotifySources) import("/casora_scripts/local/00-finden.js").catch(() => {});

    P._casoraBellExclude = function (host, S, render) {
      const hass = this._hass || {};
      css(this);
      // Beim Anzeigen nichts in den Entwurf schreiben – sonst meldet das Studio sofort „Ungespeicherte Änderungen“.
      const ex = Array.isArray(S.notify && S.notify.exclude) ? S.notify.exclude : [];
      const list = this._flowGroup(host, { header: tr("Don't notify"),
        footer: tr("These devices never create an entry in the bell – in every dashboard, on desktop and phone.") });
      list.parentElement.dataset.pkey = "notify_exclude";
      const src = {};
      if (typeof W.casoraNotifySources === "function") {
        W.casoraNotifySources(hass, { appliances: dashAppliances(this), notify: S.notify || {} }).forEach((x) => { src[x.entity] = x; });
      }
      ex.forEach((id, i) => {
        const x = src[id];
        const room = areaName(hass, id);
        const sub = !(hass.states || {})[id] ? tr("Not found in Home Assistant")
          : [room, x ? kinds(x) : ""].filter(Boolean).join(" · ");
        const r = this._flowRow(list, { title: nameOf(hass, id), sub, raw: true });
        r.row.classList.add("gx-row");
        r.row.dataset.entity = id;
        r.row.title = id;
        const s = r.row.querySelector(".rtext > span");
        if (s) s.setAttribute("data-no-i18n", "");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "casora-x";
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
        b.title = tr("Notify again");
        b.setAttribute("aria-label", tr("Notify again") + ": " + nameOf(hass, id));
        b.onclick = () => { ex.splice(i, 1); render(); };
        r.row.appendChild(b);
      });
      const I = W.__casoraPanelInternals || { FLOW_TINT: {} };
      const add = this._flowRow(list, { icon: "plus", tint: (I.FLOW_TINT || {}).teal, title: tr("Add device…"),
        onTap: () => openPicker(this, S, render) });
      add.row.classList.add("gx-addrow");
    };

    // Unter den Bereich „Benachrichtigungen“ (casora-panel-personal.js) hängen, ohne ihn umzubauen.
    const groups = P._casoraPersonalGroups;
    if (typeof groups !== "function") return;
    P._casoraPersonalGroups = function (host, S, keys, render) {
      const r = groups.apply(this, arguments);
      if ((keys || []).includes("notify")) {
        try { this._casoraBellExclude(host, S, render); } catch (e) { console.warn("Casora: bell exceptions", e); }
      }
      return r;
    };
  });
})();
