# 📦 dist/

Thư mục này quyết định **HACS tải file gì về** khi người dùng cài/cập nhật card.

## Vì sao đặt `solar-3d-card.js` ở đây thay vì ngoài root?

Theo cơ chế của HACS (loại **Plugin/Dashboard**):
- Nếu **không có** thư mục `dist/`, HACS chỉ quét và tải các file `.js` ở root repo — mọi file khác (như `.glb`) sẽ **không** được tự động tải về.
- Nếu **có** thư mục `dist/`, HACS sẽ tải **toàn bộ nội dung** bên trong thư mục này (mọi định dạng file, không chỉ `.js`) vào thẳng `/config/www/community/<tên-repo>/` trên máy người dùng — **không cần họ copy tay**.

## Cách tự động phân phối model `.glb` kèm card

1. Đặt model mẫu ngay trong thư mục này, cạnh file card:
   ```
   dist/solar-3d-card.js
   dist/cottage.glb
   dist/ferrari.glb
   ```
2. Publish một **GitHub Release** (tạo tag, ví dụ `v1.0`) — HACS lấy nội dung `dist/` tại release mới nhất, không phải commit mới nhất trên nhánh, nên **nhớ tạo Release** mỗi khi cập nhật model.
3. Sau khi người dùng cài/cập nhật card qua HACS, toàn bộ file trong `dist/` (kể cả `.glb`) tự động nằm tại:
   ```
   /config/www/community/solar-3d-card/solar-3d-card.js
   /config/www/community/solar-3d-card/cottage.glb
   /config/www/community/solar-3d-card/ferrari.glb
   ```
   và truy cập được qua đường dẫn:
   ```
   /hacsfiles/solar-3d-card/cottage.glb
   /hacsfiles/solar-3d-card/ferrari.glb
   ```
4. Người dùng chỉ cần vào **editor của card → mục 🚗 Model 3D**, nhập đúng 2 dòng này **một lần duy nhất** — không cần tự tải/copy file `.glb` nào cả:
   ```yaml
   house_model_url: /hacsfiles/solar-3d-card/cottage.glb
   car_model_url: /hacsfiles/solar-3d-card/ferrari.glb
   ```

> ⚠️ Đổi tên repo GitHub thì đường dẫn `/hacsfiles/<tên-repo>/...` cũng đổi theo — nhớ cập nhật lại README và giá trị mặc định nếu bạn đổi tên.

## Nếu không muốn kèm model mẫu

Chỉ cần để `dist/` chứa mỗi `solar-3d-card.js` — HACS vẫn hoạt động bình thường như một plugin JS thông thường, người dùng nào muốn dùng model riêng thì tự làm theo mục **"Hướng dẫn thay model 3D (.glb)"** trong README (copy vào `/config/www/`, dùng đường dẫn `/local/...`).
