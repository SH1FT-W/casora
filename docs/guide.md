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
| [**UI eXtension (UIX)**](https://github.com/Lint-Free-Technology/uix) | Required. Needs a restart. Use it instead of card-mod, not both. |
| [**button-card**](https://github.com/custom-cards/button-card) | Required. |
| [**apexcharts-card**](https://github.com/RomRider/apexcharts-card) | Optional, for the energy and history charts in popups. |
| An **AI task** in Home Assistant | Optional, for the [AI features](#ai-features-optional). |

1. In HACS open the menu, choose **Custom repositories** and add `https://github.com/SH1FT-W/casora` with the type **Integration**. The button in the [README](../README.md#install) does the same in one click.
2. **Download Casora**, together with UIX and button-card if you don't have them yet, then **restart Home Assistant** once.
3. **Add the integration** under Settings → Devices & services → Add integration → **Casora**.
4. **Open Casora Studio** in the sidebar.

Casora checks the requirements when you first open the Studio and links you to anything missing. Helpers, scripts, resources and the theme are created by Casora itself.

**Without HACS:** download the [latest release](https://github.com/SH1FT-W/casora/releases), copy its `custom_components/casora` folder into `/config/custom_components/`, restart and add the integration. New versions then show up under Settings → Updates in Home Assistant, and you install them the same way.

## The setup assistant

The first time you open Casora Studio, it greets you with a short welcome. The setup assistant then walks you through these pages. **Back** works on every page, and nothing is created until the end.

1. **Choose your look.** *Casora* is the default: warm linen, soft shadows and big round corners. The two classic looks from Hemma are offered as *Hemma 2 (Legacy)* and *Hemma 1 (Legacy)*. The look is applied the moment you pick it. More in [Looks and fonts](#looks-and-fonts).
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

Everything after the first setup happens in the Studio: rooms and room photos, tiles and their fields, badges, popups, scenes and the phone layout. Changes show up in a live preview for desktop, tablet and phone.

- **Nothing is written until you click Save.** An unsaved draft survives a reload, and leaving asks before anything is discarded.
- **The ⋯ menu** contains **Device assistant…**, **Import from YAML…**, **Rewind…**, **Setup assistant…** and **Move from Hemma…**, plus rename, icon and delete for the dashboard.
- **Casora → Settings**, at the bottom of the sidebar (on a phone at the end of the section list), holds everything that applies to all dashboards:

| Page | What you set there |
|---|---|
| **Home & Devices** | The few things Casora can't guess: waste collection (your names for the bins), calendars and their colours, doors and windows, scenes to hide and media players. |
| **Bell & Alerts** | What the notification bell reports, for example a mailbox sensor or batteries to ignore. |
| **New Dashboards** | How Casora fills a new dashboard and whether it looks for Hemma dashboards. This is also where you [remove Hemma](#removing-hemma). |
| **AI** | Which AI Casora uses, notes for the AI and a schedule for each AI feature (off, automatic or a time you pick). |
| **Outdoor & Price** | Outdoor temperature and humidity, and your electricity price. Leave the price empty and Casora uses the grid price from Home Assistant's Energy dashboard. |
| **Ventilation** | Who gets ventilation push notifications, and only when someone is home. |

These are the same options as in Home Assistant under Settings → Devices & services → Casora → **Configure**.

## Looks and fonts

| Look | What it is |
|---|---|
| **Casora** | The default. Warm linen and sand, large corners, soft shadows, in light and dark. Its theme has the same name in your Home Assistant profile. |
| **Hemma 2 (Legacy)** | The original dark glass over your room photos, exactly as before. |
| **Hemma 1 (Legacy)** | Clear glass tiles that let the room shine through. |

All three follow Home Assistant's light and dark mode. You can change the look later under Studio → **Look & Controls → Design**. Older Hemma dashboards keep their look under Casora's themes.

The font is **Inter** in every look. You can switch to Hanken Grotesk or the system font under **Look & Controls → Text**, and upload fonts you hold a licence for there as well (for example Gilroy). Casora doesn't ship commercial fonts itself.

## What Casora recognises

3D printers (Bambu Lab), washing machines and dryers (from the maker's integration such as Home Connect, Miele, SmartThings or LG ThinQ, from WashData, or from a smart plug), dishwashers (Home Connect), robot vacuums (Roborock), underfloor heating, home batteries (Anker Solix), cars (recognised by their values, so any integration works, including EVs with battery level), waste collection, calendars and your network (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik, OpenWrt …) are found through the device registry. Each gets its own tile and popup.

The washer and dryer popup shows progress, finish time, program and phase. When a run is over it says *Done · laundry inside* until you tap **Unloaded**, and it lists recent runs with stats per program.

**Security in the room.** By default a room shows one security badge. Under Studio → room → **Badges → Separate security badges**, locks, the alarm, door and window contacts and cameras get badges of their own, green when all is well, orange or red when something is open or unlocked.

A new dashboard sorts devices into their rooms (lights, then heating, air, blinds, media and appliances), groups a room once it has two or more lights, blinds or locks, and puts your favourites on Home.

Casora ships room photos for 31 room types, by day and by night, for rooms without photos of their own. It follows Home Assistant's language (English and German so far).

**Known limits.** The e-bike tile is for bikes with the Bosch Smart System and reads the Bosch eBike integration (HACS: Xunil99/ha-bosch-ebike); other e-bikes show no values. The aquarium tile is not found automatically: add it in the Studio and pick the light, light profile, dosing pump buttons and sensors in its advanced fields.

## Moving from Hemma

Moving feels like an update, and you won't lose anything you built.

1. **Make a Home Assistant backup** (Settings → System → Backups), just to be safe.
2. **Install Casora** as described [above](#install) and restart. Hemma can stay installed for now.
3. **Open Casora Studio.** It finds your Hemma dashboards, both Hemma 1 (YAML) and Hemma 2 (Hemma Studio), including renamed ones, and shows what will move across. A YAML dashboard Home Assistant can't read is listed with a note instead of being skipped silently.
4. **Decide what to do with tiles you changed yourself.** Casora compares your templates against fingerprints of every original Hemma template. For each tile type you changed, you choose **Mine** (keep your version), **Casora** (use Casora's version) or **AI** (carry your changes over to Casora's version, with a preview before you accept). *All mine*, *All Casora* and *All with AI* decide for every tile at once. Nothing is replaced without asking you.
5. Click **Move to Casora.**

**What comes along:** rooms, tiles, badges and the phone layout, one to one. Your own additions stay yours: JS modules you load yourself keep loading, customised popups are recognised, a tile you chose **Mine** for becomes a tile type of its own (Casora's tile keeps getting updates next to it), and folders your automations write to stay where they are. Switches, aquariums and doorbells become Studio tiles, the weather of the overview is added to rooms without weather of their own, and your Hemma helper values (for example the thermostat mode) are carried over. Room photos and icons from `www/hemma` are copied to `www/casora`.

**What stays:** Casora builds a **new** dashboard next to your old one, called *My Home* or after the original. It saves a copy of the original to `/config/casora_sicherungen/` and leaves your Hemma dashboard untouched. When you're happy, the last page offers to **hide the old dashboard in the sidebar** (it stays saved under Settings → Dashboards) and to **remove Hemma**.

You can start the move again at any time from the ⋯ menu (**Move from Hemma…**). Dashboards that have already moved aren't offered again.

## Removing Hemma

Casora replaces Hemma. Once your dashboards have moved, Hemma is no longer needed, and running both loads their scripts twice. Casora can remove it for you.

1. Open **Casora → Settings → New Dashboards**. The **Hemma** group appears as long as Hemma or its leftovers are there. (The move assistant also offers **Remove Hemma afterwards…** on its last page.)
2. Click **Remove Hemma…**. A list shows exactly what goes and what stays:
   - **The Hemma integration**, removed through HACS (so HACS doesn't install it again) or by deleting `custom_components/hemma`.
   - **Hemma's dashboard resources.** If they are set up in YAML, Casora tells you which lines to remove from `configuration.yaml` yourself.
   - **Hemma dashboards** you tick. Dashboards set up in YAML stay.
   - **Hemma's helpers, scripts and automations**, recognised by where they came from, not by name. Their values move to the Casora helpers first, and your own entries in the same files stay.
   - **The Hemma theme.** If it was your default, Casora takes over.
   - **Old files in `www/hemma`**, only when no dashboard uses them any more and everything is already in `www/casora`.
3. Casora saves a backup to `/config/casora_sicherungen/` first. If the backup fails, nothing is removed.
4. **Restart Home Assistant** when asked. Casora never restarts on its own.

**After the restart, Casora checks.** The Studio confirms *Hemma is completely removed* and shows where the backup is. If something is still there, for example a loaded integration or a leftover helper, it lists what is left and offers **Remove the rest**.

## When a device is missing

If a tile's device no longer exists in Home Assistant (renamed, re-paired or removed), the tile shows **Device missing** instead of *Off* or nothing at all. Its popup says the same and points you to the Studio, and the Studio marks the tile in its tile list and preview.

Open the tile in Casora Studio, choose the device again and click **Save**.

## Rewind: going back to an earlier version

Every save becomes a version. Casora keeps the last **30 versions** of each dashboard in `/config/casora_versionen/`. Moves, imports and template updates are kept as entries of their own.

1. In the Studio, open ⋯ → **Rewind…** (*Zeitreise* in German).
2. Pick an earlier version. A short summary lists what actually changed, and the preview shows it.
3. Click **Restore this version** to go back to it, or **Back to now** to leave everything as it is.

## Updates

New versions arrive through **HACS** like any other integration: install the update and restart Home Assistant. Without HACS, Casora looks for new releases on GitHub and lists them under Settings → Updates.

**Beta versions.** If you want new features early, turn on **Beta versions** under Casora Studio → **Updates**. Betas can have bugs. With HACS, turn betas on in HACS instead (*Show beta versions* on the Casora entry).

After an update, Casora brings your dashboards up to its new templates when Home Assistant starts. It only touches templates you haven't changed yourself, and it saves a version first, so a notification tells you which dashboards were updated and that you can undo it with [Rewind](#rewind-going-back-to-an-earlier-version).

What's new in each version is shown once in the Studio and listed in the [changelog](../CHANGELOG.md).

## AI features (optional)

Casora can use an AI **you have already set up in Home Assistant** (Settings → AI tasks). Casora has no account, no server and no API key of its own. Without an AI task, these features stay off and everything else works as usual.

**In the Studio**

- **Set up with AI:** AI places devices that have no room and names tiles.
- **Moving from Hemma:** AI carries your own tile changes over to Casora's templates, and you can preview the result before you accept it.
- **Custom cards in popups:** AI adapts a card you paste in to Casora's look.
- **Device assistant:** describe a device in a sentence and AI helps fill in the rest.

**On the dashboard** (set up under Casora → Settings → **AI**, or Settings → Devices & services → Casora → **Configure**)

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

**Schedules.** Under Casora → Settings → **AI → Automatic runs**, each feature gets its own schedule: **Off** (the AI only runs when you tap a button in a popup), **Automatic** or a day and time you pick. Automatic means the energy coach on Sundays at 18:00, the heating coach on Mondays at 07:00 (heating season only), the ventilation coach on Saturdays at 10:00 and the recipe on Mondays at 06:00. The update check runs daily or only when you ask. On a new install every schedule starts **Off**; an upgrade keeps what you had. AI answers in your Home Assistant language. **Notes for the AI** are added to every review, for example *"The bedroom window is tilted on purpose."*

> [!IMPORTANT]
> **AI costs money.** AI calls run on your own provider account and API key, and your provider bills you for them. Before each AI step in the Studio, Casora shows an estimate based on list prices, and you can continue or cancel. The estimate is only a guide; your provider's bill is what counts. Casora picks a suitable model itself (a Sonnet-class model rather than an Opus-class one). If your current AI isn't strong enough, Casora can set up a separate *Casora AI* task with a stronger model, and your existing AI stays as it is. Nothing runs on a schedule unless you give that feature a schedule.

## Privacy in detail

Casora runs entirely inside your Home Assistant. It has no cloud service, no account, no analytics and no telemetry. The only times it contacts anything outside your home are:

- **AI features**, if you turn them on. Requests go through Home Assistant's own AI task integration to the provider **you** configured. They include only the data that feature needs, for example a camera image when you ask for a description, or your consumption figures for the energy coach.
- **Integration logos** in the updates popup are loaded from `brands.home-assistant.io`, the same source Home Assistant uses.
- **New releases** are looked up on GitHub (`api.github.com`) so they can show under Settings → Updates. Nothing about your home is sent.

Updates come through HACS or the GitHub release page. Ventilation push notifications go only to the notify services you select. Dashboards, versions (`/config/casora_versionen/`), backups (`/config/casora_sicherungen/`) and your settings stay on your Home Assistant instance and are included in its regular backups.

## FAQ and troubleshooting

**My dashboard doesn't show what's new after an update.**
Casora updates unchanged templates by itself when Home Assistant starts. If something is still old, open the dashboard in Casora Studio and click **Save**: this brings in Casora's current templates. Templates you changed yourself are left as they are, and the Studio log tells you which ones.

**A tile says "Device missing".**
The device behind it no longer exists in Home Assistant. See [When a device is missing](#when-a-device-is-missing).

**I can't hide my old Hemma dashboard.**
Dashboards defined in `configuration.yaml` (YAML mode) can't be hidden from the Studio. Set `show_in_sidebar: false` for that dashboard in your YAML instead. Dashboards stored in Home Assistant can be hidden with one click.

**Hemma is still listed after I removed it.**
Restart Home Assistant if you haven't yet. After the restart the Studio shows what is left and offers **Remove the rest**. Anything set up in YAML (resources, helper files) has to be removed from those files by hand; Casora names the lines.

**A tile or popup looks unstyled.**
UIX or button-card is probably missing, or card-mod is installed alongside UIX. Open Casora Studio: it checks the requirements and links you to anything missing. Then reload the browser. If you're using the Companion app, clear the frontend cache.

**The look isn't quite right.**
Make sure your Home Assistant profile uses one of Casora's themes. Casora's own look is called *Casora* there; the Studio shows a hint if another theme is active.

**A popup has no charts.**
Install apexcharts-card (it's optional).

**I made a change I regret.**
Use [Rewind](#rewind-going-back-to-an-earlier-version): ⋯ → **Rewind…**, pick an earlier version and click **Restore this version**.

**Casora's helpers or scripts are missing.**
Run the `casora.einrichten` action (Developer tools → Actions). It creates whatever is missing, leaves existing helpers alone and reports anything it couldn't create.

**I upgraded from an older Casora that used `packages/casora_helpers.yaml` and `themes/casora/`.**
You can keep them, because Casora leaves existing helpers alone. You can also delete both and restart, and Casora will create what's missing.

**I had picked Plus Jakarta Sans.**
It was removed in 1.0.1. Dashboards that used it now get Inter.

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
| `casora.einrichten` | Create missing helpers, scripts and the theme again |
| `casora.umstellen` | Rename existing Hemma dashboards to Casora names (with a backup) |
