# TimeMapper

A Chrome Extension Popup to compare times across multiple timezones. Select cities by clicking on the world map and align their times on a 24-hour timeline.

---

## Features

- **Interactive World Map**: Click pins on the map to select cities. Features dynamic local time bubbles displayed above selected city pins on the map. Built-in cities include Tokyo, New York, Los Angeles, London, Taipei, Hong Kong, Dallas, Delhi, Sydney, etc.
- **Initial Cities Selection**: Pre-selects Tokyo, New York, Los Angeles, and your browser's local time as the initial setup.
- **24-Hour Timeline**: Supports selecting and aligning up to 6 cities simultaneously, with the **date** displayed on `00` hour cells to clearly mark cross-day transitions.
- **Interactive Multi-Scrub Alignment**: Click anywhere on the timeline to add a vertical alignment scrub line (up to 4 lines). You can drag handles to adjust their position or click the `[x]` button to remove them.
- **Custom Time Period Colors**: Customize the start/end hours and background/text colors for three custom time periods (default: 08-17, 18-23, 00-07).
- **Custom Cities & Map Calibration**: Add custom cities and adjust the map's zoom and offset parameters.
- **Show Selected City Times**: Toggle display of selected cities' corresponding current times directly on the map.
- **Multi-Language Support (i18n)**: UI and city names support both English and Traditional Chinese.
- **Local Storage Persistence**: Selections and configurations are stored in `localStorage` and persist across sessions.

---

## Project Structure

- manifest.json: Chrome Extension manifest file (MV3).
- assets/: Map background image and icons.
- _locales/: Multi-language message catalogs.
- src/popup/: Popup UI structure (`popup.html`), stylesheets (`*.css`), and UI logic (`controller.js`, `renderer.js`, `dom.js`).
- src/shared/: Shared configuration (`config.js`), city database (`cities.js`), translations (`i18n.js`), state management (`state.js`), and utilities (`utils.js`).

---

## Installation & Usage

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the root directory of this repository.

---

## Map Calibration Projection

The linear conversion rules for built-in city coordinates:
- **X conversion**: `x = 0.2816 * longitude + 46.2357`
- **Y conversion**: `y = -0.5257 * latitude + 63.3239`

Example:
- **Tokyo** (139.7°E, 35.7°N): `x = 86`, `y = 45`
- **New York** (74.0°W, 40.7°N): `x = 25`, `y = 42`
- **Los Angeles** (118.3°W, 34.1°N): `x = 13`, `y = 45`

---
---

# TimeMapper (中文說明)

一個用於比對多個時區時間的 Chrome Extension Popup。透過點擊世界地圖選取城市，並在 24 小時時間軸上對齊各時區時間。

---

## 功能

- **互動式世界地圖**：點擊地圖上的標記選取城市，並在選取的城市標記上方顯示**動態當地時間泡泡**。內建東京、紐約、洛杉磯、倫敦、台北、香港、達拉斯、德里、雪梨等城市。
- **預設選取城市**：初始開啟時自動預設選取東京、紐約、洛杉磯 (LA) 以及瀏覽器本地時間。
- **24 小時時間軸**：最多支援同時選取 6 個城市，並在 `00` 小時格顯示**日期**，以更直觀地識別跨日變化。
- **多重時間對齊導引線 (Scrub Lines)**：點擊時間軸任一處即可新增一條垂直導引線（最多支援 4 條）以對齊各城市在同一時間點的狀態。可自由拖曳導引線，或點擊 `[x]` 移除。
- **自訂時段色彩**：支援自訂三個時段（預設為 08-17、18-23、00-07）的起迄時間與背景/文字顏色。
- **自訂城市與地圖校準**：可手動新增自訂城市並調整地圖的縮放與偏移參數。
- **顯示已選城市時間**：地圖上可開啟/關閉顯示已選取城市的對應時間。
- **多語支援 (i18n)**：介面及城市名稱支援繁體中文與英文。
- **本機狀態保存**：選取的城市與相關設定儲存於 `localStorage`，下次開啟時保留。

---

## 專案檔案結構

- manifest.json：Chrome Extension 核心設定檔 (MV3)。
- assets/：世界地圖背景圖檔及圖示。
- _locales/：多語系語系檔。
- src/popup/：主畫面 HTML (`popup.html`)、樣式 (`*.css`) 與 UI 控制邏輯 (`controller.js`, `renderer.js`, `dom.js`)。
- src/shared/：共用設定 (`config.js`)、城市資料庫 (`cities.js`)、翻譯字典 (`i18n.js`)、狀態管理 (`state.js`) 與工具函式 (`utils.js`)。

---

## 安裝與使用方式

1. 下載或 Clone 本專案。
2. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/`。
3. 開啟右上角「開發人員模式」。
4. 點擊「載入未封裝項目」，選擇此專案的根目錄資料夾。

---

## 地圖校準投影說明

內建城市投影的線性轉換規則為：
- **X 軸轉換**：`x = 0.2816 * 經度 + 46.2357`
- **Y 軸轉換**：`y = -0.5257 * 緯度 + 63.3239`

例如：
- **東京** (139.7°E, 35.7°N)：`x = 86`, `y = 45`
- **紐約** (74.0°W, 40.7°N)：`x = 25`, `y = 42`
- **洛杉磯** (118.3°W, 34.1°N)：`x = 13`, `y = 45`
