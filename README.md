# Random Sober Life

A small, private sobriety counter for **Windows** and **Android** that helps you count and battle alcoholism.
Everything stays on your devices — no account, no tracking. The two apps can sync through an end-to-end encrypted relay.

## Main screen

- **Top:** a gentle quote of the day (1,100+ soft, caring quotes about the inner journey, peace and growth, in a fixed
  shuffled order), or a **daily recovery reflection** (100 short, kind notes for the day), or off.
  The arrows browse; the next day jumps back to that day's quote or reflection.
- **Middle:** total sober time as **Years · Months · Days · Hours**, a medal for the latest milestone, and the money saved,
  growing every second.
- **Bottom:** current streak, longest streak, average streak, streak resets, journey resets.
- **Red + button:** log how many drinks and when (Day · Hour · Minute lists, defaults to now, with a Now button). The last 5 entries are listed; deleting one fully undoes it.

## Android home-screen widgets

Long-press the home screen, then Widgets, then Random Sober Life:

- **Sober counter** (2x2): days sober and money saved.
- **Journey card** (4x2): total sober time, medal, money, current streak, next medal.
- **Journey dashboard** (4x3): years, months, days and hours, money, progress to the next medal, streaks and resets.
- **Journey card + quote** (4x3) and **Dashboard + quote** (4x4): the same with the quote (or reflection) of the day.

The **+** on a widget opens a small floating Log drinks window over the home screen; the app itself stays closed.
Widget style (Settings): follow the app's colours, wallpaper colours (Android 12+), or see-through.
Widgets refresh once a minute while the screen is on.

## Settings

- Top section: quotes / daily reflection / off.
- Colours: 10 cozy packs, each with its own colours for the quote, money, stats and + button (Forest cabin, Ocean dusk,
  Sunset ember, Midnight lavender, Daylight meadow, Autumn tea, Sakura night, Rainy cafe, Northern lights, Lavender field).
- Currency (30 currencies, USD first) and money spent per day before quitting — one average amount, or one amount for each
  day of the week.
- What counts as one drink: 7 common measures (beer 330 ml, large beer 500 ml, pint, wine, spirit shot, cocktail,
  standard drink) or your own (name, ml, alcohol %).
- Drink rule: **"X drinks will erase Y days in stats"** — X = Any or 1–30, Y = All (journey reset), One streak, or 1–30 days.
  With **Drinks are accumulative** ticked the drinks add up across entries and the leftover carries over; unticking clears the count.
- Daily summary notification (default on, 8:00).
- Sync key (create on one device, join on the other).
- Backup: automatic backup file after every change (Documents\Random Sober Life on Windows, Download/Random Sober Life on Android), plus Backup now / Restore from file. Settings apply with "SAVE and Close".

## Milestones

1 day, 3 days, 1 week, 2 weeks, 1, 2, 3, 6 and 9 months, 1 year, 18 months, 2, 3, 5 and 10 years — reached by total sober time.
A medal you drop below stays, in black and white, until you earn it back.

## Build

- Shared UI: `ui/` (plain HTML/JS, no bundler). Journey maths in `ui/core.js`.
- Windows: Tauri 2 (`src-tauri/`), tray app with start-with-Windows. `npx tauri build`.
- Android: native Kotlin WebView shell (`android/`), serves `ui/` from the APK assets. `./gradlew assembleRelease`.

Quotes come from public quote collections (JamesFT/Database-Quotes-JSON, dwyl/quotes, quotable, dummyjson).
