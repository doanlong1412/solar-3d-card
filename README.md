# ☀️ Solar 3D Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
![version](https://img.shields.io/badge/version-1.0-blue)
![HA](https://img.shields.io/badge/Home%20Assistant-2023.1+-green)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

> 🇻🇳 **Phiên bản tiếng Việt:** [README_vi.md](README_vi.md)

A custom Home Assistant Lovelace card that renders a fully interactive **3D house + solar system visualization**: a 3D villa, solar panel array, battery storage, house load and grid, all animated from the live entities you map. The card draws a real day/night sun cycle from your actual sunrise/sunset times, dynamic weather effects (rain, snow, thunder, fog...), and lets you drop in your own `.glb` 3D models (house, car).

**No extra plugins required. Works standalone, fully configurable through the built-in UI editor.**

---

## 📸 Preview

### 🎬 Demo
![Demo](assets/preview.gif)

### 🖼️ Screenshot
![Preview](assets/preview.png)

---

## 🎛️ Visual Config Editor

![Solar 3D Card Editor](assets/editor-preview.png)

---

## ✨ Features

### 🏛️ 3D Villa & Custom Models
- A detailed 3D villa (roof, windows, interior, garden lights...) ships by default
- Supports loading your own **house model** and **car model** as `.glb` (glTF binary, including Draco-compressed meshes) — replacing the default villa/car with your own asset
- If a custom `.glb` model fails to load or isn't set, the card **automatically falls back** to the built-in villa so it's never left blank

### ☀️ Real Day/Night Sun Cycle
- Reads real sunrise/sunset times from a `sun.sun` entity (or another sun entity) to render the actual sun trajectory throughout the day
- A **sun clock** panel shows the current time, day phase (Dawn / Morning / Midday / Afternoon / Sunset / Night) and an arc chart of the sun's path
- Toggle off "real time" and drag the slider to preview the card at any time of day (0h–24h)
- Light color, sky, and interior/exterior light intensity all transition smoothly with sun elevation

### ⚡ Animated Energy Flow
- Glowing particle streams visualize energy moving: **Sun → Solar Panels → Inverter → Battery / House / Grid**
- Speed, direction and on/off state of each flow reflect your real sensor data (charging, discharging, importing/exporting to the grid...)
- A 24-panel (6×4) solar array glows in proportion to real-time output

### 🔋 Live Monitoring — Solar · Battery · Load · Grid · Daily Yield
- **☀️ Solar power** — current output (kW) with a percentage bar based on your configured max capacity
- **🔋 Battery** — charge percentage, charging/discharging state
- **🏠 Load** — current house consumption (kW)
- **📊 Today** — total energy generated today (kWh)
- **🔌 Grid** — power bought/sold to the grid (kW)
- **🌤️ Outdoor** — outdoor temperature, humidity and UV index (if entities are set)

### 🌦️ Dynamic Weather Effects
Reads state from a `weather.*` entity and smoothly transitions between 8 weather styles:
- ☀️ Clear · ⛅ Partly cloudy · ☁️ Cloudy · 🌧️ Rain · ⛈️ Thunderstorm · 🌨️ Snow · 🌫️ Fog · 💨 Windy

Each weather state changes fog density, sky color, sunlight brightness, drifting clouds, falling rain/snow particles, lightning flashes (thunderstorm) and wind streaks (windy) — the whole effect layer can be **toggled on/off** with one button.

### 🌃 Automatic Day/Night Lighting
Interior and exterior lights fade in as it gets dark and fade out at daybreak, with zero extra configuration.

### 🎮 Free Camera Control
- **Mouse/Touch:** drag to orbit, scroll or pinch to zoom, right-click-drag (or 2-finger drag) to pan
- **Auto-rotate** around the villa with a **0–100% speed slider**, remembered across page reloads (`localStorage`)
- **🔄 Reset view** button to instantly return to the default angle

### 🎛️ Quick Controls on the Card
- **⚡ Energy flow** — toggle the animated energy particles
- **🌑 Shadows** — toggle shadow rendering
- **🏷️ Labels** — toggle annotation labels on the 3D model
- **🌦️ Weather** — toggle all weather effects

### 📱 Automatic Mobile Performance Optimization
The card auto-detects mobile devices and automatically reduces render resolution, disables shadows, lowers rain/snow particle count, and caps the frame rate around 30fps — keeping things smooth on phones while retaining full detail on desktop.

### 🖥️ Auto Full-Screen Height
No manual sizing needed — leave `height` unset (or set it to `auto`/`full`) and the card stretches to the real browser viewport height, minus the Home Assistant header. Great for **Panel view**.

### 🎛️ Visual Config Editor
Every option is configurable through an accordion-style visual editor — no hand-written YAML required: pick entities via `ha-entity-picker`, type model URLs, and adjust numeric fields directly.

---

## 📦 Installation

### Option 1 — HACS (recommended)

**Step 1:** Add Custom Repository to HACS:

[![Open HACS Repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=doanlong1412&repository=solar-3d-card&category=plugin)

> If the button doesn't work, add manually:
> **HACS → Frontend → ⋮ → Custom repositories**
> → URL: `https://github.com/doanlong1412/solar-3d-card` → Type: **Dashboard** → Add

**Step 2:** Search for **Solar 3D Card** → **Install**

**Step 3:** Hard-reload your browser (`Ctrl+Shift+R`)

---

### Option 2 — Manual

1. Download [`solar-3d-card.js`](https://github.com/doanlong1412/solar-3d-card/releases/latest) from the **Assets** section of the latest Release (the source file lives at `dist/solar-3d-card.js` in the repo — when publishing a Release, attach this file as its own asset so manual installers can grab it directly without cloning the whole repo)
2. Copy to `/config/www/solar-3d-card.js`
3. Go to **Settings → Dashboards → Resources** → **Add resource**:
   ```
   URL:  /local/solar-3d-card.js
   Type: JavaScript module
   ```
4. Hard-reload your browser (`Ctrl+Shift+R`)

---

## ⚙️ Card Configuration

### Step 1 — Add the card to your dashboard

```yaml
type: custom:solar-3d-card
```

After adding the card, click **✏️ Edit** to open the visual Config Editor.

### Step 2 — Config Editor sections

| # | Section | Contents |
|---|---------|----------|
| 1 | 🏛️ **Display** | Villa name, card height (px), height offset |
| 2 | 🚗 **3D Model** | Car model URL (`.glb`), house model URL (`.glb`) |
| 3 | ☀️ **Solar** | Solar power entity, energy-today entity, max solar output (kW), sun entity |
| 4 | 🔋 **Battery** | Battery level entity, charging entity, battery flow entity |
| 5 | 🏠 **Load & Grid** | House load entity, grid power entity |
| 6 | 🌤️ **Weather & Environment** | Weather entity, outdoor temperature/humidity/UV |

---

## 🚗🏠 How to Use Your Own 3D Model (.glb)

The card ships with a built-in villa and car, but you can replace either with your own `.glb` (glTF binary) model — including meshes compressed with Draco (`KHR_draco_mesh_compression`); the card already bundles `DRACOLoader`, so no extra setup is needed.

### ⚡ Option A — Automatic via HACS (no manual copying)

If the repo maintainer bundles sample models inside the `dist/` folder (next to `solar-3d-card.js`) and publishes a GitHub Release, HACS will **automatically download every file in `dist/`** — including `.glb` files — straight to the user's Home Assistant when they install or update the card. No one has to manually download and copy anything into `/config/www/`. See `dist/README.md` in the repo for the full mechanism.

For users who installed via HACS, the only remaining step is a **one-time entry** in the editor (🚗 3D Model section):
```yaml
house_model_url: /hacsfiles/solar-3d-card/cottage.glb
car_model_url: /hacsfiles/solar-3d-card/ferrari.glb
```
> Replace `solar-3d-card` with your actual GitHub repo name if different. The `/hacsfiles/...` path only works for files HACS manages (i.e. inside `dist/`) — it won't work for files you manually drop into `/config/www/` yourself.

### 🛠️ Option B — Manual copy (for manual installs, or to use a model not bundled in the repo)

**Step 1 — Prepare your model file**
- Prepare a house model (e.g. `cottage.glb`) and/or a car model (e.g. `ferrari.glb`) as a single `.glb` file
- If you only have `.gltf` + loose textures, pack them into a single `.glb` using a tool like [Blender](https://www.blender.org/) (Export → glTF 2.0 → Format: **glTF Binary (.glb)**)

**Step 2 — Copy it into Home Assistant's `www` folder**
```
/config/www/cottage.glb
/config/www/ferrari.glb
```
> Any file under `/config/www/` is reachable at `/local/<filename>`. So `/config/www/cottage.glb` becomes `/local/cottage.glb`.

**Step 3 — Point the card to your model via the editor**
In the **🚗 3D Model** section of the editor, enter:
```yaml
house_model_url: /local/cottage.glb
car_model_url: /local/ferrari.glb
```
- Leave blank or remove these lines to use the default paths (`/local/cottage.glb`, `/local/ferrari.glb`)
- Subfolders work too, e.g. `/local/models/my-house.glb`

**Step 4 — Reload the card**
Reload the page (or hard-reload with `Ctrl+Shift+R`) so the card picks up the new model. If a model fails to load, the card **automatically shows the default villa** instead of leaving an empty scene — check the browser console (F12) for detailed error logs (`[solar-3d-card] ❌ Failed to load...`).

> 💡 **Tip:** heavier/high-poly, high-resolution-texture models take longer to load — compress or decimate them (Draco, or a tool like [gltf-transform](https://gltf-transform.dev/)) for faster, smoother loading, especially on mobile.

> 📦 **Want to share a sample model via GitHub?** `.glb` files can't be run directly from GitHub — a repo can only *distribute* them (e.g. a `models/` folder or a Release asset) for people to download and copy into `/config/www/` as described above. See `models/README.md` in the repo for packaging details.

---

## 🔌 Entity Reference

| Config key | Entity type | Description |
|---|---|---|
| `sun_entity` | `sun` | Real sunrise/sunset source (default `sun.sun`) |
| `solar_power_entity` | `sensor` | Current solar output (kW) |
| `energy_today_entity` | `sensor` | Total energy generated today (kWh) |
| `battery_level_entity` | `sensor` | Battery storage level (%) |
| `battery_charging_entity` | `binary_sensor` | Whether the battery is currently charging |
| `battery_flow_entity` | `sensor` | Battery power flow (kW) — sign determines charge/discharge |
| `load_power_entity` | `sensor` | Current house load (kW) |
| `grid_power_entity` | `sensor` | Power bought/sold to the grid (kW) |
| `weather_entity` | `weather` | Weather entity that drives rain/snow/fog effects |
| `outdoor_temp_entity` | `sensor` | Outdoor temperature |
| `outdoor_humidity_entity` | `sensor` | Outdoor humidity |
| `uv_entity` | `sensor` | UV index |

> All entities above are **optional** — any unmapped entity falls back to a light built-in simulation so the card still looks alive out of the box.

---

## ⚙️ Full Config Reference

| Config key | Type | Default | Description |
|---|---|---|---|
| `villa_name` | string | `03 Cao Lồi` | Villa name shown in the top bar |
| `height` | number \| `auto` | *(unset = auto)* | Card height (px); leave unset or `auto`/`full` to fill the screen automatically |
| `height_offset` | number | `0` | Height correction (px) when using full-screen mode — positive shrinks, negative grows |
| `car_model_url` | string | `/local/ferrari.glb` | Custom car `.glb` model path |
| `house_model_url` | string | `/local/cottage.glb` | Custom house `.glb` model path |
| `max_solar_kw` | number | `5.5` | Maximum solar array output (kW), used to compute the display percentage |
| `sun_entity` | entity | `sun.sun` | Sun entity for real sunrise/sunset |
| `solar_power_entity` | entity | — | Current solar power |
| `energy_today_entity` | entity | — | Today's energy yield |
| `battery_level_entity` | entity | — | Battery level (%) |
| `battery_charging_entity` | entity | — | Charging state (binary) |
| `battery_flow_entity` | entity | — | Battery flow (kW) |
| `load_power_entity` | entity | — | House load (kW) |
| `grid_power_entity` | entity | — | Grid power (kW) |
| `weather_entity` | entity | — | Weather entity |
| `outdoor_temp_entity` | entity | — | Outdoor temperature |
| `outdoor_humidity_entity` | entity | — | Outdoor humidity |
| `uv_entity` | entity | — | UV index |

---

## 📝 Full YAML Example

```yaml
type: custom:solar-3d-card
villa_name: "03 Cao Lồi"
height: 520              # leave unset / "auto" to fill the screen
height_offset: 0

car_model_url: /local/ferrari.glb
house_model_url: /local/cottage.glb

max_solar_kw: 5.5
sun_entity: sun.sun
solar_power_entity: sensor.solar_power
energy_today_entity: sensor.energy_today

battery_level_entity: sensor.battery_level
battery_charging_entity: binary_sensor.battery_charging
battery_flow_entity: sensor.battery_power_flow

load_power_entity: sensor.house_load_power
grid_power_entity: sensor.grid_power

weather_entity: weather.home
outdoor_temp_entity: sensor.outdoor_temperature
outdoor_humidity_entity: sensor.outdoor_humidity
uv_entity: sensor.uv_index
```

---

## 🖥️ Compatibility

| | |
|---|---|
| Home Assistant | 2023.1+ |
| Lovelace | Default & custom dashboards |
| Devices | Mobile & Desktop (auto-optimized performance on mobile) |
| Dependencies | three.js r128 + GLTFLoader/DRACOLoader (auto-loaded from CDN, nothing to install) |
| Browsers | Chrome, Firefox, Safari, Edge |

---

## 📋 Changelog

### v1.0
- 🚀 Initial release — 3D villa, real day/night sun cycle, animated energy flow, Solar/Battery/Load/Grid monitoring, dynamic weather effects, custom `.glb` model support (house + car), visual config editor, automatic mobile performance optimization

---

## 📄 License

MIT License — free to use, modify, and distribute.
If you find this useful, please ⭐ **star the repo**!

---

## 🙏 Credits

Designed and developed by **[@doanlong1412](https://github.com/doanlong1412)** from 🇻🇳 Vietnam.

☕ [Buy me a coffee](https://www.paypal.com/paypalme/doanlong1412)
