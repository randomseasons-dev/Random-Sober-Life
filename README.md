# Random Sober Life

A small, private sobriety counter for **Windows** and **Android** that helps you count and battle alcoholism.
Everything stays on your devices — no account, no tracking. The two apps can sync through an end-to-end encrypted relay.

## Main screen

- **Top:** an inspirational quote of the day (2,800+ quotes about effort, life, recovery and meaning, in a fixed shuffled order).
  The arrows browse; the next day jumps back to that day's quote. Can be switched to the hot posts of
  [r/stopdrinking](https://www.reddit.com/r/stopdrinking/) or turned off.
- **Middle:** total sober time as **Years · Months · Days · Hours**, a medal for the latest milestone, and the money saved,
  growing every second.
- **Bottom:** current streak, longest streak, average streak, streak resets, journey resets.
- **Red + button:** log how many drinks and when (defaults to now). The last 5 entries are listed; deleting one fully undoes it.

## Settings

- Top section: quotes / r/stopdrinking / off.
- Colours: 10 matte, cozy packs — dark: Forest, Ocean, Sunset, Midnight, Cocoa, Ember; light: Daylight, Lavender, Clay, Oat.
  Each pack gives its own colour to the sober-time digits, money, quote card, each of the six stat tiles, settings headings,
  logo and buttons.
- Currency (30 currencies, USD first) and money spent per day before quitting — one average amount, or one amount for each
  day of the week (up to 1,000,000 per day).
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
