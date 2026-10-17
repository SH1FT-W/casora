// Studio → Einstellungen → „Live Activities“ (live_activity.py, 17.10.2026)
//
// Live-Aktivitäten auf dem Handy (iOS Sperrbildschirm/Dynamic Island, Android Live Updates) für
// Waschmaschine, Trockner, Geschirrspüler, Saugroboter und 3D-Drucker – Casora findet die Geräte wie
// seine Kacheln (live_finder.py) und schickt die Benachrichtigungen selbst. Hier: Empfänger einmal
// wählen, je Gerät Schalter und Einstellungen (Fertig-Dauer, leise Zwischenstände, Takt), eine Probe
// senden und das Protokoll der letzten Sendungen lesen. Entwurf und Speichern laufen über die
// Einstellungen-Seite (casora-panel-settings.js: _csLiveLoad/_csLiveDirty/_csLiveSave), Speicher ist
// casora/live/get|set|probe (eigener Store, nicht die Optionen).
// Reine Teile unter window.__casoraStudioLive (Test: dev/unit/studio_live.mjs).
(function () {
  const t = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const clone = (x) => JSON.parse(JSON.stringify(x || {}));

  const KIND_LABEL = { washer: "Washing machine", dryer: "Dryer", dishwasher: "Dishwasher", vacuum: "Robot vacuum", printer: "3D printer" };
  const SOURCE_LABEL = { home_connect: "Home Connect", home_connect_alt: "Home Connect (HACS)", miele: "Miele", smartthings: "SmartThings",
    lg_thinq: "LG ThinQ", washdata: "WashData", whirlpool: "Whirlpool", other: "Manufacturer app", vacuum: "Vacuum", bambu_lab: "Bambu Lab" };
  const GRADE_LABEL = { "sehr gut": "Verified", ungetestet: "Untested" };
  const PHASE_LABEL = { run: "Running", delay: "Starts later", pause: "Paused", attn: "Attention needed", done: "Done", error: "Error",
    off: "Off", clear: "Ended", probe: "Test" };
  const PHASE_TONE = { done: "ok", attn: "warn", error: "warn", pause: "warn" };
  const DEFAULTS = { on: true, done_min: 30, quiet: true, interval_min: 10 };
  const DONE_CHOICES = [10, 15, 30, 60, 120];
  const INTERVAL_CHOICES = [5, 10, 15, 30];

  // Unterzeile eines Geräts: Art · Quelle · Stufe (· Zustand, wenn gerade aktiv).
  const deviceSub = (f) => [t(KIND_LABEL[f.kind] || f.kind), SOURCE_LABEL[f.source] || f.source, t(GRADE_LABEL[f.grade] || f.grade)]
    .concat(f.phase && f.phase !== "off" ? [t(PHASE_LABEL[f.phase] || f.phase)] : []).join(" · ");
  // Nur Abweichungen vom Standard werden gespeichert (wie live_activity.merge_settings).
  const cleanDevices = (devices) => {
    const out = {};
    Object.keys(devices || {}).sort().forEach((id) => {
      const v = {};
      Object.keys(DEFAULTS).forEach((k) => { if (devices[id][k] !== undefined && devices[id][k] !== DEFAULTS[k]) v[k] = devices[id][k]; });
      if (Object.keys(v).length) out[id] = v;
    });
    return out;
  };
  const draftOf = (L) => JSON.stringify({ targets: (L && L.targets || []).slice().sort(), devices: cleanDevices(L && L.devices) });
  const settingsOf = (L, id) => Object.assign({}, DEFAULTS, (L && L.devices && L.devices[id]) || {});
  const minutes = (n) => t("{n} min").replace("{n}", n);
  // Protokollzeile: Zeit, Titel + Phase, Text, Fortschritt.
  const logLine = (e, lang) => {
    const d = new Date(e.time);
    const time = isNaN(d) ? "" : d.toLocaleTimeString(lang || undefined, { hour: "2-digit", minute: "2-digit" });
    const phase = e.clear ? t(PHASE_LABEL.clear) : t(PHASE_LABEL[e.phase] || e.phase || "");
    return { time, title: [e.title, phase].filter(Boolean).join(" · "), text: e.clear ? t("Live activity ended") : (e.message || ""),
      progress: e.progress != null && !e.clear ? e.progress + "%" : "", tone: e.clear ? "" : (PHASE_TONE[e.phase] || ""),
      tag: e.tag || "", silent: !!e.silent };
  };
  window.__casoraStudioLive = { KIND_LABEL, GRADE_LABEL, PHASE_LABEL, DEFAULTS, deviceSub, cleanDevices, draftOf, settingsOf, logLine };

  const CSS = ".cs-live-row .fswitch{margin-left:auto;flex:none}"
    + ".cs-live-row .rchev{margin-left:8px}"
    + ".cs-live-row.open .rchev{transform:rotate(90deg)}"
    + ".cs-wrap .frow.cs-live-opt{padding-left:26px}"
    + ".cs-wrap .frow.cs-live-opt .rtext b{font-weight:500}"
    + ".cs-live-log .rtext span{white-space:normal;overflow-wrap:anywhere}"
    + ".cs-live-log .rdetail{flex:none;margin-left:10px;font-variant-numeric:tabular-nums;color:var(--ink-2)}"
    + ".cs-live-log .rdetail.ok{color:var(--casora-studio-good)}.cs-live-log .rdetail.warn{color:var(--casora-studio-warn)}"
    + ".cs-live-pct{flex:none;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:var(--t-caption);font-weight:600;"
    + "background:var(--casora-studio-chip);color:var(--ink)}"
    + ".cs-live-grade{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:var(--t-caption);font-weight:600;"
    + "background:var(--casora-studio-chip);color:var(--ink-2);vertical-align:1px}";

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraLive) return;
    P.__casoraLive = true;

    const css = (self) => {
      if (self.shadowRoot.getElementById("casora-live-css")) return;
      const st = document.createElement("style");
      st.id = "casora-live-css";
      st.textContent = CSS;
      self.shadowRoot.appendChild(st);
    };
    const take = (cs, r) => {
      cs.lv = r;
      cs.L = { targets: (r.targets || []).slice(), devices: clone(r.devices) };
      cs.L0 = draftOf(cs.L);
    };
    const lang = (self) => String((self._hass && self._hass.locale && self._hass.locale.language) || (self._hass && self._hass.language) || "en");

    // ── Daten (von casora-panel-settings.js gerufen) ───────────────────────
    P._csLiveLoad = async function (cs) {
      try {
        take(cs, await this._hass.callWS({ type: "casora/live/get" }));
        cs.lvErr = null;
      } catch (e) {
        cs.lv = null;
        cs.lvErr = e && e.code === "unknown_command" ? "old" : ((e && e.message) || String(e));
      }
    };
    P._csLiveDirty = function () {
      const cs = this._cs;
      return !!(cs && cs.lv && cs.L) && draftOf(cs.L) !== cs.L0;
    };
    P._csLiveSave = async function () {
      const cs = this._cs;
      take(cs, await this._hass.callWS({ type: "casora/live/set", targets: cs.L.targets, devices: cleanDevices(cs.L.devices) }));
    };
    // Nur Protokoll und Zustände neu lesen; der Entwurf bleibt.
    P._csLiveRefresh = async function () {
      const cs = this._cs;
      if (!cs || !cs.lv) return;
      try {
        const r = await this._hass.callWS({ type: "casora/live/get" });
        cs.lv = Object.assign({}, r, { targets: cs.lv.targets, devices: cs.lv.devices });
      } catch (e) { /* alter Stand bleibt stehen */ }
      this._csRepaint();
    };

    const notifyLabel = (id) => {
      const s = String(id).replace(/^notify\./, "").replace(/^mobile_app_/, "").replace(/_/g, " ").trim();
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
    };
    const chips = (self, items, selected, onChange) => {
      const box = el("div", "casora-chips");
      box.setAttribute("data-no-i18n", "");
      items.forEach(([id, label]) => {
        const b = el("button", "casora-chip" + (selected.includes(id) ? " on" : ""), label);
        b.type = "button";
        b.title = id;
        b.onclick = () => {
          const on = !b.classList.contains("on");
          b.classList.toggle("on", on);
          onChange(id, on);
          self._csBar();
        };
        box.appendChild(b);
      });
      return box;
    };
    const fswitch = (on, onChange) => {
      const sw = el("button", "fswitch");
      sw.type = "button";
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-checked", on ? "true" : "false");
      sw.onclick = (ev) => {
        ev.stopPropagation();
        const now = sw.getAttribute("aria-checked") !== "true";
        sw.setAttribute("aria-checked", now ? "true" : "false");
        onChange(now);
      };
      return sw;
    };
    const ctl = (self, list, title, sub, control, cls) => {
      const r = self._flowRow(list, { title, sub });
      r.row.classList.add("casora-prow");
      if (cls) r.row.classList.add(cls);
      const c = el("div", "casora-pctl");
      c.appendChild(control);
      r.row.appendChild(c);
      return r.row;
    };

    // ── Seite ──────────────────────────────────────────────────────────────
    P._csFillLive = function (host) {
      css(this);
      const cs = this._cs;
      const self = this;
      if (!cs.lv) {
        this._flowGroup(host, { footer: cs.lvErr === "old"
          ? t("This page appears after Home Assistant has restarted with the new Casora version.")
          : t("The settings could not be loaded.") + " " + (cs.lvErr || "") });
        return;
      }
      const lv = cs.lv, L = cs.L;
      cs.lvOpen = cs.lvOpen || {};
      const known = (lv.notify_services || []).slice();
      (L.targets || []).forEach((x) => { if (!known.includes(x)) known.push(x); });
      if (!known.length) {
        host.appendChild(el("div", "cs-note", t("No phone with the Home Assistant app found. Sign in with the Companion app on a phone first – it appears here as a recipient.")));
      }
      // 1 · Empfänger
      let g = this._flowGroup(host, { header: t("Recipients"),
        footer: t("Live activities go to these phones. Needs the Home Assistant app; older app versions show a normal notification that keeps updating. None selected: off.") });
      ctl(this, g, t("Show live activities on"), null, known.length
        ? chips(this, known.map((id) => [id, notifyLabel(id)]), L.targets || [], (id, on) => {
          const cur = (L.targets || []).filter((x) => x !== id);
          if (on) cur.push(id);
          L.targets = cur;
        })
        : el("span", "cs-empty", t("Nothing found in Home Assistant.")));
      // 2 · Geräte
      const found = lv.found || [];
      g = this._flowGroup(host, { header: t("Devices"),
        footer: found.length
          ? t("The same devices as Casora's tiles. “Verified” sources were tested with real appliances; “untested” ones follow the integration's fields and may need feedback. Tap a device for its settings.")
          : t("No device found. Casora recognizes washing machines, dryers and dishwashers (Home Connect, Miele, SmartThings, LG ThinQ, Whirlpool, WashData and more), robot vacuums and Bambu Lab printers.") });
      found.forEach((f) => {
        const st = settingsOf(L, f.device_id);
        const open = !!cs.lvOpen[f.device_id];
        const r = this._flowRow(g, { title: f.name || t(KIND_LABEL[f.kind] || f.kind), raw: true, sub: deviceSub(f), chevron: true,
          onTap: () => { cs.lvOpen[f.device_id] = !open; self._csRepaint(); } });
        r.row.classList.add("cs-live-row");
        if (open) r.row.classList.add("open");
        r.row.dataset.device = f.device_id;
        const sub = r.row.querySelector(".rtext > span");
        if (sub) sub.setAttribute("data-no-i18n", "");
        r.row.appendChild(fswitch(st.on, (on) => {
          L.devices[f.device_id] = Object.assign({}, L.devices[f.device_id], { on });
          self._csBar();
        }));
        if (!open) return;
        const set = (key, v) => { L.devices[f.device_id] = Object.assign({}, L.devices[f.device_id], { [key]: v }); self._csBar(); };
        const doneList = DONE_CHOICES.includes(st.done_min) ? DONE_CHOICES : DONE_CHOICES.concat([st.done_min]).sort((a, b) => a - b);
        const doneLabels = {}; doneList.forEach((n) => { doneLabels[String(n)] = minutes(n); });
        ctl(this, g, t("“Done” stays for"), t("Then the activity disappears by itself."),
          this._combo(String(st.done_min), doneList.map(String), "", (v) => { if (v) set("done_min", Number(v)); },
            { fixed: true, labels: doneLabels }).wrap, "cs-live-opt");
        ctl(this, g, t("Quiet progress updates"), t("Off: every progress step makes a sound."),
          fswitch(st.quiet, (on) => set("quiet", on)), "cs-live-opt");
        const ivList = INTERVAL_CHOICES.includes(st.interval_min) ? INTERVAL_CHOICES : INTERVAL_CHOICES.concat([st.interval_min]).sort((a, b) => a - b);
        const ivLabels = {}; ivList.forEach((n) => { ivLabels[String(n)] = minutes(n); });
        ctl(this, g, t("Refresh at least every"), t("Keeps the time left in step with the appliance."),
          this._combo(String(st.interval_min), ivList.map(String), "", (v) => { if (v) set("interval_min", Number(v)); },
            { fixed: true, labels: ivLabels }).wrap, "cs-live-opt");
      });
      // 3 · Probe
      g = this._flowGroup(host, { header: t("Test"),
        footer: t("Sends a sample activity (42%, 25 minutes left) to the saved recipients. It disappears after two minutes.") });
      const unsaved = JSON.stringify((L.targets || []).slice().sort()) !== JSON.stringify((lv.targets || []).slice().sort());
      const probeSub = cs.lvProbe ? cs.lvProbe : (unsaved ? t("Save the recipients first.") : (lv.targets || []).length ? null : t("Choose a recipient first."));
      const pr = this._flowRow(g, { title: t("Send a test"), sub: probeSub });
      pr.row.classList.add("casora-prow", "cs-live-probe");
      const pc = el("div", "casora-pctl");
      if (found.length) {
        cs.lvProbeDev = found.some((f) => f.device_id === cs.lvProbeDev) ? cs.lvProbeDev : found[0].device_id;
        const labels = {}; found.forEach((f) => { labels[f.device_id] = f.name || t(KIND_LABEL[f.kind] || f.kind); });
        pc.appendChild(this._combo(cs.lvProbeDev, found.map((f) => f.device_id), "", (v) => { if (v) cs.lvProbeDev = v; }, { fixed: true, labels }).wrap);
      }
      const pb = el("button", "ghost", cs.lvBusy ? t("Sending…") : t("Send test"));
      pb.type = "button";
      pb.disabled = !!cs.lvBusy || unsaved || !(lv.targets || []).length;
      pb.onclick = async () => {
        cs.lvBusy = true; cs.lvProbe = null; this._csRepaint();
        try {
          const r = await this._hass.callWS({ type: "casora/live/probe", device_id: cs.lvProbeDev || null });
          cs.lvProbe = t("Sent to {n} phones.").replace("{n}", r.targets);
        } catch (e) {
          cs.lvProbe = t("Didn't work:") + " " + ((e && e.message) || String(e));
        }
        cs.lvBusy = false;
        await this._csLiveRefresh();
      };
      pc.appendChild(pb);
      pr.row.appendChild(pc);
      // 4 · Protokoll
      const log = lv.log || [];
      g = this._flowGroup(host, { header: t("Last sent"),
        footer: log.length ? t("The last 20 notifications Casora sent, newest first.") : t("Nothing sent yet.") });
      const lg = lang(this);
      log.forEach((e) => {
        const line = logLine(e, lg);
        const r = this._flowRow(g, { title: line.title, raw: true, sub: line.text, detail: line.time, detailTone: line.tone });
        r.row.classList.add("cs-live-log");
        const sub = r.row.querySelector(".rtext > span");
        if (sub && !e.clear) sub.setAttribute("data-no-i18n", "");
        if (line.progress) r.row.insertBefore(el("span", "cs-live-pct", line.progress), r.row.querySelector(".rdetail"));
      });
      const rb = el("button", "ghost", t("Refresh"));
      rb.type = "button";
      rb.onclick = () => this._csLiveRefresh();
      const rr = this._flowRow(g, { title: t("Protocol"), sub: t("Reads the latest entries again.") });
      rr.row.classList.add("casora-prow");
      const rc = el("div", "casora-pctl");
      rc.appendChild(rb);
      rr.row.appendChild(rc);
    };
  });
})();
