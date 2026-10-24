<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-title-dark.webp" />
  <img src="docs/images/readme-title-light.webp" alt="Casora: Your home. At ease. The home view on a desktop with a house photo, weather, status badges and device tiles." />
</picture>

<p>A calm, photo-backed dashboard that sets itself up.<br/>
Shape the rest room by room in a visual studio. No YAML.</p>

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FSH1FT-W%2Fcasora%2Fmain%2Fcustom_components%2Fcasora%2Fmanifest.json&query=%24.version&label=version&style=flat-square&color=94603B&labelColor=3A322B)](https://github.com/SH1FT-W/casora/releases/latest)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026.9%2B-94603B?style=flat-square&labelColor=3A322B&logo=homeassistant&logoColor=white)](https://www.home-assistant.io)
[![HACS](https://img.shields.io/badge/HACS-custom-94603B?style=flat-square&labelColor=3A322B)](https://hacs.xyz)
[![License](https://img.shields.io/badge/license-MIT-94603B?style=flat-square&labelColor=3A322B)](LICENSE)

<p><a href="https://sh1ft-w.github.io/casora"><b>Website</b></a> &nbsp;·&nbsp; <a href="#new">New</a> &nbsp;·&nbsp; <a href="#layouts">Layouts</a> &nbsp;·&nbsp; <a href="#popups">Popups</a> &nbsp;·&nbsp; <a href="#studio">Studio</a> &nbsp;·&nbsp; <a href="#look">Designs</a> &nbsp;·&nbsp; <a href="#privacy">Privacy</a> &nbsp;·&nbsp; <a href="#install">Install</a> &nbsp;·&nbsp; <a href="CHANGELOG.md">Changelog</a></p>

</div>

<br/>

<a id="new"></a>
<sub><b>JUST ARRIVED</b></sub>
## Four new cards. One new look.

Community cards come with every Casora release and wait in the Studio until you add them, so your tile list stays short.

<!-- cards:new -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/cctv-dark.svg"><img src="docs/images/icons/cctv-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Frigate camera</b> <code>26.10.31</code><br>Live view with what Frigate detected last. Alerts and detections with clip, download, share and favourite, the recordings of the last days with a timeline.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/doorbell-video-dark.svg"><img src="docs/images/icons/doorbell-video-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Reolink doorbell</b> <code>26.10.31</code><br>Live picture that says when someone rang. Listen in, send a quick reply, sound the siren and see who rang lately.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/coffee-maker-outline-dark.svg"><img src="docs/images/icons/coffee-maker-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Coffee machine</b> <code>26.10.31</code><br>Ready, heating up or brewing with progress, and what the machine needs. Start drinks from the popup. Home Connect, Miele, De'Longhi, Jura, Melitta, La Marzocco or a smart plug.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/robot-mower-outline-dark.svg"><img src="docs/images/icons/robot-mower-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Robot lawn mower</b> <code>1.5.0</code><br>Mowing, parked or trapped, the battery as a ring, to station, mow and park, and the mowing time of the last 7 days. Extra details for Gardena.</td></tr>
</table>
<!-- /cards:new -->

And a new look: **Casora Glas** <sub>26.10.31</sub>, frosted glass over your room photos, light and dark, next to Casora and Casora Nebel. In performance mode the glass turns opaque.

Missing a card for one of your devices? Request it in the Studio under **Community**. It may become a card for everyone.

Every change, release by release, in the [changelog](CHANGELOG.md).

<br/>

<a id="setup"></a>
<sub><b>SETUP</b></sub>
## It already knows your home.

Casora reads Home Assistant's device registry, puts every device into its room and groups what belongs together. Your first dashboard is ready before you have touched a single tile.

The setup assistant in Casora Studio walks you through it: pick a look, let Casora sort your devices into rooms, check the preview and create your dashboard.

- **0** lines of YAML to get started. Everything is set up in the Studio.
- **31** room types with their own photos, for day and for night.
- **30** versions kept for every dashboard, ready to restore.

<br/>

<a id="layouts"></a>
<sub><b>DESKTOP, TABLET, PHONE</b></sub>
## One home. Three screens.

Every screen gets a layout made for it. Not a shrunken copy.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-screens-dark.webp" />
    <img src="docs/images/readme-screens-light.webp" alt="Casora on three screens side by side: a bedroom on a desktop display, the home view on a wall tablet and the phone layout." />
  </picture>
</p>

<!-- cards:layouts -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/monitor-dark.svg"><img src="docs/images/icons/monitor-light.svg" width="26" height="26" alt=""></picture></td><td width="29%" valign="top"><b>Desktop</b><br>Room by room. A full photo of each room, with its devices right below and every room one tap away.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tablet-dark.svg"><img src="docs/images/icons/tablet-light.svg" width="26" height="26" alt=""></picture></td><td width="29%" valign="top"><b>Wall tablet</b><br>Made for the hallway. Large tiles, readable from across the room, and a look that stays calm all day.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/cellphone-dark.svg"><img src="docs/images/icons/cellphone-light.svg" width="26" height="26" alt=""></picture></td><td width="29%" valign="top"><b>Phone</b><br>Your favourites first, a navigation bar under your thumb. Tiles can grow while something is going on and shrink again after.</td></tr>
</table>
<!-- /cards:layouts -->

<br/>

<a id="popups"></a>
<sub><b>POPUPS</b></sub>
## Tap a tile. See the whole story.

Lights, climate, energy, locks, blinds, media, cameras, plants, washers and dryers each open a popup of their own. Controls on the left, devices on the right, the rarely used tucked away under **More**.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-popups-dark.webp" />
    <img src="docs/images/readme-popups-light.webp" alt="The lighting popup on a desktop display and on a phone: every room with its lights, the rooms that are on highlighted, and a button to switch all off." />
  </picture>
  <br/><sub><b>Every light in the home, grouped by room.</b> The rooms that are on highlighted, and a button to switch all off.</sub>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-popups2-dark.webp" />
    <img src="docs/images/readme-popups2-light.webp" alt="The energy popup on a desktop display and on a phone: the home uses 896 W, all of it from solar, while 2.4 kW of solar power goes to the home, the home battery and the grid. Below, usage today and this month and the biggest consumers." />
  </picture>
  <br/><sub><b>Energy at a glance.</b> Power right now, where it comes from, how the solar power splits between home, battery and grid, and which devices use the most.</sub>
</p>

<!-- cards:popups -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/thermometer-dark.svg"><img src="docs/images/icons/thermometer-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Room climate</b><br>Temperature and humidity of every room, with a day of readings.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/washing-machine-dark.svg"><img src="docs/images/icons/washing-machine-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Every wash</b><br>Washer and dryer with their program, time left and energy.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/gas-station-outline-dark.svg"><img src="docs/images/icons/gas-station-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Fuel</b><br>When to refuel, and where it is cheapest right now.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/sprout-outline-dark.svg"><img src="docs/images/icons/sprout-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Plants</b><br>What a plant needs, in plain words.</td></tr>
</table>
<!-- /cards:popups -->

<br/>

<a id="hold"></a>
<sub><b>PRESS AND HOLD</b></sub>
## Hold a tile. Everything is right there.

The everyday actions should not need a popup. Press and hold any tile and a small menu opens right at the tile, a bottom sheet on the phone, a right-click on the desktop.

<!-- cards:hold -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/gesture-tap-hold-dark.svg"><img src="docs/images/icons/gesture-tap-hold-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>The quick menu</b><br>The main action on top: turn off, unlock, pause. Below it brightness and colour, position, temperature, volume. Then history, device and Edit tile.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/timer-outline-dark.svg"><img src="docs/images/icons/timer-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Timers</b><br>Turn off in 30 minutes or on for 2 hours. The tile shows a ring that empties over time. Timers survive a restart and step aside when you switch by hand.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/arrow-left-dark.svg"><img src="docs/images/icons/arrow-left-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>It stays in Casora</b><br>A reading opens its chart with 24 hours, 7 or 30 days. A window contact shows when it was open. Each with a back arrow, not Home Assistant's dialog.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/help-circle-outline-dark.svg"><img src="docs/images/icons/help-circle-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Ask first, then switch</b><br>Any tile can ask before it switches. Unlock, Open door and the alarm always ask. When you arm the alarm, Casora names open windows and doors.</td></tr>
</table>
<!-- /cards:hold -->

<br/>

<a id="tiles"></a>
<sub><b>TILES</b></sub>
## Everything in your home. Already covered.

Casora picks the right tile and popup for each device on its own, with the integrations you already have.

<!-- cards:tiles -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/home-outline-dark.svg"><img src="docs/images/icons/home-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Every home</b><br>Lights and light groups, switches, scenes, blinds and covers, locks, thermostats and room climate, fans, air purifiers, humidifiers, media players, cameras and doorbells.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/shield-home-outline-dark.svg"><img src="docs/images/icons/shield-home-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Safety</b><br>Alarm system, doors and windows, smoke, water and gas sensors, official warnings.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/lightning-bolt-outline-dark.svg"><img src="docs/images/icons/lightning-bolt-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Energy and house</b><br>Energy with solar and home battery, batteries of all devices, network, updates, waste collection, calendar, Pulse.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/washing-machine-dark.svg"><img src="docs/images/icons/washing-machine-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Appliances</b><br>Washing machine, dryer, dishwasher, robot vacuum, 3D printer.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/car-outline-dark.svg"><img src="docs/images/icons/car-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>On the road</b><br>Car with fuel prices nearby, e-bike.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/flower-outline-dark.svg"><img src="docs/images/icons/flower-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Hobbies</b><br>Plants, aquariums, football, game activity (PlayStation, Steam, Discord), recipe of the week.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/account-group-outline-dark.svg"><img src="docs/images/icons/account-group-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Community cards</b><br>Frigate camera, Reolink doorbell, coffee machine, robot lawn mower. They wait in the Studio until you add them.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/puzzle-outline-dark.svg"><img src="docs/images/icons/puzzle-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Your own</b><br>Any Home Assistant card as a custom tile.</td></tr>
</table>
<!-- /cards:tiles -->

### Community cards

Community cards ship with Casora, but they only appear in **Add tile** once you add them in the Community, so your tile list stays short. Every card has a preview of its tile and popup. Removing a card asks whether tiles that use it stay or go. Nothing is downloaded from outside your Home Assistant: a new Community card comes with a Casora release. If a card is ever retired, it disappears from **Add tile** first while existing tiles keep working, and only a later release removes it.


<details>
<summary><b>Request a card and follow it</b></summary>
<br/>

**Request a card.** In the Studio, open **Community** in the header (on a phone: the **⋯** menu) and choose **Request a card…**. Describe the device and what the tile and popup should show, and pick a few example entities. Casora prepares a GitHub issue for you and shows you the exact text before anything is sent. It contains the kind of device, units, device classes and attribute names, but no entity names, rooms or places. You submit it on GitHub yourself.

**Follow it.** Under **Your requests** in the Community the Studio shows where each request stands:

| State | Meaning |
|---|---|
| Open | Received, not picked up yet |
| Question | Something is unclear, the answer from the Casora team is shown right there |
| In progress | The card is being built |
| Built | The card ships with the next Casora release |
| Declined | Not planned, with the reason |

</details>

<br/>

<a id="studio"></a>
<sub><b>CASORA STUDIO</b></sub>
## Design it. Don't code it.

A visual editor in the Home Assistant sidebar. Rooms, tiles, badges and popups, changed in place with a live preview for desktop, tablet and phone. Tap anything in the preview and change it right beside it. Press and hold to try the real popup.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-studio-dark.webp" />
    <img src="docs/images/readme-studio-light.webp" alt="Casora Studio on a desktop display: the tile editor next to a live preview of the dashboard and the tile's popup." />
  </picture>
  <br/><sub><b>Casora Studio.</b> Rooms, tiles, badges and popups, edited in place. Nothing is written until you click Save.</sub>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme-tools-dark.webp" />
    <img src="docs/images/readme-tools-light.webp" alt="Two Studio assistants, each on a desktop display: the device assistant placing new devices, and the move assistant bringing a Hemma dashboard over." />
  </picture>
  <br/><sub><b>Assistants for the tedious part.</b> Place new devices, move from Hemma, go back to any version.</sub>
</p>

<!-- cards:studio -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/eye-outline-dark.svg"><img src="docs/images/icons/eye-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>See it before you save</b><br>Switch the preview between desktop, tablet and phone. Nothing is written until you click Save, and a draft survives a reload.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/history-dark.svg"><img src="docs/images/icons/history-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Go back in time</b><br>Every save becomes a version. Preview any earlier one and restore it with a click. Nothing is ever lost.</td></tr>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/auto-fix-dark.svg"><img src="docs/images/icons/auto-fix-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>New devices find their place</b><br>The device assistant spots what is new in your home and suggests the room and the tile. You decide.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/tune-dark.svg"><img src="docs/images/icons/tune-light.svg" width="26" height="26" alt=""></picture></td><td width="46%" valign="top"><b>Hold is configurable</b><br>Under Controls, Tiles, Hold on tiles picks what press and hold does: quick menu, popup or Home Assistant dialog, for all tiles or one.</td></tr>
</table>
<!-- /cards:studio -->

<br/>

<a id="look"></a>
<sub><b>THREE DESIGNS</b></sub>
## Soft by day. Warm by night.

Warm linen, generous corners and gentle shadows, set in Inter. All three designs come in light and dark and follow Home Assistant's theme mode.

<!-- cards:looks -->
<table>
<tr><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/palette-outline-dark.svg"><img src="docs/images/icons/palette-outline-light.svg" width="26" height="26" alt=""></picture></td><td width="29%" valign="top"><b>Casora</b><br>The default. Warm linen and sand, large corners, soft shadows.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/weather-fog-dark.svg"><img src="docs/images/icons/weather-fog-light.svg" width="26" height="26" alt=""></picture></td><td width="29%" valign="top"><b>Casora Nebel</b><br>The same calm design in cool grey with a petrol accent.</td><td width="34" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/icons/blur-dark.svg"><img src="docs/images/icons/blur-light.svg" width="26" height="26" alt=""></picture></td><td width="29%" valign="top"><b>Casora Glas</b><br>Frosted glass over your room photos. In performance mode the glass turns opaque for older tablets.</td></tr>
</table>
<!-- /cards:looks -->

<details>
<summary><b>The three designs in pictures</b></summary>
<br/>

<p align="center">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/design-casora-dark.webp" /><img src="docs/images/design-casora-light.webp" width="32%" alt="The Casora design: warm linen tiles on a desktop display and a phone." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/design-nebel-dark.webp" /><img src="docs/images/design-nebel-light.webp" width="32%" alt="The Casora Nebel design: cool grey tiles with a petrol accent." /></picture>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/design-glas-dark.webp" /><img src="docs/images/design-glas-light.webp" width="32%" alt="The Casora Glas design: frosted glass tiles over the room photo." /></picture>
<br/><sub>Casora, Casora Nebel and Casora Glas.</sub>
</p>

</details>

<br/>

<a id="hemma"></a>
<sub><b>COMING FROM HEMMA</b></sub>
## Moving feels like an update.

Casora finds your Hemma dashboards, both Hemma 1 (YAML) and Hemma 2 (Hemma Studio), and carries over rooms, tiles, the phone layout and your own cards. Your old dashboard stays untouched.

1. **Make a backup** in Home Assistant, just to be safe.
2. **Install Casora** and open the Studio. It lists everything that will move.
3. **Choose** for each tile you changed: keep yours, take Casora's, or let AI merge the two.

Your own JS modules, customised popups and folders your automations write to are kept as they are. Casora builds a new dashboard next to your old one and saves a copy of the original first. Your Hemma dashboard stays untouched until you choose to hide it. Step by step in the [guide](docs/guide.md#moving-from-hemma).

<br/>

<a id="install"></a>
<sub><b>INSTALL</b></sub>
## Three steps. Then it's yours.

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=SH1FT-W&repository=casora&category=integration"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open the Casora repository in HACS." /></a>

1. **Add the repository.** Click the button above, or in HACS open the menu, choose **Custom repositories** and add `https://github.com/SH1FT-W/casora` with the type **Integration**.
2. **Download Casora**, together with UIX and button-card if you don't have them yet, then **restart Home Assistant** once.
3. **Add the integrations** under Settings, Devices & services, Add integration: **Casora**, and **UI eXtension** if it isn't added yet. UIX does nothing until it is added there. Then open **Casora Studio** in the sidebar. The setup assistant takes it from there.

Updates arrive through HACS like any other integration. After an update, Casora brings your dashboards up to its new templates and saves a version first, so you can always go back. It never restarts Home Assistant on its own.

### What you need

| Requirement | Notes |
|---|---|
| **Home Assistant 2026.9** or newer | Required, with dashboards in storage mode (the default). |
| [**UI eXtension (UIX)**](https://github.com/Lint-Free-Technology/uix) | Required, from HACS. The successor to card-mod. After downloading, restart and add it under Settings, Devices & services, Add integration, **UI eXtension**. Use it instead of card-mod, not both. |
| [**button-card**](https://github.com/custom-cards/button-card) | Required, from HACS. |
| An **AI task** in Home Assistant | Optional, for the [AI features](docs/guide.md#ai-features-optional). |

Casora checks all of this when you first open the Studio and links you to anything missing. Helpers, scripts, resources and the theme are created by Casora itself.

<details>
<summary><b>Without HACS</b></summary>
<br/>

1. Download the [latest release](https://github.com/SH1FT-W/casora/releases) and copy its `custom_components/casora` folder into `/config/custom_components/` on your Home Assistant.
2. Install UIX and button-card if you don't have them yet, then **restart Home Assistant**.
3. Add the **Casora** and **UI eXtension** integrations and open **Casora Studio** in the sidebar, as above.

To update, replace the folder with the new release and restart. Without HACS, new versions show up under Settings, Updates in Home Assistant. Step by step in the [guide](docs/guide.md#install).

</details>

### Versions

Since October 2026 Casora uses calendar versions **`YY.M.N`**: year, month, and the number of the release within that month. `26.10.31` is the 31st release of October 2026. Every release, feature or fix, gets the next number; there are no separate patch or minor versions. The jump from 1.6.0 was intended: HACS and the Casora update see the new version as usual.

### Documentation

- [**Guide**](docs/guide.md): setup assistant, Studio, looks, moving from Hemma, rewind, AI features, FAQ and troubleshooting, actions
- [**Advanced YAML**](docs/ADVANCED.md): building and tuning Casora dashboards by hand
- [**Contributing**](docs/contributing.md): pull requests and screenshots
- [**Changelog**](CHANGELOG.md): what changed in each version, in English and [German](CHANGELOG.de.md)

Found a bug or have an idea? [Open an issue](https://github.com/SH1FT-W/casora/issues). For a bug, add the diagnostics from the Studio (⋯ → **Help…** → **Copy diagnostics…**): versions and counts only, no names.

<br/>

<a id="privacy"></a>
<sub><b>PRIVACY</b></sub>
## It stays at home.

- **No cloud.** Casora runs entirely inside your Home Assistant. No account, no analytics, no telemetry.
- **Your data, your backups.** Dashboards, versions and settings live on your own instance and are part of its regular backups.
- **AI only if you ask.** AI features stay off until you turn them on, and then use the provider you already set up in Home Assistant.

Casora only reaches outside for AI features you turn on (through the provider you configured), for integration logos from `brands.home-assistant.io` and to look for new Casora releases on GitHub. Updates come through HACS or the release page. The full list is in the [guide](docs/guide.md#privacy-in-detail).

### Optional, and quietly useful

With an AI task set up in Home Assistant, Casora can place devices that have no room, name tiles, and adapt your own cards to its look. On the dashboard it adds a few helpers: an energy coach, a heating coach, a ventilation coach, camera descriptions, a plant doctor, an aquarium doctor, a bike check, an update check against your setup and a recipe of the week.

AI runs on your own provider account. Before each AI step in the Studio, Casora shows a cost estimate. Each feature has its own schedule (off, automatic or a time you pick), and on a new install all of them start switched off. Without an AI task, these features simply stay off. More in the [guide](docs/guide.md#ai-features-optional).

<br/>

<sub><b>CREDITS</b></sub>
## Built on Hemma

Casora is built on [Hemma](https://github.com/willsanderson/Hemma) by [Will Sanderson](https://github.com/willsanderson), which grew out of [Homio](https://github.com/iamtherufus/Homio) by [@iamtherufus](https://github.com/iamtherufus). Thank you both.

Casora is an independent project and is not affiliated with Home Assistant or Nabu Casa. Released under the [MIT License](LICENSE). The original Hemma copyright notice is kept.

<br/>

<div align="center">
  <sub>A <a href="https://sh1ft-w.github.io"><b>SH1FT-W</b></a> project &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/flode">FLODE</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/pulse">Pulse</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/evenlight">Evenlight</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/agentbar">AgentBar</a> &nbsp;·&nbsp; <a href="https://sh1ft-w.github.io/sharemount">ShareMount</a> &nbsp;·&nbsp; Built with <a href="https://claude.ai">Claude</a></sub>
</div>
