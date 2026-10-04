# Changelog

Casora grew out of [Hemma](https://github.com/willsanderson/Hemma) 2.1.2 (MIT) and has been
developed independently since 26.09.2026. Hemma's earlier entries are in the Git history.
The German version is in [CHANGELOG.de.md](CHANGELOG.de.md).

## 1.0.4 – 04.10.2026

### Fixed
- The overview's name now looks the same everywhere: a name you gave it (also “Home” in German) stays
  exactly as you typed it in the navigation, room title, phone bar, phone header and Studio. Only the
  name Casora set up itself follows the interface language.
- Updates popup: the gap below Available updates no longer disappears after opening.
- Phone: in a room, tiles that are on (a light, a running washer) move to the front again, as on the
  desktop. The rest keeps the order from the Studio.
- Phone: a room shows its windows, doors and locks as badges, as in the room header on the desktop.
  Existing phone layouts pick them up when the dashboard is next opened in the Studio.
- Renaming a room in the Studio now also renames it on the phone: header, room page, bottom bar, room
  badges and the air quality title. Phone layouts brought over from Hemma are no longer left out, and a
  room renamed earlier is brought up to date when the dashboard is next opened in the Studio.
- Phone: every badge now gives the same light tap feedback as the tiles (before, Security, Climate,
  People and Media did not). In Weich, the air quality symbol in the badge circle is as large as the others.

## 1.0.3 – 04.10.2026

### New
- **Plants say what they need:** one plain wording for tile, popup and notifications: “Doing well”,
  “Needs water”, “Too wet”, “Needs fertilizer”, “Over-fertilized”, “Needs more light”, “Too much sun”,
  “Too cold”, “Air too dry”, “Take a look”. If several readings are off, water comes first.
- **A new mark:** roof and rooms in Casora's warm tone with one window lit in honey, with a lighter
  version for Home Assistant in dark mode.
- If Casora was installed through HACS, updates appear only in HACS, so Casora is no longer listed twice
  under Settings → Updates.
- **Rename Favorites on the phone:** Studio → Home → Appearance → “Name on phone”. The section stays the
  favorites section under any name, it never turns into a room.
- **Washer and dryer:** the popup shows progress, finish time, program and phase, “Done, laundry inside”
  with an “Unloaded” button, recent runs and stats per program. Casora prefers the maker's integration
  (Home Connect, Miele, SmartThings, LG ThinQ and others), then WashData, then a smart plug.
- **Security in the room:** locks, alarm, contacts and cameras can show as their own badges
  (Studio → room → Badges → “Show individually”), colored green, orange or red by state.
- **Name your own cards** in the Studio tile list.
- **AI schedules per feature** under Settings → AI: Off, Automatic (previous time) or a custom weekday and
  time. New installations start with everything off; existing installations keep their previous behaviour.
  The AI update check runs once a day instead of every hour, or only when you tap the button.
- **Beta versions:** a new switch under Updates gets pre-releases early (off by default; with HACS, turn on
  betas in HACS).
- **Electricity price from the Energy dashboard:** device costs use the grid price from Home Assistant's
  Energy settings when no price is set in Casora, including a live price entity.
- **Active rows:** popups for lights, heating, ventilation, network, aquarium, windows and doors, locks,
  covers and room climate highlight what is on or needs attention.
- The recipe of the week can put its ingredients on a shopping list of your choice.
- **Moving from Hemma keeps your own work:** your own JS modules stay loaded, customized popups are
  recognized, “Mine” becomes its own tile type while the Casora tile keeps getting updates, and folders
  your automations write to stay in place.

### Improved
- The plant tile reads the cause straight from the plant, even without sensors set up in the tile.
- Casora checks for updates directly on GitHub. The update server, the Casora key and the
  “Update access” page are gone.
- New README, guide and website, and all screenshots in the Casora look.
- Setup assistant: “Set up automatically” uses Casora's warm tone instead of a bright blue.
- The Updates tile follows the Studio again: by default it only shows when there is something to update.
  On the phone it no longer appears at full height first and then collapses.

### Fixed
- Swipe tiles (e.g. plants) no longer cast a square shadow: the stack no longer clips the card shadow at a rectangular edge.
- Phone: tapping the security badge shows its sub badges again (locks, cameras, contacts), like climate and lights.
- Updates popup: brand logos in the rows get rounded corners like an app icon, so square logos look calm inside the circle.
- The top navigation shows the overview under the name you typed (e.g. Home), like the room title,
  instead of translating it.
- Room energy badge: rooms that earlier got just one device power sensor automatically now show the sum of all devices in the room once; a device total sensor counts alone, otherwise every channel counts (no double counting).
- Plant popup: the light row was marked orange although the plant integration doesn't rate light.
- No error message when Home Assistant restarts while the dashboard is open.
- A door with a lock sensor and a contact sensor is reported open only once.
- The air quality badge shows the same rating as its popup (CO₂ and particle sensors count), in
  matching color and symbol.
- The battery popup is only wide when it shows two columns.
- Changing the Home Assistant language no longer breaks tiles with a template error.
- Phone: no extra gap above the next section when nothing is playing, and hidden tiles no longer
  flash back after closing a filter.
- Weather popup: rain, wind and visibility use the decimal separator of your language.
- Rooms with only a window or door contact show the security badge again.
- Badge order matches Hemma: security, climate, lights, people, energy, scenes, media.
- The energy badge shows in every room that measures power, also at 0 W; switching it off stays off.
- The bell shows one dot, also with several notifications, and no longer reports fuel station sensors
  as open doors. Windows with the same name in different rooms are all reported.
- Phone: the room badge row appears on first open, badge circles sit evenly, the Studio works in
  landscape, “Update all” lines up with its heading.
- Swipe tile: at the end of the stack the row scrolls on, the dots can be tapped, vertical swipes scroll
  the page.
- Air purifier and fan show mode and speed as Home Assistant names them.
- Waste tile shows the next pickup when no duty is planned; aquarium devices count as running from 2 W.
- iPads no longer switch to the reduced effects mode.
- AI answers (coaches, camera, plants, aquarium, e-bike, update check, recipe) use the language of Home
  Assistant.
- Room energy badge: without a sensor for the whole room it shows the sum of all plugs and devices, and its
  popup lists each one.
- Phone: the light chip is back after temperature and humidity, chips have an even gap, the Media badge only
  appears while something is playing, and the home screen photo follows the one chosen in the Studio.
- Weich: scene buttons match the other tiles.
- Vacuum, 3D printer and underfloor heating find their entities through the official integrations, in every
  Home Assistant language. Without a printer name the popup shows the device name.
- Car doors, windows and locks no longer count as openings of the home.
- Windows and doors popup and plant popup are fully translated to English.
- The camera badge says Camera for one camera and Cameras for several.
- Tapping an "is open" notification for a window or door opens the Doors & windows popup instead of the locks popup.
- Updates popup: the two columns under More line up, also in Safari, and the AI check rows match the other rows.
- A running update shows "Updating" with a small spinner instead of almost invisible text.
- Integrations without a brand image show a neutral puzzle icon instead of "icon not available".
- The Updates tile shows a download arrow when updates are available and a restart arrow when a restart is pending.
- Climate popup: More sits below the readings.
- Player: the tip of the skip forward button is no longer cut off.

### Changed
- The e-bike tile works with the Bosch eBike integration (Bosch Smart System). The fields for a custom charger
  and live battery sensor are gone.
- Aquarium tile: pick the light profile, the schedule switch and the dosing pump buttons in the advanced
  fields. Older tiles with an entity prefix keep working.
- Waste settings: the "your turn" months, sensor and reminder sit under a collapsed "Advanced" section.

Several of these fixes and the phone favorites name were taken over from Hemma 2.2.0 (MIT).

## 1.0.1 – 02.10.2026

### Improved
- **Setup:** The preview images for look and effects now show the current Casora design.
- **Choosing a font:** Every font shows a large specimen with sample lines, so the difference
  is clear at a glance.
- **Inter is Casora's font,** also in the Casora look. Plus Jakarta Sans is removed; if you had
  picked it, you get Inter.
- Notifications: The first entry no longer sticks to the top edge when everything is read.
- Checkmarks and success messages in the assistant use Casora green instead of a harsh green.
- Vehicle: Derived helpers (for example a monthly counter) are no longer mistaken for the real
  odometer.
- Status lines never break right before a “·” anymore, and the space before the “·” in sublines is back.
- **Polish after a complete review** of Studio and dashboard in light and dark, on desktop, tablet and phone:
  consistent column spacing in popups, “More” in two columns for network, energy, updates, washer, dryer
  and robot vacuum too, full size climate icons, clearly visible Assist suggestions, camera buttons with
  room to breathe, Studio colors matching the Casora look, cut off selection fields end with “…”, and the
  room menu in the sidebar has icons.
- Energy without a power sensor shows today's value as the main line.
- **Moving from Hemma feels like an update:** Rooms, tiles and badges come along one to one. The new dashboard
  is called “My Home”. Switches, aquariums and doorbells become Studio tiles, the overview's weather is added
  to rooms without their own weather, and the lighting badge appears even with a single light group. A YAML
  dashboard that can't be read is shown with a note instead of being skipped silently.
- **Removing Hemma:** After the restart, Casora checks that everything is gone and confirms it in the Studio.
- **Batteries:** Charging devices are highlighted like active tiles, with the room as a subline. Low batteries
  show an orange or red icon, and the section is called “Low battery” (which also fits built in batteries).
- **Camera:** No separate privacy logic anymore. A camera that is switched off is simply off, the same for
  every integration. The name on the still image is readable in light looks too.
- **Device missing:** If a tile's device no longer exists, the tile shows “Device missing” instead of “Off”,
  and the popup points to the Studio. The tile list in the Studio marks these tiles as well.
- **Time travel:** Restore and “Back to now” stay pinned to the bottom, and the summary only lists real changes.
- **Calendar:** The ring shows today's date, calendar colors match the look, and tapping the icon opens the
  calendar.
- **Studio:** Tile list and room view use sublines instead of a crowded right column, the device assistant's
  selection fields match the Studio style, the first field in the tile editor can be removed too, and every
  dashboard can be saved.
- Climate sub badges with full size icons, room chips in the lighting popup fade out softly, and the setup
  shows preview images in your language.
- Aquarium doctor and bike check run through Casora itself and no longer need scripts of their own.


## 1.0.0 – 02.10.2026

### New
- **New Casora look:** warm linen and sand, large corners, soft shadows, in light and dark.
  It is the new default. The previous looks stay available as “Hemma (Legacy)” and
  “Hemma Glass (Legacy)” and look exactly as before.
- **Popups rebuilt:** ring, title and a status line at the top, controls on the left, devices
  on the right. Things you rarely need sit in the collapsed “More” area. It spans both columns
  and spreads evenly over two columns when opened.
- **Vehicle for any integration:** The car tile now recognizes cars by their values instead of
  a specific integration, for example VW, Škoda, Tesla or BMW, including EVs with battery level.
  Several cars are possible.
- **Recipe popup:** meal plan as a week strip, idea of the week as a banner, shopping list in
  two columns.
- **Scenes popup** with scene chips like the lighting popup.
- **Custom font:** Plus Jakarta Sans is included. Your own fonts (for example Gilroy) can be
  uploaded in the Studio under “Look & Controls → Text”.
- **Studio in light and dark,** matching Home Assistant, with consistent icon colors and action
  buttons in the accent tone like the dashboard.

### Improved
- One color system for icons in badges, menus and the Studio.
- Media: volume, progress and ring in pink red, Apple Music in its own red. The ring is gray
  while nothing is playing.
- Cameras: technical duplicate streams hidden, an “All cameras” arrow, age shown as “… min ago”.
- Badges with a colored icon circle, tile switches and type tuned to match. A badge row that is
  too long fades out softly on tablet and desktop.
- Waste and heating: the headings of both columns line up.
- The overview's name stays exactly as you type it, including “Home” in German, on desktop and
  phone.
- A fresh Casora always greets you with “Welcome to Casora”.
- Moving from Hemma: Hemma's helper values are carried over, and “Remove Hemma” cleans up thoroughly.

### Fixed
- 3D printer: The tile turns red on “Failed”, like the popup.
- Media popup: The room line under the title was cut off at the top (umlauts).
- Studio: Clicking a room from Settings, Updates or Time travel didn't take you back to the room.
- Heating coach: “Evaluate again” depended on a wrong condition.
- Aquarium light opened an empty popup.
- Alarm: After disarming, it couldn't be armed again without reopening.
- Descenders in the tile status were cut off.

### Removed
- Old, unused popups (old contact, aquarium overview, aquarium light, old robot vacuum, old
  dishwasher). Existing tiles redirect to their successors.


## 0.5.1 – 30.09.2026

### New
- **Welcome and start page:** New users first see what Casora is, then
  “How do you want to start?” with Set up, New dashboard, From Hemma or YAML import.
  The assistant no longer starts on its own. The start page is always reachable through
  “Start page …”.
- **Settings in the Studio:** a “Casora, for all dashboards” area in the sidebar with
  Home & devices, Bell & notices, New dashboards, AI, Outdoor values & electricity price,
  Ventilation and Update access. These are the same options as under Integrations, plus the
  previous home settings.
- **Updates with a Casora key:** Casora can get updates from its own update server;
  instead of a GitHub token, a personal key that can be revoked is enough.
  An existing token keeps working for now.

### Improved
- **“Rewind”** (German “Zeitreise”) instead of “Versions”, so it isn't confused with
  updates.
- **Badge rows scroll sideways** when they are too wide: on desktop with the mouse wheel
  and by dragging, on the phone by swiping. The scenes badge also expands in the preview.
- Long room names in the sidebar end with “…”; states like “Jammed” or
  “Unavailable” appear in German; numbers use a decimal comma everywhere.
- Room climate and solar tip no longer land on “Home” on their own, only through
  “Add tile”.
- **All scenes** in the scenes badge instead of at most ten; the row scrolls.
- **English interface** reworked (consistent terms, missing translations added).
- Release notes in Home Assistant's update dialog are readable; the note about missing
  update access appears only once.

### Fixed
- Studio preview: the navigation bar stuck out over the edge.
- Start page: “Cancel” in the settings didn't lead back.
- Phone: sub badges (lighting, energy, media) were partly out of reach.
- Phone: with many rooms, rooms in the “Rooms” menu seemed to be missing. The list
  now shows that it scrolls and jumps to the open room.
- After an update without a restart, the Studio stayed empty (takes effect from the next update).

### Quality
- A fixed check now runs before every release: syntax, unit tests, end-to-end tests,
  regression tests for every reported bug and an automatic walk through Studio and
  dashboards on desktop, tablet and phone, also with a stress house
  (many rooms, scenes, long names).

## 0.5.0 – 30.09.2026

### New
- **Updates in the Studio:** its own area “Casora → Updates” in the sidebar. All
  versions with their changes to expand, “Install” with progress and a
  restart notice, “Check for updates”. With update access from GitHub, otherwise from the
  bundled CHANGELOG.
- **Card updates:** fixes for single cards and popups come as small packages of their own
  (`karten-…`), without a restart, checked by checksum and minimum version, and
  automatic if you like. Cards you customized yourself stay untouched.
- **Templates stay current:** after an update, Casora brings all dashboards to the new
  templates at startup. Only unchanged ones, and a version is saved first.
- **Draft:** unsaved changes survive a reload; “Done” asks first.
- **Popup settings in every tile** with a popup: title and fields right in the
  tile editor, with a live preview.
- **“Add tile” with search** and “Fits <room>”; when the match is unclear, Casora
  asks.
- **Moving recognizes renamed Hemma dashboards** (different template prefix).

### Improved
- **Moving:** AI no longer preselected, price on the button, name field, hide the old
  dashboard (YAML: a note), comparison with an AI column, first version right after the move.
- **Phone:** takes over renaming, moving and deleting rooms, the same
  home badges as on desktop and the tile order from the Studio. Faster first
  load (bundled scripts, cache), no unfiltered intermediate state anymore.
- **“Zuhause”** is the name of the overview room in German, “Home” in English.
- Selection fields with names, search and matching devices first; glass design in the preview
  and undoable; tile row on desktop with mouse wheel and dragging.
- Sensors are checked for plausibility (weather, updates, thermostat, energy,
  batteries); German numbers and dates in popups and charts.

### Fixed
- Security showed “Secured” although a door was unlocked; climate, car, e-bike,
  room climate, recipe and light popups were partly empty; network “Offline” despite a connection.
- Popups on iPhone were see-through; the scenes menu on the phone showed all scenes of the house.
- The room template was never updated on newly created dashboards.
- First letter swallowed when renaming; room icon changed when renaming.

## 0.4.0 – 29.09.2026

### New
- **Updates without HACS:** with a read-only GitHub token in the Casora options
  (“Update access”), new versions appear under Settings → Updates. “Install”
  backs up the running version to `casora_sicherungen/` and tells you when a restart
  is needed.
- **New setup assistant:** pick a look (Casora Standard or Casora Glass),
  effects for weaker devices, rooms as photos, “How do you want to start?” with a live preview
  of the Hemma dashboard, a finish page with desktop and phone preview and “Use as
  default dashboard”. Pages glide into each other.
- **Rooms fill themselves (standard room):** “Start fresh” puts devices straight into
  their rooms, sorted (lights → heating → air → covers → media → devices). From two
  lights, covers or locks they are combined into one tile, status LEDs are left out,
  favorites go to Home. Preview with deselect; the rules are under “Personal → Standard room”.
- **AI (optional, your own API key):** when moving, carry your own tile customizations over
  to Casora's version (per tile type “Mine | Casora | ✦ AI”, “All with AI”, preview through
  “View”), and during setup assign devices without a room and name tiles. Casora picks
  the right AI itself (Sonnet before Opus), estimates the cost first and can create its own
  “Casora AI” with a strong model if the existing one is too weak.
