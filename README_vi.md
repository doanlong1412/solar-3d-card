# ☀️ Solar 3D Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
![version](https://img.shields.io/badge/version-1.0-blue)
![HA](https://img.shields.io/badge/Home%20Assistant-2023.1+-green)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

> 🇬🇧 **English version:** [README.md](README.md)

Card 3D tùy chỉnh cho Home Assistant Lovelace — mô phỏng trực quan hệ thống điện mặt trời của ngôi nhà: villa 3D, dàn pin mặt trời, pin lưu trữ, tải tiêu thụ và lưới điện, tất cả chuyển động theo dữ liệu thực từ các entity bạn khai báo. Card tự vẽ chu kỳ ngày/đêm theo giờ mọc/lặn thực tế, hiệu ứng thời tiết động (mưa, tuyết, sấm chớp, sương mù...), và cho phép chèn model 3D `.glb` của riêng bạn (nhà, xe).

**Không cần plugin bổ sung. Hoạt động độc lập, cấu hình hoàn toàn qua giao diện chỉnh sửa tích hợp.**

---

## 📸 Xem trước

### 🎬 Demo
![Demo](assets/preview.gif)

### 🖼️ Screenshot
![Preview](assets/preview.png)

---

## 🎛️ Visual Config Editor

![Solar 3D Card Editor](assets/editor-preview.png)

---

## ✨ Tính năng

### 🏛️ Villa 3D & model tùy chỉnh
- Villa 3D dựng sẵn (mái, cửa sổ, nội thất, đèn sân vườn...) hiển thị mặc định
- Hỗ trợ nạp **model nhà** và **model xe** dạng `.glb` (glTF binary, kể cả nén Draco) — thay thế villa/xe mặc định bằng model thật của bạn
- Nếu model `.glb` tuỳ chỉnh lỗi hoặc chưa có, card **tự động fallback** về villa dựng sẵn để không bao giờ hiển thị trống

### ☀️ Chu kỳ ngày/đêm theo giờ thực tế
- Đọc giờ mọc/lặn thực tế từ entity `sun.sun` (hoặc entity mặt trời khác) để dựng đúng quỹ đạo mặt trời trong ngày
- Đồng hồ mặt trời (**sun clock**) hiển thị giờ hiện tại, pha ngày (Bình minh / Buổi sáng / Giữa trưa / Buổi chiều / Hoàng hôn / Ban đêm) và biểu đồ vòng cung mặt trời
- Có thể **tắt "Giờ thực tế"** và kéo thanh trượt để xem thử card ở bất kỳ thời điểm nào trong ngày (0h–24h)
- Màu ánh sáng, bầu trời, cường độ sáng đèn nội thất/ngoại thất đều thay đổi mượt theo góc mặt trời

### ⚡ Luồng năng lượng trực quan
- Các dòng hạt phát sáng mô phỏng năng lượng chảy: **Mặt trời → Dàn pin → Inverter → Pin lưu trữ / Nhà / Lưới điện**
- Tốc độ, hướng và trạng thái bật/tắt của từng luồng phản ánh đúng số liệu thực (đang sạc pin, đang xả pin, đang mua/bán điện lưới...)
- Dàn pin mặt trời 24 tấm (6 cột × 4 hàng) phát sáng theo công suất phát thực tế

### 🔋 Giám sát trực tiếp — Solar · Pin · Tải · Lưới · Sản lượng
- **☀️ Pin mặt trời** — công suất phát hiện tại (kW) + thanh phần trăm theo công suất tối đa cấu hình
- **🔋 Pin lưu trữ** — phần trăm pin, trạng thái đang sạc/xả
- **🏠 Tiêu thụ** — công suất tải nhà hiện tại (kW)
- **📊 Hôm nay** — sản lượng điện sinh ra trong ngày (kWh)
- **🔌 Lưới điện** — công suất mua/bán với lưới (kW)
- **🌤️ Ngoài trời** — nhiệt độ, độ ẩm, chỉ số UV ngoài trời (nếu khai báo entity)

### 🌦️ Hiệu ứng thời tiết động
Đọc trạng thái từ entity `weather.*` và tự chuyển cảnh mượt giữa 8 kiểu thời tiết:
- ☀️ Nắng đẹp · ⛅ Ít mây · ☁️ Nhiều mây · 🌧️ Mưa · ⛈️ Dông bão · 🌨️ Tuyết · 🌫️ Sương mù · 💨 Có gió

Mỗi kiểu thời tiết thay đổi: mật độ sương mù, màu bầu trời, độ sáng ánh nắng, mây trôi, hạt mưa/tuyết rơi, tia sét chớp sáng (dông bão) và các vệt gió (trời gió) — có thể **bật/tắt toàn bộ hiệu ứng thời tiết** bằng một nút.

### 🌃 Đèn tự động theo ngày/đêm
Đèn nội thất và đèn ngoại thất tự sáng dần khi trời tối và tắt dần khi trời sáng, không cần cấu hình thêm.

### 🎮 Điều khiển camera tự do
- **Chuột/Touch:** kéo để xoay, cuộn/chụm để zoom, giữ chuột phải (hoặc 2 ngón) để di chuyển góc nhìn
- **Tự động xoay** quanh villa với **thanh trượt tốc độ** 0–100%, tốc độ được ghi nhớ (`localStorage`) kể cả sau khi tải lại trang
- Nút **🔄 Reset góc nhìn** để quay về góc mặc định bất kỳ lúc nào

### 🎛️ Thanh điều khiển nhanh trên card
- **⚡ Luồng điện** — bật/tắt hiệu ứng hạt năng lượng
- **🌑 Bóng đổ** — bật/tắt đổ bóng (shadow map)
- **🏷️ Nhãn** — bật/tắt nhãn chú thích trên mô hình
- **🌦️ Thời tiết** — bật/tắt toàn bộ hiệu ứng thời tiết

### 📱 Tự động tối ưu hiệu năng trên di động
Card tự nhận diện thiết bị di động và tự động: giảm độ phân giải render, tắt đổ bóng, giảm số hạt mưa/tuyết, giới hạn khung hình ~30fps — đảm bảo mượt trên điện thoại mà vẫn giữ chi tiết đầy đủ trên desktop.

### 🖥️ Tự động full màn hình
Không cần dò kích thước — để trống `height` (hoặc đặt `auto`/`full`), card tự kéo full theo chiều cao thật của trình duyệt, trừ thanh header của Home Assistant. Rất hợp với **View kiểu Panel**.

### 🎛️ Trình chỉnh sửa trực quan
Toàn bộ cấu hình qua form trực quan dạng accordion — không cần chỉnh YAML tay: chọn entity bằng `ha-entity-picker`, nhập tên/URL model, chỉnh số bằng ô nhập liệu.

---

## 📦 Cài đặt

### Cách 1 — HACS (khuyến nghị)

**Bước 1:** Thêm Custom Repository vào HACS:

[![Open HACS Repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=doanlong1412&repository=solar-3d-card&category=plugin)

> Nếu nút trên không hoạt động, thêm thủ công:
> **HACS → Frontend → ⋮ → Custom repositories**
> → URL: `https://github.com/doanlong1412/solar-3d-card` → Loại: **Dashboard** → Add

**Bước 2:** Tìm **Solar 3D Card** → **Install**

**Bước 3:** Tải lại trình duyệt (`Ctrl+Shift+R`)

---

### Cách 2 — Cài thủ công

1. Tải file [`solar-3d-card.js`](https://github.com/doanlong1412/solar-3d-card/releases/latest) từ mục **Assets** của bản Release mới nhất (file nguồn nằm ở `dist/solar-3d-card.js` trong repo — khi tạo Release, đính kèm file này làm asset riêng để người cài thủ công tải trực tiếp, không cần clone cả repo)
2. Copy vào `/config/www/solar-3d-card.js`
3. Vào **Cài đặt → Bảng điều khiển → Tài nguyên** → **Thêm tài nguyên**:
   ```
   URL:  /local/solar-3d-card.js
   Loại: JavaScript module
   ```
4. Tải lại trình duyệt (`Ctrl+Shift+R`)

---

## ⚙️ Cấu hình Card

### Bước 1 — Thêm card vào dashboard

```yaml
type: custom:solar-3d-card
```

Sau khi thêm, bấm **✏️ Chỉnh sửa** để mở trình chỉnh sửa trực quan.

### Bước 2 — Các mục trong trình chỉnh sửa

| # | Mục | Nội dung |
|---|-----|----------|
| 1 | 🏛️ **Hiển thị** | Tên villa, chiều cao card (px), offset chiều cao |
| 2 | 🚗 **Model 3D** | URL model xe (`.glb`), URL model nhà (`.glb`) |
| 3 | ☀️ **Năng lượng mặt trời** | Entity công suất solar, entity sản lượng hôm nay, công suất tối đa (kW), entity mặt trời |
| 4 | 🔋 **Pin lưu trữ** | Entity mức pin (%), entity đang sạc, entity dòng pin (kW) |
| 5 | 🏠 **Tiêu thụ & Lưới điện** | Entity tải nhà, entity lưới điện |
| 6 | 🌤️ **Thời tiết & Môi trường** | Entity thời tiết, nhiệt độ/độ ẩm/UV ngoài trời |

---

## 🚗🏠 Hướng dẫn thay model 3D (.glb)

Card đi kèm villa và xe dựng sẵn, nhưng bạn có thể thay bằng model `.glb` (glTF binary) của riêng mình — kể cả model nén bằng Draco (`KHR_draco_mesh_compression`), card đã tích hợp sẵn `DRACOLoader` nên không cần cấu hình thêm.

### ⚡ Cách A — Tự động qua HACS (không cần copy tay)

Nếu bạn (chủ repo) đóng gói sẵn model mẫu trong thư mục `dist/` của repo (cạnh `solar-3d-card.js`) và publish GitHub Release, HACS sẽ **tự tải toàn bộ file trong `dist/`** — kể cả `.glb` — về thẳng máy người dùng khi họ cài/cập nhật card, không cần ai phải tự tải rồi copy vào `/config/www/` nữa. Xem chi tiết cơ chế trong `dist/README.md` của repo.

Với người dùng đã cài qua HACS, việc còn lại chỉ là **nhập 1 lần** trong editor (mục 🚗 Model 3D):
```yaml
house_model_url: /hacsfiles/solar-3d-card/cottage.glb
car_model_url: /hacsfiles/solar-3d-card/ferrari.glb
```
> Đổi `solar-3d-card` thành đúng tên repo GitHub của bạn nếu khác. Đường dẫn `/hacsfiles/...` chỉ hoạt động với các file được HACS quản lý (nằm trong `dist/`) — không dùng được cho file bạn tự thêm thủ công vào `/config/www/`.

### 🛠️ Cách B — Copy thủ công (dùng khi cài thủ công, hoặc muốn dùng model riêng không có trong repo)

**Bước 1 — Chuẩn bị file model**
- Chuẩn bị file nhà (ví dụ `cottage.glb`) và/hoặc file xe (ví dụ `ferrari.glb`) ở định dạng `.glb`
- Nếu chỉ có định dạng `.gltf` + textures rời, hãy đóng gói lại thành 1 file `.glb` duy nhất bằng công cụ như [Blender](https://www.blender.org/) (Export → glTF 2.0 → Format: **glTF Binary (.glb)`)

**Bước 2 — Copy vào thư mục `www` của Home Assistant**
```
/config/www/cottage.glb
/config/www/ferrari.glb
```
> Bất kỳ file nào trong `/config/www/` đều truy cập được qua đường dẫn `/local/<tên-file>`. Ví dụ `/config/www/cottage.glb` → `/local/cottage.glb`.

**Bước 3 — Trỏ card đến file model qua trình chỉnh sửa**
Trong mục **🚗 Model 3D** của editor, nhập:
```yaml
house_model_url: /local/cottage.glb
car_model_url: /local/ferrari.glb
```
- Để trống hoặc xoá dòng này → card dùng lại đường dẫn mặc định (`/local/cottage.glb`, `/local/ferrari.glb`)
- Muốn dùng thư mục con cũng được, ví dụ: `/local/models/my-house.glb`

**Bước 4 — Tải lại card**
Tải lại trang (hoặc `Ctrl+Shift+R`) để card nạp model mới. Nếu model lỗi/không tồn tại, card sẽ **tự động hiện lại villa mặc định** thay vì để trống — kiểm tra Console trình duyệt (F12) nếu muốn xem log lỗi chi tiết (`[solar-3d-card] ❌ Không tải được...`).

> 💡 **Mẹo:** Model càng nhiều polygon/texture độ phân giải cao thì càng nặng — nên nén/giảm poly (dùng Draco hoặc công cụ như [gltf-transform](https://gltf-transform.dev/)) để card load nhanh và mượt hơn, đặc biệt trên điện thoại.

> 📦 **Muốn chia sẻ model mẫu qua GitHub?** File `.glb` không chạy trực tiếp từ GitHub được — chúng chỉ có thể *phân phối* qua repo (ví dụ thư mục `models/` hoặc mục Releases) để người khác tải về rồi tự copy vào `/config/www/` như hướng dẫn trên. Xem `models/README.md` trong repo để biết chi tiết cách đóng gói.

---

## 🔌 Entity Reference

| Config key | Loại entity | Mô tả |
|---|---|---|
| `sun_entity` | `sun` | Nguồn giờ mọc/lặn thực tế (mặc định `sun.sun`) |
| `solar_power_entity` | `sensor` | Công suất phát điện mặt trời hiện tại (kW) |
| `energy_today_entity` | `sensor` | Sản lượng điện sinh ra trong ngày (kWh) |
| `battery_level_entity` | `sensor` | Mức pin lưu trữ (%) |
| `battery_charging_entity` | `binary_sensor` | Trạng thái đang sạc pin |
| `battery_flow_entity` | `sensor` | Dòng công suất pin (kW) — dấu âm/dương xác định sạc/xả |
| `load_power_entity` | `sensor` | Công suất tải nhà đang tiêu thụ (kW) |
| `grid_power_entity` | `sensor` | Công suất mua/bán với lưới điện (kW) |
| `weather_entity` | `weather` | Thực thể thời tiết điều khiển hiệu ứng mưa/tuyết/sương mù... |
| `outdoor_temp_entity` | `sensor` | Nhiệt độ ngoài trời |
| `outdoor_humidity_entity` | `sensor` | Độ ẩm ngoài trời |
| `uv_entity` | `sensor` | Chỉ số UV |

> Mọi entity ở trên đều **tuỳ chọn** — entity nào chưa khai báo, card sẽ tự dùng giá trị mô phỏng hợp lý để vẫn hiển thị sống động ngay khi mới cài.

---

## ⚙️ Full Config Reference

| Config key | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `villa_name` | string | `03 Cao Lồi` | Tên villa hiển thị trên thanh tiêu đề |
| `height` | number \| `auto` | *(trống = auto)* | Chiều cao card (px); để trống hoặc `auto`/`full` để tự full màn hình |
| `height_offset` | number | `0` | Bù trừ chiều cao (px) khi dùng chế độ full màn hình — số dương làm card thấp bớt, số âm làm card cao thêm |
| `car_model_url` | string | `/local/ferrari.glb` | Đường dẫn model xe `.glb` tuỳ chỉnh |
| `house_model_url` | string | `/local/cottage.glb` | Đường dẫn model nhà `.glb` tuỳ chỉnh |
| `max_solar_kw` | number | `5.5` | Công suất phát tối đa của dàn pin mặt trời (kW), dùng để tính % thanh hiển thị |
| `sun_entity` | entity | `sun.sun` | Entity mặt trời cho giờ mọc/lặn thực tế |
| `solar_power_entity` | entity | — | Công suất solar hiện tại |
| `energy_today_entity` | entity | — | Sản lượng hôm nay |
| `battery_level_entity` | entity | — | Mức pin (%) |
| `battery_charging_entity` | entity | — | Đang sạc (binary) |
| `battery_flow_entity` | entity | — | Dòng pin (kW) |
| `load_power_entity` | entity | — | Tải nhà (kW) |
| `grid_power_entity` | entity | — | Lưới điện (kW) |
| `weather_entity` | entity | — | Thực thể thời tiết |
| `outdoor_temp_entity` | entity | — | Nhiệt độ ngoài trời |
| `outdoor_humidity_entity` | entity | — | Độ ẩm ngoài trời |
| `uv_entity` | entity | — | Chỉ số UV |

---

## 📝 Ví dụ YAML đầy đủ

```yaml
type: custom:solar-3d-card
villa_name: "03 Cao Lồi"
height: 520              # để trống / "auto" để tự full màn hình
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

## 🖥️ Tương thích

| | |
|---|---|
| Home Assistant | 2023.1+ |
| Lovelace | Dashboard mặc định & tuỳ chỉnh |
| Thiết bị | Mobile & Desktop (tự tối ưu hiệu năng trên di động) |
| Dependencies | three.js r128 + GLTFLoader/DRACOLoader (tự tải qua CDN, không cần cài thêm) |
| Trình duyệt | Chrome, Firefox, Safari, Edge |

---

## 📋 Changelog

### v1.0
- 🚀 Phát hành lần đầu — Villa 3D, chu kỳ ngày/đêm thực tế, luồng năng lượng, giám sát Solar/Pin/Tải/Lưới, hiệu ứng thời tiết động, hỗ trợ model `.glb` tuỳ chỉnh (nhà + xe), trình chỉnh sửa trực quan, tự tối ưu hiệu năng di động

---

## 📄 Giấy phép

MIT License — tự do sử dụng, chỉnh sửa và phân phối.
Nếu thấy hữu ích, hãy ⭐ **star repo** nhé!

---

## 🙏 Credits

Thiết kế và phát triển bởi **[@doanlong1412](https://github.com/doanlong1412)** từ 🇻🇳 Việt Nam.

☕ [Buy me a coffee](https://www.paypal.com/paypalme/doanlong1412)
