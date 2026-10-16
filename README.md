# TimeMapper

**English** | [繁體中文](README.zh-TW.md) | [Español](README.es.md)

A Chrome extension popup for comparing time across timezones. Click cities on a world map and line up their days on a 24-hour timeline, so you can find a moment that works for everyone.

---

## Install

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the root folder of this repository.
5. Click the TimeMapper icon in the Chrome toolbar.

---

## How to use

**Choose cities** — click any pin on the world map to add that city to the timeline; click it again to remove it. The first time you open the popup, Tokyo, New York, Los Angeles and your browser's local time are already selected.

**Open the cities panel** — the 🏙️ button in the top bar lets you search for any city by name, review and reorder your current list, change the maximum number of cities, load an example set, or clear everything.

**Read the timeline** — each row is one city's 24-hour day, and the vertical **now line** marks this exact moment. The `00` cell also shows the date, so you can see where a city's day rolls over.

**Compare a specific moment** — click anywhere on the timeline to drop an alignment line (up to four). Drag a line to move it, or click its `[x]` to remove it. Every row updates to show what time that moment is in that city.

**Use the map** — the map can shade the current night area, draw the hour lines for each timezone, and show a live time bubble above every selected city. The map panel collapses if you only want the timeline.

---

## Settings

Click the ⚙ button in the top bar to open the settings page:

| Section | What you can do |
| --- | --- |
| **Language Settings** | Switch the interface between 繁體中文, English and Español. |
| **Minimap Settings** | Toggle the night area, hour lines and city time bubbles; fine-tune the map's longitude/latitude offsets, width/height scale and vertical offset; reset everything to defaults. |
| **Time Period Settings** | Choose what the now line is measured against (your browser's local time, or the first city), then set the hour range and the background/text colours of three highlighted periods. Defaults are 08–17, 18–23 and 00–07. |
| **Appearance** | Auto, dark or light theme. Auto follows your system setting. |

Your cities, periods and map calibration are saved in the browser's `localStorage` and restored the next time you open the popup.

---

## A city that is not on the map

Search for it in the cities panel. Results come from the [Open-Meteo geocoding API](https://geocoding-api.open-meteo.com/), so searching needs a network connection. The city you pick is placed on the map from its own coordinates and remembered for next time.

To add a city permanently to the built-in list, edit `cityCatalog` in `src/shared/cities.js`. The constants that turn longitude/latitude into a map position are documented in the `PROJECTION` block at the top of `src/shared/config.js`.

---

## Checking translations

`node tools/check-i18n.mjs` verifies that the dictionaries in `src/shared/i18n.js` still cover every string the pages ask for. Run it after adding a UI string, a language, or a city.
