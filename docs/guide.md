# Casora guide

Everything the [README](../README.md) leaves out: setting up, the Studio, moving from Hemma, the AI features, troubleshooting and the actions Casora adds to Home Assistant.

**Contents**

- [Install](#install)
- [The setup assistant](#the-setup-assistant)
- [Working in Casora Studio](#working-in-casora-studio)
- [Looks and fonts](#looks-and-fonts)
- [What Casora recognises](#what-casora-recognises)
- [Moving from Hemma](#moving-from-hemma)
- [Removing Hemma](#removing-hemma)
- [Using the dashboard](#using-the-dashboard)
- [Community cards](#community-cards)
- [When a device is missing](#when-a-device-is-missing)
- [Rewind: going back to an earlier version](#rewind-going-back-to-an-earlier-version)
- [Updates](#updates)
- [AI features (optional)](#ai-features-optional)
- [Privacy in detail](#privacy-in-detail)
- [FAQ and troubleshooting](#faq-and-troubleshooting)
- [Actions](#actions)

## Install

You need **Home Assistant 2026.9** or newer with dashboards in storage mode (the default), plus two frontend cards from HACS:

| | |
|---|---|
| [**UI eXtension (UIX)**](https://github.com/Lint-Free-Technology/uix) | Required. The successor to card-mod. After downloading, restart and add it under Settings → Devices & services → Add integration → **UI eXtension**. Use it instead of card-mod, not both. |
| [**button-card**](https://github.com/custom-cards/button-card) | Required. |
| An **AI task** in Home Assistant | Optional, for the [AI features](#ai-features-optional). |

1. In HACS open the menu, choose **Custom repositories** and add `https://github.com/SH1FT-W/casora` with the type **Integration**. The button in the [README](../README.md#install) does the same in one click.
2. **Download Casora**, together with UIX and button-card if you don't have them yet, then **restart Home Assistant** once.
3. **Add the integrations** under Settings → Devices & services → Add integration: **Casora**, and **UI eXtension** if it isn't added yet. UIX does nothing until it is added there.
4. **Open Casora Studio** in the sidebar.

Casora checks the requirements when you first open the Studio and links you to anything missing. Casora creates its helpers and registers its dashboard resources itself; its actions and designs come with the integration, so nothing is written into your configuration.

**Without HACS:** download the [latest release](https://github.com/SH1FT-W/casora/releases), copy its `custom_components/casora` folder into `/config/custom_components/`, restart and add the integration. New versions then show up under Settings → Updates in Home Assistant, and you install them the same way.

## The setup assistant

The first time you open Casora Studio, it greets you with a short welcome. The setup assistant then walks you through these pages. **Back** works on every page, and nothing is created until the end.

1. **Choose your look.** *Casora* is the default: warm linen, soft shadows and big round corners. *Casora Nebel* is the same design in cool grey with a petrol accent, and *Casora Glas* puts frosted glass over your room photos. The look is applied the moment you pick it. More in [Looks and fonts](#looks-and-fonts).
2. **Choose your font.** *Inter* is Casora's font. *Hanken Grotesk* is a little rounder, and *System font* uses the device's own (SF Pro on Apple devices). Each option shows a large specimen.
3. **Smooth on every screen.** *Automatic* lets each device choose for itself, *All effects* keeps glass, blur and depth everywhere, and *Reduced effects* uses clear panels for older tablets. With *Automatic*, older wall tablets switch to reduced effects on their own.
4. **Existing dashboard found.** This page only appears if Casora finds something to bring along: a Hemma dashboard (*Take over from Hemma*, see [Moving from Hemma](#moving-from-hemma)) or a Casora dashboard in YAML (*Import YAML dashboard*). Each is shown as a live preview. *Start from scratch* continues with the steps below.
5. **Choose your rooms.** Each room gets its own page, and *Home* is always included. The list comes from your Home Assistant areas. If you have none yet, Casora suggests a few to start with. You also name the dashboard here.
6. **Fill your rooms.**
   - **Set up automatically:** your devices go into their rooms, sorted and grouped.
   - **✦ Set up with AI:** like automatic, but AI also places devices that have no room and gives tiles clear names. Casora shows a cost estimate first.
   - **Start empty:** the rooms stay empty and you add tiles yourself in the Studio.
7. **Check.** A preview shows what goes where. Untick anything you don't want before it is created.
8. **Your dashboard is ready.** A summary shows the look and whether a phone layout was made. From here you can turn on **Use as default dashboard** (it then opens first in the browser and in the app, and phones switch to the phone layout by themselves) and start editing.

You can run the assistant again at any time from the Studio's ⋯ menu (**Setup assistant…**).

## Working in Casora Studio

Everything after the first setup happens in the Studio: rooms and room photos, tiles and their fields, badges, popups, scenes and the phone layout. The preview is the editor: click a title, badge or tile in the live preview and its settings open beside it (on a phone, tap it and they open in a sheet from below). The preview switches between desktop, tablet and phone.

- **The toolbar** has **Rooms** (switch, add and arrange rooms), **Content** (everything in the open room, including what the preview doesn't show right now), **+** (add a tile), **Settings** and **Community**. On a phone the bar at the bottom has **Rooms**, **Content**, **+**, **Look & feel** and **Settings**. **Search…** (⌘K or Ctrl+K) finds rooms, tiles, devices, settings and actions.
- **Nothing is written until you save.** **Save** keeps the Studio open, **Done** saves and opens the dashboard. An unsaved draft survives a reload, and leaving asks before anything is discarded. The clock next to Undo opens [Rewind](#rewind-going-back-to-an-earlier-version).
- **The dashboard's name** at the top opens the dashboard menu: switch to another dashboard or create one, and for this dashboard **Rename…**, **Icon…**, **Open on phone…**, **Phone layout** and **Delete…**.
- **The ⋯ menu** contains **Move from Hemma…**, **Device assistant…**, **Import from YAML…**, **Setup assistant…**, **Quick tour**, **Keyboard shortcuts** and **Help…**. On a phone it also holds **Community cards…**.

**Settings** opens a start page with a search and six topics. Entries marked *Only this dashboard* change only the dashboard you are editing; everything else applies to all your Casora dashboards.

| Topic | What you set there |
|---|---|
| **Look & feel** | The design of all dashboards, and the clock of this dashboard (**Time**). |
| **Messages** | What the bell shows on this dashboard, the bell's wording and exceptions for all dashboards (zone wording, mailbox, batteries to ignore, doors and windows with two sensors), ventilation push notifications and Live Activities on the phone's lock screen. |
| **Home & Devices** | Waste collection (your names for the bins), doors and windows (hide single ones or give them a name of their own), players and scenes to hide, the calendars the calendar tile and its popup show, and the scenes of this dashboard. |
| **Weather & climate** | This dashboard's weather source and chart values, outdoor temperature and humidity, and your electricity price. Leave the price empty and Casora uses the grid price from Home Assistant's Energy dashboard. |
| **Controls** | Hold on tiles, font, tile size on the phone and the other controls of this dashboard, plus how Casora fills a new dashboard and whether it looks for Hemma dashboards (**New Dashboards**). This is also where you [remove Hemma](#removing-hemma). |
| **Extras** | Which AI Casora uses, hints for the AI and a schedule for each AI feature, and fuel prices for the car popup. |

Below the topics, **System › Updates** shows the installed version and every version with its release notes (see [Updates](#updates)).

The AI, outdoor and electricity price settings and the ventilation push are also in Home Assistant under Settings → Devices & services → Casora → **Configure**.

## Looks and fonts

| Look | What it is |
|---|---|
| **Casora** | The default. Warm linen and sand, large corners, soft shadows, in light and dark. Home Assistant's theme picker in your profile lists it under the same name. |
| **Casora Nebel** | The same design in cool light grey with a petrol accent. |
| **Casora Glas** | Casora with frosted glass over your room photos, in light and dark. In performance mode the glass surfaces turn opaque. |

All three follow Home Assistant's light and dark mode. You can change the look later in the Studio under **Settings › Look & feel › Design**; it applies to all dashboards at once. The legacy looks Hemma 2 and Hemma 1 were removed in 26.10.31; if you used one, Casora switches you to *Casora Glas* once and tells you.

The font is **Inter** in every look. You can switch to Hanken Grotesk or the system font per dashboard under **Settings › Controls › Controls on this dashboard › Text**. With **Own font** you upload fonts you hold a licence for there as well (for example Gilroy, with **Upload font**). Casora doesn't ship commercial fonts itself.

## What Casora recognises

3D printers (Bambu Lab), washing machines and dryers (from the maker's integration such as Home Connect, Miele, SmartThings or LG ThinQ, from WashData, or from a smart plug), dishwashers (Home Connect), fridges and freezers (Liebherr, Home Connect), coffee machines (Home Connect, Miele, De'Longhi, Jura, Melitta, La Marzocco, Philips or a smart plug), robot vacuums (Roborock, Dreame, Ecovacs, iRobot Roomba), robot lawn mowers (Husqvarna Automower, Gardena, Worx Landroid, Segway Navimow, Ecovacs GOAT, Mammotion), underfloor heating, home batteries (Anker Solix), cars (recognised by their values, so any integration works, including EVs with battery level), waste collection, calendars and your network (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik, OpenWrt …) are found through the device registry. Each gets its own tile and popup.

The washer and dryer popup shows progress, finish time, program and phase. When a run is over it says *Done · laundry inside* until you tap **Unloaded**, and it lists recent runs with stats per program.

**Security in the room.** By default a room shows one security badge. Under Studio → room → **Badges → Separate security badges**, locks, the alarm, door and window contacts and cameras get badges of their own, green when all is well, orange or red when something is open or unlocked.

A new dashboard sorts devices into their rooms (lights, then heating, air, blinds, media and appliances), groups a room once it has two or more lights, blinds or locks, and puts your favourites on Home.

Casora ships room photos for 31 room types, by day and by night, for rooms without photos of their own. It follows Home Assistant's language: English, German, Spanish, French, Italian, Dutch, Polish and Portuguese.

**Known limits.** The e-bike tile is for bikes with the Bosch Smart System and reads the Bosch eBike integration (HACS: Xunil99/ha-bosch-ebike); other e-bikes show no values. The aquarium tile is not found automatically: add it in the Studio and pick the light, light profile, dosing pump buttons and sensors in its advanced fields.

## Moving from Hemma

Moving feels like an update, and you won't lose anything you built.

1. **Make a Home Assistant backup** (Settings → System → Backups), just to be safe.
2. **Install Casora** as described [above](#install) and restart. Hemma can stay installed for now.
3. **Open Casora Studio.** It finds your Hemma dashboards, both Hemma 1 (YAML) and Hemma 2 (Hemma Studio), including renamed ones, and shows what will move across. A YAML dashboard Home Assistant can't read is listed with a note instead of being skipped silently.
4. **Decide what to do with tiles you changed yourself.** Casora compares your templates against fingerprints of every original Hemma template. For each tile type you changed, you choose **Mine** (keep your version), **Casora** (use Casora's version) or **AI** (carry your changes over to Casora's version, with a preview before you accept). *All mine*, *All Casora* and *All with AI* decide for every tile at once. Nothing is replaced without asking you.
5. Click **Move to Casora.**

**What comes along:** rooms, tiles, badges and the phone layout, one to one. Your own additions stay yours: JS modules you load yourself keep loading, customised popups are recognised, a tile you chose **Mine** for becomes a tile type of its own (Casora's tile keeps getting updates next to it), and folders your automations write to stay where they are. Switches, aquariums and doorbells become Studio tiles, the weather of the overview is added to rooms without weather of their own, and your Hemma helper values (for example the thermostat mode) are carried over. Room photos from `www/hemma` are copied to `/config/casora_photos` (served only to logged-in users), icons to `www/casora`.

**What stays:** Casora builds a **new** dashboard next to your old one, called *My Home* or after the original. It saves a copy of the original to `/config/casora_sicherungen/` and leaves your Hemma dashboard untouched. When you're happy, the last page offers to **hide the old dashboard in the sidebar** (it stays saved under Settings → Dashboards) and to **remove Hemma**.

You can start the move again at any time from the ⋯ menu (**Move from Hemma…**). Dashboards that have already moved aren't offered again.

## Removing Hemma

Casora replaces Hemma. Once your dashboards have moved, Hemma is no longer needed, and running both loads their scripts twice. Casora can remove it for you.

1. In the Studio open **Settings › Controls › New Dashboards**. The **Hemma** group appears as long as Hemma or its leftovers are there. (The move assistant also offers **Remove Hemma afterwards…** on its last page.)
2. Click **Remove Hemma…**. A list shows exactly what goes and what stays:
   - **The Hemma integration**, removed through HACS (so HACS doesn't install it again) or by deleting `custom_components/hemma`.
   - **Hemma's dashboard resources.** If they are set up in YAML, Casora tells you which lines to remove from `configuration.yaml` yourself.
   - **Hemma dashboards** you tick. Dashboards set up in YAML stay.
   - **Hemma's helpers, scripts and automations**, recognised by where they came from, not by name. Their values move to the Casora helpers first, and your own entries in the same files stay.
   - **The Hemma theme.** If it was your default, Casora takes over.
   - **Old files in `www/hemma`**, only when no dashboard uses them any more and everything has been copied over to Casora.
3. Casora saves a backup to `/config/casora_sicherungen/` first. If the backup fails, nothing is removed.
4. **Restart Home Assistant** when asked. Casora never restarts on its own.

**After the restart, Casora checks.** The Studio confirms *Hemma is completely removed* and shows where the backup is. If something is still there, for example a loaded integration or a leftover helper, it lists what is left and offers **Remove the Rest**.

## Using the dashboard

- **Tap** the icon of a tile to switch the device, tap the rest of the tile to open its popup.
- **Press and hold** a tile and a small menu opens right at the tile (a bottom sheet on phones). At the top sits the main action (turn off, unlock, pause …), below it quick controls for the device: brightness and colour, cover position, temperature, volume and tracks, target humidity or fan speed. **History**, **Device** and **Edit tile** (jumps to the tile in the Studio) follow. On desktop a right-click opens the same menu; on the keyboard use Shift+F10 or the context-menu key. In the Studio under **Settings › Controls › Controls on this dashboard › Tiles**, "Hold on tiles" lets you choose the quick menu, the popup or Home Assistant's dialog instead for the whole dashboard; a single tile can differ under **Visibility, ask first & hold**.
- **Timers.** In the quick menu, "Turn off in" or "Turn on for" 15 min, 30 min, 1 h or 2 h is available for lights, switches, fans, air purifiers, humidifiers, heating and media players. While a timer runs, the tile shows a ring with a clock in the top corner that empties over time. Timers survive a restart and are dropped when you switch the device by hand first. Automations can use the [actions](#actions) `casora.set_timer` and `casora.cancel_timer`.
- **Casora pages instead of Home Assistant's dialog.** A reading (temperature, power …) opens its chart with 24 h, 7 days or 30 days, highest, lowest and average value. A door or window contact shows when it was open. A device opens its device page with everything that belongs to it and "Open in Home Assistant" for the rest. All of them have ‹ back to where you came from.
- **Ask first.** Unlock, "Open door" and the alarm always ask before they act; codes are asked masked. Any other tile can ask too: turn it on in the Studio in the tile's settings under **Visibility, ask first & hold**.
- **The bell** collects what needs attention, such as open doors, low batteries, finished appliances and updates. It also shows Home Assistant's notifications, so a script or automation can put a message there with `persistent_notification.create`; Home Assistant's own notices appear too. Tap one to read the whole message and delete it; swiping it away in the bell dismisses it in Home Assistant as well. With the Pulse integration, its problems show up in the bell too. What the bell shows is set per dashboard under **Settings › Messages › Bell on this dashboard** (switch off **Home Assistant notifications** there if you don't want them).

## Community cards

Cards for devices that not every home has ship with Casora but stay out of **Add a tile** until you add them. In the Studio, open **Community** in the toolbar; on a phone choose **Community cards…** in the **⋯** menu.

- **Add a card.** Every card has a preview of its tile and popup; tap it to see both large. Once added, the card appears in **Add a tile** for all your dashboards. Removing a card asks whether tiles that use it stay or go.
- **Request a card.** Choose **Request a card…**, describe the device and what the tile and popup should show, and pick a few example entities. Casora prepares a GitHub issue with the kind of device, units, device classes and attribute names, but without entity names, rooms or places, and shows you the exact text first. You submit it on GitHub yourself. **Your requests** shows where each one stands: Open, Question (with the answer), In progress, Built or Declined.
- **Available now:** Frigate camera, Reolink doorbell, Velair thermostat, chart and pet tracker (Tractive). The robot lawn mower and the coffee machine started as community cards and are regular tiles now. Nothing is downloaded from outside your Home Assistant: new cards come with a Casora release. If a card is ever retired, it disappears from **Add a tile** first while existing tiles keep working.
- **Talking at the Reolink doorbell** is an experiment: turn on **Talk (experiment)** in the tile's settings. It needs HTTPS and the doorbell connected in your network (RTSP), and not every doorbell accepts it. With Home Assistant 2026.11 and its two-way audio (a Labs preview), Casora talks through Home Assistant's own player.

## When a device is missing

If a tile's device no longer exists in Home Assistant (renamed, re-paired or removed), the tile shows **Device missing** instead of *Off* or nothing at all. Its popup says the same and points you to the Studio, and the Studio marks the tile in its tile list and preview.

Open the tile in Casora Studio, choose the device again and click **Save**.

## Rewind: going back to an earlier version

Every save becomes a version. Casora keeps the last **30 versions** of each dashboard in `/config/casora_versionen/`. Moves, imports and template updates are kept as entries of their own.

1. In the Studio, click the clock next to Undo, or search for **Rewind** (*Zeitreise* in German).
2. Pick an earlier version. A short summary lists what actually changed, and the preview shows it.
3. Click **Restore This Version** to go back to it, or **Back to Now** to leave everything as it is.

## Updates

New versions arrive through **HACS** like any other integration: install the update and restart Home Assistant. In the Studio, an **Update** button appears in the toolbar when a new version is there, and **Settings › System › Updates** shows the installed version and all versions with their release notes. Without HACS, Casora looks for new releases on GitHub and lists them under Settings → Updates.

**Beta versions.** With HACS, open the beta in the version list under **Settings › System › Updates** in the Studio and tap **Install**; HACS downloads it. You can also open Casora in HACS, choose ⋮ › **Redownload** and pick the beta in the version list. Without HACS, turn on **Beta versions** on the same Updates page so betas show up under Settings → Updates too. Betas can have bugs. Casora never installs anything by itself: the Studio's **Install** button asks HACS, so updates always go through HACS (or a manual download).

After an update, Casora brings your dashboards up to its new templates when Home Assistant starts. It only touches templates you haven't changed yourself, and it saves a version first, so a notification tells you which dashboards were updated and that you can undo it with [Rewind](#rewind-going-back-to-an-earlier-version).

What's new in each version is shown once in the Studio and listed in the [changelog](../CHANGELOG.md).

**Version numbers.** Since October 2026 Casora counts year.month.number: 26.10.31 is the 31st release of October 2026. Every release gets the next number; there are no separate patch or minor versions. The jump from 1.6.0 to 26.10.31 was intended, HACS and the Casora update treat it as a normal update.

## AI features (optional)

Casora can use an AI **you have already set up in Home Assistant** (Settings → AI tasks). Casora has no account, no server and no API key of its own. Without an AI task, these features stay off and everything else works as usual.

**In the Studio**

- **Set up with AI:** AI places devices that have no room and names tiles.
- **Moving from Hemma:** AI carries your own tile changes over to Casora's templates, and you can preview the result before you accept it.
- **Custom cards in popups:** AI adapts a card you paste in to Casora's look.
- **Device assistant:** describe a device in a sentence and AI helps fill in the rest.

**On the dashboard** (set up in the Studio under **Settings › Extras › AI**, or in Home Assistant under Settings → Devices & services → Casora → **Configure**)

| Feature | What it does |
|---|---|
| **Energy coach** | Gives you a weekly look at your consumption, with concrete tips and what they would save at your electricity price. |
| **Heating coach** | Reviews heating times and set points, and warns about heating while a window is open. |
| **Ventilation coach** | Watches CO₂ and humidity in each room and tells you when to open a window, and when not to. It can also send push notifications to devices you pick. |
| **Camera description** | Describes what a camera sees in one sentence. A camera that is off or offline isn't described. |
| **Plant doctor** | Diagnoses a plant from seven days of sensor readings and tells you what to do next. |
| **Aquarium doctor** | Assesses an aquarium from seven days of temperature, equipment, light and leak sensor. |
| **Bike check** | Assesses an e-bike: service, wear by mileage and battery care. |
| **Update check** | Reads the release notes of pending updates and checks them against *your* setup before you install anything. |
| **Recipe of the week** | Suggests a seasonal recipe and adds its ingredients to your shopping list if you ask. |

The aquarium doctor and the bike check start from the aquarium and e-bike popups. Their button only appears when an AI task is set up.

**Schedules.** In the Studio under **Settings › Extras › AI › Automatic runs**, each feature gets its own schedule: **Off** (the AI only runs when you tap a button in a popup), **Automatic** or a day and time you pick. Automatic means the energy coach on Sundays at 18:00, the heating coach on Mondays at 07:00 (heating season only), the ventilation coach on Saturdays at 10:00 and the recipe on Mondays at 06:00. The update check runs daily or only when you ask. On a new install every schedule starts **Off**; an upgrade keeps what you had. AI answers in your Home Assistant language. **Hints for the AI** are added to every review, for example *"The bedroom window is tilted on purpose."*

> [!IMPORTANT]
> **AI costs money.** AI calls run on your own provider account and API key, and your provider bills you for them. Before each AI step in the Studio, Casora shows an estimate based on list prices, and you can continue or cancel. The estimate is only a guide; your provider's bill is what counts. Casora picks a suitable model itself (a Sonnet-class model rather than an Opus-class one). If your current AI isn't strong enough, Casora can set up a separate *Casora AI* task with a stronger model, and your existing AI stays as it is. Nothing runs on a schedule unless you give that feature a schedule.

## Privacy in detail

Casora runs entirely inside your Home Assistant. It has no cloud service, no account, no analytics and no telemetry. The only times it contacts anything outside your home are:

- **AI features**, if you turn them on. Requests go through Home Assistant's own AI task integration to the provider **you** configured. They include only the data that feature needs, for example a camera image when you ask for a description, or your consumption figures for the energy coach.
- **Integration logos** in the updates popup are loaded from `brands.home-assistant.io`, the same source Home Assistant uses.
- **New releases** are looked up on GitHub (`api.github.com`) so they can show under Settings → Updates. Nothing about your home is sent.
- **Community card requests:** the status under **Your requests** is looked up on GitHub by the request's number. You submit the request yourself on GitHub.
- **Fuel prices**, if you enter your own Tankerkönig key: Casora asks Tankerkönig for the stations within your radius around the car or your home. With Home Assistant's Tankerkönig integration instead, Casora only reads its sensors. The browser loads the station logos from the brands' websites, Wikimedia or Google's favicon service.
- **Football tile:** the popup loads the league table and form from ESPN, the same source the Team Tracker integration uses.

Updates come through HACS or the GitHub release page. Ventilation push notifications and pushes about new Casora versions go only to the devices you select. Your own room photos are stored in `/config/casora_photos` and are served only to logged-in users. Dashboards, versions (`/config/casora_versionen/`), backups (`/config/casora_sicherungen/`) and your settings stay on your Home Assistant instance and are included in its regular backups.

## FAQ and troubleshooting

**My dashboard doesn't show what's new after an update.**
Casora updates unchanged templates by itself when Home Assistant starts. If something is still old, open the dashboard in Casora Studio and click **Save**: this brings in Casora's current templates. Templates you changed yourself are left as they are, and the Studio log tells you which ones.

**A tile says "Device missing".**
The device behind it no longer exists in Home Assistant. See [When a device is missing](#when-a-device-is-missing).

**I can't hide my old Hemma dashboard.**
Dashboards defined in `configuration.yaml` (YAML mode) can't be hidden from the Studio. Set `show_in_sidebar: false` for that dashboard in your YAML instead. Dashboards stored in Home Assistant can be hidden with one click.

**Hemma is still listed after I removed it.**
Restart Home Assistant if you haven't yet. After the restart the Studio shows what is left and offers **Remove the Rest**. Anything set up in YAML (resources, helper files) has to be removed from those files by hand; Casora names the lines.

**A tile or popup looks unstyled.**
UIX or button-card is probably missing, UIX was downloaded but never added under Settings → Devices & services, or card-mod is installed alongside UIX. Open Casora Studio: it checks the requirements and links you to anything missing. Then reload the browser. If you're using the Companion app, clear the frontend cache.

**The look isn't quite right.**
Check the design in the Studio under **Settings › Look & feel › Design**; it applies to all dashboards. If your Home Assistant profile picks another theme, that choice wins in that browser: pick a Casora design there or go back to the default.

**A chart says "No data".**
Casora draws its charts itself from Home Assistant's history, so the sensor has to be recorded (Recorder). Charts over 7 or 30 days and the daily bars use long-term statistics, which a sensor only has with a state class.

**I made a change I regret.**
Use [Rewind](#rewind-going-back-to-an-earlier-version): click the clock next to Undo, pick an earlier version and click **Restore This Version**.

**Casora's helpers are missing.**
Run the `casora.einrichten` action (Developer tools → Actions); Casora also runs it at every start. It creates whatever helper is missing, leaves existing helpers alone and reports anything it couldn't create.

**I upgraded from an older Casora that used `packages/casora_helpers.yaml` and `themes/casora/`.**
You can keep them, because Casora leaves existing helpers alone. You can also delete both and restart: Casora creates the missing helpers itself and no longer needs a theme file.

**I had picked Plus Jakarta Sans.**
It was removed in 1.0.1. Dashboards that used it now get Inter.

**Reporting a problem.**
In the Studio, open ⋯ → **Help…** → **Copy diagnostics…**. Casora shows a short summary and copies it: the Casora and Home Assistant versions, language, theme, device, and per entity domain how many entities there are, how many are diagnostic, hidden or disabled, and how many the Studio's lists and tile suggestions offer. It contains no entity names, rooms, people, addresses or URLs. Paste it into your [GitHub issue](https://github.com/SH1FT-W/casora/issues); it often answers the first questions right away.

**Can I still write YAML by hand?**
Yes. Casora writes ordinary Lovelace dashboards, so custom templates, hand-built views and per-card overrides keep working. See [ADVANCED.md](ADVANCED.md).

## Actions

Casora adds these actions to Home Assistant (Developer tools → Actions).

| Action | Purpose |
|---|---|
| `casora.energie_coach`, `casora.heizungs_coach`, `casora.lueftungs_coach` | Run a coach now |
| `casora.kamera_beschreiben` | Describe a camera image |
| `casora.pflanzen_doktor` | Diagnose a plant |
| `casora.aquarium_doktor` | Assess an aquarium (the aquarium popup passes its sensors) |
| `casora.ebike_check` | Check an e-bike: service, wear and battery care (the e-bike popup passes its entities) |
| `casora.update_pruefen`, `casora.update_bestaetigen` | Check a pending update, or mark it as reviewed |
| `casora.rezept_neu`, `casora.rezept_auf_liste` | Get a new recipe of the week, or add its ingredients to the shopping list |
| `casora.einrichten` | Create missing helpers again (Casora also does this at every start) |
| `casora.umstellen` | Rename existing Hemma dashboards to Casora names (with a backup) |
| `casora.ai_generate` | Like `ai_task.generate_data`, but falls back to the first AI task when none is chosen. Used by Casora's AI steps |
| `casora.light_smart_toggle`, `casora.thermostat_overlay_toggle`, `casora.actions_overlay_toggle`, `casora.restart_toggle` | Used by Casora's tiles: turn a light group back on with the lamps that were on, open a tile's thermostat or action controls, restart a device after a confirming tap |
| `casora.set_timer`, `casora.cancel_timer` | Turn an entity off or on after 1–1440 minutes (the hold menu's timers), or remove that timer. `set_timer` can return `entity_id`, `at` and `start` |

When a timer ends, Casora fires the event `casora_timer_finished` with `entity_id`, `action` and `reason`: `expired` (time is up, after switching), `manual` (someone switched the entity by hand first) or `cancelled` (`cancel_timer`, or the entity was removed). Replacing a timer with a new `set_timer` fires nothing. Use it as an event trigger in automations.
