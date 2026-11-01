// „Willkommen bei Casora“ / „Neu in Casora x.y.z“
// (like the „Was ist neu“ screen after an iOS update). Shows once per
// version and browser in the Studio.
//
// On every release: fill WHATS_NEW with the news (2-4 entries), bump the version
// in manifest.json, extend the CHANGELOG. The version comes from the
// loader URL (?v=<version>.<stamp>) that the integration writes on startup.
(() => {
  if (window.__casoraWelcome) return;
  window.__casoraWelcome = true;

  const VERSION = (() => {
    try {
      const v = new URL(import.meta.url).searchParams.get("v") || "";
      return v.split(".").slice(0, 3).join(".") || "0";
    } catch (e) { return "0"; }
  })();
  const SEEN_KEY = "casora.seenVersion";
  const CHANGELOG_URL = "https://github.com/SH1FT-W/casora/blob/main/CHANGELOG.md";

  const TEXT = {
    de: {
      welcomeTitle: "Willkommen bei Casora",
      whatsNewTitle: "Neu in Casora {version}",
      continue: "Weiter",
      all: "Alle Änderungen",
      w1t: "Raum für Raum", w1: "Gestalte dein Dashboard mit den Geräten, die du schon in Home Assistant hast.",
      w2t: "Geräte-Assistent", w2: "Casora schlägt für jeden Raum passende Kacheln vor und baut sie ein.",
      w3t: "Desktop, Tablet und Handy", w3: "Ein Dashboard, das sich jedem Bildschirm anpasst, mit eigener Handy-Ansicht.",
      n0t: "Raumsuche", n0: "Am Handy oben auf Zuhause tippen und Räume, Geräte oder Szenen finden. Am Desktop mit ⌘K.",
      n1t: "iPad und iPhone", n1: "Regler und Rad lassen sich wieder ziehen, statt dass die Seite scrollt.",
      n2t: "Exportieren und importieren", n2: "Ein Dashboard als Datei sichern oder weitergeben, im Studio über ⋯.",
      n3t: "Filme und Serien", n3: "Das Cover füllt den ganzen Kreis, bei Musik bleibt die Schallplatte.",
    },
    en: {
      welcomeTitle: "Welcome to Casora",
      whatsNewTitle: "New in Casora {version}",
      continue: "Continue",
      all: "All changes",
      w1t: "Room by room", w1: "Design your dashboard with the devices you already have in Home Assistant.",
      w2t: "Device Assistant", w2: "Casora suggests the right tiles for every room and adds them for you.",
      w3t: "Desktop, tablet and phone", w3: "One dashboard that fits every screen, with its own phone layout.",
      n0t: "Room search", n0: "On the phone tap at the top of Home to find rooms, devices or scenes. On the desktop with Cmd+K.",
      n1t: "iPad and iPhone", n1: "Dials and sliders can be dragged again instead of scrolling the page.",
      n2t: "Export and import", n2: "Save a dashboard as a file or pass it on, in the Studio via ⋯.",
      n3t: "Movies and series", n3: "The cover fills the whole circle, music keeps the record.",
    },
    // Spanish: same keys as en (dev/unit/welcome_es.mjs); a missing key falls back to English.
    es: {
      welcomeTitle: "Te damos la bienvenida a Casora",
      whatsNewTitle: "Novedades de Casora {version}",
      continue: "Continuar",
      all: "Todos los cambios",
      w1t: "Habitación por habitación", w1: "Diseña tu panel con los dispositivos que ya tienes en Home Assistant.",
      w2t: "Asistente de dispositivos", w2: "Casora propone las tarjetas adecuadas para cada habitación y las añade por ti.",
      w3t: "Escritorio, tableta y móvil", w3: "Un panel que se adapta a cada pantalla, con su propio diseño para el móvil.",
      n0t: "Buscar habitaciones", n0: "En el móvil toca arriba en Inicio para encontrar habitaciones, dispositivos o escenas. En el escritorio con Cmd+K.",
      n1t: "iPad y iPhone", n1: "Las ruedas y los controles se pueden arrastrar de nuevo en lugar de desplazar la página.",
      n2t: "Exportar e importar", n2: "Guarda un panel como archivo o compártelo, en el Studio desde ⋯.",
      n3t: "Películas y series", n3: "La carátula llena todo el círculo; con música se queda el disco.",
    },
    fr: {
      welcomeTitle: "Bienvenue dans Casora",
      whatsNewTitle: "Nouveautés de Casora {version}",
      continue: "Continuer",
      all: "Tous les changements",
      w1t: "Pièce par pièce",
      w1: "Conçois ton tableau de bord avec les appareils que tu as déjà dans Home Assistant.",
      w2t: "Assistant appareils",
      w2: "Casora propose les tuiles adaptées à chaque pièce et les ajoute pour toi.",
      w3t: "Ordinateur, tablette et téléphone",
      w3: "Un tableau de bord qui s'adapte à chaque écran, avec sa propre mise en page téléphone.",
      n0t: "Recherche", n0: "Sur mobile, touche le haut de l'accueil pour trouver pièces, appareils ou scènes. Sur ordinateur avec Cmd+K.",
      n1t: "iPad et iPhone", n1: "Les molettes et curseurs se glissent à nouveau au lieu de faire défiler la page.",
      n2t: "Exporter et importer", n2: "Enregistre un tableau de bord dans un fichier ou partage-le, dans le Studio via ⋯.",
      n3t: "Films et séries", n3: "La pochette remplit tout le cercle ; pour la musique, le disque reste.",
    },
    it: {
      welcomeTitle: "Ti diamo il benvenuto in Casora",
      whatsNewTitle: "Novità di Casora {version}",
      continue: "Continua",
      all: "Tutte le modifiche",
      w1t: "Stanza per stanza",
      w1: "Progetta la tua dashboard con i dispositivi che hai già in Home Assistant.",
      w2t: "Assistente dispositivi",
      w2: "Casora propone le schede adatte per ogni stanza e le aggiunge per te.",
      w3t: "Desktop, tablet e telefono",
      w3: "Una dashboard che si adatta a ogni schermo, con un layout dedicato per il telefono.",
      n0t: "Ricerca stanze", n0: "Sul telefono tocca in alto nella Home per trovare stanze, dispositivi o scene. Sul desktop con Cmd+K.",
      n1t: "iPad e iPhone", n1: "Ghiere e cursori si trascinano di nuovo invece di scorrere la pagina.",
      n2t: "Esportare e importare", n2: "Salva una dashboard come file o condividila, nello Studio da ⋯.",
      n3t: "Film e serie", n3: "La copertina riempie tutto il cerchio; con la musica resta il disco.",
    },
    nl: {
      welcomeTitle: "Welkom bij Casora",
      whatsNewTitle: "Nieuw in Casora {version}",
      continue: "Verder",
      all: "Alle wijzigingen",
      w1t: "Kamer voor kamer",
      w1: "Ontwerp je dashboard met de apparaten die je al in Home Assistant hebt.",
      w2t: "Apparaatassistent",
      w2: "Casora stelt voor elke kamer passende tegels voor en bouwt ze in.",
      w3t: "Desktop, tablet en telefoon",
      w3: "Eén dashboard dat zich aan elk scherm aanpast, met een eigen telefoonweergave.",
      n0t: "Zoeken", n0: "Tik op de telefoon bovenaan Thuis om kamers, apparaten of scènes te vinden. Op de computer met Cmd+K.",
      n1t: "iPad en iPhone", n1: "Draaiknoppen en schuiven laten zich weer slepen in plaats van de pagina te scrollen.",
      n2t: "Exporteren en importeren", n2: "Een dashboard als bestand bewaren of doorgeven, in de Studio via ⋯.",
      n3t: "Films en series", n3: "De hoes vult de hele cirkel; bij muziek blijft de plaat.",
    },
    pl: {
      welcomeTitle: "Witaj w Casora",
      whatsNewTitle: "Nowości w Casora {version}",
      continue: "Dalej",
      all: "Wszystkie zmiany",
      w1t: "Pokój po pokoju",
      w1: "Zaprojektuj swój pulpit z urządzeń, które już masz w Home Assistant.",
      w2t: "Asystent urządzeń",
      w2: "Casora proponuje pasujące kafelki dla każdego pokoju i dodaje je za ciebie.",
      w3t: "Komputer, tablet i telefon",
      w3: "Jeden pulpit, który dopasowuje się do każdego ekranu, z własnym układem na telefon.",
      n0t: "Wyszukiwanie", n0: "Na telefonie dotknij u góry ekranu Dom, aby znaleźć pokoje, urządzenia lub sceny. Na komputerze Cmd+K.",
      n1t: "iPad i iPhone", n1: "Pokrętła i suwaki znowu dają się przeciągać zamiast przewijać stronę.",
      n2t: "Eksport i import", n2: "Zapisz panel jako plik lub przekaż go dalej, w Studio przez ⋯.",
      n3t: "Filmy i seriale", n3: "Okładka wypełnia całe koło; przy muzyce zostaje płyta.",
    },
    pt: {
      welcomeTitle: "Bem-vindo ao Casora",
      whatsNewTitle: "Novidades do Casora {version}",
      continue: "Continuar",
      all: "Todas as alterações",
      w1t: "Divisão a divisão",
      w1: "Desenha o teu painel com os dispositivos que já tens no Home Assistant.",
      w2t: "Assistente de dispositivos",
      w2: "O Casora propõe os cartões certos para cada divisão e adiciona-os por ti.",
      w3t: "Computador, tablet e telemóvel",
      w3: "Um painel que se adapta a cada ecrã, com layout próprio para o telemóvel.",
      n0t: "Pesquisa", n0: "No telemóvel toca no topo do Início para encontrar divisões, dispositivos ou cenas. No computador com Cmd+K.",
      n1t: "iPad e iPhone", n1: "Os seletores e controlos voltam a deixar-se arrastar em vez de deslocar a página.",
      n2t: "Exportar e importar", n2: "Guarda um painel como ficheiro ou partilha-o, no Studio através de ⋯.",
      n3t: "Filmes e séries", n3: "A capa preenche todo o círculo; com música fica o disco.",
    },
  };
  // Texts for a language: its own, English for anything it does not have (yet).
  const texts = (lang) => Object.assign({}, TEXT.en, TEXT[String(lang || "").split(/[-_]/)[0]] || {});

  /** First visit: what Casora is - three lines, no more. */
  const WELCOME = [
    ["mdi:view-dashboard-edit-outline", "w1t", "w1"],
    ["mdi:auto-fix", "w2t", "w2"],
    ["mdi:cellphone-link", "w3t", "w3"],
  ];

  /** After an update: the news of this version - replace on every release. */
  const WHATS_NEW = [
    ["mdi:magnify", "n0t", "n0"],
    ["mdi:tablet", "n1t", "n1"],
    ["mdi:export-variant", "n2t", "n2"],
    ["mdi:movie-open-outline", "n3t", "n3"],
  ];

  // Decide on load - before the Studio writes its own casora.* keys.
  const startMode = (() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === VERSION) return null;
      if (seen !== null) return "whatsNew";
      // Studio used before this sheet existed → an update.
      const used = Object.keys(localStorage).some((k) => /^casora[._-]/i.test(k) && k !== SEEN_KEY);
      return used ? "whatsNew" : "welcome";
    } catch (e) { return null; }
  })();

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, VERSION); } catch (e) { /* ohne Speicher eben wieder */ }
  }

  // The app mark (brand/icon.svg): roof and rooms in clay, one window in honey.
  const MARK = '<svg viewBox="48 52 416 416" aria-hidden="true">'
    + '<path d="M76 236 256 86l180 150" fill="none" stroke="#B67A50" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<rect x="138" y="254" width="104" height="96" rx="26" fill="#E8B04A"/><g fill="#B67A50"><rect x="270" y="254" width="104" height="96" rx="26"/>'
    + '<rect x="138" y="366" width="104" height="96" rx="26"/><rect x="270" y="366" width="104" height="96" rx="26"/></g></svg>';

  const CSS = `
    .cw-scrim{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;
      background:rgba(0,0,0,.45);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);
      animation:cw-in .28s ease both;font-family:var(--primary-font-family, system-ui, sans-serif)}
    .cw-sheet{width:min(460px,100%);max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;
      padding:34px 30px 26px;border-radius:26px;background:var(--casora-studio-sheet, #1c1e24);color:var(--casora-studio-ink, #fff);
      box-shadow:0 30px 80px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08);
      display:grid;justify-items:center;gap:18px;animation:cw-up .38s var(--casora-ease-enter, cubic-bezier(.2,.8,.3,1)) both}
    .cw-mark{width:64px;height:64px;filter:drop-shadow(0 10px 22px rgba(240,140,80,.45))}
    .cw-sheet h2{margin:0;font-size:34px;font-weight:700;letter-spacing:-.03em;text-align:center;text-wrap:balance}
    .cw-sheet ul{list-style:none;margin:6px 0;padding:0;display:grid;gap:18px;width:100%}
    .cw-sheet li{display:grid;grid-template-columns:40px 1fr;gap:14px;align-items:start;line-height:1.4;color:var(--casora-studio-ink-2, rgba(255,255,255,.62));font-size:15px}
    .cw-sheet li b{color:var(--casora-studio-ink, #fff);font-weight:600}
    .cw-sheet li ha-icon{--mdc-icon-size:30px;color:var(--casora-studio-accent, #00C3D0);margin-top:2px}
    .cw-go{width:100%;height:52px;border:0;border-radius:26px;background:var(--casora-studio-done, linear-gradient(to bottom,#2fd6e0,#00a8b4));
      color:var(--casora-studio-on-done, #fff);font:inherit;font-size:17px;font-weight:600;cursor:pointer}
    .cw-go:focus-visible{outline:2px solid #7fe8ef;outline-offset:3px}
    .cw-all{color:var(--casora-studio-link, #2fd6e0);font-size:15px;text-decoration:none}
    .light .cw-sheet{background:var(--casora-studio-sheet, #f2f2f7);color:var(--casora-studio-ink, #1d1d1f);box-shadow:0 30px 80px -20px rgba(0,0,0,.35), inset 0 0 0 .5px rgba(0,0,0,.06)}
    .light .cw-sheet li{color:var(--casora-studio-ink-2, #6e6e73)}
    .light .cw-sheet li b{color:var(--casora-studio-ink, #1d1d1f)}
    .light .cw-sheet li ha-icon{color:var(--casora-studio-accent, #00838c)}
    .light .cw-all{color:var(--casora-studio-link, #00838c)}
    .light.cw-scrim{background:rgba(0,0,0,.22)}
    @keyframes cw-in{from{opacity:0}to{opacity:1}}
    @keyframes cw-up{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion: reduce){.cw-scrim,.cw-sheet{animation:none}}`;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function show(mode, lang) {
    const L = texts(lang);
    const list = mode === "welcome" ? WELCOME : WHATS_NEW;
    const host = document.createElement("div");
    host.setAttribute("data-casora-welcome", "");
    const root = host.attachShadow({ mode: "open" });
    // Light when HA is light (like the Studio).
    const themes = ((document.querySelector("home-assistant") || {}).hass || {}).themes;
    const light = !!(themes && themes.darkMode === false);
    root.innerHTML = `<style>${CSS}</style><div class="cw-scrim${light ? " light" : ""}" role="dialog" aria-modal="true" aria-labelledby="cw-t">
      <div class="cw-sheet"><div class="cw-mark">${MARK}</div>
      <h2 id="cw-t">${esc(mode === "welcome" ? L.welcomeTitle : L.whatsNewTitle.replace("{version}", VERSION))}</h2>
      <ul>${list.map(([icon, t, x]) => `<li><ha-icon icon="${icon}"></ha-icon><span><b>${esc(L[t])}</b><br>${esc(L[x])}</span></li>`).join("")}</ul>
      <button class="cw-go">${esc(L.continue)}</button>
      ${mode === "welcome" ? "" : `<a class="cw-all" href="${CHANGELOG_URL.replace(/\.md$/, String(lang || "").toLowerCase().split(/[-_]/)[0] === "de" ? ".de.md" : ".md")}" target="_blank" rel="noreferrer">${esc(L.all)}</a>`}
      </div></div>`;
    const close = () => { markSeen(); host.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
    root.querySelector(".cw-go").addEventListener("click", close);
    root.querySelector(".cw-scrim").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
  }

  // For the updates page: the same news as plain text („Neu in …“).
  window.casoraWhatsNew = (lang) => {
    const L = texts(lang);
    return { version: VERSION, title: L.whatsNewTitle.replace("{version}", VERSION),
      items: WHATS_NEW.map(([, t, x]) => [L[t], L[x]]) };
  };

  window.casoraWelcomeShow = (mode) => show(mode || "whatsNew",
    ((document.querySelector("home-assistant") || {}).hass || {}).language);

  if (!startMode) return;

  // Wait until the Studio knows whether dashboards exist: without a Casora dashboard
  // the Studio greets on its own („Willkommen bei Casora“ before the assistant) - then not twice.
  const t0 = Date.now();
  const find = (root, d) => {
    if (!root || d > 8) return null;
    const hit = root.querySelector && root.querySelector("casora-panel");
    if (hit) return hit;
    for (const el of (root.querySelectorAll ? root.querySelectorAll("*") : [])) {
      if (el.shadowRoot) { const f = find(el.shadowRoot, d + 1); if (f) return f; }
    }
    return null;
  };
  const wait = () => {
    const p = find(document, 0);
    const ready = p && p._hass && Array.isArray(p._dashList);
    if (!ready && Date.now() - t0 < 15000) { setTimeout(wait, 300); return; }
    if (!p || !p.isConnected) return;
    // No Casora dashboard yet = a new user (E12, test 2): the Studio greets; no "New in Casora" list of changes
    // they never knew, even when other casora.* keys made this look like an update.
    if (!(p._dashList || []).length) { markSeen(); return; }
    show(startMode, p._hass && p._hass.language);
  };
  setTimeout(wait, 600);
})();
