// Removes the scripts earlier Casora versions appended to scripts.yaml, once, from an admin's browser
// (legacy_cleanup.py). Home Assistant has no Python API to delete a UI script; this uses HA's own script
// config API, the one the script editor uses, as the signed-in admin. Loaded on every page only while
// the integration still has scripts waiting (frontend.add_extra_js_url).
//
//   1. casora/legacy/scripts                 which former scripts are left (empty for non-admins or when
//                                            another browser is at it)
//   2. keep every script something still uses: search/related (entity), the configs of all automations
//      and scripts (automation/config, script/config), all dashboards (lovelace/config)
//   3. GET config/script/config/<id>         the script as it stands in scripts.yaml (missing: elsewhere)
//   4. casora/legacy/match                   which of them are still exactly what Casora wrote
//   5. DELETE config/script/config/<id>      only those
//   6. casora/legacy/report                  what was removed and what was kept, and why
//
//   window.casoraLegacyCleanup.run(hass)     Promise of the report, or null when there was nothing to do
(function () {
  if (window.casoraLegacyCleanup) return;

  function hassNow() { var el = document.querySelector('home-assistant'); return el && el.hass; }

  function usable(h) {
    return !!(h && h.user && h.connection && typeof h.connection.sendMessagePromise === 'function'
      && typeof h.callApi === 'function');
  }

  function ws(h, msg) { return h.connection.sendMessagePromise(msg); }

  function refs(text, entityId) {
    // The entity id as a whole word (script.casora_x, not script.casora_x_2).
    var i = text.indexOf(entityId);
    while (i >= 0) {
      var next = text.charAt(i + entityId.length);
      if (!/[a-z0-9_]/.test(next)) return true;
      i = text.indexOf(entityId, i + 1);
    }
    return false;
  }

  // entity_id -> [what uses it]
  async function usages(h, ids) {
    var by = {};
    ids.forEach(function (o) { by['script.' + o] = []; });
    var wanted = Object.keys(by);
    var add = function (eid, who) { if (who !== eid && by[eid].indexOf(who) < 0) by[eid].push(who); };

    for (var i = 0; i < wanted.length; i++) {
      var eid = wanted[i];
      try {
        var rel = await ws(h, { type: 'search/related', item_type: 'entity', item_id: eid });
        ['automation', 'script', 'scene', 'group', 'person'].forEach(function (k) {
          (rel && rel[k] || []).forEach(function (who) { add(eid, who); });
        });
      } catch (e) { by[eid].push('?'); }
    }

    var states = h.states || {};
    for (var sid in states) {
      var dom = sid.split('.')[0];
      if (dom !== 'automation' && dom !== 'script') continue;
      if (by[sid]) continue;  // a former script itself
      var conf;
      try { conf = await ws(h, { type: dom + '/config', entity_id: sid }); } catch (e) { continue; }
      var text = JSON.stringify(conf && conf.config !== undefined ? conf.config : conf) || '';
      wanted.forEach(function (eid) { if (refs(text, eid)) add(eid, sid); });
    }

    var dashboards = [{ url_path: null, title: 'Overview' }];
    try {
      (await ws(h, { type: 'lovelace/dashboards/list' }) || []).forEach(function (d) {
        if (d && d.url_path) dashboards.push(d);
      });
    } catch (e) { /* only the default dashboard */ }
    for (var j = 0; j < dashboards.length; j++) {
      var d = dashboards[j];
      var cfg;
      try { cfg = await ws(h, { type: 'lovelace/config', url_path: d.url_path, force: false }); } catch (e) { continue; }
      var dt = JSON.stringify(cfg) || '';
      wanted.forEach(function (eid) { if (refs(dt, eid)) add(eid, 'dashboard ' + (d.url_path || 'lovelace')); });
    }
    return by;
  }

  async function run(h) {
    if (!usable(h) || !h.user.is_admin) return null;
    var st = await ws(h, { type: 'casora/legacy/scripts' });
    var ids = (st && st.pending) || [];
    if (!ids.length) return null;

    var removed = [];
    var kept = {};
    var used = await usages(h, ids);
    var configs = {};
    for (var i = 0; i < ids.length; i++) {
      var o = ids[i];
      var by = used['script.' + o] || [];
      if (by.length) { kept[o] = { reason: 'in_use', by: by.slice(0, 10) }; continue; }
      try {
        configs[o] = await h.callApi('GET', 'config/script/config/' + encodeURIComponent(o));
      } catch (e) {
        // 404: not in scripts.yaml (a package or another file) - not Casora's to touch.
        kept[o] = { reason: e && (e.status_code === 404 || e.status === 404 || /not found/i.test(String(e.body && e.body.message || e.message || '')))
          ? 'not_in_scripts_yaml' : 'failed' };
      }
    }
    var names = Object.keys(configs);
    var match = names.length ? ((await ws(h, { type: 'casora/legacy/match', configs: configs })).match || []) : [];
    for (var k = 0; k < names.length; k++) {
      var n = names[k];
      if (match.indexOf(n) < 0) { kept[n] = { reason: 'edited' }; continue; }
      try {
        await h.callApi('DELETE', 'config/script/config/' + encodeURIComponent(n));
        removed.push(n);
      } catch (e) { kept[n] = { reason: 'failed' }; }
    }
    var report = { removed: removed, kept: kept };
    await ws(h, Object.assign({ type: 'casora/legacy/report' }, report));
    return report;
  }

  var started = false;
  function start() {
    if (started) return;
    var h = hassNow();
    if (!usable(h)) { setTimeout(start, 500); return; }
    started = true;
    // Let the page settle first; this is housekeeping, not part of loading.
    setTimeout(function () {
      run(hassNow() || h).catch(function (e) { try { console.warn('Casora: cleanup of old scripts failed', e); } catch (x) { /* no console */ } });
    }, 3000);
  }

  window.casoraLegacyCleanup = { run: run };
  start();
})();