- **Room photos for 31 room types**, picked by room name when there are no photos of your own.
- **Moving assistant Hemma → Casora:** the Studio finds Hemma 1 and Hemma 2 dashboards
  itself (at first start and in the menu “Move from Hemma …”), shows rooms, tiles and
  custom cards, backs up the original (`casora_sicherungen/`) and creates a new
  Casora dashboard with a phone layout next to it. Tiles you customized are recognized by
  the fingerprints of all Hemma original templates; for each tile type you choose “Keep
  mine” or “Take Casora's” instead of losing them silently.
- **Studio → “Personal …”:** waste (bins, duty months, calendar, reminder),
  calendars with colors, bell (zone wording, mailbox, battery exceptions,
  combined contacts, device care), hidden scenes, door and window groups,
  Now Playing icons and volume, night mode switch and e-bike, stored in
  the integration instead of a file. An existing `einstellungen.js` is taken over the
  first time you open it.
- **Ventilation by push:** pick recipients (notify services) and optionally people in the
  Casora options. “Ventilate now” from 7 to 22 only when someone is home, “Close
  windows” from 7 to 23, both only after 10 min; CO₂ from 2500 ppm right away as a critical
  notice. Without recipients there are no push notices.
- **Network popup finds devices itself:** routers, access points, switches, Wi‑Fi networks and
  latency, independent of the maker (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik, OpenWrt …).
  Your own lists in the dashboard still take precedence.

