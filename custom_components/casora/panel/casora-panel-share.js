// Studio → ⋯ → "Export…" / "Import from file…" (01.11.2026)
//
// A dashboard as one file (casora-<name>-<date>.casora): desktop + phone layout, the Casora settings
// that belong to it and, if wanted, the own photos. The integration builds and checks the file
// (share.py); this module offers it: export sheet, file choice, preview, where it goes (new or
// replacing one – with a question, the state before stays under Rewind) and entities that are missing
// in this home, each with a same-domain replacement or left as "not found".
(function () {
  const t = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const EXPORT_URL = "/api/casora/share/export";
  const IMPORT_URL = "/api/casora/share/import";
  const SECTION_LABEL = { waste: "Waste", calendars: "Calendars", scenes: "Scenes", contacts: "Doors and windows",
    security: "Security", media: "Now Playing", night_entity: "Night", ebike: "E-bike" };
  const REASON = {
    not_casora: "This isn't a Casora dashboard file.",
    newer_format: "This file was made by a newer Casora. Update Casora, then try again.",
    broken: "The file is damaged and can't be read.",
    empty: "The file is empty.",
    too_large: "The file is too large. Export it without photos and try again.",
    expired: "The file is no longer loaded. Choose it again.",
    not_empty: "The new dashboard isn't empty – nothing was written.",
    no_templates: "Casora's templates could not be read – nothing was written. Restart Home Assistant and try again.",
  };
  const reasonOf = (code, fallback) => t(REASON[code] || fallback || "The file could not be read.");

  const CSS = ".csh-note{margin:6px 4px 14px;font-size:var(--t-foot);line-height:1.45;color:var(--ink-2)}"
    + ".csh-ent .rtext span{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--t-caption)}"
    + ".csh-ent .rdetail{max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    + ".csh-ent .rdetail.warn{flex:0 0 auto;max-width:none}";
  const css = (self) => {
    if (self.shadowRoot.getElementById("casora-share-css")) return;
    const st = document.createElement("style");
    st.id = "casora-share-css";
    st.textContent = CSS;
    self.shadowRoot.appendChild(st);
  };

  // Same name, other numbering ("sensor.kitchen_temp" ↔ "sensor.kitchen_temp_2"): a unique match is
  // preselected; anything less certain is left for the user.
  const bare = (id) => String(id).split(".").slice(1).join(".").replace(/_\d+$/, "");
  function suggest(id, hass) {
    const dom = id.split(".")[0];
    const want = bare(id);
    const hits = Object.keys((hass && hass.states) || {}).filter((e) => e.split(".")[0] === dom && bare(e) === want);
    return hits.length === 1 ? hits[0] : null;
  }
  // "sensor.hall_battery" → "Hall battery" (as missingName in casora-panel.js).
  const missingName = (id) => {
    const o = String(id || "").split(".").slice(1).join(".").replace(/_/g, " ").trim();
    return o ? o.charAt(0).toUpperCase() + o.slice(1) : String(id || "");
  };
  const nameOf = (hass, id) => {
    const st = hass && hass.states && hass.states[id];
    return (st && st.attributes && st.attributes.friendly_name) || id;
  };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraShare) return;
    P.__casoraShare = true;

    // ── Menu: "Export…" under this dashboard, "Import from file…" under New ──────
    const menuAt = P._menuAt;
    P._menuAt = function (anchor, items, onPick, opts) {
      if (Array.isArray(items) && items.some((x) => x && x.id === "create")
        && !items.some((x) => x && x.id === "casora_import_file") && this._hass && this._hass.user && this._hass.user.is_admin) {
        items = items.slice();
        if (this._dashUrl && !this._flowMode) items.push({ id: "casora_export", label: "Export…" });
        items.push({ id: "casora_import_file", label: "Import from file…" });
        const pick = onPick;
        onPick = (id) => (id === "casora_export" ? this._shExport()
          : id === "casora_import_file" ? this._shImportPick() : pick(id));
      }
      return menuAt.call(this, anchor, items, onPick, opts);
    };

    // ── Export ────────────────────────────────────────────────────────────────
    P._shExport = function () {
      if (this._state && this._isDirty && this._isDirty()) {
        return this._status("Save your changes first, then export the dashboard.", "warn");
      }
      css(this);
      const cur = (this._dashList || []).find((x) => x.url_path === this._dashUrl);
      // The phone layout open on its own: export it with its desktop, as a pair.
      const pair = this._homes(this._dashList || []).find((h) => h.wide === cur || h.phone === cur);
      const d = pair ? pair.wide : cur;
      if (!d) return;
      const home = pair;
      const phone = home && home.phone;
      const o = { photos: true, settings: true };
      const s = this._flowScreen({ icon: "share", title: "Export Dashboard",
        lede: "Saves this dashboard as one file – to keep, or to import in the Studio of another Casora home." });
      const g = this._flowGroup(s.body, { header: "In the File" });
      this._flowRow(g, { title: d.title || d.url_path, raw: true,
        sub: phone ? t("Desktop and phone layout") : t("Desktop layout"), icon: "dashboard" });
      const toggle = (key, title, sub) => {
        const r = this._flowRow(g, { title, sub, check: o[key], onTap: () => {
          o[key] = !o[key];
          r.row.setAttribute("aria-checked", o[key] ? "true" : "false");
        } });
        r.row.dataset.k = "share-" + key;
      };
      toggle("photos", "Take Photos Along", "Your own room and vehicle photos");
      toggle("settings", "Take Settings Along", "Security, scenes, waste, calendars, doors and windows");
      const note = document.createElement("p");
      note.className = "csh-note";
      note.textContent = t("The file contains no passwords or access tokens. It does contain what the dashboard shows – room names, entity IDs and, if chosen, your photos. Only share it with people you trust.");
      s.body.appendChild(note);
      const note2 = document.createElement("p");
      note2.className = "csh-note";
      note2.textContent = t("Own templates and code in [[[ ]]] stay out of the file – an import uses that Casora's templates.");
      s.body.appendChild(note2);
      this._flowCancel(s.acts);
      const btn = this._flowButton(s.acts, "Export", async () => {
        btn.disabled = true;
        btn.textContent = t("Exporting…");
        this._flowError("");
        const q = new URLSearchParams({ url_path: d.url_path, title: d.title || d.url_path,
          photos: o.photos ? "1" : "0", settings: o.settings ? "1" : "0" });
        if (phone) q.set("mobile_url", phone.url_path);
        try {
          const res = await this._hass.fetchWithAuth(EXPORT_URL + "?" + q.toString());
          if (!res.ok) {
            let body = {};
            try { body = await res.json(); } catch (e) { /* not JSON */ }
            throw Object.assign(new Error(body.message || res.statusText), { code: body.code });
          }
          const name = res.headers.get("X-Casora-File") || "casora-dashboard.casora";
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = name; a.style.display = "none";
          this.shadowRoot.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
          this._shLastExport = name;
          this._exitFlow(true);
          this._log && this._log(`exported "${d.url_path}" as ${name} (${Math.round(blob.size / 1024)} KB)`, "ok");
          this._status(t("Exported as {file}").replace("{file}", name), "ok");
        } catch (e) {
          btn.disabled = false;
          btn.textContent = t("Export");
          this._flowError(reasonOf(e.code, t("The dashboard could not be exported.")) + (e.code ? "" : " " + e.message));
        }
      });
    };

    // ── Import: choose the file ──────────────────────────────────────────────
    P._shImportPick = function () {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".casora,.zip,application/zip";
      input.style.display = "none";
      input.onchange = () => {
        const f = input.files && input.files[0];
        input.remove();
        if (f) this._shUpload(f);
      };
      this.shadowRoot.appendChild(input);
      input.click();
    };

    P._shUpload = async function (file) {
      css(this);
      const s = this._flowScreen({ icon: "import", title: "Reading the File", lede: file.name });
      if (s.lede) s.lede.setAttribute("data-no-i18n", "");
      const spin = document.createElement("div");
      spin.className = "fspin";
      s.body.appendChild(spin);
      const tok = this._flowTok;
      let res, body = {};
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        res = await this._hass.fetchWithAuth(IMPORT_URL, { method: "POST", body: fd });
        try { body = await res.json(); } catch (e) { body = {}; }
      } catch (e) {
        res = null;
        body = { message: e.message };
      }
      if (this._flowTok !== tok) return;
      if (!res || !res.ok) {
        const code = res && res.status === 413 ? "too_large" : body.code;
        return this._shFailed(reasonOf(code, body.message ? t("The file could not be read.") + " " + body.message : null));
      }
      this._shPreview(body, { file: file.name });
    };

    P._shFailed = function (reason) {
      const s = this._flowScreen({ icon: "alert", tone: "warn", title: "Can't Import This File", lede: reason });
      this._flowCancel(s.acts);
      this._flowButton(s.acts, "Choose Another File", () => this._shImportPick());
    };

    // ── Import: preview, target, options, missing entities ────────────────────
    P._shPreview = async function (pv, st) {
      css(this);
      const hass = this._hass;
      if (!st.init) {
        st.init = true;
        st.mode = "new";
        st.title = window.casoraFreeName
          ? window.casoraFreeName(pv.title, new Set((this._dashList || []).map((d) => (d.title || "").trim())), hass)
          : pv.title;
        st.target = this._dashUrl || null;
        st.photos = pv.photos > 0;
        st.mapping = {};
        (pv.missing || []).forEach((id) => { const s = suggest(id, hass); if (s) st.mapping[id] = s; });
        st.settings = false;
        if ((pv.settings || []).length) {
          try {
            const cur = (await hass.callWS({ type: "casora/settings/get" })).settings || {};
            st.settings = !pv.settings.some((k) => cur[k] !== undefined);
          } catch (e) { st.settings = false; }
        }
      }
      const again = () => this._shPreview(pv, st);
      const s = this._flowScreen({ icon: "import", title: "Import Dashboard", quiet: !!st.drawn,
        lede: "Check what's in the file, then choose where it goes." });
      st.drawn = true;

      // What is inside.
      const inside = this._flowGroup(s.body, { header: "In the File" });
      this._flowRow(inside, { title: pv.title, raw: true, icon: "dashboard",
        sub: [pv.casora ? t("Casora {v}").replace("{v}", pv.casora) : "", (pv.exported || "").slice(0, 10)].filter(Boolean).join(" · ") });
      const rooms = pv.rooms || [];
      const r1 = this._flowRow(inside, { title: t("{n} rooms").replace("{n}", rooms.length), raw: true, icon: "rooms",
        sub: rooms.join(" · ") });
      r1.row.querySelector(".rtext span") && r1.row.querySelector(".rtext span").setAttribute("data-no-i18n", "");
      this._flowRow(inside, { title: t("{n} tiles").replace("{n}", pv.tiles), raw: true, icon: "devices",
        sub: pv.phone ? t("Phone layout with {n} tiles").replace("{n}", pv.phone_tiles) : t("No phone layout") });
      if (pv.photos) this._flowRow(inside, { title: t("{n} photos").replace("{n}", pv.photos), raw: true, icon: "photo" });
      // Own room symbols always travel with the file (a name taken here gets „-2“).
      if (pv.icons) this._flowRow(inside, { title: t("{n} own symbols").replace("{n}", pv.icons), raw: true, icon: "home" });
      // Never taken from a file (share.py clean_dashboard): own templates and code in [[[ ]]]. Said every time.
      const lo = pv.left_out || {};
      const lr = this._flowRow(inside, { title: t("No code from the file"), raw: true,
        icon: "info", sub: lo.templates || lo.code
          ? t("Own templates and code from the file are not taken over: {t} own templates, {c} entries with code. The tiles use this Casora's templates.")
            .replace("{t}", lo.templates || 0).replace("{c}", lo.code || 0)
          : t("Own templates and code from the file are not taken over. The tiles use this Casora's templates.") });
      lr.row.classList.add("wrap2");
      lr.row.dataset.k = "share-left-out";
      const lsp = lr.row.querySelector(".rtext span");
      if (lsp) lsp.setAttribute("data-no-i18n", "");

      // Where it goes.
      const where = this._flowGroup(s.body, { header: "Where To" });
      const radio = (mode, title, sub) => this._flowRow(where, { title, sub, check: st.mode === mode, radio: true,
        onTap: () => { if (st.mode !== mode) { st.mode = mode; again(); } } });
      radio("new", "As a New Dashboard", "Your dashboards stay as they are");
      const homes = this._homes(this._dashList || []);
      if (homes.length) radio("replace", "Replace a Dashboard", "The current version stays under Rewind");
      let titleIn = null;
      if (st.mode === "new") {
        titleIn = this._flowRow(where, { title: "Name", input: st.title }).input;
        titleIn.oninput = () => { st.title = titleIn.value; };
      } else {
        if (!homes.some((h) => h.wide.url_path === st.target)) st.target = homes[0].wide.url_path;
        homes.forEach((h) => {
          const r = this._flowRow(where, { title: h.wide.title || h.wide.url_path, raw: true,
            sub: h.phone ? t("Desktop and phone layout") : t("Desktop layout"), check: st.target === h.wide.url_path, radio: true,
            onTap: () => { st.target = h.wide.url_path; again(); } });
          r.row.classList.add("csh-target");
        });
      }

      // Options.
      if (pv.photos || (pv.settings || []).length) {
        const opt = this._flowGroup(s.body, { header: "Options" });
        if (pv.photos) this._flowRow(opt, { title: "Take Photos Along", sub: "Photos with the same name stay; the file's get a new name",
          check: st.photos, onTap: () => { st.photos = !st.photos; again(); } }).row.classList.add("wrap2");
        if ((pv.settings || []).length) {
          const r = this._flowRow(opt, { title: "Take Settings Along", raw: false,
            sub: t("Replaces your settings for: {list}").replace("{list}", pv.settings.map((k) => t(SECTION_LABEL[k] || k)).join(", ")),
            check: st.settings, onTap: () => { st.settings = !st.settings; again(); } });
          const sp = r.row.querySelector(".rtext span");
          if (sp) sp.setAttribute("data-no-i18n", "");
          r.row.classList.add("wrap2");
        }
      }

      // Entities that are not in this home.
      const missing = pv.missing || [];
      if (missing.length) {
        const mg = this._flowGroup(s.body, { header: t("Missing Here ({n})").replace("{n}", missing.length),
          footer: "These entities don't exist in this home. Pick one of the same kind, or leave it – the tile then shows it as missing." });
        mg.previousSibling && mg.previousSibling.setAttribute("data-no-i18n", "");
        missing.forEach((id) => {
          const to = st.mapping[id];
          const r = this._flowRow(mg, { title: missingName(id), raw: true, sub: id,
            detail: to ? nameOf(hass, to) : t("Missing"), detailTone: to ? "" : "warn", chevron: true,
            onTap: () => this._shMapMenu(r.row, id, st, again) });
          r.row.classList.add("csh-ent");
          r.row.dataset.k = "map-" + id;
          if (r.detail) r.detail.setAttribute("data-no-i18n", "");
          const sp = r.row.querySelector(".rtext span");
          if (sp) sp.setAttribute("data-no-i18n", "");
        });
      } else if (pv.entities) {
        const note = document.createElement("p");
        note.className = "csh-note";
        note.textContent = t("All {n} entities exist in this home.").replace("{n}", pv.entities);
        note.setAttribute("data-no-i18n", "");
        s.body.appendChild(note);
      }

      this._flowCancel(s.acts);
      const go = this._flowButton(s.acts, st.mode === "replace" ? "Replace" : "Import", async () => {
        go.disabled = true;
        const label = go.textContent;
        go.textContent = t("Importing…");
        const ok = await this._shApply(pv, st);
        if (!ok && go.isConnected) { go.disabled = false; go.textContent = label; }
      });
    };

    P._shMapMenu = function (anchor, id, st, again) {
      const hass = this._hass;
      const dom = id.split(".")[0];
      const cands = Object.keys(hass.states || {}).filter((e) => e.split(".")[0] === dom)
        .sort((a, b) => String(nameOf(hass, a)).localeCompare(String(nameOf(hass, b))));
      const first = suggest(id, hass);
      const list = (first ? [first] : []).concat(cands.filter((e) => e !== first));
      const items = [{ id: "", label: "Leave as Missing", checked: !st.mapping[id] }]
        .concat(list.slice(0, 300).map((e) => ({ id: e, label: nameOf(hass, e) + " · " + e, raw: true, checked: st.mapping[id] === e })));
      if (!cands.length) items.push({ id: "__none", label: t("No {d} entities in this home").replace("{d}", dom), disabled: true, raw: true });
      this._menuAt(anchor, items, (pick) => {
        if (pick === "__none") return;
        if (pick) st.mapping[id] = pick; else delete st.mapping[id];
        again();
      }, { search: t("Search entities") });
    };

    // ── Import: write it ──────────────────────────────────────────────────────
    P._shApply = async function (pv, st) {
      const hass = this._hass;
      const created = [];
      const mobileOf = (u) => String(u).replace(/[-_]mobile$/i, "") + "-mobile";
      let url_path, mobile_url = null, title;
      this._flowError("");
      try {
        if (st.mode === "replace") {
          const home = this._homes(this._dashList || []).find((h) => h.wide.url_path === st.target);
          if (!home) return false;
          title = home.wide.title || home.wide.url_path;
          const ok = await this._ask({
            title: t("Replace “{name}”?").replace("{name}", title),
            message: t("Its rooms and tiles are replaced by the file. The current version stays under Rewind – you can go back at any time."),
            confirmLabel: "Replace", destructive: true,
          });
          if (!ok) return false;
          if (st.target === this._dashUrl && this._leaveStudioOk && !(await this._leaveStudioOk())) return false;
          url_path = home.wide.url_path;
          if (pv.phone) {
            if (home.phone) mobile_url = home.phone.url_path;
            else {
              // The file brings a phone layout, this dashboard has none yet: add it next to it.
              mobile_url = mobileOf(url_path);
              const pm = await hass.callWS({ type: "lovelace/dashboards/create", url_path: mobile_url,
                title: title + " Mobile", icon: "mdi:cellphone", show_in_sidebar: false, require_admin: !!home.wide.require_admin });
              created.push(pm && pm.id);
            }
          }
        } else {
          title = String(st.title || "").trim() || pv.title || "Casora";
          url_path = this._flowPath(title, "casora-imported", "imported");
          const made = await hass.callWS({ type: "lovelace/dashboards/create", url_path, title,
            icon: "mdi:home", show_in_sidebar: true, require_admin: false });
          created.push(made && made.id);
          if (pv.phone) {
            mobile_url = url_path + "-mobile";
            const pm = await hass.callWS({ type: "lovelace/dashboards/create", url_path: mobile_url,
              title: title + " Mobile", icon: "mdi:cellphone", show_in_sidebar: false, require_admin: false });
            created.push(pm && pm.id);
          }
        }
        const mapping = {};
        Object.keys(st.mapping || {}).forEach((k) => { if (st.mapping[k]) mapping[k] = st.mapping[k]; });
        const r = await hass.callWS({ type: "casora/share/apply", token: pv.token, url_path, mobile_url,
          mode: st.mode, mapping, photos: !!st.photos, settings: !!st.settings });
        await this._flowRelist();
        this._exitFlow(true);
        this._log && this._log(`imported ${pv.title} into "${url_path}" (${st.mode}, ${r.mapped} mapped, ${r.photos} photos)`, "ok");
        const left = (pv.missing || []).length - Object.keys(mapping).length;
        const msg = t(st.mode === "replace" ? "Replaced “{name}”" : "Imported as “{name}”").replace("{name}", title)
          + (left > 0 ? " · " + t("{n} missing").replace("{n}", left) : "");
        this._remember(url_path);
        this._routeUsed = true;
        this._room = 0;
        await this._refreshDashboards(url_path);
        if (typeof this._bToast === "function") this._bToast(msg, { ms: 7000 });
        else this._status(msg, "ok");
        return true;
      } catch (e) {
        for (const id of created.reverse()) {
          try { if (id) await hass.callWS({ type: "lovelace/dashboards/delete", dashboard_id: id }); } catch (e2) { /* stays listed */ }
        }
        await this._flowRelist();
        if (e && e.code === "expired") { this._shFailed(reasonOf("expired")); return false; }
        this._flowError(reasonOf(e && e.code, t("The dashboard could not be imported.")) + (e && REASON[e.code] ? "" : " " + ((e && e.message) || "")));
        return false;
      }
    };
  });
})();