### Improved
- Conditional tiles show the name, icon and fields of the tile inside them in the Studio, and their
  condition in words; conditional collection cards (automatic, carousel) are named.
- Old Hemma dashboards also look right under the Casora theme (theme bridge
  `--hemma-*` → `--casora-*`).
- Inter font as in the Hemma original; header at the same height as in Hemma.
- Phone preview with a real notch: wallpaper up to the top, navbar in its place.
- Studio: selection texts and placeholders fully in German.
- No fixed entities in the code anymore: doors and windows, outdoor sensors, backup, Cookidoo,
  e-bike and scenes are detected or set in “Personal”.
- English complete: popup titles, live updated values and texts inserted later
  are translated too; about 560 more texts and patterns.
- Casora's own sensors (ventilation, solar tip, AI) are named in Home Assistant's language.
- Scene chips: “last activated” and more room for chips sized to their content.
- Screenshots for README and website from a neutral, English demo house.

### Fixed
- New empty dashboards got no navbar on the phone.
- The light tile didn't count a list of lights without an HA group (“2 On”).
- The sidebar stayed hidden after the dashboard preview.
- “Move to Casora” clicked twice created two dashboards.
- The template package contained fixed network entities of a sample house; the
  build now checks nested lists too.

## 0.3.0 – 27.09.2026

### New
- **Sets itself up:** the integration creates helpers, scripts and the Casora theme
  at startup (the service `casora.einrichten` repeats it). `packages/casora_helpers.yaml`
  and `themes/casora/` are gone; the theme is switched on with the first dashboard.
- **Room climate and solar tip** without fixed entities: `sensor.casora_lueften`,
  `binary_sensor.casora_lueften_hinweis`, `binary_sensor.casora_solar_tipp`.
- **Multilingual tiles and popups:** texts follow Home Assistant's language
  (German, English).
- **“Welcome” / “New in Casora”** in the Studio, once per version.
- Now Playing: Netflix and DAZN logo when the player provides no image.

### Improved
- The Studio greets new users even when HA's own “Map” dashboard exists.
- New dashboards: HA header off (also without kiosk-mode), room addresses with
  umlauts, sensible room preselection, clock in HA's time format, “Add devices” as the
  next step; the device assistant saves by itself.
- Import: the phone layout gets the tiles right away.
- Desktop: glass pill centered next to the sidebar, the clock never below it.
- Cameras tile without a selection shows all cameras; camera popup with a still image for
  cameras without a stream; camera tile on the phone in the normal tile grid.

### Fixed
- Phone/desktop redirect caused many console errors (“reading 'config'”).
- Tapping a room on the phone: error message because of a missing filter option.
- The vacuum icon called the service `vacuum.turn_off`, which no longer exists.
- Aquarium tile without a state; 3D printer icon dark while printing.
- Default background image and room images on new installations (404).

### Removed
- Plex (tile, popups, badge, Now Playing sources, sensor, `swipe-card-patch.js`).

## 0.2.0 – 26.09.2026

### New
- Its own name throughout: templates, cards, CSS variables, scripts, theme and
  helpers are called “casora…”. The service `casora.umstellen` converts existing dashboards
  (with a backup); Hemma dashboards are translated on import.
- AI in the integration: energy, heating and ventilation coach, camera and
  plant AI, update check, recipe of the week, with options (AI, web AI,
  outdoor sensors, electricity price, notices).
- Devices are found automatically: 3D printer, washer/dryer, dishwasher,
  robot vacuum, underfloor heating, solar storage, car, waste, calendar.
- Casora Studio: Casora tiles with icon and fields, “Automatic: …” placeholders,
  “Complete with AI”, device assistant, import assistant for Hemma 1.
- Your own settings in `/config/www/casora/einstellungen.js`.
- Icons, weather and room images come from the integration (`/casora_assets`).

### Transition
- `casora-kompat.js` keeps old element and window names available for dashboards that
  haven't been converted; the theme “Hemma” is an alias of “Casora”.
