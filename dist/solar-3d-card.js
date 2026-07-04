/*!
 * Solar 3D Card – Custom Lovelace Card
 * ------------------------------------------------------
 * A fully interactive 3D house/solar-system visualization for Home
 * Assistant. Reads live values from entities you map in the card config
 * (solar power, battery %, house load, energy today)
 * and animates a day/night sun cycle, energy-flow particles, and an
 * adjustable auto-rotating camera around a detailed 3D villa model.
 *
 * Install (HACS – custom repository, or manual):
 *   1. Copy this file to /config/www/solar-3d-card.js
 *   2. Add as a Lovelace resource:
 *        url: /local/solar-3d-card.js
 *        type: module
 *   3. Add the card to a dashboard, e.g.:
 *        type: custom:solar-3d-card
 *        solar_power_entity: sensor.solar_power
 *        battery_level_entity: sensor.battery_level
 *        battery_charging_entity: binary_sensor.battery_charging
 *        load_power_entity: sensor.house_load_power

 *        energy_today_entity: sensor.energy_today
 *        sun_entity: sun.sun   # nguồn giờ mọc/lặn thực tế (mặc định sun.sun)
 *        max_solar_kw: 5.5
 *        height: 520
 *
 *   Muốn card tự full chiều cao màn hình (không cần dò số px như 800):
 *   xoá dòng height, hoặc đặt height: auto. Card sẽ tự kéo full theo
 *   100dvh (chiều cao viewport thật) trừ đi thanh header của HA — hoạt
 *   động cho mọi loại View (đặc biệt hợp với View kiểu "Panel" – 1 card
 *   choán trọn màn hình). Nếu bị lố/hụt vài chục px do theme đổi cỡ
 *   header, chỉnh thêm: height_offset: 20  (số dương làm card thấp bớt,
 *   số âm làm card cao thêm).
 *
 * All entity_* config keys are optional – any entity left unmapped
 * falls back to a light built-in simulation so the card still looks
 * alive out of the box.
 */
(function(){
  console.info('[solar-3d-card] loaded build 2026-07-03-furniture-lights');
  const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  let threeLoadPromise=null;
  // Module-level (IIFE scope) – survives card remounts within the same page session.
  // Also persisted in localStorage so it survives full page reloads.
  let _lastRotSpeed=+(localStorage.getItem('solar_3d_rot_speed')||20);
  function ensureThree(){
    if(window.THREE) return Promise.resolve();
    if(threeLoadPromise) return threeLoadPromise;
    threeLoadPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=THREE_CDN;
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Không tải được three.js từ CDN'));
      document.head.appendChild(s);
    });
    return threeLoadPromise;
  }

  // ── GLTFLoader (r128-compatible build) – dùng để nạp model xe (.glb) ──
  const GLTFLOADER_CDN = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js";
  let gltfLoaderPromise=null;
  function ensureGLTFLoader(){
    if(window.THREE && window.THREE.GLTFLoader) return Promise.resolve();
    if(gltfLoaderPromise) return gltfLoaderPromise;
    gltfLoaderPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=GLTFLOADER_CDN;
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Không tải được GLTFLoader từ CDN'));
      document.head.appendChild(s);
    });
    return gltfLoaderPromise;
  }

  // ── DRACOLoader – ferrari.glb được nén bằng KHR_draco_mesh_compression
  //    (extensionsRequired) nên GLTFLoader BẮT BUỘC phải gắn DRACOLoader,
  //    nếu không sẽ load lỗi âm thầm và model không bao giờ hiện ra ──
  const DRACOLOADER_CDN = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js";
  const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
  let dracoLoaderPromise=null;
  function ensureDracoLoader(){
    if(window.THREE && window.THREE.DRACOLoader) return Promise.resolve();
    if(dracoLoaderPromise) return dracoLoaderPromise;
    dracoLoaderPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=DRACOLOADER_CDN;
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Không tải được DRACOLoader từ CDN'));
      document.head.appendChild(s);
    });
    return dracoLoaderPromise;
  }

  const CARD_STYLE = `
:host{display:block;height:100%}
ha-card{height:100%}
*{margin:0;padding:0;box-sizing:border-box}
/* container-type cho phép @container bên dưới bắt theo CHIỀU RỘNG THẬT của
   card (khung hiển thị), thay vì chiều rộng cả trình duyệt/màn hình như
   @media -> chính xác hơn nhiều khi card nằm trong cột hẹp, panel, hay
   trên điện thoại có viewport bị trình duyệt/app báo sai. */
.card-wrap{position:relative;width:100%;height:var(--villa-card-height,500px);
  background:#000;color:#e8eaf0;font-family:'Segoe UI',sans-serif;overflow:hidden;
  border-radius:var(--ha-card-border-radius,12px);
  container-type:inline-size;container-name:villa-card}
/* fill-panel: full theo chiều cao viewport thật (dvh), trừ chiều cao
   header của HA -> luôn đúng bất kể View là Panel/Masonry/Grid, không
   phụ thuộc dò cấu trúc DOM (vốn không đáng tin cậy qua Shadow DOM). */
.card-wrap.fill-panel{
  height:calc(100vh - var(--header-height,56px) - var(--vc-height-offset,0px));
}
@supports (height:100dvh){
  .card-wrap.fill-panel{
    height:calc(100dvh - var(--header-height,56px) - var(--vc-height-offset,0px));
  }
}
#c{width:100%;height:100%;display:block}
#hud{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}

/* Top bar */
#topbar{position:absolute;top:0;left:0;right:0;padding:12px 20px;
  background:linear-gradient(180deg,rgba(0,0,0,.9) 0%,transparent 100%);
  display:flex;align-items:center;justify-content:space-between;pointer-events:auto}
#topbar h1{font-size:16px;font-weight:700;color:#fff;letter-spacing:.5px}
#topbar h1 span{color:#3df2e0;text-shadow:0 0 12px rgba(61,242,224,.6)}
.live{display:flex;align-items:center;gap:6px;font-size:12px;color:#3df2e0}
.dot{width:7px;height:7px;background:#3df2e0;border-radius:50%;box-shadow:0 0 8px #3df2e0;animation:pd 1.4s ease-in-out infinite}
@keyframes pd{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}

/* Right column: sun clock + metrics stacked vertically */
#rightcol{position:absolute;top:60px;right:16px;display:flex;flex-direction:column;gap:8px;pointer-events:auto;width:200px}

#sunclock{
  background:rgba(10,20,40,.30);
  border:1px solid rgba(61,242,224,.35);
  border-radius:12px;padding:12px 14px;
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  box-shadow:0 0 18px rgba(61,242,224,.18),inset 0 1px 0 rgba(255,255,255,.08)}
#sunclock .time-big{font-size:26px;font-weight:700;color:#fff;line-height:1;font-variant-numeric:tabular-nums}
#sun-arc{width:100%;height:50px;position:relative;margin:8px 0 6px}
#sun-arc canvas{width:100%;height:100%}
.sun-info{font-size:12px;color:rgba(255,255,255,.85)}
.sun-info b{color:#ffcf5c;display:block;font-size:15px}
#sunclock label{font-size:12px;color:rgba(255,255,255,.85);display:flex;align-items:center;gap:6px;margin-top:6px}
#sunclock input[type=range]{width:100%;accent-color:#ffcf5c;margin-top:4px}

/* Metric cards – glassmorphism */
.mc{
  background:rgba(10,20,40,.28);
  border:1px solid rgba(61,242,224,.32);
  border-radius:10px;padding:10px 14px;
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  box-shadow:0 0 14px rgba(61,242,224,.15),inset 0 1px 0 rgba(255,255,255,.07)}
.mc .lbl{font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px}
.mc .val{font-size:21px;font-weight:700;line-height:1.1}
.mc .sub{font-size:11px;color:rgba(255,255,255,.80);margin-top:2px}
.mc .bg{height:3px;background:rgba(255,255,255,.06);border-radius:2px;margin-top:6px;overflow:hidden}
.mc .fg{height:100%;border-radius:2px;transition:width .8s}

/* Controls */
#ctrl{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
  display:flex;gap:8px;pointer-events:auto;
  background:rgba(10,20,40,.28);border:1px solid rgba(61,242,224,.32);
  border-radius:10px;padding:8px 14px;
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  box-shadow:0 0 14px rgba(61,242,224,.15),inset 0 1px 0 rgba(255,255,255,.07)}
.cb{padding:6px 14px;background:transparent;border:1px solid rgba(255,255,255,.20);
  color:rgba(255,255,255,.80);border-radius:7px;cursor:pointer;font-size:12px;transition:all .2s}
.cb.on{background:rgba(61,242,224,.12);color:#3df2e0;border-color:rgba(61,242,224,.35)}
.cb:hover{border-color:rgba(61,242,224,.35);color:#3df2e0}
#rotspeed-wrap{display:flex;align-items:center;gap:7px;padding:0 6px;
  border-left:1px solid rgba(255,255,255,.12);margin-left:4px}
#rotspeed-wrap span{font-size:11px;color:rgba(255,255,255,.80);white-space:nowrap}
#rotspeed-wrap input[type=range]{width:90px;accent-color:#3df2e0}
#rotSpeedVal{min-width:32px;text-align:right;color:#3df2e0;font-weight:600}

/* Legend */
#hint{position:absolute;bottom:68px;left:50%;transform:translateX(-50%);
  font-size:11px;color:rgba(255,255,255,.25);pointer-events:none;white-space:nowrap}

/* ── Responsive: bắt theo CHIỀU RỘNG THẬT CỦA CARD (container query),
   không phải chiều rộng màn hình -> đúng cả khi card hẹp trên laptop
   (cột nhỏ) lẫn trên điện thoại thật. Thu nhỏ HUD dần theo 2 ngưỡng. */
@container villa-card (max-width:520px){
  #rightcol{width:170px;top:56px;right:10px;gap:7px}
  #rightcol .mc{padding:9px 11px}
  #rightcol .mc .val{font-size:17px}
  #topbar h1{font-size:14px}
}
@container villa-card (max-width:420px){
  #rightcol{width:142px;top:50px;right:8px;gap:6px}
  #rightcol .mc{padding:7px 9px}
  #rightcol .mc .val{font-size:14px}
  #rightcol .mc .lbl{font-size:8px}
  #sunclock{padding:8px 9px}
  #sunclock .time-big{font-size:19px}
  #topbar{padding:7px 10px}
  #topbar h1{font-size:11px}
  .live{font-size:9px}
  #ctrl{padding:5px 7px;gap:3px;max-width:96%;flex-wrap:wrap;justify-content:center;bottom:8px}
  .cb{padding:4px 7px;font-size:9px}
  #rotspeed-wrap{padding:0 3px;margin-left:2px}
  #rotspeed-wrap span{font-size:8px}
  #rotspeed-wrap input[type=range]{width:44px}
  #hint{display:none}
}
/* Dự phòng cho trình duyệt cũ chưa hỗ trợ Container Query (hiếm) */
@media (max-width:420px){
  #rightcol{width:142px;top:50px;right:8px;gap:6px}
  #rightcol .mc{padding:7px 9px}
  #rightcol .mc .val{font-size:14px}
  #ctrl{flex-wrap:wrap;justify-content:center}
}
`;
  const CARD_BODY = `<canvas id="c"></canvas>
<div id="hud">
  <div id="topbar">
    <h1>🏛️ <span id="villa-name-lbl">03 Cao Lồi</span> · Solar Monitor</h1>
    <div class="live"><span class="dot"></span>Realtime · Mặt trời thực tế</div>
  </div>

  <div id="rightcol">
    <div id="sunclock">
      <div class="time-big" id="clocktxt">06:00</div>
      <div class="sun-info" id="sunphaselbl">🌅 Bình minh</div>
      <div id="sun-arc"><canvas id="arcCanvas" width="200" height="50"></canvas></div>
      <div class="sun-info"><b id="solarval">0.0 kW</b>☀️ Solar hiện tại</div>
      <label><input type="checkbox" id="autoTime" checked> Giờ thực tế</label>
      <input type="range" id="timeSlider" min="0" max="1440" value="360" title="Kéo để thay đổi giờ">
    </div>

    <div class="mc">
      <div class="lbl">☀️ Pin mặt trời</div>
      <div class="val" id="mv-solar" style="color:#ffcf5c">0.0 kW</div>
      <div class="sub" id="ms-solar">Chờ mặt trời mọc</div>
      <div class="bg"><div class="fg" id="mf-solar" style="width:0%;background:#ffcf5c"></div></div>
    </div>
    <div class="mc">
      <div class="lbl">🔋 Pin lưu trữ</div>
      <div class="val" id="mv-batt" style="color:#3df2c0">82%</div>
      <div class="sub" id="ms-batt">Đang sạc</div>
      <div class="bg"><div class="fg" id="mf-batt" style="width:82%;background:#3df2c0"></div></div>
    </div>
    <div class="mc">
      <div class="lbl">🏠 Tiêu thụ</div>
      <div class="val" id="mv-load" style="color:#ff6ec7">1.8 kW</div>
      <div class="bg"><div class="fg" id="mf-load" style="width:36%;background:#ff6ec7"></div></div>
    </div>
    <div class="mc">
      <div class="lbl">📊 Hôm nay</div>
      <div class="val" id="mv-today" style="color:#e8eaf0;font-size:17px">0.0 kWh</div>
      <div class="sub" id="ms-today">Tiết kiệm 0₫</div>
    </div>
    <div class="mc" id="mc-grid">
      <div class="lbl">🔌 Lưới điện</div>
      <div class="val" id="mv-grid" style="color:#5cc9ff">0.0 kW</div>
      <div class="sub" id="ms-grid">—</div>
      <div class="bg"><div class="fg" id="mf-grid" style="width:0%;background:#5cc9ff"></div></div>
    </div>
    <div class="mc" id="mc-weather">
      <div class="lbl">🌤️ Ngoài trời</div>
      <div class="val" id="mv-weather" style="color:#e8eaf0;font-size:15px">--°C</div>
      <div class="sub" id="ms-weather">--% ẩm · UV --</div>
    </div>
  </div>

  <div id="ctrl">
    <button class="cb on" id="btn-flow">⚡ Luồng điện</button>
    <button class="cb on" id="btn-shadow">🌑 Bóng đổ</button>
    <button class="cb on" id="btn-labels">🏷️ Nhãn</button>
    <button class="cb on" id="btn-weather">🌦️ Thời tiết</button>
    <button class="cb" id="btn-reset">🔄 Reset góc nhìn</button>
    <div id="rotspeed-wrap">
      <span>🔁 Tốc độ xoay</span>
      <input type="range" id="rotSpeed" min="0" max="100" value="20" >
      <span id="rotSpeedVal">20%</span>
    </div>
  </div>

  <div id="hint">🖱️ Kéo để xoay · Cuộn để zoom · Nhấn giữ phải để di chuyển</div>
</div>`;

  class Solar3dCard extends HTMLElement {
    // Nếu người dùng không khai `height` (hoặc khai height: auto / full),
    // card sẽ tự full theo chiều cao viewport thật (xem CSS .fill-panel).
    // Cách này KHÔNG dò cấu trúc DOM (closest() không xuyên được Shadow DOM
    // của HA nên trước đây luôn thất bại) mà dùng thẳng 100dvh của trình
    // duyệt -> luôn đúng, không phụ thuộc bạn đang ở loại View nào.
    // Nếu vẫn chưa full khít 100% (dôi/thiếu vài chục px do header đổi
    // cỡ), chỉnh bằng `height_offset: <px>` trong cấu hình card.
    _applyHeightMode(){
      if(!this._wrapEl) return;
      const h=this._cfg && this._cfg.height;
      const wantsAuto = !h || h==='auto' || h==='full';
      this._wrapEl.classList.toggle('fill-panel', wantsAuto);
      if(!wantsAuto){
        this._wrapEl.style.setProperty('--villa-card-height',(typeof h==='number'?h:520)+'px');
      }
      const offset=(this._cfg && this._cfg.height_offset)||0;
      this._wrapEl.style.setProperty('--vc-height-offset', offset+'px');
    }

    setConfig(config){
      this._cfg = config || {};
      if(!this._initialized){
        this._buildDom();
      }
      // Allow live config changes from the card editor/YAML without a full rebuild
      this._applyHeightMode();
      // Update villa name label in real-time when edited in YAML/visual editor
      if(this._q){
        const lbl=this._q('villa-name-lbl');
        if(lbl) lbl.textContent=this._cfg.villa_name||'03 Cao Lồi';
      }
    }

    set hass(hass){
      this._hass=hass;
      // Expose as `this.hass` for the scene-init closure (uses this.hass directly)
    }
    get hass(){ return this._hass; }

    _buildDom(){
      this._initialized=true;
      const card=document.createElement('ha-card');
      const shadow=this.attachShadow({mode:'open'});
      const style=document.createElement('style');
      style.textContent=CARD_STYLE;
      const wrap=document.createElement('div');
      wrap.className='card-wrap';
      wrap.style.setProperty('--villa-card-height',(this._cfg.height||520)+'px');
      wrap.innerHTML=CARD_BODY;
      card.appendChild(wrap);
      shadow.appendChild(style);
      shadow.appendChild(card);
      this._wrapEl=wrap;
      this._shadow=shadow;
      this._destroyed=false;

      // Shadow-DOM scoped element lookup, used throughout the 3D scene script
      // as this._q(id) instead of document.getElementById(id).
      this._q=(id)=>shadow.getElementById(id);

      ensureThree().then(()=>{
        if(this._destroyed)return;
        this._initScene();
      }).catch(err=>{
        wrap.innerHTML='<div style="padding:20px;color:#ff8888;font-family:sans-serif">'+
          '⚠️ Lỗi tải three.js: '+err.message+'</div>';
      });
    }

    // The entire 3D scene + UI logic lives in this single arrow-function
    // method so every nested function/closure inside it correctly shares
    // `this` (the card instance) without manual .bind() calls.
    _initScene = () => {

// Apply configurable villa name (config key: villa_name)
{
  const lbl=this._q('villa-name-lbl');
  if(lbl) lbl.textContent=this._cfg.villa_name||'03 Cao Lồi';
}

// ═══════════════════════════════════════════════════════
//  RENDERER + SCENE
// ═══════════════════════════════════════════════════════
const canvas = this._q('c');
const _wrap = this._q('hud').parentElement; // sized container div for this card
const _size=()=>({w:_wrap.clientWidth||400,h:_wrap.clientHeight||300});

// ── Mobile detection: dùng để giảm chất lượng render tự động ──
const _isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints>1 && window.innerWidth<900);

const R = new THREE.WebGLRenderer({canvas, antialias:!_isMobile, powerPreference:'high-performance'});
// Mobile: pixelRatio 1.0 (tránh render x2 pixel); Desktop: giới hạn 1.5 để mượt hơn (2x tốn GPU hơn nhiều nhưng lợi ích thị giác rất nhỏ)
R.setPixelRatio(_isMobile ? Math.min(devicePixelRatio,1.0) : Math.min(devicePixelRatio,1.5));
R.sortObjects=true; // ensure transparent glass renders after opaque geometry
{const s=_size();R.setSize(s.w,s.h);}
// Mobile: tắt shadow hoàn toàn để tiết kiệm GPU; Desktop: PCFSoft
R.shadowMap.enabled = !_isMobile;
R.shadowMap.type = THREE.PCFSoftShadowMap;
R.toneMapping = THREE.ACESFilmicToneMapping;
R.toneMappingExposure = 1.2;

const S = new THREE.Scene();
S.fog = new THREE.FogExp2(0x87ceeb,0.004);

const CAM = new THREE.PerspectiveCamera(52,_size().w/_size().h,0.1,300);
// camTheta = π+0.15 → camera đứng phía -Z (trước nhà), hơi lệch phải
// camPhi   = 0.35   → góc ngẩng lên cao hơn để thấy mái
// camR     = 55     → zoom out để thấy nhà to hơn
// camTarget= (-2,5,-2) → nhìn vào giữa nhà mới
// ⚠️  ĐỪNG đổi camTheta về 0.15 – sẽ nhìn từ phía SAU nhà
let camTheta=Math.PI+0.15,camPhi=0.35,camR=55,camTarget=new THREE.Vector3(-2,5,-2);
function updateCam(){
  CAM.position.set(
    camTarget.x+camR*Math.sin(camTheta)*Math.cos(camPhi),
    camTarget.y+camR*Math.sin(camPhi),
    camTarget.z+camR*Math.cos(camTheta)*Math.cos(camPhi)
  );
  CAM.lookAt(camTarget);
}
updateCam();

// ═══════════════════════════════════════════════════════
//  MOUSE CONTROLS
// ═══════════════════════════════════════════════════════
let mdown=false,mright=false,lx=0,ly=0;
canvas.addEventListener('mousedown',e=>{
  if(e.button===0)mdown=true;
  if(e.button===2)mright=true;
  lx=e.clientX;ly=e.clientY;
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('mouseup',()=>{mdown=false;mright=false});
window.addEventListener('mousemove',e=>{
  if(mdown){
    camTheta-=(e.clientX-lx)*0.007;
    camPhi=Math.max(.05,Math.min(1.3,camPhi-(e.clientY-ly)*0.005));
  }
  if(mright){
    const r=camR*0.001;
    const dx=(e.clientX-lx),dy=(e.clientY-ly);
    camTarget.x-=dx*r*Math.cos(camTheta);
    camTarget.z+=dx*r*Math.sin(camTheta);
    camTarget.y+=dy*r;
  }
  lx=e.clientX;ly=e.clientY;
  updateCam();
});
canvas.addEventListener('wheel',e=>{
  const delta=e.deltaY*0.04;
  const newR=Math.max(6,Math.min(80,camR+delta));
  const zoomFactor=(newR-camR)/camR; // negative = zoom in

  // Compute world-space direction from camera toward the point under the mouse cursor
  const rect=canvas.getBoundingClientRect();
  const ndcX=((e.clientX-rect.left)/rect.width)*2-1;
  const ndcY=-((e.clientY-rect.top)/rect.height)*2+1;

  // Unproject two NDC points to get the ray direction in world space
  const near=new THREE.Vector3(ndcX,ndcY,0).unproject(CAM);
  const far =new THREE.Vector3(ndcX,ndcY,1).unproject(CAM);
  const dir =far.sub(near).normalize(); // ray direction pointing into scene

  // Shift camTarget along the ray proportional to how much we zoomed
  // (positive deltaY = zoom out → push target away; negative = zoom in → pull toward cursor)
  const shift=camR*(-zoomFactor)*0.4;
  camTarget.addScaledVector(dir,shift);

  camR=newR;
  updateCam();
},{passive:true});
// Reset về góc nhìn MẶT TRƯỚC nhà (nhà to hơn, zoom out thêm)
const resetCam=()=>{camTheta=Math.PI+0.15;camPhi=0.35;camR=55;camTarget.set(-2,5,-2);updateCam()};

// ═══════════════════════════════════════════════════════
//  TOUCH CONTROLS (mobile)
// ═══════════════════════════════════════════════════════
let _touches={};  // lưu các touch hiện tại theo identifier
let _lastPinchDist=0;
let _lastPinchMidX=0, _lastPinchMidY=0;

function _getTouches(e){ return Array.from(e.touches); }
function _pinchDist(t1,t2){
  const dx=t1.clientX-t2.clientX, dy=t1.clientY-t2.clientY;
  return Math.sqrt(dx*dx+dy*dy);
}
function _pinchMid(t1,t2){
  return {x:(t1.clientX+t2.clientX)/2, y:(t1.clientY+t2.clientY)/2};
}

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  const ts=_getTouches(e);
  if(ts.length===1){
    lx=ts[0].clientX; ly=ts[0].clientY;
    mdown=true; mright=false;
  } else if(ts.length===2){
    mdown=false;
    _lastPinchDist=_pinchDist(ts[0],ts[1]);
    const m=_pinchMid(ts[0],ts[1]);
    _lastPinchMidX=m.x; _lastPinchMidY=m.y;
  }
},{passive:false});

canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  const ts=_getTouches(e);
  if(ts.length===1 && mdown){
    // 1 ngón: xoay camera
    const dx=ts[0].clientX-lx, dy=ts[0].clientY-ly;
    camTheta-=dx*0.007;
    camPhi=Math.max(.05,Math.min(1.3,camPhi-dy*0.005));
    lx=ts[0].clientX; ly=ts[0].clientY;
    updateCam();
  } else if(ts.length===2){
    // 2 ngón: pinch zoom
    const dist=_pinchDist(ts[0],ts[1]);
    const delta=(_lastPinchDist-dist)*0.06;
    camR=Math.max(6,Math.min(80,camR+delta));
    _lastPinchDist=dist;

    // 2 ngón kéo (pan)
    const m=_pinchMid(ts[0],ts[1]);
    const pdx=m.x-_lastPinchMidX, pdy=m.y-_lastPinchMidY;
    const r=camR*0.001;
    camTarget.x-=pdx*r*Math.cos(camTheta);
    camTarget.z+=pdx*r*Math.sin(camTheta);
    camTarget.y+=pdy*r;
    _lastPinchMidX=m.x; _lastPinchMidY=m.y;
    updateCam();
  }
},{passive:false});

canvas.addEventListener('touchend',e=>{
  if(e.touches.length===0){ mdown=false; }
  else if(e.touches.length===1){
    // còn 1 ngón sau khi nhả 1 ngón — reset về rotate mode
    lx=e.touches[0].clientX; ly=e.touches[0].clientY;
    mdown=true;
  }
},{passive:false});

// Auto-rotate speed (camera orbits the house when idle) – adjustable 0-100%
// via the slider; 20% (default) maps to the original .0002 rad/frame speed.
let camAutoSpeed=(_lastRotSpeed/100)*0.0011; // +10% overall speed
const setRotSpeed=v=>{
  camAutoSpeed=(v/100)*0.0011; // +10% overall speed
  this._q('rotSpeedVal').textContent=v+'%';
  _lastRotSpeed=+v;
  try{localStorage.setItem('solar_3d_rot_speed',v);}catch(e){}
};

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
const M=(color,rough=.7,metal=0,ei=0,ec=0x000000)=>
  new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive:ec,emissiveIntensity:ei});
function box(w,h,d,mat,cx=0,cy=0,cz=0,parent=S){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(cx,cy,cz);m.castShadow=true;m.receiveShadow=true;
  parent.add(m);return m;
}
function cyl(rt,rb,h,seg,mat,cx=0,cy=0,cz=0,parent=S){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);
  m.position.set(cx,cy,cz);m.castShadow=true;m.receiveShadow=true;
  parent.add(m);return m;
}
// ── Procedural canvas texture helper (no external images needed) ──
function makeCanvasTexture(draw,w=256,h=256,repX=1,repY=1){
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d');
  draw(ctx,w,h);
  const tex=new THREE.CanvasTexture(cv);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(repX,repY);
  tex.needsUpdate=true;
  return tex;
}
// ── Robust planar polygon face builder. Auto-fixes winding so the
//    roof ALWAYS faces up (fixes the "inverted / flipped-open" roof bug),
//    builds watertight non-overlapping slopes, and generates real UVs
//    so tile textures map correctly on every slope. ──
function polygonNormal(pts){
  const n=new THREE.Vector3(0,0,0);
  for(let i=0;i<pts.length;i++){
    const c=pts[i],nx=pts[(i+1)%pts.length];
    n.x+=(c.y-nx.y)*(c.z+nx.z);
    n.y+=(c.z-nx.z)*(c.x+nx.x);
    n.z+=(c.x-nx.x)*(c.y+nx.y);
  }
  return n.normalize();
}
function roofFace(pts,mat,uvScale=0.45){
  let pp=pts.slice();
  let n=polygonNormal(pp);
  if(n.y<0){pp=pp.slice().reverse();n=polygonNormal(pp);}
  const origin=pp[0];
  const ex=new THREE.Vector3().subVectors(pp[1],origin).normalize();
  const ey=new THREE.Vector3().crossVectors(n,ex).normalize();
  const posArr=[],uvArr=[];
  for(let i=1;i<pp.length-1;i++){
    [pp[0],pp[i],pp[i+1]].forEach(p=>{
      posArr.push(p.x,p.y,p.z);
      const d=new THREE.Vector3().subVectors(p,origin);
      uvArr.push(d.dot(ex)*uvScale,d.dot(ey)*uvScale);
    });
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(posArr),3));
  g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(uvArr),2));
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);
  m.castShadow=true;m.receiveShadow=true;
  return m;
}
// Thin glowing rectangular outline (used for pool deck rim accent)
function neonRect(w,d,y,color=0x3df2e0,thickness=0.06){
  const pts=[
    new THREE.Vector3(-w/2,0,-d/2),new THREE.Vector3(w/2,0,-d/2),
    new THREE.Vector3(w/2,0,d/2),new THREE.Vector3(-w/2,0,d/2),
    new THREE.Vector3(-w/2,0,-d/2)
  ];
  const curve=new THREE.CatmullRomCurve3(pts);
  curve.curveType='catmullrom';
  const geo=new THREE.TubeGeometry(curve,40,thickness,8,true);
  const mat=new THREE.MeshBasicMaterial({color});
  return new THREE.Mesh(geo,mat);
}

// ═══════════════════════════════════════════════════════
//  SKY + 3D ISLAND BASE
// ═══════════════════════════════════════════════════════
//
//  ┌─────────────────────────────────────────────────────┐
//  │  HỆ QUY CHIẾU – GHI NHỚ KHI SỬA                   │
//  │                                                     │
//  │  • Trục X  : dương → phải màn hình (camera reset)  │
//  │              âm    → trái màn hình                  │
//  │  • Trục Z  : âm (-Z) → mặt TRƯỚC nhà / cổng       │
//  │              dương (+Z) → mặt SAU nhà               │
//  │  • Trục Y  : dương → lên trên                      │
//  │                                                     │
//  │  Camera reset: camTheta = π+0.15                   │
//  │    → camera đứng phía -Z (trước cổng) nhìn vào    │
//  │    → hơi lệch phải 0.15 rad                        │
//  │                                                     │
//  │  Vị trí các thành phần chính (world space):        │
//  │    Villa body center : x=0,  z=0                   │
//  │    Pool (hồ bơi)     : x=+18, z=+1  (bên PHẢI)   │
//  │    Gate (cổng)       : x=0,  z=-14  (phía TRƯỚC)  │
//  │    Wall sides        : x=±11, z≈-8                 │
//  │    Palm trees        : x=±11, z=-14                │
//  │    Inverter/Battery  : phía trái nhà (x âm)        │
//  │                                                     │
//  │  Nội dung trải từ x≈-11 đến x≈+23 (pool edge)     │
//  │  Tâm nội dung thực ≈ x=+6                          │
//  │  → ISL_CX nên ≈ 4–6 để đảo bao đều quanh nhà      │
//  └─────────────────────────────────────────────────────┘
//
const skyGeo=new THREE.SphereGeometry(150,32,16);
const skyMat=new THREE.MeshBasicMaterial({side:THREE.BackSide,color:0x87ceeb});
const skySphere=new THREE.Mesh(skyGeo,skyMat);
S.add(skySphere);

// ── Kích thước đảo ──────────────────────────────────────
// ISL_W  : chiều rộng đảo theo trục X (trái–phải)
// ISL_D  : chiều sâu đảo theo trục Z (trước–sau)
// ISL_CX : tâm đảo theo X – tăng → sang PHẢI, giảm → sang TRÁI
//           pool ở x=+18, villa ở x=0, inverter ở x=-11 → tâm nội dung ≈ +3.5
//           đặt +4 để đảo cân đối với vòng cung mặt trời (ORBIT_CENTER.x=4)
// ISL_CZ : tâm đảo theo Z – gate ở z=-14, rear ≈ z=+6
//           đặt -3 để đảo bao đủ cả cổng lẫn phía sau
const ISL_W=52, ISL_D=48, ISL_CX=-2, ISL_CZ=-2;  // rộng hơn (+4W/+8D) & dịch tâm ra trước 1 đơn vị → đuôi nhà +5 đơn vị
const ISL_H=2.4;   // chiều cao (độ dày) đế đảo
const PLINTH_Y=-ISL_H/2; // tâm Y của khối đảo (mặt trên = y=0)

// ── Texture mặt trên đảo: gạch lát sân kiểu vuông bo góc ──
const islandTopTex=makeCanvasTexture((ctx,w,h)=>{
  // Nền đá sáng kem
  const bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#d8d0be'); bg.addColorStop(1,'#c8c0a8');
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  // Lưới gạch 60x60px
  const ts=60;
  for(let tx=0;tx<w;tx+=ts){
    for(let ty=0;ty<h;ty+=ts){
      // Gạch nền chính
      const shade=((tx/ts+ty/ts)%2===0)?'rgba(255,255,255,.06)':'rgba(0,0,0,.04)';
      ctx.fillStyle=shade; ctx.fillRect(tx+1,ty+1,ts-2,ts-2);
      // Bo góc nhẹ
      ctx.fillStyle='rgba(180,168,140,.5)'; ctx.fillRect(tx,ty,2,2);
      ctx.fillRect(tx+ts-2,ty,2,2); ctx.fillRect(tx,ty+ts-2,2,2); ctx.fillRect(tx+ts-2,ty+ts-2,2,2);
    }
  }
  // Đường kẻ mạch vữa
  ctx.strokeStyle='rgba(160,148,122,.7)'; ctx.lineWidth=1.5;
  for(let tx=0;tx<=w;tx+=ts){ctx.beginPath();ctx.moveTo(tx,0);ctx.lineTo(tx,h);ctx.stroke();}
  for(let ty=0;ty<=h;ty+=ts){ctx.beginPath();ctx.moveTo(0,ty);ctx.lineTo(w,ty);ctx.stroke();}
},512,512,4,3);

// ── Texture mặt hông đảo: bê tông xám bo góc (cement/concrete look) ──
const islandSideTex=makeCanvasTexture((ctx,w,h)=>{
  const bg=ctx.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,'#c0b8a8'); bg.addColorStop(.4,'#b0a898'); bg.addColorStop(1,'#888078');
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  // Đường viền ngang nhẹ (vệt đổ bê tông)
  for(let i=0;i<8;i++){
    const y=Math.random()*h;
    ctx.fillStyle='rgba(255,255,255,.04)'; ctx.fillRect(0,y,w,1);
  }
  // Vài đốm nhám
  for(let i=0;i<600;i++){
    ctx.fillStyle=`rgba(0,0,0,${Math.random()*.06})`;
    ctx.fillRect(Math.random()*w,Math.random()*h,2,2);
  }
},256,128,6,2);

const matIslandTop=new THREE.MeshStandardMaterial({map:islandTopTex,roughness:.8,metalness:.02});
const matIslandSide=new THREE.MeshStandardMaterial({map:islandSideTex,roughness:.9,metalness:.02,color:0xd0c8b8});
const matIslandEdge=new THREE.MeshStandardMaterial({color:0xe8e0d0,roughness:.6,metalness:.05}); // viền mép trắng

// ── Khối chính đảo (BoxGeometry với vật liệu riêng mỗi mặt) ──
// Dùng 6 material cho 6 mặt: top/bottom/4 hông
const islandMats=[
  matIslandSide,  // right (+x)
  matIslandSide,  // left (-x)
  matIslandTop,   // top (+y)  ← mặt đứng trên
  new THREE.MeshStandardMaterial({color:0x706860,roughness:.95}), // bottom (-y) ← đáy tối
  matIslandSide,  // front (+z)
  matIslandSide,  // back (-z)
];
const islandGeo=new THREE.BoxGeometry(ISL_W,ISL_H,ISL_D);
const islandMesh=new THREE.Mesh(islandGeo,islandMats);
islandMesh.position.set(ISL_CX,PLINTH_Y,ISL_CZ);
islandMesh.receiveShadow=true; islandMesh.castShadow=true;
S.add(islandMesh);

// ── Viền mép trên đảo: thanh viền trắng bo nhẹ quanh 4 cạnh ──
const edgeH=0.12, edgeW=0.28;
// Front edge
box(ISL_W+edgeW*2,edgeH,edgeW,matIslandEdge, ISL_CX,0,ISL_CZ+ISL_D/2);
// Back edge
box(ISL_W+edgeW*2,edgeH,edgeW,matIslandEdge, ISL_CX,0,ISL_CZ-ISL_D/2);
// Left edge
box(edgeW,edgeH,ISL_D,matIslandEdge, ISL_CX-ISL_W/2,0,ISL_CZ);
// Right edge
box(edgeW,edgeH,ISL_D,matIslandEdge, ISL_CX+ISL_W/2,0,ISL_CZ);

// ── Lớp viền đáy đảo (đế bo): dày, tạo cảm giác chiều sâu 3D ──
const baseH=0.55, baseOvh=0.7;
const matBase=new THREE.MeshStandardMaterial({color:0xc0b8a8,roughness:.85,metalness:.04});
box(ISL_W+baseOvh*2,baseH,ISL_D+baseOvh*2,matBase, ISL_CX,-ISL_H+baseH/2+0.01,ISL_CZ);
// Lớp đế thứ 2 nhô thêm (double-step plinth như ảnh mẫu)
const base2H=0.3, base2Ovh=1.1;
const matBase2=new THREE.MeshStandardMaterial({color:0xb8b0a0,roughness:.88,metalness:.03});
box(ISL_W+base2Ovh*2,base2H,ISL_D+base2Ovh*2,matBase2, ISL_CX,-ISL_H+base2H/2,ISL_CZ);

// ── Đường chỉ ngang giữa thân đảo (2 đường chỉ tạo tầng lớp đẹp hơn) ──
const matBand=new THREE.MeshStandardMaterial({color:0xd8d0c0,roughness:.7,metalness:.04});
box(ISL_W+0.02,0.22,ISL_D+0.02,matBand, ISL_CX,-ISL_H*0.38,ISL_CZ);
box(ISL_W+0.02,0.14,ISL_D+0.02,matBand, ISL_CX,-ISL_H*0.68,ISL_CZ);

// ── Sân lát gạch (courtyard) trên mặt đảo ──
const yardTex=makeCanvasTexture((ctx,w,h)=>{
  const bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#ddd4be'); bg.addColorStop(1,'#ccc4aa');
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  // Gạch lớn hơn, tông ấm hơn mặt đảo
  const ts=48;
  for(let tx=0;tx<w;tx+=ts){
    for(let ty=0;ty<h;ty+=ts){
      const even=(tx/ts+ty/ts)%2===0;
      ctx.fillStyle=even?'rgba(255,255,255,.07)':'rgba(0,0,0,.05)';
      ctx.fillRect(tx+1,ty+1,ts-2,ts-2);
    }
  }
  ctx.strokeStyle='rgba(180,165,135,.65)'; ctx.lineWidth=1.5;
  for(let tx=0;tx<=w;tx+=ts){ctx.beginPath();ctx.moveTo(tx,0);ctx.lineTo(tx,h);ctx.stroke();}
  for(let ty=0;ty<=h;ty+=ts){ctx.beginPath();ctx.moveTo(0,ty);ctx.lineTo(w,ty);ctx.stroke();}
},512,512,5,3);
const yard=new THREE.Mesh(new THREE.PlaneGeometry(34,22),
  new THREE.MeshStandardMaterial({map:yardTex,roughness:.82}));
yard.rotation.x=-Math.PI/2; yard.position.set(2,.008,-3); yard.receiveShadow=true; S.add(yard);

// (tile grid removed – mạch sân đã có trong texture yardTex)

// ═══════════════════════════════════════════════════════
//  HỒ BƠI TRƯỚC NHÀ – 2 ô chữ nhật với nước nhiều lớp + sóng
//  👉 SỬA VỊ TRÍ từng hồ: hpG1.position.set(x,y,z) / hpG2.position.set(x,y,z)
// ═══════════════════════════════════════════════════════

// ── Helper: canvas texture nước hồ bơi mosaic xanh ──
function makePoolWaterTex(){
  const c=document.createElement('canvas'); c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,0,512);
  bg.addColorStop(0,'#0a8fcc'); bg.addColorStop(0.5,'#0668a0'); bg.addColorStop(1,'#034d7a');
  ctx.fillStyle=bg; ctx.fillRect(0,0,512,512);
  const ts=24;
  for(let tx=0;tx<512;tx+=ts){
    for(let ty=0;ty<512;ty+=ts){
      const v=Math.random()*0.12-0.06;
      ctx.fillStyle=`rgba(${(30+v*255)|0},${(160+v*255)|0},${(220+v*255)|0},0.18)`;
      ctx.fillRect(tx+1,ty+1,ts-2,ts-2);
    }
  }
  ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=0.8;
  for(let i=0;i<=512;i+=ts){
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(512,i); ctx.stroke();
  }
  for(let i=0;i<60;i++){
    const gx=Math.random()*512, gy=Math.random()*512;
    const gr=ctx.createRadialGradient(gx,gy,0,gx,gy,18+Math.random()*20);
    gr.addColorStop(0,'rgba(255,255,255,0.22)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gr; ctx.fillRect(gx-22,gy-22,44,44);
  }
  const tex=new THREE.CanvasTexture(c);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(3,3);
  return tex;
}

// ── Helper: tạo một hồ bơi (basin + nước 3 lớp + rim + glow) ──
function makePool(W, D, depth){
  const g=new THREE.Group();
  // Viền bể (rim) gạch trắng kem 4 cạnh
  const rimMat=new THREE.MeshStandardMaterial({color:0xf0ebe0,roughness:.45,metalness:.05});
  const rimW=0.28;
  [
    {geo:new THREE.BoxGeometry(W+rimW*2,0.12,rimW), x:0, z: D/2+rimW/2},
    {geo:new THREE.BoxGeometry(W+rimW*2,0.12,rimW), x:0, z:-D/2-rimW/2},
    {geo:new THREE.BoxGeometry(rimW,0.12,D),        x: W/2+rimW/2, z:0},
    {geo:new THREE.BoxGeometry(rimW,0.12,D),        x:-W/2-rimW/2, z:0},
  ].forEach(r=>{
    const m=new THREE.Mesh(r.geo,rimMat);
    m.position.set(r.x,0.06,r.z);
    m.receiveShadow=true; m.castShadow=true; g.add(m);
  });
  // Đáy bể – mosaic xanh đậm
  const basin=new THREE.Mesh(
    new THREE.BoxGeometry(W,depth,D),
    new THREE.MeshStandardMaterial({color:0x0668a0,roughness:.3,metalness:.1})
  );
  basin.position.set(0,-depth/2,0); basin.receiveShadow=true; g.add(basin);
  // ── Lớp 1: Nước đáy – semi-transparent xanh đậm ──
  const texA=makePoolWaterTex();
  const matA=new THREE.MeshStandardMaterial({
    map:texA, color:0x1a9ed4, transparent:true, opacity:0.55,
    roughness:.04, metalness:.35
  });
  const wA=new THREE.Mesh(new THREE.PlaneGeometry(W-.04,D-.04,32,32),matA);
  wA.rotation.x=-Math.PI/2; wA.position.y=-.015; g.add(wA);
  // ── Lớp 2: Sóng mặt ──
  const texB=makePoolWaterTex(); texB.repeat.set(5,5);
  const matB=new THREE.MeshStandardMaterial({
    map:texB, color:0x55ccee, transparent:true, opacity:0.38,
    roughness:.01, metalness:.55
  });
  const wB=new THREE.Mesh(new THREE.PlaneGeometry(W-.08,D-.08,48,48),matB);
  wB.rotation.x=-Math.PI/2; wB.position.y=0.002; g.add(wB);
  // ── Lớp 3: Highlight phản chiếu ──
  const matC=new THREE.MeshStandardMaterial({
    color:0xaaeeff, transparent:true, opacity:0.18,
    roughness:.0, metalness:.9
  });
  const wC=new THREE.Mesh(new THREE.PlaneGeometry(W-.12,D-.12,16,16),matC);
  wC.rotation.x=-Math.PI/2; wC.position.y=0.008; g.add(wC);
  // ── Ánh sáng xanh pool glow ──
  const glow=new THREE.PointLight(0x22ccff,0.6,W*1.4);
  glow.position.set(0,0.05,0); g.add(glow);
  // ── Viền glow neon ──
  const hw=W/2+.05, hd=D/2+.05, ny=.04;
  const nGeo=new THREE.BufferGeometry();
  nGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([
    -hw,ny,-hd, hw,ny,-hd, hw,ny,hd, -hw,ny,hd, -hw,ny,-hd
  ]),3));
  g.add(new THREE.Line(nGeo,new THREE.LineBasicMaterial({color:0x3df2e0,transparent:true,opacity:.6})));
  return {g, texA, texB, matA, matB, wB, glow};
}

// Hồ 1 – ô bên phải
const _hp1=makePool(7,8.2,0.5);
const hpG1=_hp1.g; S.add(hpG1);
// 👉 SỬA VỊ TRÍ HỒ 1 Ở ĐÂY (x, y, z)
hpG1.position.set(7,0.5,-13);

// Hồ 2 – ô bên trái
const _hp2=makePool(14,8.2,0.5);
const hpG2=_hp2.g; S.add(hpG2);
// 👉 SỬA VỊ TRÍ HỒ 2 Ở ĐÂY (x, y, z)
hpG2.position.set(-3,0.5,-13);

// Ref cho animate – sóng + glow
const _hpTexA=[_hp1.texA,_hp2.texA];
const _hpTexB=[_hp1.texB,_hp2.texB];
const _hpWaveB=[_hp1.wB,_hp2.wB];
const _hpGlows=[_hp1.glow,_hp2.glow];

// ── Viền cỏ dải xanh quanh mép đảo (thay thế cỏ phẳng rộng) ──
const grassStripTex=makeCanvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#4a7a36'; ctx.fillRect(0,0,w,h);
  for(let i=0;i<5000;i++){
    const gx=Math.random()*w, gy=Math.random()*h;
    const gv=100+Math.random()*80;
    ctx.fillStyle=`rgba(${40+Math.random()*30|0},${gv|0},${30+Math.random()*30|0},.6)`;
    ctx.fillRect(gx,gy,1.8,1.8);
  }
},512,512,8,8);
const matGrassStrip=new THREE.MeshStandardMaterial({map:grassStripTex,roughness:.95});

// 4 dải cỏ quanh mép đảo (nằm trên mặt đảo, sát viền)
const GW=1.8; // độ rộng dải cỏ
// Front strip (phía cổng)
{const g=new THREE.Mesh(new THREE.PlaneGeometry(ISL_W-GW*2,GW),matGrassStrip);
g.rotation.x=-Math.PI/2; g.position.set(ISL_CX,.012,ISL_CZ+ISL_D/2-GW/2); S.add(g);}
// Back strip
{const g=new THREE.Mesh(new THREE.PlaneGeometry(ISL_W-GW*2,GW),matGrassStrip);
g.rotation.x=-Math.PI/2; g.position.set(ISL_CX,.012,ISL_CZ-ISL_D/2+GW/2); S.add(g);}
// Left strip
{const g=new THREE.Mesh(new THREE.PlaneGeometry(GW,ISL_D),matGrassStrip);
g.rotation.x=-Math.PI/2; g.position.set(ISL_CX-ISL_W/2+GW/2,.012,ISL_CZ); S.add(g);}
// Right strip
{const g=new THREE.Mesh(new THREE.PlaneGeometry(GW,ISL_D),matGrassStrip);
g.rotation.x=-Math.PI/2; g.position.set(ISL_CX+ISL_W/2-GW/2,.012,ISL_CZ); S.add(g);}

// ── Nền xa phía dưới (ground rộng để đảo nổi lên trên) ──
const gnd=new THREE.Mesh(new THREE.PlaneGeometry(300,300),
  new THREE.MeshStandardMaterial({color:0xa8c8e8,roughness:1.0,metalness:0}));
gnd.rotation.x=-Math.PI/2; gnd.position.y=-ISL_H-0.01; gnd.receiveShadow=true; S.add(gnd);

// ── Đường phố trước cổng (nằm trên nền ground, phía trước đảo -Z) ──
const roadY=-ISL_H;  // cùng mức với mặt ground
// Mặt đường nhựa xám — phía -Z là mặt trước nhà/cổng
const roadMesh=new THREE.Mesh(new THREE.PlaneGeometry(50,8),
  new THREE.MeshStandardMaterial({color:0x2e2e2e,roughness:.92,metalness:.02}));
roadMesh.rotation.x=-Math.PI/2;
roadMesh.position.set(ISL_CX, roadY+0.005, ISL_CZ-ISL_D/2-4);
roadMesh.receiveShadow=true; S.add(roadMesh);
// Vạch kẻ đường giữa (nét đứt trắng)
for(let i=-2;i<=2;i++){
  const ln=new THREE.Mesh(new THREE.PlaneGeometry(3.0,.14),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85}));
  ln.rotation.x=-Math.PI/2;
  ln.position.set(ISL_CX+i*11, roadY+0.012, ISL_CZ-ISL_D/2-4);
  S.add(ln);
}
// Vỉa hè (lề đường) giữa đảo và đường — nằm gọn giữa chân đế đảo và mép đường nhựa
// Road bắt đầu từ Z = ISL_CZ-ISL_D/2-base2Ovh (≈-20.1), width road = 8 → mép gần Z≈-20.1
// Sidewalk rộng 1.4 đặt tại Z = ISL_CZ-ISL_D/2-base2Ovh-0.7 → từ -19.4 đến -20.8, không đè road
const sidewalkMesh=new THREE.Mesh(new THREE.PlaneGeometry(ISL_W+base2Ovh*2+2.0, 1.4),
  new THREE.MeshStandardMaterial({color:0xc8c0b0,roughness:.88}));
sidewalkMesh.rotation.x=-Math.PI/2;
sidewalkMesh.position.set(ISL_CX, roadY+0.008, ISL_CZ-ISL_D/2-base2Ovh-0.7);
sidewalkMesh.receiveShadow=true; S.add(sidewalkMesh);

// shadowDisc removed – it was covering the front road with a white/blue strip

// ═══════════════════════════════════════════════════════
//  LIGHTS
// ═══════════════════════════════════════════════════════
const ambLight=new THREE.AmbientLight(0x445577,.7);S.add(ambLight);
const sunLight=new THREE.DirectionalLight(0xfffbe8,3.0);
sunLight.castShadow=!_isMobile;
sunLight.shadow.mapSize.set(_isMobile?512:1024,_isMobile?512:1024);
sunLight.shadow.camera.near=0.5;sunLight.shadow.camera.far=150;
sunLight.shadow.camera.left=-40;sunLight.shadow.camera.right=40;
sunLight.shadow.camera.top=40;sunLight.shadow.camera.bottom=-40;
sunLight.shadow.bias=-0.0005;
S.add(sunLight);
const fillLight=new THREE.DirectionalLight(0x88aaee,.5);
fillLight.position.set(-15,8,-5);S.add(fillLight);
// Warm interior glow
const intGlow=new THREE.PointLight(0xffcc66,1.2,12);
intGlow.position.set(0,4,0);S.add(intGlow);

// ═══════════════════════════════════════════════════════
//  MATERIALS PALETTE
// ═══════════════════════════════════════════════════════
// Terracotta roof tile texture (Mediterranean/Indochine villa style barrel tiles)
const roofTileTex=makeCanvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#7a3a22';ctx.fillRect(0,0,w,h);
  const cols=8,rows=8,cw=w/cols,rh=h/rows;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const cx=(c+(r%2?0.5:0))*cw+cw/2;
      const cy=r*rh+rh/2;
      const rad=cw*0.62;
      const g=ctx.createRadialGradient(cx,cy-rad*.35,rad*.1,cx,cy,rad);
      g.addColorStop(0,'#c06a40');
      g.addColorStop(.55,'#9a4a2e');
      g.addColorStop(1,'#6e2f1a');
      ctx.fillStyle=g;
      ctx.beginPath();ctx.ellipse(cx,cy,rad,rh*.62,0,0,Math.PI*2);ctx.fill();
    }
  }
},256,256,7,5);
const matWall   = M(0xf7f3ea,.75,.03);                 // bright white plaster wall
const matWallB  = M(0xeee8d8,.7,.03);                  // slightly warm wall
const matRoof   = new THREE.MeshStandardMaterial({map:roofTileTex,color:0xffffff,roughness:.85,metalness:.04,side:THREE.DoubleSide});  // terracotta tile roof
const matRoofT  = M(0x5c2c18,.7,.05);                  // darker terracotta ridge cap
const matColumn = M(0xfaf6ee,.55,.05);                 // white classical column
const matMolding= M(0xf0ece0,.5,.05);                  // cornice molding
const matBrick  = M(0xc4a878,.8);                      // yellow/beige brick wall base
const matGate   = M(0xb8986a,.35,.7);                  // bronze gate
const matGatePost=M(0xf2eedd,.55,.05);                 // white gate post
const matIron   = M(0x222222,.5,.6);                   // iron fence
const matGlass = new THREE.MeshPhysicalMaterial({
  color:0xb8e8ff, roughness:.05, metalness:.1,
  transparent:true, opacity:.35,
  transmission:.65, clearcoat:1.0, clearcoatRoughness:.05,
  emissive:0x000000, emissiveIntensity:0,
  side:THREE.DoubleSide, depthWrite:false});
const matGlassW = new THREE.MeshStandardMaterial({color:0xcc8855,roughness:.6,transparent:true,opacity:.9});
const matDoorGlass = new THREE.MeshPhysicalMaterial({
  color:0xa8dfff, roughness:.03, metalness:.08,
  transparent:true, opacity:.28,
  transmission:.72, clearcoat:1.0, clearcoatRoughness:.04,
  emissive:0x000000, emissiveIntensity:0,
  side:THREE.DoubleSide, depthWrite:false});
const matDoorFrame = new THREE.MeshStandardMaterial({color:0x2b2f36,roughness:.35,metalness:.75}); // slim dark aluminum door frame
const matBalcony= M(0x1a1a1a,.6,.5);                   // iron balcony rail
const matPavt   = M(0xc0b090,.85);                     // pavement
const matSolar  = new THREE.MeshStandardMaterial({color:0x0d1a2e,roughness:.2,metalness:.5,emissive:0x0022aa,emissiveIntensity:.25});
const matNeon   = new THREE.MeshBasicMaterial({color:0x3df2e0});      // cyan neon trim (subtle accent)
const matNeonG  = new THREE.MeshBasicMaterial({color:0x4dff8c});      // green energy-line neon

// ═══════════════════════════════════════════════════════
//  ╔═══════════════════════════╗
//  ║    MAIN VILLA BUILDING    ║
//  ╚═══════════════════════════╝
// ═══════════════════════════════════════════════════════
const villa=new THREE.Group();
villa.visible = false; // ẩn ngay – nhà cottage.glb sẽ hiển thị thay thế
// (nếu cottage.glb lỗi, villa sẽ được bật lại như fallback)
S.add(villa);

// ── FOUNDATION / PLINTH ──────────────────────────────
box(18,0.6,14,M(0xd8d0c0,.8),0,.3,0,villa);

// ── TẦNG 1 MAIN BODY ─────────────────────────────────
box(18,4.2,12,matWall,0,2.4,0,villa);
// Side wings slightly recessed
box(4,4.2,11.5,matWallB,-8.5,2.4,.5,villa);
box(4,4.2,11.5,matWallB, 8.5,2.4,.5,villa);

// Horizontal belt/band between floors
box(20,.35,13.5,matMolding,0,4.7,0,villa);

// ── TẦNG 2 MAIN BODY ─────────────────────────────────
box(16,3.8,11,matWall,0,6.8,0,villa);
// Tầng 2 setback wings
box(3.5,3.8,10,matWallB,-9,6.8,0,villa);
box(3.5,3.8,10,matWallB, 9,6.8,0,villa);

// Top entablature / cornice
box(18,.5,12.5,matMolding,0,8.85,.25,villa);
// Top parapet
box(16,.8,0.3,matMolding,0,9.1,-5.25,villa);

// ── CLASSICAL COLUMNS TẦNG 1 ─────────────────────────
const colPos1=[[-6,0,-6],[- 3,0,-6],[0,0,-6],[3,0,-6],[6,0,-6]];
colPos1.forEach(([x,,z])=>{
  // Column shaft
  cyl(.28,.3,4.4,16,matColumn,x,2.2,z,villa);
  // Capital
  box(.7,.3,.7,matColumn,x,4.4,z,villa);
  // Base
  box(.65,.25,.65,matColumn,x,.45,z,villa);
});

// ── CLASSICAL COLUMNS TẦNG 2 ─────────────────────────
const colPos2=[[-5,0,-5.5],[-2.5,0,-5.5],[0,0,-5.5],[2.5,0,-5.5],[5,0,-5.5]];
colPos2.forEach(([x,,z])=>{
  cyl(.22,.24,4,16,matColumn,x,6.8,z,villa);
  box(.56,.22,.56,matColumn,x,8.7,z,villa);
  box(.52,.2,.52,matColumn,x,5.0,z,villa);
});

// ── BALCONY FLOOR TẦNG 2 ─────────────────────────────
box(16,.2,1.8,matMolding,0,5.0,-5.6,villa);
// Balcony railing posts
for(let i=-7;i<=7;i+=.9){
  box(.06,1,.06,matBalcony,i,5.6,-6.4,villa);
}
// Balcony rail top + bottom bars
box(16,.07,.07,matBalcony,0,6.0,-6.4,villa);
box(16,.07,.07,matBalcony,0,5.1,-6.4,villa);

// ── WINDOW: 4 thanh frame mỏng + 1 plane kính mỏng, không recess ──────
function addWin(x,y,z,w=1.8,h=2.2,parent=villa,axis='z'){
  const fT=.08, fD=.12;
  // Xác định chiều nhô ra: z âm → nhô về phía âm; z dương → nhô về dương; x → theo x
  const sign = axis==='z' ? (z<=0?-1:1) : (x>=0?1:-1);
  const nx = axis==='x' ? x+sign*.01 : x;
  const nz = axis==='z' ? z+sign*.01 : z;

  // 4 thanh viền frame (mỏng, không che glass)
  const mkBar=(bw,bh,bd,bx,by,bz)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),matDoorFrame);
    m.position.set(bx,by,bz);
    if(axis==='x') m.rotation.y=Math.PI/2;
    parent.add(m);
  };
  if(axis==='z'){
    mkBar(w+fT*2,fT,fD, nx,y+h/2+fT/2,nz);  // top
    mkBar(w+fT*2,fT,fD, nx,y-h/2-fT/2,nz);  // bottom
    mkBar(fT,h,fD, nx-w/2-fT/2,y,nz);        // left
    mkBar(fT,h,fD, nx+w/2+fT/2,y,nz);        // right
    // Glass – PlaneGeometry mỏng, đặt đúng mặt ngoài tường
    const gm=new THREE.Mesh(new THREE.PlaneGeometry(w,h),matGlass);
    gm.position.set(nx,y,nz+sign*.02);
    if(sign>0) gm.rotation.y=Math.PI; // flip normal để nhìn đúng chiều
    gm.renderOrder=4;
    parent.add(gm);
    // Mullion (dấu thập, mỏng)
    const mz=nz+sign*.03;
    mkBar(w,.04,.04, nx,y,mz);
    mkBar(.04,h,.04, nx,y,mz);
  } else {
    mkBar(fD,fT,w+fT*2, nx,y+h/2+fT/2,nz);  // top
    mkBar(fD,fT,w+fT*2, nx,y-h/2-fT/2,nz);  // bottom
    mkBar(fD,h,fT, nx,y,nz-w/2-fT/2);        // front
    mkBar(fD,h,fT, nx,y,nz+w/2+fT/2);        // back
    const gm=new THREE.Mesh(new THREE.PlaneGeometry(w,h),matGlass);
    gm.position.set(nx+sign*.02,y,nz);
    gm.rotation.y=sign>0?Math.PI/2:-Math.PI/2;
    gm.renderOrder=4;
    parent.add(gm);
    const mx=nx+sign*.03;
    mkBar(.04,fT,w, mx,y,nz);
    mkBar(.04,h,.04, mx,y,nz);
  }
}
// Front windows floor 1 – mặt tường z=-6.0
addWin(-5.5,2.4,-6.0);addWin(-3,2.4,-6.0);addWin(3,2.4,-6.0);addWin(5.5,2.4,-6.0);
// Side windows bên PHẢI – mặt tường x=+10.5 (depth 11.5 → x=±10.75, dùng 10.5 cho wing)
addWin(10.5,2.4,-1,1.6,2.0,villa,'x');addWin(10.5,2.4,2,1.6,2.0,villa,'x');
// Rear windows – mặt tường z=+6.0
addWin(-4,2.4,6.0);addWin(0,2.4,6.0);addWin(4,2.4,6.0);

// Floor 2 windows – mặt tường z=-5.5
addWin(-4.5,7.0,-5.5,1.7,2.0);addWin(-1.5,7.0,-5.5,1.7,2.0);addWin(1.5,7.0,-5.5,1.7,2.0);addWin(4.5,7.0,-5.5,1.7,2.0);
addWin(-9.0,7.0,-5.0,1.5,1.8);addWin(9.0,7.0,-5.0,1.5,1.8);
addWin(-9.0,7.0, 5.0,1.5,1.8);addWin(9.0,7.0, 5.0,1.5,1.8);

// Arch window floor 2 center top (round top)
const archGeo=new THREE.CylinderGeometry(0.8,0.8,0.1,32,1,false,0,Math.PI);
const arch=new THREE.Mesh(archGeo,matGlassW);
arch.rotation.z=Math.PI/2;arch.position.set(0,8.2,-5.45);villa.add(arch);

// ── MAIN ENTRANCE ────────────────────────────────────
// Entrance porch roof
box(5,.25,3,matMolding,0,5.05,-7.2,villa);
box(5,.1,2.9,matRoof,0,5.2,-7.2,villa);
// Entrance columns
[[-1.8,0],[-0,0],[1.8,0]].forEach(([x])=>{
  cyl(.25,.27,5.0,16,matColumn,x,2.5,-7.1,villa);
  box(.6,.2,.6,matColumn,x,5.0,-7.1,villa);
});
// Double door – slim aluminum frame + flat glass panels
box(2.20,.10,.12,matDoorFrame,0,3.08,-6.01,villa);   // top bar
box(2.20,.10,.12,matDoorFrame,0,.03,-6.01,villa);    // bottom bar
box(.10,3.08,.12,matDoorFrame,-1.05,1.52,-6.01,villa); // left bar
box(.10,3.08,.12,matDoorFrame, 1.05,1.52,-6.01,villa); // right bar
box(.07,3.08,.10,matDoorFrame,0,1.52,-6.01,villa);   // center mullion
box(2.06,.07,.10,matDoorFrame,0,1.52,-6.01,villa);   // mid-rail
// Glass panels – PlaneGeometry mỏng, sát mặt ngoài tường
const _dg1=new THREE.Mesh(new THREE.PlaneGeometry(.96,2.88),matDoorGlass);
_dg1.position.set(-.52,1.52,-6.02); _dg1.renderOrder=4; villa.add(_dg1);
const _dg2=new THREE.Mesh(new THREE.PlaneGeometry(.96,2.88),matDoorGlass);
_dg2.position.set( .52,1.52,-6.02); _dg2.renderOrder=4; villa.add(_dg2);
// Door header
box(2.1,.2,.13,matMolding,0,3.05,-6.02,villa);
// Metal door handles
[-.18,.18].forEach(hx=>{
  box(.03,.5,.03,matDoorFrame,hx,1.3,-5.95,villa);
});

// Steps
box(4.5,.15,1.0,matPavt,0,.15,-6.7,villa);
box(3.8,.3,1.0,matPavt,0,.3,-7.3,villa);
box(3.2,.45,1.0,matPavt,0,.45,-7.8,villa);

// ═══════════════════════════════════════════════════════
//  INTERIOR FURNITURE & LIGHTING (visible through glass
//  door/windows – adds depth so the house doesn't look
//  hollow when seen from outside)
// ═══════════════════════════════════════════════════════
const interiorGroup=new THREE.Group();
interiorGroup.renderOrder=1; // render before glass (renderOrder 2) so it shows through
// LƯU Ý: KHÔNG add(interiorGroup) vào villa hay S ở đây nữa.
// villa.visible=false nên nội thất sẽ không hiện nếu gắn vào villa.
// interiorGroup được build bằng toạ độ cục bộ (gốc 0,0,0, không xoay) của
// villa/nhà cũ. Nó sẽ được gắn vào `houseAnchor` NGAY SAU KHI cottage.glb
// load xong (xem callback gltfLoader.load(houseUrl,...) bên dưới), để tự
// động khớp đúng vị trí + hướng xoay của nhà thật.
const matSofa   = M(0x5a6b7a,.85);
const matSofaCu = M(0x7a8b98,.8);
const matWood   = M(0x8a6840,.6,.05);
const matWoodDk = M(0x5c4228,.55,.05);
const matRug    = M(0xb09060,.9);
const matTVbody = M(0x111418,.4,.3);
const matMetalLamp=M(0x2b2f36,.35,.7);

// ═══════════════════════════════════════════════════════════════════
//  📐 HỆ TRỤC TOẠ ĐỘ NỘI THẤT (đọc trước khi chỉnh bất kỳ số nào)
//  Mọi hàm box(w,h,d,mat, x,y,z, parent) / cyl(...) bên dưới dùng:
//    x → trái(-) / phải(+)   — theo chiều ngang mặt tiền nhà
//    y → xuống(-) / lên(+)   — chiều cao, 0 = sàn nhà, ~4 = trần
//    z → trước(-) / sau(+)   — âm là phía CỬA CHÍNH (nam), dương là phía sau nhà
//  Gốc (0,0,0) = tâm khối nhà (houseAnchor), KHÔNG xoay, KHÔNG scale.
//  Mỗi món đồ được đánh dấu [ID-xxx] trong comment để dễ tìm bằng Ctrl+F.
// ═══════════════════════════════════════════════════════════════════

// [ID-floor] Floor (visible through the glass so the room doesn't look like a void)
// 👉 SỬA VỊ TRÍ: 3 số cuối trước "interiorGroup" chính là (x,y,z)
box(16,.1,10.5,M(0xcdbb98,.7,.04),0,.35,.5,interiorGroup);
// [ID-rug] Area rug under the living-room seating
// 👉 SỬA VỊ TRÍ: 3 số cuối trước "interiorGroup" chính là (x,y,z)
box(4.2,.02,2.8,matRug,0,.41,-1.5,interiorGroup);

// ── [ID-sofa] Living room sofa (L-shaped), facing the front windows ──
// (kích thước w,d truyền vào khi gọi hàm — KHÔNG cần sửa; chỉ sửa x,y,z)
function sofaUnit(x,z,w,d,rot=0,y=0){
  const u=new THREE.Group();interiorGroup.add(u);
  box(w,.4,d,matSofa,0,.55,0,u);            // seat base
  box(w,.5,.18,matSofaCu,0,.95,-d/2+.1,u);  // backrest
  box(.18,.5,d,matSofaCu,-w/2+.1,.78,0,u);  // left armrest
  box(.18,.5,d,matSofaCu, w/2-.1,.78,0,u);  // right armrest
  u.position.set(x,y,z);u.rotation.y=rot;
  return u;
}
// 👉 SỬA VỊ TRÍ: 2 số đầu = (x,z); nếu muốn chỉnh cao/thấp thêm số y vào cuối (mặc định 0)
const sofaMain=sofaUnit(-1.6,-2.4,3.2,1.1);              // [ID-sofa-main] sofa dài
const sofaSide=sofaUnit(2.1,16,1.1,2.0,Math.PI/2,0.8);    // [ID-sofa-side] sofa góc L

// ── [ID-coffee-table] Coffee table ──
const coffeeTableGroup=new THREE.Group();interiorGroup.add(coffeeTableGroup);
box(1.6,.45,.9,matWoodDk,0,.55,0,coffeeTableGroup);
box(1.4,.04,.7,new THREE.MeshStandardMaterial({color:0xcfe8ee,roughness:.1,metalness:.2,transparent:true,opacity:.5}),0,.78,0,coffeeTableGroup);
coffeeTableGroup.position.set(-1.6,0,-.6); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z)

// ── [ID-tv] TV console + flat-screen TV on the side wall ──
const tvGroup=new THREE.Group();interiorGroup.add(tvGroup);
box(2.6,.6,.5,matWoodDk,0,.65,0,tvGroup);
const tv=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.2,.08),matTVbody);
tv.position.set(0,1.6,-.15);tvGroup.add(tv);
const tvScreen=new THREE.Mesh(new THREE.PlaneGeometry(2.0,1.0),
  new THREE.MeshStandardMaterial({color:0x1a3a55,emissive:0x4488cc,emissiveIntensity:1.1}));
tvScreen.position.set(0,1.6,-.10);tvGroup.add(tvScreen);
tvGroup.position.set(-0.5,1,5.5); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z)

// ── [ID-dining] Dining table + chairs near the rear windows ──
const diningGroup=new THREE.Group();interiorGroup.add(diningGroup);
box(2.2,.42,1.1,matWood,0,.55,0,diningGroup);
[[-0.8,-0.6],[0.8,-0.6],[-0.8,0.6],[0.8,0.6]].forEach(([cx,cz])=>{
  box(.4,.5,.4,matWoodDk,cx,.5,cz,diningGroup);
});
diningGroup.position.set(1.8,0,2.6); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z) — dịch cả bàn+4 ghế cùng lúc

// ══════════════════════════════════════════════════════════════════
//  NỘI THẤT MỞ RỘNG – phòng ngủ, kệ bếp, tủ đứng, bàn học, đèn ngủ
// ══════════════════════════════════════════════════════════════════

// ── [ID-bed] Phòng ngủ chính (giường: khung + đệm + gối + chăn) ──────
const matBed   = M(0xf0e8d8,.85);      // chăn trắng kem
const matBedFr = M(0x5c3a2a,.6,.04);   // khung giường gỗ nâu sẫm
const matPillow= M(0xffffff,.9);        // gối trắng
const matNTable= M(0x7a5a38,.6,.05);    // tủ đầu giường gỗ nhạt
const matLampBs= M(0xd4b060,.35,.6);   // đế đèn ngủ đồng

const bedGroup=new THREE.Group();interiorGroup.add(bedGroup);
// Khung giường (headboard + frame)
box(2.6,.12,1.55,matBedFr,0,.44,0.04,bedGroup);  // frame đáy
box(2.6,1.0,.1,matBedFr,0,1.0,-.74,bedGroup);    // headboard
box(2.6,.08,.04,matBedFr,0,1.96,-.70,bedGroup);  // đầu headboard
// Chân giường (4 chân)
[[-1.1,-.68],[-1.1,.68],[1.1,-.68],[1.1,.68]].forEach(([bx,bz])=>{
  box(.1,.44,.1,matBedFr,bx,.22,bz,bedGroup);
});
// Đệm + chăn
box(2.4,.22,1.44,matBed,0,.65,0,bedGroup);
// Gối x2
box(.7,.18,.52,matPillow,-.45,.87,-.5,bedGroup);
box(.7,.18,.52,matPillow,.45,.87,-.5,bedGroup);
// Chăn gấp cuối giường
box(2.2,.14,.38,M(0x8a6255,.8),0,.72,.52,bedGroup);
bedGroup.position.set(-4.8,0,3.06); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z) — dịch cả giường

// ── [ID-nightstands] Tủ đầu giường x2 + đèn ngủ trên tủ ──────────────
const nightstandsGroup=new THREE.Group();interiorGroup.add(nightstandsGroup);
const _bedLampMats=[];
[-0.94,0.94].forEach((bx)=>{
  // Tủ đầu giường
  box(.42,.5,.42,matNTable,bx,.63,0,nightstandsGroup);
  // Đế đèn
  cyl(.07,.07,.28,10,matLampBs,bx,.94,0,nightstandsGroup);
  // Bóng đèn nhỏ
  const _blm=new THREE.MeshStandardMaterial({color:0xfffbe8,emissive:0xffd860,emissiveIntensity:0.6});
  const _bl=new THREE.Mesh(new THREE.SphereGeometry(.10,8,8),_blm);
  _bl.position.set(bx,1.14,0);nightstandsGroup.add(_bl);
  _bedLampMats.push(_blm);
  // Chụp đèn hình nón
  const _bsm=new THREE.MeshStandardMaterial({color:0xffe8b0,emissive:0xffcc70,emissiveIntensity:.5,side:THREE.DoubleSide,transparent:true,opacity:.88});
  const _bs=new THREE.Mesh(new THREE.ConeGeometry(.18,.24,14,1,true),_bsm);
  _bs.position.set(bx,1.22,0);nightstandsGroup.add(_bs);
  _bedLampMats.push(_bsm);
});
// Point light từ 2 đèn đầu giường (x local giống 2 tủ ở trên)
const bedLight1=new THREE.PointLight(0xffd9a0,.0,3.5);
bedLight1.position.set(-0.94,1.2,0);nightstandsGroup.add(bedLight1);
const bedLight2=new THREE.PointLight(0xffd9a0,.0,3.5);
bedLight2.position.set(0.94,1.2,0);nightstandsGroup.add(bedLight2);
nightstandsGroup.position.set(-4.8,0,2.58); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z) — dịch cả 2 tủ + 2 đèn ngủ

// ── [ID-wardrobe] Tủ quần áo (wardrobe) áp tường phải phòng ngủ ──────
const wardrobeGroup=new THREE.Group();interiorGroup.add(wardrobeGroup);
box(.22,2.5,1.4,matBedFr,0,1.25,0,wardrobeGroup);      // thân tủ
box(.06,2.5,.04,matWoodDk,.1,1.25,-.68,wardrobeGroup);  // cánh trái
box(.06,2.5,.04,matWoodDk,.1,1.25,.68,wardrobeGroup);   // cánh phải
[-.52,.52].forEach(hz=>{
  box(.02,.18,.06,M(0xcccccc,.25,.8),.17,.9,hz,wardrobeGroup);
});
wardrobeGroup.position.set(-6.8,0,3.06); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z)

// ── [ID-kitchen] Kệ bếp / phòng bếp (góc phải phía sau) ──────────────
const matCounter= M(0xf5f0e8,.6,.08);  // mặt bàn đá nhạt
const matCabinet= M(0x7a6550,.65,.04); // tủ bếp gỗ
const matSink   = M(0xb0b8be,.3,.8);   // chậu rửa inox
const matFaucet =M(0xd0d8de,.2,.85);

const kitchenGroup=new THREE.Group();interiorGroup.add(kitchenGroup);
box(3.2,.88,.6,matCabinet,0,.44,0,kitchenGroup);      // tủ dưới
box(3.4,.06,.68,matCounter,0,.9,0,kitchenGroup);      // mặt đá
box(.7,.08,.44,matSink,.6,.87,0,kitchenGroup);        // chậu rửa
box(.04,.32,.04,matFaucet,.6,1.14,-.24,kitchenGroup); // vòi thẳng đứng
box(.22,.04,.04,matFaucet,.6,1.28,-.24,kitchenGroup); // vòi ngang
box(3.2,.7,.35,matCabinet,0,2.0,.27,kitchenGroup);    // tủ trên
[-.6,.1].forEach(bx=>{
  [-.28,.08].forEach(bz=>{
    cyl(.11,.11,.04,16,M(0x1a1a1a,.55,.2),bx,.93,bz,kitchenGroup);
    cyl(.06,.06,.05,14,M(0x555555,.4,.3),bx,.96,bz,kitchenGroup);
  });
});
// [ID-kitchen-light] Đèn tủ bếp (under-cabinet strip light) — nằm chung group bếp
const kitchenStripMat=new THREE.MeshStandardMaterial({color:0xfff4d0,emissive:0xffe090,emissiveIntensity:.8});
const kitchenStrip=new THREE.Mesh(new THREE.BoxGeometry(3.0,.04,.08),kitchenStripMat);
kitchenStrip.position.set(0,1.36,-.08);kitchenGroup.add(kitchenStrip);
const kitchenLight=new THREE.PointLight(0xfff0c8,.0,4.5);
kitchenLight.position.set(0,1.3,-.02);kitchenGroup.add(kitchenLight);
kitchenGroup.position.set(4.8,0,3.8); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z) — dịch cả tủ bếp + chậu + đèn

// ── [ID-desk] Bàn học / home office ───────────────────────────────────
const matDesk   = M(0x8a7050,.5,.05);
const matMonitor= M(0x111418,.4,.3);
const deskGroup=new THREE.Group();interiorGroup.add(deskGroup);
box(2.0,.04,1.0,matDesk,0,.78,0,deskGroup);
box(.06,.78,.06,matDesk,-.95,.39,-.45,deskGroup);
box(.06,.78,.06,matDesk,.95,.39,-.45,deskGroup);
box(.06,.78,.06,matDesk,-.95,.39,.45,deskGroup);
box(.06,.78,.06,matDesk,.95,.39,.45,deskGroup);
box(1.2,.7,.06,matMonitor,0,1.35,-.42,deskGroup);
const monitorScreen=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.6),
  new THREE.MeshStandardMaterial({color:0x1a3a55,emissive:0x4488cc,emissiveIntensity:.9}));
monitorScreen.position.set(0,1.35,-.45);deskGroup.add(monitorScreen);
box(.06,.3,.06,matDesk,0,.93,-.38,deskGroup);
box(.7,.03,.28,M(0x2a2a2a,.5,.15),-.1,.8,-.08,deskGroup);
box(.1,.04,.15,M(0x1a1a1a,.5,.15),.5,.8,-.08,deskGroup);
deskGroup.position.set(-1.0,0,4.2); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z)

// ── [ID-bookshelf] Kệ sách (phòng khách, góc trái) ─────────────────────
const matShelf = M(0x8a6840,.55,.05);
const matBook  = [M(0xcc4444),M(0x4466cc),M(0x44aa55),M(0xccaa22),M(0x884488)];
const bookshelfGroup=new THREE.Group();interiorGroup.add(bookshelfGroup);
[1.85, 2.55, 3.25].forEach((sy)=>{
  box(2.4,.06,.22,matShelf,0,sy,0,bookshelfGroup);
  let bx=-.8;
  while(bx<1.2){
    const bw=0.10+Math.random()*.08;
    const bh=0.28+Math.random()*.16;
    const bi=Math.floor(Math.random()*matBook.length);
    box(bw,bh,.18,matBook[bi],bx,sy+.06+bh/2,0,bookshelfGroup);
    bx+=bw+0.04+Math.random()*.02;
  }
});
box(.06,1.5,.24,matShelf,-1.0,2.55,0,bookshelfGroup);
box(.06,1.5,.24,matShelf,1.0,2.55,0,bookshelfGroup);
box(2.06,.06,.24,matShelf,0,1.52,0,bookshelfGroup);
box(2.06,.06,.24,matShelf,0,3.52,0,bookshelfGroup);
bookshelfGroup.position.set(-6.8,0,-3.6); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z)

// ── [ID-floor-lamp] Floor lamp beside the sofa (warm glow, visible through glass) ──
const lampG=new THREE.Group();interiorGroup.add(lampG);
box(.05,1.4,.05,matMetalLamp,0,.7,0,lampG);
const _lampShadeMat=new THREE.MeshStandardMaterial({color:0xffe7b0,emissive:0xffcf80,emissiveIntensity:1.0,side:THREE.DoubleSide});
const lampShade=new THREE.Mesh(new THREE.ConeGeometry(.32,.4,12,1,true),_lampShadeMat);
lampShade.position.set(0,1.55,0);lampG.add(lampShade);
const lampLight=new THREE.PointLight(0xffd9a0,1.0,5);
lampLight.position.set(0,1.5,0);lampG.add(lampLight); // (trước đây add riêng vào interiorGroup — giờ chung group để đi theo lampG)
lampG.position.set(-4.6,0,-2.6); // 👉 SỬA VỊ TRÍ Ở ĐÂY (x,y,z) — dịch cả đèn cây + vùng sáng

// ── [ID-pendant] Ceiling pendant lights over the living/dining area (2 cái) ──
const _pendantMats=[], _pendantLights=[], _pendantGroups=[];
[[-1.6,-1.5],[1.8,2.6]].forEach(([px,pz])=>{
  const pg=new THREE.Group();interiorGroup.add(pg);
  const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.9,6),matMetalLamp);
  cord.position.set(0,4.0,0);pg.add(cord);
  const _bMat=new THREE.MeshStandardMaterial({color:0xfff2cc,emissive:0xffe6a8,emissiveIntensity:1.4});
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.14,10,10),_bMat);
  bulb.position.set(0,3.5,0);pg.add(bulb);
  _pendantMats.push(_bMat);
  const pl=new THREE.PointLight(0xffe2b0,0.85,6);
  pl.position.set(0,3.4,0);pg.add(pl);
  _pendantLights.push(pl);
  pg.position.set(px,0,pz);
  _pendantGroups.push(pg);
});
// 👉 SỬA VỊ TRÍ: _pendantGroups[0] = đèn thả trên sofa, _pendantGroups[1] = đèn thả trên bàn ăn
// ví dụ dịch đèn thả sofa: _pendantGroups[0].position.set(x,y,z)

// [ID-fill-light] Soft warm ambient fill so the interior reads even in daylight glare
// 👉 SỬA VỊ TRÍ: 3 số trong .position.set(x,y,z) ngay dưới đây
const interiorFill=new THREE.PointLight(0xfff0d8,0.5,9);
interiorFill.position.set(0,2.6,-1);interiorGroup.add(interiorFill);

// ── [ID-tv-glow] TV screen glow light (adds warm blue cast at night) ──
// 👉 SỬA VỊ TRÍ: 3 số trong .position.set(x,y,z) ngay dưới đây
const tvGlowLight=new THREE.PointLight(0x4488cc,0,4);
tvGlowLight.position.set(2.5,1.6,-4.0);interiorGroup.add(tvGlowLight);


// ═══════════════════════════════════════════════════════════════════
//  OUTDOOR LIGHTS – đèn hiên + đèn sân (thêm vào scene S, không villa)
//  Tất cả sẽ sáng dần theo _nightF trong animate() cùng đèn trong nhà
//  📐 Đèn hiên (makeWallSconce) dùng CÙNG hệ trục với nội thất (x/y/z tính
//     từ tâm nhà, xem legend phía trên interiorGroup). Đèn trụ sân/cổng
//     (makePostLamp) dùng toạ độ TUYỆT ĐỐI trong sân (world space, không
//     phụ thuộc vị trí nhà) vì chúng nằm ở lối đi/hàng rào, không áp vào nhà.
// ═══════════════════════════════════════════════════════════════════
const _outdoorLightMats=[];  // mảng material bóng đèn để cập nhật emissive
const _outdoorLights   =[];  // mảng {light, dayI, nightI}

// Helper: tạo bóng đèn hiên (wall sconce) hình trụ ngắn + bóng cầu nhỏ bên dưới
function makeWallSconce(x,y,z,lightColor=0xffe8a8,radius=10,parent=S){
  const g=new THREE.Group();parent.add(g);
  // Hộp gắn tường
  const bracketMat=new THREE.MeshStandardMaterial({color:0x2c2c2c,roughness:.4,metalness:.7});
  const brkt=new THREE.Mesh(new THREE.BoxGeometry(.14,.22,.14),bracketMat);
  g.add(brkt);
  // Thân đèn (hình trụ ngắn giống wall lantern)
  const bodyMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:.35,metalness:.75});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.28,12),bodyMat);
  body.position.set(0,-0.24,0.08);g.add(body);
  // Kính đèn (mặt trước trong suốt phát sáng)
  const glassMat=new THREE.MeshStandardMaterial({color:0xffe8c0,emissive:0xffd080,
    emissiveIntensity:0.5,transparent:true,opacity:.72,roughness:.04});
  const glassPane=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.22,12,1,true),glassMat);
  glassPane.position.set(0,-0.24,0.08);g.add(glassPane);
  _outdoorLightMats.push(glassMat);
  // Đỉnh đèn (chóp)
  const capMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:.35,metalness:.8});
  const cap=new THREE.Mesh(new THREE.ConeGeometry(.13,.1,12),capMat);
  cap.position.set(0,-0.09,0.08);g.add(cap);
  // Đáy đèn
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.04,12),capMat);
  base.position.set(0,-0.36,0.08);g.add(base);
  g.position.set(x,y,z);
  // Point light
  const pl=new THREE.PointLight(lightColor,.0,radius);
  pl.position.set(x,y-0.3,z+0.25);parent.add(pl);
  _outdoorLights.push({light:pl,dayI:0.0,nightI:2.2});
  return {group:g,glassMat,light:pl};
}

// Helper: đèn trụ sân (garden post lamp) – cột ngắn + bóng cầu trên
function makePostLamp(x,z,h=1.6,lightColor=0xffd8a0,radius=8){
  // Cột
  const postMat=new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:.45,metalness:.65});
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,h,10),postMat);
  post.position.set(x,h/2,z);S.add(post);
  // Đế cột
  const basePost=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,.12,10),postMat);
  basePost.position.set(x,.06,z);S.add(basePost);
  // Bóng đèn cầu trên đỉnh
  const globeMat=new THREE.MeshStandardMaterial({color:0xffe0b0,emissive:0xffd070,
    emissiveIntensity:.6,transparent:true,opacity:.80,roughness:.04,side:THREE.DoubleSide});
  const globe=new THREE.Mesh(new THREE.SphereGeometry(.18,12,12),globeMat);
  globe.position.set(x,h+.18,z);S.add(globe);
  _outdoorLightMats.push(globeMat);
  // Chụp trên
  const capMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:.35,metalness:.8});
  const cap=new THREE.Mesh(new THREE.ConeGeometry(.22,.14,12),capMat);
  cap.position.set(x,h+.42,z);S.add(cap);
  // Point light
  const pl=new THREE.PointLight(lightColor,.0,radius);
  pl.position.set(x,h+.18,z);S.add(pl);
  _outdoorLights.push({light:pl,dayI:0.0,nightI:1.8});
}

// ── Đèn hiên trước + sau: KHÔNG tạo ở đây nữa. ──
// Trước đây 4 cái đèn này add thẳng vào S bằng toạ độ cục bộ của villa cũ
// (z=-6.15 / z=7.1), trong khi nhà thật (cottage.glb) được xoay -90° và
// dịch tâm về hCenter2 sau khi load → đèn bị "nhảy" ra chỗ khác (ra hồ).
// Giờ chúng được tạo bên trong callback gltfLoader.load(houseUrl,...),
// gắn vào `houseAnchor` (nhóm cùng vị trí+hướng xoay với nhà thật) nên
// luôn bám đúng hai bên cửa chính, bất kể nhà xoay/dịch thế nào.

// ── [ID-path-lamp] Đèn trụ sân – lối đi từ cổng vào cửa chính ──
// Lối đi trung tâm phía trước nhà, khoảng z=-14 (cổng) đến z=-6 (cửa)
makePostLamp(8, 15.0, 1.5, 0xffd8a0, 19);


// ── [ID-island-lamp] Đèn trụ sân – hai bên đảo (viền sân) ──
makePostLamp( ISL_CX+ISL_W/2-2.5, ISL_CZ-ISL_D/2+2.0, 1.4, 0xffd0a0, 8);
makePostLamp( ISL_CX-ISL_W/2+2.5, ISL_CZ-ISL_D/2+2.0, 1.4, 0xffd0a0, 8);
makePostLamp( ISL_CX+ISL_W/2-2.5, ISL_CZ+ISL_D/2-2.0, 1.4, 0xffd0a0, 8);
makePostLamp( ISL_CX-ISL_W/2+2.5, ISL_CZ+ISL_D/2-2.0, 1.4, 0xffd0a0, 8);

// ── [ID-gate-lamp] Đèn cổng – gắn trên 2 trụ cổng (x=±7.5, z≈-14) ──
makeWallSconce(-10.5, 6.5, -4.5, 0xffcc80, 10);
makeWallSconce( 2.2, 6.5, -4.5, 0xffcc80, 10);

// Bundle all interior controllable lights for night-time animation
// [light, baseDayIntensity, baseNightIntensity]
const _interiorLights=[
  {light:lampLight,      shadeMat:_lampShadeMat, dayI:0.0,  nightI:1.2},
  {light:_pendantLights[0], mat:_pendantMats[0], dayI:0.0,  nightI:1.1},
  {light:_pendantLights[1], mat:_pendantMats[1], dayI:0.0,  nightI:0.9},
  {light:interiorFill,   shadeMat:null,          dayI:0.25, nightI:0.6},
  {light:tvGlowLight,    shadeMat:null,          dayI:0.0,  nightI:0.7},
  {light:bedLight1,      shadeMat:null,          dayI:0.0,  nightI:0.95},
  {light:bedLight2,      shadeMat:null,          dayI:0.0,  nightI:0.85},
  {light:kitchenLight,   shadeMat:null,          dayI:0.0,  nightI:1.0},
  // Outdoor lights registered separately so we can also drive their materials
  ..._outdoorLights,
];

// ── ROOF TẦNG 1 WINGS ────────────────────────────────
// Flat top with slight pitch on left/right wings
function addRoofPitch(x,w,d,h,parent=villa){
  // Hip roof for wings
  const geo=new THREE.ConeGeometry(1,h,4,1);
  // Actually use a manual shape
  const shape=new THREE.Shape();
  shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,h);shape.closePath();
  const extSettings={depth:d,bevelEnabled:false};
  const geo2=new THREE.ExtrudeGeometry(shape,extSettings);
  const m=new THREE.Mesh(geo2,matRoof);
  m.position.set(x-w/2,8.9,-d/2);
  m.castShadow=true;parent.add(m);
}
// Main roof – large hip roof (proper watertight trapezoid + hip-triangle faces,
// auto-corrected winding via roofFace() so it always reads as a normal sloped
// tile roof instead of the old overlapping/flipped panels)
(()=>{
  const baseY=8.85, ridgeY=12.35, ridgeHalfLen=8.0;
  const halfW=10.2, halfD=6.6; // small overhang beyond the wall line
  const A=new THREE.Vector3(-halfW,baseY,-halfD);   // front-left eave
  const B=new THREE.Vector3( halfW,baseY,-halfD);   // front-right eave
  const Cc=new THREE.Vector3(halfW,baseY, halfD);   // back-right eave
  const D=new THREE.Vector3(-halfW,baseY, halfD);   // back-left eave
  const R1=new THREE.Vector3(-ridgeHalfLen,ridgeY,0); // ridge left
  const R2=new THREE.Vector3( ridgeHalfLen,ridgeY,0); // ridge right
  villa.add(roofFace([A,B,R2,R1],matRoof));  // front slope (trapezoid)
  villa.add(roofFace([D,Cc,R2,R1],matRoof)); // back slope (trapezoid)
  villa.add(roofFace([A,D,R1],matRoof));     // left hip (triangle)
  villa.add(roofFace([B,Cc,R2],matRoof));    // right hip (triangle)
  // Ridge cap
  box(ridgeHalfLen*2+1,.3,.3,matRoofT,0,ridgeY,0,villa);
  // Eave fascia trim along front/back edges (clean finished edge)
  box(halfW*2+.4,.18,.18,matRoofT,0,baseY-.02,-halfD,villa);
  box(halfW*2+.4,.18,.18,matRoofT,0,baseY-.02, halfD,villa);
})();

// Roof eave details (overhangs)
box(22,.15,14.5,matMolding,0,8.83,0,villa);

// ── NEON TRIM ACCENT (subtle, just under the main roof eave) ──
function neonStrip(w,h,d,x,y,z,parent=villa){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),matNeon);
  m.position.set(x,y,z);parent.add(m);return m;
}
neonStrip(20.2,.04,.04,0,8.78,7.25,villa);
neonStrip(20.2,.04,.04,0,8.78,-7.25,villa);

// ═══════════════════════════════════════════════════════
//  SOLAR PANELS ON MAIN ROOF (aligned to actual roof slope, bigger array)
// ═══════════════════════════════════════════════════════
const panelGroup=new THREE.Group();
const panelFrame=M(0x3a4452,.4,.5);
// Main front slope: baseY=8.85 at z=-6.6, ridgeY=12.35 at z=0 (see main roof build above)
const roofBaseY=8.85, roofRidgeY=12.35, roofHalfD=6.6;
const mainSlopeAngle=Math.atan2(roofRidgeY-roofBaseY,roofHalfD);
const mainSlopeLen=Math.sqrt(roofHalfD**2+(roofRidgeY-roofBaseY)**2);
const panelW=1.35,panelD=1.18,panelGap=0.16;
const panelCols=[-5.4,-3.55,-1.7,1.7,3.55,5.4];
const panelRowsT=[0.13,0.36,0.59,0.82]; // fraction along slope (0=eave,1=ridge), kept clear of ridge cap
panelCols.forEach(px=>{
  panelRowsT.forEach(t=>{
    const distAlong=t*mainSlopeLen;
    const pz=-roofHalfD+distAlong*Math.cos(mainSlopeAngle); // eave → ridge
    const py=roofBaseY+distAlong*Math.sin(mainSlopeAngle)+0.05; // lift slightly above tile surface
    const fr=new THREE.Mesh(new THREE.BoxGeometry(panelW,.05,panelD),panelFrame);
    fr.position.set(px,py,pz);
    fr.rotation.x=-mainSlopeAngle;
    fr.castShadow=true;panelGroup.add(fr);
    const cell=new THREE.Mesh(new THREE.BoxGeometry(panelW-.08,.03,panelD-.08),matSolar);
    cell.position.set(px,py+0.03,pz);
    cell.rotation.x=-mainSlopeAngle;
    panelGroup.add(cell);
    // Cell grid lines (visual detail so big panels don't read as a flat slab)
    for(let gx=-1;gx<=1;gx++){
      const gl=new THREE.Mesh(new THREE.BoxGeometry(.02,.01,panelD-.1),M(0x16263a,.3,.2));
      gl.position.set(px+gx*(panelW/3),py+0.045,pz);
      gl.rotation.x=-mainSlopeAngle;
      panelGroup.add(gl);
    }
  });
});
S.add(panelGroup);
const solarGlow=new THREE.PointLight(0x4488ff,0,8);
solarGlow.position.set(0,10.8,-3);S.add(solarGlow);

// ═══════════════════════════════════════════════════════
//  AC OUTDOOR UNITS (biểu diễn tải tiêu thụ của nhà – đặt phía sau nhà)
// ═══════════════════════════════════════════════════════
const acBodyMat  = M(0xe9ebee,.55,.15);
const acGrilleMat= M(0x2c323b,.6,.35);
const acFinMat   = M(0xbcc4cc,.4,.5);
const acPipeMat  = M(0x5a6067,.5,.4);
const acPadMat   = M(0x9aa0a8,.9,0);

function buildACUnit(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);villa.add(g);
  const bw=1.15, bh=.72, bd=.42, legH=.14, baseY=legH+bh/2;
  // Bệ bê tông nhỏ dưới chân máy
  box(bw+.18,.07,bd+.18,acPadMat,0,legH*0.4,0,g);
  // 4 chân đỡ
  [[-bw/2+.1,-bd/2+.08],[bw/2-.1,-bd/2+.08],[-bw/2+.1,bd/2-.08],[bw/2-.1,bd/2-.08]].forEach(([lx,lz])=>{
    box(.07,legH,.07,acGrilleMat,lx,legH/2,lz,g);
  });
  // Thân máy
  box(bw,bh,bd,acBodyMat,0,baseY,0,g);
  // Nắp trên
  box(bw*0.94,.05,bd*0.94,acGrilleMat,0,baseY+bh/2+.025,0,g);
  // Mặt lưới trước với khe tản nhiệt ngang
  box(bw*0.86,bh*0.62,.03,acGrilleMat,0,baseY-.02,bd/2+.016,g);
  for(let i=-4;i<=4;i++){
    box(bw*0.8,.03,.04,acFinMat,0,baseY-.02+i*.065,bd/2+.03,g);
  }
  // Quạt tròn phía phải mặt trước
  const fan=cyl(.17,.17,.02,20,acGrilleMat,bw*0.24,baseY-.03,bd/2+.03,g);
  fan.rotation.x=Math.PI/2;
  const fanRing=cyl(.19,.19,.01,20,acFinMat,bw*0.24,baseY-.03,bd/2+.035,g);
  fanRing.rotation.x=Math.PI/2;
  // Ống dẫn gas chạy lên tường vào trong nhà
  cyl(.022,.022,1.5,8,acPipeMat,-bw/2+.14,baseY+.9,-bd/2-.01,g);
  return g;
}
buildACUnit(-3.2, roofHalfD+0.36);
buildACUnit( 3.0, roofHalfD+0.36);

// ═══════════════════════════════════════════════════════
//  DECORATIVE ELEMENTS
// ═══════════════════════════════════════════════════════
// Corner pilasters on main facade
[[-8.5,0],[8.5,0]].forEach(([x])=>{
  box(.6,8.6,.55,matColumn,x,4.6,-6.0,villa);
});

// Horizontal molding strips
[-1.0,4.65,8.8].forEach(y=>{
  box(18.2,.2,12.2,matMolding,0,y,0,villa);
});

// Decorative brackets under balcony
for(let i=-6.5;i<=6.5;i+=2.5){
  box(.25,.6,.6,matMolding,i,4.85,-5.55,villa);
}

// ═══════════════════════════════════════════════════════
//  BOUNDARY WALL + GATE – ĐÃ XÓA (chỉ giữ nền, inverter, pin, xe, solar)
// ═══════════════════════════════════════════════════════
const wallGroup=new THREE.Group(); // giữ tham chiếu rỗng để các phần tử khác không bị lỗi
// (không add vào S)

// ═══════════════════════════════════════════════════════
//  PALM TREES – ĐÃ XÓA
// ═══════════════════════════════════════════════════════
function palmTree(x,z,h=8){
  const g=new THREE.Group(); // không add vào S
  // Trunk – slightly curved, segmented for a natural taper
  const trunkMat=M(0x9a7a48,.85);
  const segs=6;
  let curveOffset=0;
  for(let i=0;i<segs;i++){
    const segH=h/segs;
    curveOffset+=0.04;
    const seg=new THREE.Mesh(new THREE.CylinderGeometry(.16-i*.012,.19-i*.012,segH,8),trunkMat);
    seg.position.set(x+curveOffset,segH*i+segH/2,z);
    seg.castShadow=true;g.add(seg);
  }
  const topY=h+0.3, topX=x+curveOffset;
  // Fronds – curved, serrated blades that fan out and droop like real pinnate
  // palm leaves (jagged sine-wave edge mimics individual leaflets)
  function frond(angle,droop,lenScale,startAngle){
    const w=0.55,len=3.4*lenScale;
    const geo=new THREE.PlaneGeometry(w,len,5,10);
    const pos=geo.attributes.position;
    for(let i=0;i<pos.count;i++){
      const ny=pos.getY(i); // -len/2..len/2
      let t=(ny+len/2)/len; // 0 at base .. 1 at tip
      t=Math.max(0,Math.min(1,t)); // clamp – float32 rounding can push t slightly <0 → Math.pow() NaN
      const bend=Math.pow(t,1.45)*droop;
      const nx=pos.getX(i);
      const taper=1-t*0.8;
      const serrate=Math.sin(t*Math.PI*13)*0.05*(1-t*0.25); // jagged leaflet edge
      pos.setX(i,nx*taper+(nx>=0?serrate:-serrate));
      // +bend (not -bend): in local space the leaf's own +Y is already tilted
      // up/outward by startAngle below, so curving the tip towards +Z here
      // means the tip arcs further UP and away from the trunk first, then
      // gravity-droops back down at the very tip – the classic fountain-palm
      // shape – instead of curling the whole frond down into the trunk.
      pos.setZ(i,bend+Math.sin(t*Math.PI*13)*0.012);
    }
    geo.computeVertexNormals();
    const tone=Math.random()<0.5?0x2d7a3a:0x357f3f;
    const mat=new THREE.MeshStandardMaterial({color:tone,roughness:.8,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(topX,topY,z);
    mesh.rotation.y=angle;
    // startAngle: small tilt off the trunk so the frond's local +Y (its
    // length axis) points mostly UP with a bit of outward Z lean – NOT a
    // big angle, which would point translateY sideways/inward instead.
    mesh.rotation.x=-startAngle+(Math.random()-.5)*0.12;
    mesh.translateY(len/2*0.9);
    mesh.castShadow=true;
    g.add(mesh);
  }
  // Lower tier – mature, longer, more drooping fronds (the main fountain shape).
  // startAngle here is a small lean angle (~25–35°): the leaf base points
  // mostly upward and slightly outward, then the tip arcs up and gently
  // droops back down near the very end – the classic palm "fountain" look.
  const lowerCount=10;
  for(let i=0;i<lowerCount;i++){
    frond((i/lowerCount)*Math.PI*2+Math.random()*.2,2.6+Math.random()*0.8,1.0,Math.PI/6);
  }
  // Upper tier – young, shorter, more upright fronds filling the crown center
  const upperCount=6;
  for(let i=0;i<upperCount;i++){
    frond((i/upperCount)*Math.PI*2+Math.random()*.2+.3,1.1+Math.random()*0.4,0.62,Math.PI/12);
  }
  // Crown bud + small coconut cluster (breaks up the plain "green ball" tip)
  const bud=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),M(0x3a8a4a,.8));
  bud.position.set(topX,topY-.1,z);g.add(bud);
  const coconutMat=M(0x4a3520,.75);
  for(let i=0;i<4;i++){
    const ang=i/4*Math.PI*2;
    const co=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),coconutMat);
    co.position.set(topX+Math.cos(ang)*.17,topY-.25+Math.random()*.05,z+Math.sin(ang)*.17);
    g.add(co);
  }
}
// Only 2 palm trees flanking the entrance gate (z = -14)
palmTree(11,-14,7);palmTree(-11,-14,7.5);

// ── SHRUBS – ĐÃ XÓA

// ═══════════════════════════════════════════════════════
//  SWIMMING POOL – ĐÃ XÓA
// ═══════════════════════════════════════════════════════
const poolGroup=new THREE.Group(); // không add vào S
const POOL_X=18,POOL_Z=1;

// ── Pool deck – 4 border strips (N/S/E/W) leaving pool opening clear ──
//   Pool water occupies the 9×7 centre; deck strips are 1 unit wide each side.
const dkMat=M(0xe8e0cf,.55,.04);
// North strip
const dkN=new THREE.Mesh(new THREE.BoxGeometry(11,.28,1.0),dkMat);
dkN.position.set(POOL_X,.0,POOL_Z+4.0);poolGroup.add(dkN);
// South strip
const dkS=new THREE.Mesh(new THREE.BoxGeometry(11,.28,1.0),dkMat);
dkS.position.set(POOL_X,.0,POOL_Z-4.0);poolGroup.add(dkS);
// West strip (spans the middle gap only)
const dkW=new THREE.Mesh(new THREE.BoxGeometry(1.0,.28,7.0),dkMat);
dkW.position.set(POOL_X-5.0,.0,POOL_Z);poolGroup.add(dkW);
// East strip
const dkE=new THREE.Mesh(new THREE.BoxGeometry(1.0,.28,7.0),dkMat);
dkE.position.set(POOL_X+5.0,.0,POOL_Z);poolGroup.add(dkE);

// ── Pool coping: raised rim tiles around water edge ───────────────
[[0,-3.65],[0,3.65]].forEach(([dx,dz])=>{
  const r=new THREE.Mesh(new THREE.BoxGeometry(9.6,.06,.4),M(0xf5f0e5,.5,.04));
  r.position.set(POOL_X+dx,.15,POOL_Z+dz);poolGroup.add(r);
});
[[-4.85,0],[4.85,0]].forEach(([dx,dz])=>{
  const r=new THREE.Mesh(new THREE.BoxGeometry(.4,.06,7.6),M(0xf5f0e5,.5,.04));
  r.position.set(POOL_X+dx,.15,POOL_Z+dz);poolGroup.add(r);
});

// ── Pool basin – vivid blue mosaic tile ──────────────────────────
const poolTileTex=makeCanvasTexture((ctx,w,h)=>{
  // Deep blue base
  const g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#1a8fc8');g.addColorStop(1,'#0d5a8a');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  // White grout lines
  ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2;
  const n=10;
  for(let i=0;i<=n;i++){
    ctx.beginPath();ctx.moveTo(i*w/n,0);ctx.lineTo(i*w/n,h);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*h/n);ctx.lineTo(w,i*h/n);ctx.stroke();
  }
  // Lane stripes on bottom
  ctx.fillStyle='rgba(255,255,255,.15)';
  [.18,.36,.54,.72].forEach(t=>{ctx.fillRect(t*w,0,w*.07,h);});
},256,256,4,2);
const poolBasinMat=new THREE.MeshStandardMaterial({
  map:poolTileTex,roughness:.3,metalness:.08,
  color:0x2299cc,emissive:0x0a4466,emissiveIntensity:.18
});
const poolBasin=new THREE.Mesh(new THREE.BoxGeometry(9.4,.5,7.4),poolBasinMat);
poolBasin.position.set(POOL_X,-.26,POOL_Z);
poolGroup.add(poolBasin);

// ── Water surface – vivid cyan-blue with shimmer ─────────────────
const poolWaterTex=makeCanvasTexture((ctx,w,h)=>{
  const g=ctx.createRadialGradient(w*.5,h*.38,w*.06,w*.5,h*.5,w*.62);
  g.addColorStop(0,'#5de8f0');    // bright centre
  g.addColorStop(.35,'#15b8d8'); // mid
  g.addColorStop(.72,'#0880b0'); // depth
  g.addColorStop(1,'#054e78');   // very deep edge
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  // Caustics-like shimmer blobs
  ctx.globalAlpha=.18;
  for(let i=0;i<22;i++){
    const cx=Math.random()*w,cy=Math.random()*h,r=8+Math.random()*18;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle=i%2?'#a0f4ff':'#ffffff';ctx.fill();
  }
  ctx.globalAlpha=1;
  // Ripple lines
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1.5;
  for(let i=0;i<20;i++){
    const y=Math.random()*h;
    ctx.beginPath();ctx.moveTo(0,y);
    for(let x=0;x<=w;x+=14) ctx.lineTo(x,y+Math.sin(x*.055+i)*6);
    ctx.stroke();
  }
},512,512,1,1);
const waterMat=new THREE.MeshStandardMaterial({
  map:poolWaterTex,
  color:0x22c8e8,roughness:.03,metalness:.18,
  emissive:0x0a6a96,emissiveIntensity:.65,
  transparent:true,opacity:.91
});
const water=new THREE.Mesh(new THREE.PlaneGeometry(9.0,7.0),waterMat);
water.rotation.x=-Math.PI/2;
water.position.set(POOL_X,.01,POOL_Z); // ground level — deck strips don't cover this area
poolGroup.add(water);

// ── Spa / jacuzzi ──────────────────────────────────────────────
const spaDeck=new THREE.Mesh(new THREE.BoxGeometry(3.2,.32,3.2),M(0xe8e0cf,.55,.04));
spaDeck.position.set(POOL_X+1.5,0,POOL_Z+5.2);poolGroup.add(spaDeck);
const spaBasin=new THREE.Mesh(new THREE.BoxGeometry(2.6,.6,2.6),poolBasinMat);
spaBasin.position.set(POOL_X+1.5,-.35,POOL_Z+5.2);poolGroup.add(spaBasin);
const spaWater=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),waterMat);
spaWater.rotation.x=-Math.PI/2;
spaWater.position.set(POOL_X+1.5,.01,POOL_Z+5.2);poolGroup.add(spaWater);

// ── Pool steps (corner entry) ───────────────────────────────────
for(let i=0;i<3;i++){
  const step=new THREE.Mesh(new THREE.BoxGeometry(2.2-i*.5,.12,1.4-i*.3),poolBasinMat);
  step.position.set(POOL_X-3,-.1-i*.18,POOL_Z-3+i*.3);
  poolGroup.add(step);
}

// ── Chrome pool ladder ─────────────────────────────────────────
{
  const lMat=M(0xdddddd,.2,.85);
  // Two vertical rails
  box(.06,1.0,.06,lMat,POOL_X+4.4,.0,POOL_Z-3.0,poolGroup);
  box(.06,1.0,.06,lMat,POOL_X+4.7,.0,POOL_Z-3.0,poolGroup);
  // Three rungs
  [0.15,.4,.65].forEach(y=>{
    box(.34,.05,.06,lMat,POOL_X+4.55,y,POOL_Z-3.0,poolGroup);
  });
}

// ── Underwater glow lights – pool đã xóa, bỏ qua ──────────────────

// ── Neon edge accent ───────────────────────────────────────────
const poolNeon=neonRect(11.1,9.1,.16,0x3df2e0,.04);
poolNeon.position.x=POOL_X;poolNeon.position.z=POOL_Z;
poolGroup.add(poolNeon);

// ── Planters with ornamental grass ────────────────────────────
[[POOL_X-5.2,POOL_Z-3],[POOL_X-5.2,POOL_Z+3],[POOL_X+5.2,POOL_Z-3],[POOL_X+5.2,POOL_Z+3]].forEach(([x,z])=>{
  const pot=new THREE.Mesh(new THREE.BoxGeometry(1,.55,1),M(0x3a3428,.6,.1));
  pot.position.set(x,.27,z);poolGroup.add(pot);
  for(let i=0;i<7;i++){
    const blade=new THREE.Mesh(new THREE.ConeGeometry(.04,.9+Math.random()*.5,4),M(0x2a8a4a,.7));
    blade.position.set(x+(Math.random()-.5)*.6,.9,z+(Math.random()-.5)*.6);
    blade.rotation.z=(Math.random()-.5)*.4;
    poolGroup.add(blade);
  }
});

// ═══════════════════════════════════════════════════════
//  LOUNGE CHAIRS + SUNBATHER
// ═══════════════════════════════════════════════════════
// Helper: build one lounge chair, returns the group
function loungeChair(parentGroup,x,z,ry){
  const lg=new THREE.Group();
  // Frame (light aluminium)
  const fMat=M(0xc8c0b0,.45,.6);
  // Seat base
  box(.72,.07,2.2,M(0xe8dfc8,.65),0,.32,0,lg);
  // Seat cushion (slightly raised, softer tone)
  box(.62,.08,2.0,M(0xfaf5e8,.6),0,.4,0,lg);
  // Head-rest back (reclined ~20°)
  const back=new THREE.Group();
  box(.62,.07,1.0,M(0xfaf5e8,.6),0,0,0,back);
  back.position.set(0,.46,-1.0);
  back.rotation.x=-0.35; // slight recline
  lg.add(back);
  // Four legs
  [[-0.3,.32,-0.85],[0.3,.32,-0.85],[-0.3,.32,0.85],[0.3,.32,0.85]].forEach(([lx,ly,lz])=>{
    box(.06,.32,.06,fMat,lx,ly*.5,lz,lg);
  });
  // Side table (small)
  box(.5,.04,.5,M(0xddd5c0,.5),0,.36,1.4,lg);
  box(.04,.36,.04,fMat,.22,.18,1.4,lg);
  box(.04,.36,.04,fMat,-.22,.18,1.4,lg);

  lg.position.set(x,0,z);
  lg.rotation.y=ry;
  parentGroup.add(lg);
  return lg;
}

// Two chairs – moved to FRONT edge of pool (POOL_Z - side), facing outward
const chairRy = Math.PI/2 + 0.1; // face outward from front pool edge
loungeChair(poolGroup, POOL_X-1.6, POOL_Z-5.2, chairRy);     // empty chair (right)
loungeChair(poolGroup, POOL_X+1.6, POOL_Z-5.2, chairRy);     // sunbather's chair (left)

// ── Sunbather – smooth cylinder/sphere body (no sharp boxes) ────
{
  const BX=POOL_X+1.6, BY=0.44, BZ=POOL_Z-5.2;
  const RY=chairRy;
  const pg=new THREE.Group();

  // Materials
  const skin =new THREE.MeshStandardMaterial({color:0xd4956a,roughness:.75,metalness:0});
  const hair =new THREE.MeshStandardMaterial({color:0x1a0803,roughness:.9});
  const bikR =new THREE.MeshStandardMaterial({color:0xe8334a,roughness:.45,metalness:.15});
  const nailM=new THREE.MeshStandardMaterial({color:0xcc1133,roughness:.3,metalness:.1});
  const glassMat=new THREE.MeshStandardMaterial({color:0x111111,metalness:.7,roughness:.15});
  const lensMat=new THREE.MeshStandardMaterial({color:0x224422,metalness:.3,roughness:.1,transparent:true,opacity:.8});

  // TORSO: tapered cylinder (wider at chest, narrower at waist)
  const torsoMesh=new THREE.Mesh(new THREE.CylinderGeometry(.155,.19,.82,20),skin);
  torsoMesh.rotation.x=Math.PI/2;torsoMesh.position.set(0,.09,0);pg.add(torsoMesh);
  // Shoulder bulges
  [-0.21,0.21].forEach(ox=>{
    const sh=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),skin);
    sh.scale.set(.9,.6,1);sh.position.set(ox,.09,-.28);pg.add(sh);
  });

  // Bikini top – rounded cups
  [-0.09,0.09].forEach(ox=>{
    const cup=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),bikR);
    cup.scale.set(1,.65,1.1);cup.position.set(ox,.16,-.22);pg.add(cup);
  });
  const strap=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.38,8),bikR);
  strap.rotation.z=Math.PI/2;strap.position.set(0,.13,-.22);pg.add(strap);

  // HIPS: smooth ellipsoid
  const hipsMesh=new THREE.Mesh(new THREE.SphereGeometry(.2,14,10),skin);
  hipsMesh.scale.set(1.1,.42,1.1);hipsMesh.position.set(0,.08,.32);pg.add(hipsMesh);
  const bBot=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),bikR);
  bBot.scale.set(1.05,.38,1.0);bBot.position.set(0,.1,.32);pg.add(bBot);

  // LEGS: tapered cylinders + sphere joints
  [-0.1,0.1].forEach(ox=>{
    const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.09,.075,.48,12),skin);
    thigh.rotation.x=Math.PI/2;thigh.position.set(ox,.07,.67);pg.add(thigh);
    const knee=new THREE.Mesh(new THREE.SphereGeometry(.078,10,8),skin);
    knee.position.set(ox,.07,.93);pg.add(knee);
    const calf=new THREE.Mesh(new THREE.CylinderGeometry(.072,.052,.44,12),skin);
    calf.rotation.x=Math.PI/2;calf.position.set(ox,.065,1.16);pg.add(calf);
    const ankle=new THREE.Mesh(new THREE.SphereGeometry(.052,8,6),skin);
    ankle.position.set(ox,.055,1.38);pg.add(ankle);
    const foot=new THREE.Mesh(new THREE.SphereGeometry(.075,10,7),skin);
    foot.scale.set(.8,.38,1.5);foot.position.set(ox,.045,1.44);pg.add(foot);
    const tn=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.01,8),nailM);
    tn.rotation.x=Math.PI/2;tn.position.set(ox,.075,1.52);pg.add(tn);
  });

  // ARMS: tapered cylinders with sphere joints
  [-0.26,0.26].forEach((ox,si)=>{
    const side=si===0?-1:1;
    const sball=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),skin);
    sball.position.set(ox,.08,-.28);pg.add(sball);
    const ua=new THREE.Mesh(new THREE.CylinderGeometry(.074,.062,.42,10),skin);
    ua.rotation.x=Math.PI/2;ua.position.set(ox,.08,-.08);pg.add(ua);
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(.062,8,6),skin);
    elbow.position.set(ox+(side*.03),.09,-.47);pg.add(elbow);
    const fa=new THREE.Mesh(new THREE.CylinderGeometry(.058,.047,.42,10),skin);
    fa.rotation.x=Math.PI/2;fa.rotation.z=side*.08;
    fa.position.set(ox+(side*.04),.10,-.68);pg.add(fa);
    const wrist=new THREE.Mesh(new THREE.SphereGeometry(.048,8,6),skin);
    wrist.position.set(ox+(side*.06),.12,-.88);pg.add(wrist);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.072,10,8),skin);
    hand.scale.set(.85,.38,1.1);hand.position.set(ox+(side*.07),.12,-.98);pg.add(hand);
  });

  // NECK
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.063,.073,.16,12),skin);
  neck.position.set(0,.15,-.46);pg.add(neck);

  // HEAD + HAIR
  const headG=new THREE.Group();
  const headMesh=new THREE.Mesh(new THREE.SphereGeometry(.165,16,14),skin);
  headG.add(headMesh);
  // Hair cap (slightly larger sphere)
  const hairCap=new THREE.Mesh(new THREE.SphereGeometry(.185,16,14),hair);
  hairCap.position.set(0,.02,-.02);headG.add(hairCap);
  // Face patch (skin over front of hair cap)
  const facePatch=new THREE.Mesh(new THREE.SphereGeometry(.17,16,14),skin);
  facePatch.scale.set(.96,.92,.58);facePatch.position.set(0,.0,.05);headG.add(facePatch);
  // Long hair strands – tapered cones for a natural flowing look
  const hairStrand1=new THREE.Mesh(new THREE.CylinderGeometry(.06,.01,.58,10),hair);
  hairStrand1.position.set(.17,-.28,-.03);hairStrand1.rotation.z=-.16;headG.add(hairStrand1);
  const hairStrand2=new THREE.Mesh(new THREE.CylinderGeometry(.05,.008,.5,10),hair);
  hairStrand2.position.set(-.13,-.24,-.05);hairStrand2.rotation.z=.12;headG.add(hairStrand2);
  const hairBack=new THREE.Mesh(new THREE.CylinderGeometry(.07,.025,.4,10),hair);
  hairBack.position.set(0,-.18,-.12);hairBack.rotation.x=-.18;headG.add(hairBack);

  // Sunglasses
  const glBar=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.34,8),glassMat);
  glBar.rotation.z=Math.PI/2;glBar.position.set(0,.025,.18);headG.add(glBar);
  [-0.082,0.082].forEach(gx=>{
    const lens=new THREE.Mesh(new THREE.SphereGeometry(.068,10,8),lensMat);
    lens.scale.set(1,.62,.38);lens.position.set(gx,.025,.196);headG.add(lens);
  });
  const bridge=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.065,6),glassMat);
  bridge.rotation.z=Math.PI/2;bridge.position.set(0,.025,.19);headG.add(bridge);
  [-0.165,0.165].forEach(gx=>{
    const tarm=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.14,6),glassMat);
    tarm.rotation.x=Math.PI/2;tarm.rotation.z=gx<0?-.07:.07;
    tarm.position.set(gx,.025,.1);headG.add(tarm);
  });
  // Lips
  const lips=new THREE.Mesh(new THREE.SphereGeometry(.038,8,6),M(0xd44060,.5));
  lips.scale.set(1,.38,.32);lips.position.set(0,-.068,.164);headG.add(lips);

  headG.position.set(0,.19,-.66);
  headG.rotation.y=-.15;headG.rotation.z=.04;
  pg.add(headG);

  // Cocktail on side table
  const drinkMat=new THREE.MeshStandardMaterial({color:0xff3366,transparent:true,opacity:.72,roughness:.04,metalness:.12});
  const drinkGlass=new THREE.Mesh(new THREE.CylinderGeometry(.048,.03,.22,12),drinkMat);
  drinkGlass.position.set(-.28,.62,.62);pg.add(drinkGlass);
  const ice=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),
    new THREE.MeshStandardMaterial({color:0xddf4ff,transparent:true,opacity:.75,roughness:.05}));
  ice.position.set(-.28,.7,.62);pg.add(ice);
  const straw=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.3,6),M(0xffffff,.5));
  straw.position.set(-.26,.74,.6);straw.rotation.z=.18;pg.add(straw);

  pg.position.set(BX,BY,BZ);
  pg.rotation.y=RY;
  poolGroup.add(pg);
}




// ═══════════════════════════════════════════════════════
//  EQUIPMENT: INVERTER + BATTERY
// ═══════════════════════════════════════════════════════
// ── INVERTER – realistic wall-mounted unit (tầng 2 side wall) ──
// ── INVERTER – vẽ lại theo ảnh: hộp bo góc bạc, LCD xanh, 3 chân đế, cáp ──
let invLcdCanvas=null, invLcdCtx=null, invLcdTex=null, invFanMesh=null;
const invG=new THREE.Group();S.add(invG);
{
  // W=1.10  H=1.25  D=0.22  (portrait, bo góc rõ)
  const IW=1.10, IH=1.25, ID=0.22;

  // Materials
  const matSilver = new THREE.MeshStandardMaterial({color:0xb9c2c7,roughness:.30,metalness:.75}); // vỏ bạc (đậm hơn để nổi trên tường sáng)
  const matSilverD= new THREE.MeshStandardMaterial({color:0x828e93,roughness:.35,metalness:.68}); // bạc tối cạnh
  const matDark   = new THREE.MeshStandardMaterial({color:0x151c20,roughness:.5, metalness:.4});  // khung tối
  const matLCD    = new THREE.MeshStandardMaterial({color:0x5a7a8a,emissive:0x2a4a5a,emissiveIntensity:.6,roughness:.12,metalness:.1}); // LCD xanh xám
  const matBtnOut = new THREE.MeshStandardMaterial({color:0x404850,roughness:.4,metalness:.6});   // viền nút
  const matBtnIn  = new THREE.MeshStandardMaterial({color:0x181e22,roughness:.5,metalness:.5});   // nút đen
  const matFoot   = new THREE.MeshStandardMaterial({color:0x1a1e22,roughness:.6,metalness:.5});   // chân đế
  const matCable  = new THREE.MeshStandardMaterial({color:0x111418,roughness:.85});               // dây cáp

  // ── Tấm ốp tường tối màu phía sau – tạo viền tương phản để khối không "chìm" vào tường sáng ──
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(IW+.14,IH+.14,.03),
    new THREE.MeshStandardMaterial({color:0x10151a,roughness:.6,metalness:.3}));
  backPlate.position.set(0,0,-ID/2-.02);
  invG.add(backPlate);
  // Viền sáng mảnh quanh mép tấm ốp (đường chỉ kim loại phân định khối rõ trên tường)
  const trimMat=new THREE.MeshStandardMaterial({color:0xe4eaee,roughness:.25,metalness:.8});
  const trimTop=new THREE.Mesh(new THREE.BoxGeometry(IW+.14,.02,.035),trimMat);
  trimTop.position.set(0,(IH+.14)/2,-ID/2-.005); invG.add(trimTop);
  const trimBot=new THREE.Mesh(new THREE.BoxGeometry(IW+.14,.02,.035),trimMat);
  trimBot.position.set(0,-(IH+.14)/2,-ID/2-.005); invG.add(trimBot);
  const trimL=new THREE.Mesh(new THREE.BoxGeometry(.02,IH+.14,.035),trimMat);
  trimL.position.set(-(IW+.14)/2,0,-ID/2-.005); invG.add(trimL);
  const trimR=new THREE.Mesh(new THREE.BoxGeometry(.02,IH+.14,.035),trimMat);
  trimR.position.set((IW+.14)/2,0,-ID/2-.005); invG.add(trimR);

  // ── Thân chính – hộp bo góc (dùng cylinder ở 4 góc + planes)
  // Three.js r128 chưa có RoundedBoxGeometry sẵn → ghép bằng box + 4 cột trụ góc
  const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(IW,IH,ID),matSilver);
  invG.add(bodyBox);

  // Bo 4 góc bằng cylinder đứng (bán kính nhỏ, chiều cao = IH)
  const CR=0.09; // corner radius
  [[-1,1],[1,1],[1,-1],[-1,-1]].forEach(([sx,sz])=>{
    const col=new THREE.Mesh(new THREE.CylinderGeometry(CR,CR,IH,20),matSilver);
    col.position.set(sx*(IW/2-CR), 0, sz*(ID/2-CR));
    invG.add(col);
    // Lấp góc hộp
    const fill=new THREE.Mesh(new THREE.BoxGeometry(CR*2,IH,CR*2),matSilver);
    fill.position.set(sx*(IW/2-CR),0,sz*(ID/2-CR));
    invG.add(fill);
  });

  // Gradient bạc sẫm ở cạnh bên (hai tấm hẹp overlay)
  [-IW/2+.04,IW/2-.04].forEach(ex=>{
    const edge=new THREE.Mesh(new THREE.BoxGeometry(.08,IH,ID+.01),matSilverD);
    edge.position.set(ex,0,0);
    invG.add(edge);
  });

  // ── Màn hình LCD kiểu oscilloscope (khung tối + canvas vẽ sóng sin AC realtime) ──
  const lcdFrame=new THREE.Mesh(new THREE.BoxGeometry(IW*.80,.26,ID*.18),matDark);
  lcdFrame.position.set(-IW*.04,-IH*.18,ID*.5+.005);
  invG.add(lcdFrame);
  // Mặt LCD – texture canvas động, được vẽ lại mỗi frame trong animate() để chạy sóng sin AC
  invLcdCanvas=document.createElement('canvas');
  invLcdCanvas.width=256; invLcdCanvas.height=80;
  invLcdCtx=invLcdCanvas.getContext('2d');
  invLcdTex=new THREE.CanvasTexture(invLcdCanvas);
  const lcdFace=new THREE.Mesh(
    new THREE.PlaneGeometry(IW*.58,.18),
    new THREE.MeshBasicMaterial({map:invLcdTex,toneMapped:false})
  );
  lcdFace.position.set(-IW*.09,-IH*.18,ID*.5+.013);
  invG.add(lcdFace);

  // ── Lưới thông gió + quạt tản nhiệt quay bên trong (góc trên) ──
  const ventCX=IW*.28, ventCY=IH*.24, ventR=IW*.155;
  // Hốc lõm màu tối phía sau tạo chiều sâu cho quạt
  const ventWell=new THREE.Mesh(new THREE.CylinderGeometry(ventR*1.05,ventR*1.05,.04,28),matDark);
  ventWell.rotation.x=Math.PI/2;
  ventWell.position.set(ventCX,ventCY,ID*.5-.01);
  invG.add(ventWell);
  // Cụm quạt (hub + cánh) – cả nhóm xoay quanh trục Z trong animate()
  invFanMesh=new THREE.Group();
  invFanMesh.position.set(ventCX,ventCY,ID*.5+.006);
  invG.add(invFanMesh);
  const matBlade=new THREE.MeshStandardMaterial({color:0x2f8fe0,emissive:0x1a4d8a,emissiveIntensity:.35,roughness:.35,metalness:.45});
  const matHub  =new THREE.MeshStandardMaterial({color:0x454d53,roughness:.28,metalness:.72});
  const N_BLADES=7;
  for(let b=0;b<N_BLADES;b++){
    const blade=new THREE.Mesh(new THREE.BoxGeometry(ventR*.95,ventR*.30,.012),matBlade);
    const ang=b/N_BLADES*Math.PI*2;
    blade.position.set(Math.cos(ang)*ventR*.40,Math.sin(ang)*ventR*.40,0);
    blade.rotation.z=ang;
    invFanMesh.add(blade);
  }
  const fanHub=new THREE.Mesh(new THREE.CylinderGeometry(ventR*.22,ventR*.22,.05,16),matHub);
  fanHub.rotation.x=Math.PI/2;
  invFanMesh.add(fanHub);
  // Lồng bảo vệ tĩnh – vòng tròn đồng tâm mỏng + nan hướng tâm, để hở khe nhìn thấy cánh quạt quay
  const matGrille=new THREE.MeshStandardMaterial({color:0x181e22,roughness:.5,metalness:.5,side:THREE.DoubleSide});
  for(let ri=1;ri<=3;ri++){
    const ring=new THREE.Mesh(new THREE.RingGeometry(ventR*(ri/3)-.006,ventR*(ri/3),24),matGrille);
    ring.position.set(ventCX,ventCY,ID*.5+.016);
    invG.add(ring);
  }
  for(let s=0;s<6;s++){
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(ventR*2,.010,.006),matGrille);
    spoke.position.set(ventCX,ventCY,ID*.5+.017);
    spoke.rotation.z=s/6*Math.PI*2;
    invG.add(spoke);
  }
  // Viền ngoài vành quạt (bạc, tách khỏi vỏ chính)
  const ventRim=new THREE.Mesh(new THREE.RingGeometry(ventR*1.03,ventR*1.13,28),matSilverD);
  ventRim.position.set(ventCX,ventCY,ID*.5+.008);
  invG.add(ventRim);

  // ── 3 đèn LED trạng thái (xanh lá/xanh dương/hổ phách) – tạo điểm nhấn màu nổi bật từ xa ──
  const ledColors=[0x33ff66,0x55aaff,0xffaa33];
  ledColors.forEach((c,i)=>{
    const led=new THREE.Mesh(new THREE.SphereGeometry(.028,12,12),
      new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:2.2,roughness:.3}));
    led.position.set(-IW*.34+i*.09,IH*.24,ID*.5+.012);
    invG.add(led);
  });
  const ledGlow=new THREE.PointLight(0x66ccff,.5,1.2);
  ledGlow.position.set(-IW*.34+.09,IH*.24,ID*.5+.15);
  invG.add(ledGlow);

  // Nút tròn bên phải màn hình
  const btnOut=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.04,20),matBtnOut);
  btnOut.rotation.x=Math.PI/2; btnOut.position.set(IW*.26,-IH*.18,ID*.5+.01);
  invG.add(btnOut);
  const btnIn=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.03,20),matBtnIn);
  btnIn.rotation.x=Math.PI/2; btnIn.position.set(IW*.26,-IH*.18,ID*.5+.022);
  invG.add(btnIn);

  // ── 3 chân đế dưới ── (trái / giữa / phải)
  [-IW*.28, 0, IW*.28].forEach((cx,ci)=>{
    const legH=ci===1?.12:.10;
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.12,legH,.12),matFoot);
    leg.position.set(cx,-IH/2-legH/2+.005,0);
    invG.add(leg);
    // Chân nhỏ dưới leg
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,legH*.6,10),matFoot);
    foot.position.set(cx,-IH/2-legH-.02,0);
    invG.add(foot);
  });

  // ── Dây cáp giữa đi xuống từ chân giữa ──
  const cbl=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.55,8),matCable);
  cbl.position.set(0,-IH/2-.42,.01);
  invG.add(cbl);
  // Hộp connector nhỏ (vuông) giữa chân và dây
  const conn=new THREE.Mesh(new THREE.BoxGeometry(.10,.10,.10),matFoot);
  conn.position.set(0,-IH/2-.18,.01);
  invG.add(conn);

  // ── Point light xanh nhẹ từ LCD ──
  const lcdLight=new THREE.PointLight(0x5599aa,.8,3.5);
  lcdLight.position.set(0,-IH*.18,ID*.5+.3);
  invG.add(lcdLight);

  // Vị trí: tường bên trái nhà mới (nhà to hơn 50% nên dịch ra x=-16)
  invG.rotation.y = -Math.PI/2;
  invG.position.set(-11.5, 5.0, 1.8);
}

// ── BATTERY – bình trụ trong suốt kiểu bồn nước, mực & màu theo % pin ──
const battG=new THREE.Group();S.add(battG);
let battLiquidMesh=null;   // mesh nước bên trong – update mỗi frame
let battLiquidMat=null;    // material nước – đổi màu theo %
let battGlowLight=null;    // point light – đổi màu theo %
let battBoltMat=null;      // tia sét – đổi màu theo %
let battBoltGlowMat=null;
let battRibMats=null;      // gân dọc quanh thân – màu bạc, ánh sáng nhẹ đổi theo %
let battBubbles=null;      // bong bóng nổi trong nước khi đang sạc
let battGroundGlowMat=null;// vòng sáng đáy bồn tỏa ra sàn – đổi màu theo %
{
  const R   = 0.52;   // bán kính thân
  const H   = 1.65;   // chiều cao thân
  const SEG = 40;
  const FLOOR_Y = -H/2; // đáy trong

  // ── Vật liệu ──
  const matRim = new THREE.MeshStandardMaterial({color:0xd4dce0,roughness:.15,metalness:.92});     // viền bạc sáng
  const matCap = new THREE.MeshStandardMaterial({color:0xb0b8bc,roughness:.2, metalness:.88});      // nắp bạc
  const matGlass = new THREE.MeshPhysicalMaterial({                                                  // vỏ trong suốt
    color:0x88ccdd, roughness:.04, metalness:.05,
    transparent:true, opacity:.18,
    transmission:.82, clearcoat:1.0, clearcoatRoughness:.04,
    side:THREE.DoubleSide
  });
  // Nước bên trong – sẽ gán emissive color runtime
  battLiquidMat = new THREE.MeshStandardMaterial({
    color:0x00ff44, emissive:0x00ff44, emissiveIntensity:1.4,
    roughness:.08, metalness:.0, transparent:true, opacity:.82
  });
  // Tia sét
  battBoltMat = new THREE.MeshStandardMaterial({
    color:0x66ff44, emissive:0x44ff22, emissiveIntensity:5.0, roughness:.04
  });
  battBoltGlowMat = new THREE.MeshBasicMaterial({
    color:0x88ff44, transparent:true, opacity:.30, side:THREE.DoubleSide
  });

  // ── Vỏ ngoài trong suốt ──
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R,R,H,SEG,1,false),matGlass);
  body.renderOrder=2;
  battG.add(body);

  // Đáy trụ (trong suốt nhẹ)
  const botDisc = new THREE.Mesh(new THREE.CircleGeometry(R,SEG),matGlass);
  botDisc.rotation.x=Math.PI/2; botDisc.position.y=-H/2;
  battG.add(botDisc);

  // ── Mực nước (liquid fill) – tạo sẵn, update y-scale mỗi frame ──
  // Bắt đầu ở 80% cho đẹp khi chưa load entity
  battLiquidMesh = new THREE.Mesh(new THREE.CylinderGeometry(R*.97,R*.97,H,SEG),battLiquidMat);
  battLiquidMesh.renderOrder=1;
  // Sẽ clip bằng position + scale thay vì shader clip
  battG.add(battLiquidMesh);

  // ── Mặt trên mực nước (disc ngang) – lung linh hơn ──
  const surfaceMat = new THREE.MeshStandardMaterial({
    color:0x44ff66,emissive:0x22ff44,emissiveIntensity:2.5,
    roughness:.02,transparent:true,opacity:.9
  });
  const liquidSurface = new THREE.Mesh(new THREE.CircleGeometry(R*.96,SEG),surfaceMat);
  liquidSurface.rotation.x=-Math.PI/2;
  // position.y sẽ update cùng với mực nước
  battG.add(liquidSurface);
  battG.userData.liquidSurface = liquidSurface;
  battG.userData.surfaceMat    = surfaceMat;

  // ── Viền bạc trên & dưới ──
  const rimTop = new THREE.Mesh(new THREE.CylinderGeometry(R+.032,R+.032,.055,SEG),matRim);
  rimTop.position.y = H/2+.026; battG.add(rimTop);
  const rimBot = new THREE.Mesh(new THREE.CylinderGeometry(R+.028,R+.028,.048,SEG),matRim);
  rimBot.position.y = -H/2-.023; battG.add(rimBot);

  // Đường gân ngang giữa (kim loại)
  const midBand = new THREE.Mesh(new THREE.CylinderGeometry(R+.022,R+.022,.022,SEG),matRim);
  midBand.position.y = 0; battG.add(midBand);

  // ── 2 thanh viền dọc bên trái/phải thân bồn – gân kim loại như bồn/tank thật ──
  // Màu nền bạc cố định, cộng thêm ánh glow nhẹ đổi theo % pin (update trong animate())
  battRibMats=[];
  const ribAngles=[0, Math.PI]; // 2 bên trái/phải thật sự (song song mặt tường), lệch 90° so với trước
  ribAngles.forEach(ang=>{
    const ribMat=new THREE.MeshStandardMaterial({
      color:0xdbe3e6, emissive:0x000000, emissiveIntensity:0, roughness:.22, metalness:.85
    });
    const rib=new THREE.Mesh(new THREE.BoxGeometry(.06,H-.10,.032),ribMat);
    rib.position.set(Math.cos(ang)*(R+.016), 0, Math.sin(ang)*(R+.016));
    rib.rotation.y=-ang;
    battG.add(rib);
    battRibMats.push(ribMat);
  });

  // ── Nắp trên ──
  const topCapMesh = new THREE.Mesh(new THREE.CylinderGeometry(R+.02,R+.02,.038,SEG),matCap);
  topCapMesh.position.y = H/2+.057; battG.add(topCapMesh);
  // Cực dương
  const termOuter = new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.06,SEG),matRim);
  termOuter.position.y = H/2+.09; battG.add(termOuter);
  const termInner = new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.04,SEG),matCap);
  termInner.position.y = H/2+.115; battG.add(termInner);

  // ── Đường kẻ chia vạch % (5 vạch ngang, bạc mờ) + số % khắc nổi trên mặt kính ──
  for(let t=1;t<=4;t++){
    const vy = FLOOR_Y + (H/5)*t;
    const tick = new THREE.Mesh(new THREE.CylinderGeometry(R+.005,R+.005,.008,SEG),
      new THREE.MeshStandardMaterial({color:0xaabbcc,roughness:.3,metalness:.7,transparent:true,opacity:.55}));
    tick.position.y=vy; battG.add(tick);

    // Số % kiểu khắc/frosted trên mặt kính, ngay cạnh vạch chia
    const pctCv=document.createElement('canvas'); pctCv.width=96; pctCv.height=48;
    const pctCtx=pctCv.getContext('2d');
    pctCtx.font='bold 30px Segoe UI';
    pctCtx.textAlign='left'; pctCtx.textBaseline='middle';
    pctCtx.fillStyle='rgba(255,255,255,0.55)';
    pctCtx.fillText((t*20)+'%',4,24);
    const pctTex=new THREE.CanvasTexture(pctCv);
    const pctPlane=new THREE.Mesh(new THREE.PlaneGeometry(.30,.15),
      new THREE.MeshBasicMaterial({map:pctTex,transparent:true,toneMapped:false}));
    pctPlane.position.set(0,vy,R+.012);
    battG.add(pctPlane);
  }

  // ── TIA SÉT ── (giữa thân, phía trước)
  {
    const s=0.22;
    const boltPts=[
       0.08*s,  0.58*s, 0,
       0.42*s, -0.05*s, 0,
       0.06*s,  0.02*s, 0,
       0.06*s,  0.02*s, 0,
       0.42*s, -0.05*s, 0,
      -0.06*s,  0.02*s, 0,
      -0.06*s,  0.02*s, 0,
       0.42*s, -0.05*s, 0,
      -0.08*s, -0.58*s, 0,
    ];
    const bGeo=new THREE.BufferGeometry();
    bGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(boltPts),3));
    bGeo.computeVertexNormals();
    const bMesh=new THREE.Mesh(bGeo,battBoltMat);
    bMesh.position.set(0,.05,R+.01);
    battG.add(bMesh);

    // Glow hào quang
    const sg=0.30;
    const glowPts=[
       0.10*sg,  0.64*sg, 0,
       0.48*sg, -0.07*sg, 0,
       0.08*sg,  0.03*sg, 0,
       0.08*sg,  0.03*sg, 0,
       0.48*sg, -0.07*sg, 0,
      -0.08*sg,  0.03*sg, 0,
      -0.08*sg,  0.03*sg, 0,
       0.48*sg, -0.07*sg, 0,
      -0.10*sg, -0.64*sg, 0,
    ];
    const gGeo=new THREE.BufferGeometry();
    gGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(glowPts),3));
    gGeo.computeVertexNormals();
    const gMesh=new THREE.Mesh(gGeo,battBoltGlowMat);
    gMesh.position.set(0,.05,R+.008);
    battG.add(gMesh);
  }

  // ── Bong bóng nổi trong nước – chỉ hiện rõ khi đang sạc (update trong animate()) ──
  battBubbles=[];
  const matBubble=new THREE.MeshStandardMaterial({
    color:0xffffff, emissive:0xffffff, emissiveIntensity:.35,
    roughness:.1, metalness:0, transparent:true, opacity:.5
  });
  for(let i=0;i<12;i++){
    const bMesh=new THREE.Mesh(new THREE.SphereGeometry(0.018+Math.random()*.022,10,10),matBubble.clone());
    const ang=Math.random()*Math.PI*2, rad=Math.random()*R*0.72;
    bMesh.position.set(Math.cos(ang)*rad, FLOOR_Y+Math.random()*H*0.6, Math.sin(ang)*rad);
    bMesh.userData={ang,rad,speed:0.006+Math.random()*0.008,wob:Math.random()*10};
    bMesh.visible=false;
    battG.add(bMesh);
    battBubbles.push(bMesh);
  }

  // ── Vòng sáng đáy bồn tỏa ra sàn – texture radial gradient, tint theo % pin ──
  {
    const gcv=document.createElement('canvas'); gcv.width=128; gcv.height=128;
    const gctx=gcv.getContext('2d');
    const grad=gctx.createRadialGradient(64,64,0,64,64,64);
    grad.addColorStop(0,'rgba(255,255,255,0.85)');
    grad.addColorStop(.5,'rgba(255,255,255,0.30)');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    gctx.fillStyle=grad; gctx.fillRect(0,0,128,128);
    const gTex=new THREE.CanvasTexture(gcv);
    battGroundGlowMat=new THREE.MeshBasicMaterial({
      map:gTex, color:0x00ff44, transparent:true, opacity:.7,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false
    });
    const groundGlow=new THREE.Mesh(new THREE.CircleGeometry(R*2.6,32),battGroundGlowMat);
    groundGlow.rotation.x=-Math.PI/2;
    groundGlow.position.set(0,FLOOR_Y-.02,0);
    battG.add(groundGlow);
  }

  // ── Dây cáp xuống dưới ──
  const cab=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.5,8),
    new THREE.MeshStandardMaterial({color:0x222222,roughness:.8}));
  cab.position.set(0,-H/2-.29,0);
  battG.add(cab);

  // ── Point light – đổi màu theo % ──
  battGlowLight = new THREE.PointLight(0x00ff44,1.6,5.0);
  battGlowLight.position.set(0,0,0);
  battG.add(battGlowLight);

  // ── Lưu constants để dùng trong animate ──
  battG.userData.H = H;
  battG.userData.FLOOR_Y = FLOOR_Y;
  battG.userData.R = R;

  // ── Đặt vị trí ──
  // Nhà mới to hơn 50% → dịch battery ra xa hơn theo x
  battG.rotation.y = Math.PI/2;
  battG.position.set(-13.0, 0.88, 1.5); // dịch sát nhà hơn (trước: -16.8)
}

// ═══════════════════════════════════════════════════════
//  XE FERRARI 3D – đỗ cạnh bồn pin (battery)
// ═══════════════════════════════════════════════════════
// File .glb cần được đặt trong /config/www/ của Home Assistant để truy cập
// qua URL /local/<tên file>.glb (mặc định: /local/ferrari.glb). Có thể đổi
// đường dẫn qua config key car_model_url nếu đặt tên/thư mục khác.
// Tự động scale theo chiều dài thực (~4.3m) bất kể đơn vị gốc của model,
// và tự canh đáy xe chạm mặt sân (y=0) nên không cần biết trước bounding box.
{
  const carUrl = (this._cfg && this._cfg.car_model_url) || '/hacsfiles/solar-3d-card/ferrari.glb';
  console.info('[solar-3d-card] Bắt đầu nạp model xe:', carUrl);
  Promise.all([ensureGLTFLoader(), ensureDracoLoader()]).then(()=>{
    if(this._destroyed) return;
    console.info('[solar-3d-card] GLTFLoader + DRACOLoader đã sẵn sàng, đang tải file...');
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const gltfLoader = new THREE.GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.load(carUrl, (gltf)=>{
      if(this._destroyed) return;
      const car = gltf.scene;
      car.traverse(o=>{
        if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; }
      });

      // ── Auto-scale theo chiều dài thực ~4.3m (Ferrari cỡ trung bình) ──
      car.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(car);
      let size = new THREE.Vector3(); box.getSize(size);
      const TARGET_LEN = 5 * 1.5 * 1.6;
      const horizLen = Math.max(size.x, size.z) || 1;
      car.scale.setScalar(TARGET_LEN / horizLen);

      // ── Vị trí: đỗ trước nhà (battG ở x=-16.8, z=-1.0), nhà to hơn nên dịch ra phù hợp ──
      const CAR_X = -19.5, CAR_Z = -1.0;
      car.rotation.y = 0; // xoay lại thêm 180° so với trước (Math.PI → 0)
      car.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(car);
      const center = new THREE.Vector3(); box.getCenter(center);
      car.position.x += (CAR_X - center.x);
      car.position.z += (CAR_Z - center.z);
      car.position.y += (0 - box.min.y); // đáy xe chạm mặt sân

      car.name = 'ferrariCar';
      S.add(car);
      console.info('[solar-3d-card] ✅ Đã thêm xe vào scene tại', car.position, 'scale=', car.scale.x);
    }, undefined, (err)=>{
      console.error('[solar-3d-card] ❌ Không tải được model xe ('+carUrl+'):', err);
    });
  }).catch(err=>{
    console.error('[solar-3d-card] ❌ Không tải được GLTFLoader/DRACOLoader:', err.message);
  });
}

// ═══════════════════════════════════════════════════════
//  THAY NGÔI NHÀ – nạp model cottage mới thay cho villa vẽ tay,
//  giữ nguyên hồ bơi / cổng / cây cọ / tấm pin / inverter / battery / xe
// ═══════════════════════════════════════════════════════
// File .glb cần đặt trong /config/www/ để truy cập qua /local/<tên file>.glb
// (mặc định: /local/cottage.glb). Đổi qua config key house_model_url nếu cần.
// villa cũ chỉ bị ẩn SAU KHI nhà mới load thành công (nếu lỗi, vẫn thấy villa cũ
// thay vì mất nhà hoàn toàn).
{
  const houseUrl = (this._cfg && this._cfg.house_model_url) || '/hacsfiles/solar-3d-card/cottage.glb';
  console.info('[solar-3d-card] Bắt đầu nạp model nhà mới:', houseUrl);

  // Các mesh của model gốc trùng chức năng với những gì scene đã có sẵn
  // (hồ bơi/lối đi/gạch lát/sân gỗ riêng của model) → bỏ qua, không thêm vào scene.
  const HOUSE_SKIP = ['water','pool','walkway','ceramic tile','pool ladder','planks'];

  // ── Phối màu "modern cottage": tường kem ấm, mái nâu sẫm, khung cửa đen
  //    nhám, kính xanh nhạt trong suốt – tông hài hoà với sân gạch be/kem
  //    và mái ngói sẵn có của villa cũ. ──
  const HOUSE_WALL_COLOR = 0xEFE6D3;
  const HOUSE_ROOF_COLOR = 0x3b322c;
  const HOUSE_FRAME_COLOR = 0x24262a;
  const HOUSE_GLASS_COLOR = 0xbfe6ee;

  // "cottage" là 1 mesh gộp chung cả tường + mái → tô màu theo gradient
  // vertex-color dựa trên chiều cao cục bộ (thấp=tường kem, cao=mái nâu sẫm)
  // thay vì 1 màu phẳng, để nhìn có khối tường/mái rõ ràng dù chỉ 1 mesh.
  function _cottageColorize(mesh){
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const minY = geo.boundingBox.min.y, maxY = geo.boundingBox.max.y;
    const range = Math.max(maxY - minY, 1e-6);
    const wallColor = new THREE.Color(HOUSE_WALL_COLOR);
    const roofColor = new THREE.Color(HOUSE_ROOF_COLOR);
    const thresholdT = 0.60, bandT = 0.14; // ngưỡng chuyển màu ~60% chiều cao, dải mềm 14%
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count*3);
    const c = new THREE.Color();
    for(let i=0;i<pos.count;i++){
      const t = (pos.getY(i)-minY)/range;
      const localT = THREE.MathUtils.clamp((t-(thresholdT-bandT/2))/bandT, 0, 1);
      c.copy(wallColor).lerp(roofColor, localT);
      colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
    mesh.material = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.78, metalness:.04});
  }

  ensureGLTFLoader().then(()=>{
    if(this._destroyed) return;
    const gltfLoader = new THREE.GLTFLoader();
    gltfLoader.load(houseUrl, (gltf)=>{
      if(this._destroyed) return;
      const house = gltf.scene;
      const toRemove=[];

      house.traverse(o=>{
        if(!o.isMesh) return;
        const nameLC = (o.name||'').toLowerCase();
        if(HOUSE_SKIP.some(s=>nameLC===s || nameLC.startsWith(s))){ toRemove.push(o); return; }

        o.castShadow=true; o.receiveShadow=true;
        if(nameLC==='cottage'){
          _cottageColorize(o);
        } else if(nameLC==='walls'){
          o.material=new THREE.MeshStandardMaterial({color:HOUSE_WALL_COLOR,roughness:.85,metalness:.03});
        } else if(nameLC.includes('glass')){
          o.material=new THREE.MeshPhysicalMaterial({
            color:HOUSE_GLASS_COLOR,transparent:true,opacity:.35,
            roughness:.05,metalness:.05,transmission:.5,side:THREE.DoubleSide});
        } else if(nameLC.includes('frame')){
          o.material=new THREE.MeshStandardMaterial({color:HOUSE_FRAME_COLOR,roughness:.35,metalness:.35});
        } else {
          o.material=new THREE.MeshStandardMaterial({color:HOUSE_WALL_COLOR,roughness:.8,metalness:.05});
        }
      });
      toRemove.forEach(o=>{ if(o.parent) o.parent.remove(o); });

      // ── Auto-scale: nhà to hơn 70% so với villa cũ (~20m → 36m) ──
      // lần trước 30 (+50%), lần này +20% nữa → 30 * 1.2 = 36
      house.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(house);
      let size = new THREE.Vector3(); box.getSize(size);
      const TARGET_WIDTH = 36; // +70% tổng cộng so với 20m gốc
      const horiz = Math.max(size.x, size.z) || 1;
      house.scale.setScalar(TARGET_WIDTH/horiz);
      house.scale.y *= 1.20; // nâng nhà cao thêm 20%

      // ── Xoay 180° so với lần trước (π/2 + π = 3π/2 = -π/2) ──
      house.rotation.y = -Math.PI/2; // xoay thêm 180° so với Math.PI/2 trước
      house.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(house);
      const center = new THREE.Vector3(); box.getCenter(center);
      house.position.x += (0 - center.x);
      house.position.z += (0 - center.z);
      house.position.y += (0 - box.min.y); // đáy nhà chạm mặt sân

      house.name = 'newCottageHouse';
      S.add(house);

      // villa đã được ẩn từ đầu (villa.visible=false khi khởi tạo)
      // – không cần set lại ở đây

      // ── Dựng lại solar panels: THU GỌN còn 8 tấm (4x2), hạ THẤP sát mái
      // thật, và dựng khung đỡ vài cột nghiêng dốc ra sau (kiểu giá đỡ pin
      // mặt trời thật ngoài đời: cột trước thấp, cột sau cao hơn) ──
      // (Trước đây code chỉ dịch + scale nguyên khối panelGroup vốn có tọa độ
      // cục bộ tính riêng cho mái nhà vẽ tay cũ → tấm bị đẩy vọt lên cao,
      // trôi khỏi mái. Bản trước dùng bounding-box TOÀN NHÀ (hBox2.max.y) để
      // định vị nên vẫn bị cao nếu nhà có khối phụ cao hơn mái chính ở chỗ
      // khác. Giờ dò cao độ mái THẬT bằng raycast xuống đúng mesh nhà tại vị
      // trí đặt dàn pin, nên panel luôn nằm sát mái chính chứ không lơ lửng.)
      house.updateMatrixWorld(true);
      const hBox2 = new THREE.Box3().setFromObject(house);
      const hSize2 = new THREE.Vector3(); hBox2.getSize(hSize2);
      const hCenter2 = new THREE.Vector3(); hBox2.getCenter(hCenter2);

      // ── houseAnchor: nhóm neo để gắn nội thất + đèn hiên vào đúng vị trí
      // nhà GLB. QUAN TRỌNG: KHÔNG được copy house.rotation.y vào đây!
      // house.rotation.y=-90° chỉ là góc hiệu chỉnh HƯỚNG THÔ của file
      // cottage.glb (vì asset gốc quay ngược) để đưa mặt tiền thật của nó
      // về đúng hướng "nam" chuẩn mà toàn bộ scene dùng (lối đi, cổng...).
      // interiorGroup + đèn hiên thì NGƯỢC LẠI đã được vẽ sẵn thẳng theo
      // đúng hướng "nam" chuẩn đó rồi (y hệt quy ước villa cũ, không xoay).
      // Nếu xoay houseAnchor thêm theo house.rotation.y sẽ bị xoay 2 LẦN →
      // nội thất văng lệch ra khỏi khối nhà (bug vừa gặp). Vì vậy chỉ dịch
      // chuyển theo hCenter2 (thực chất ~0,0 vì house đã được recenter về
      // gốc toạ độ ở bước trên), tuyệt đối không rotate.
      const houseAnchor = new THREE.Group();
      houseAnchor.position.set(hCenter2.x, 0, hCenter2.z);
      S.add(houseAnchor);

      // Nội thất (đã dựng sẵn ở interiorGroup phía trên, chưa từng được add
      // vào scene) — gắn vào houseAnchor để hiện đúng vị trí bên trong nhà.
      houseAnchor.add(interiorGroup);

      // [ID-porch-front] Đèn hiên trước (2 cái, hai bên cửa chính), z=-6.15
      makeWallSconce(-10.5, 7, -4.5, 0xffe8a0, 8, houseAnchor);
      makeWallSconce( 2.2, 7, -4.5, 0xffe8a0, 8, houseAnchor);

      // [ID-porch-back] Đèn hiên sau (phía AC units), z=7.1
      makeWallSconce(-10.5, 7, 14.5, 0xffe0a0, 7, houseAnchor);
      makeWallSconce( -6, 7,  14.5, 0xffe0a0, 7, houseAnchor);

      console.info('[solar-3d-card] ✅ Nội thất + đèn hiên đã gắn vào houseAnchor (không xoay), tâm='+
        hCenter2.toArray().map(v=>v.toFixed(1)));

      // Xoá các tấm pin cũ (được vẽ nghiêng theo mái villa cũ, không còn khớp nhà mới)
      while(panelGroup.children.length) panelGroup.remove(panelGroup.children[0]);
      panelGroup.position.set(0,0,0);
      panelGroup.rotation.set(0,0,0);
      panelGroup.scale.set(1,1,1);

      // Dò cao độ mái THẬT tại vị trí đặt dàn pin bằng raycast thẳng đứng
      // xuống mesh nhà (chính xác hơn nhiều so với dùng đỉnh bounding-box
      // toàn nhà, vốn có thể bị lệch cao bởi khối phụ/tường chắn mái ở nơi khác).
      const _roofRay = new THREE.Raycaster();
      function roofY(x,z){
        _roofRay.set(new THREE.Vector3(x, hBox2.max.y+30, z), new THREE.Vector3(0,-1,0));
        const hit = _roofRay.intersectObject(house, true);
        return hit.length ? hit[0].point.y : hBox2.max.y;
      }

      // Dàn pin: 4 hàng x 6 tấm/hàng = 24 tấm.
      const pW=1.85, pD=1.4, gapX=0.14, gapZ=0.18;
      const nCols=8, nRows=5;
      const gridW = nCols*(pW+gapX)-gapX;
      const gridD = nRows*(pD+gapZ)-gapZ;
      const frontZ = hCenter2.z - gridD/2;
      const backZ  = hCenter2.z + gridD/2;
      const roofFrontY = roofY(hCenter2.x, frontZ);
      const roofBackY  = roofY(hCenter2.x, backZ);

      // Khung đỡ: cột trước THẤP (sát mái), cột sau CAO hơn → dàn pin dốc
      // nghiêng ra phía sau nhà (góc nghiêng cố định 14°, giống giá đỡ thật).
      const TILT_DEG = 14;
      const tiltRad = THREE.MathUtils.degToRad(TILT_DEG);
      const legFrontH = 0.18;
      const legBackH  = legFrontH + gridD*Math.tan(tiltRad);

      const legMat = M(0x4a5058,.55,.4);
      // 3 cặp cột (trái/giữa/phải) vì dàn rộng hơn (6 cột tấm) cần thêm đỡ giữa
      const legXs = [hCenter2.x-gridW/2+0.25, hCenter2.x, hCenter2.x+gridW/2-0.25];
      legXs.forEach(lx=>{
        const legF=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,legFrontH,8),legMat);
        legF.position.set(lx, roofFrontY+legFrontH/2, frontZ+0.08);
        legF.castShadow=true; panelGroup.add(legF);
        const legB=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,legBackH,8),legMat);
        legB.position.set(lx, roofBackY+legBackH/2, backZ-0.08);
        legB.castShadow=true; panelGroup.add(legB);
      });
      // Xà ngang nối các cột trước/sau, đỡ khung tấm pin
      const railFront=new THREE.Mesh(new THREE.BoxGeometry(gridW,.06,.08),legMat);
      railFront.position.set(hCenter2.x, roofFrontY+legFrontH, frontZ+0.08);
      panelGroup.add(railFront);
      const railBack=new THREE.Mesh(new THREE.BoxGeometry(gridW,.06,.08),legMat);
      railBack.position.set(hCenter2.x, roofBackY+legBackH, backZ-0.08);
      panelGroup.add(railBack);

      for(let ix=0; ix<nCols; ix++){
        for(let iz=0; iz<nRows; iz++){
          const px = hCenter2.x - gridW/2 + pW/2 + ix*(pW+gapX);
          const pz = frontZ + pD/2 + iz*(pD+gapZ);
          const tRow = (pz-frontZ)/gridD;
          const py = roofFrontY + legFrontH + tRow*(legBackH-legFrontH) + 0.03;
          const fr=new THREE.Mesh(new THREE.BoxGeometry(pW,.05,pD),panelFrame);
          fr.position.set(px, py, pz);
          fr.rotation.x = -tiltRad;
          fr.castShadow=true; panelGroup.add(fr);
          const cell=new THREE.Mesh(new THREE.BoxGeometry(pW-.1,.03,pD-.1),matSolar);
          cell.position.set(px, py+0.03, pz);
          cell.rotation.x = -tiltRad;
          panelGroup.add(cell);
          for(let gx=-1;gx<=1;gx++){
            const gl=new THREE.Mesh(new THREE.BoxGeometry(.02,.01,pD-.12),M(0x16263a,.3,.2));
            gl.position.set(px+gx*(pW/3), py+0.045, pz);
            gl.rotation.x = -tiltRad;
            panelGroup.add(gl);
          }
        }
      }

      console.info('[solar-3d-card] ✅ Nhà mới xoay 180°, scale=', house.scale.x.toFixed(2), 'pos=', house.position);
      console.info('[solar-3d-card] ✅ Solar panels: 24 tấm (6 cột x 4 hàng), nghiêng '+TILT_DEG+'°, chân trước Y='+roofFrontY.toFixed(2)+' chân sau Y='+roofBackY.toFixed(2));

      // ── Cập nhật điểm đích flow sau khi nhà/tấm pin được đặt đúng vị trí ──
      // Trước đây SPLIT/SUN_STEM tính từ hình học mái villa cũ → flow lơ lửng sai chỗ.
      // Giờ dùng tọa độ thực tế của dàn pin cottage để căn chỉnh lại.
      {
        const pCX = hCenter2.x;                                 // trục X tâm dàn pin
        const pCZ = hCenter2.z;                                 // trục Z tâm dàn pin
        const pFrontY = roofFrontY + legFrontH + 0.05;         // mặt pin hàng trước (thấp)
        const pBackY  = roofBackY  + legBackH  + 0.05;         // mặt pin hàng sau  (cao)
        const pCY     = (pFrontY + pBackY) / 2;                // giữa dàn pin theo Y
        const pTopY   = pBackY + 0.35;                         // đỉnh dàn pin (trên cao nhất)

        // --- sunToSolar: tia mặt trời → tâm dàn pin ---
        // SUN_STEM là điểm ngay trên tâm dàn pin → tia mặt trời "đổ thẳng đứng" vào đây
        // SUN_STEM là THREE.Vector3 (const) → dùng .set() để cập nhật in-place
        SUN_STEM.set(pCX, pTopY + 1.8, pCZ);
        flows.sunToSolar.to.set(pCX, pTopY, pCZ);
        flows.sunToSolar._rebuildLine();

        // --- panelFlows: các nhánh tỏa ra từ tâm xuống các vùng tấm pin ---
        // 8 nhánh: 4 vùng × 2 bên (trái/phải)
        const branchTargets = [
          [pCX - gridW*0.30, pFrontY, frontZ + gridD*0.15],   // trái trước
          [pCX + gridW*0.30, pFrontY, frontZ + gridD*0.15],   // phải trước
          [pCX - gridW*0.35, pCY,     pCZ],                   // trái giữa
          [pCX + gridW*0.35, pCY,     pCZ],                   // phải giữa
          [pCX - gridW*0.30, pBackY,  backZ  - gridD*0.15],   // trái sau
          [pCX + gridW*0.30, pBackY,  backZ  - gridD*0.15],   // phải sau
          [pCX,              pFrontY, frontZ + gridD*0.20],   // giữa trước
          [pCX,              pBackY,  backZ  - gridD*0.20],   // giữa sau
        ];
        panelFlows.forEach((f, i) => {
          f.from.set(pCX, pTopY, pCZ);                        // xuất phát từ tâm trên dàn pin
          const pt = branchTargets[i % branchTargets.length];
          f.to.set(pt[0], pt[1], pt[2]);
          f._rebuildLine();
        });

        // --- solarToInv: từ mép trái dàn pin → vòng ngoài mái → xuống inverter ---
        const eSolarX = pCX - gridW * 0.5 - 0.2;             // mép trái dàn pin
        flows.solarToInv.from.set(eSolarX, pCY, pCZ);
        flows.solarToInv.waypoints = [
          new THREE.Vector3(eSolarX - 0.4, pTopY + 0.3, pCZ),  // lên trên mép dàn pin
          new THREE.Vector3(-11.2, pTopY + 0.3, 1.8),           // chạy ngang về phía inverter
          new THREE.Vector3(-11.2, 6.5,          1.8),           // hạ dần xuống chiều cao inverter
        ];
        flows.solarToInv._rebuildLine();

        console.info('[solar-3d-card] ✅ Đã cập nhật flow endpoints: SUN_STEM='+SUN_STEM.toArray().map(v=>v.toFixed(1))
          +', solarEdge=['+eSolarX.toFixed(1)+','+pCY.toFixed(1)+','+pCZ.toFixed(1)+']');
      }
    }, undefined, (err)=>{
      console.error('[solar-3d-card] ❌ Không tải được model nhà mới ('+houseUrl+'):', err);
      // Fallback: hiện lại villa cũ nếu không tải được cottage.glb
      villa.visible = true;
    });
  }).catch(err=>{
    console.error('[solar-3d-card] ❌ Không tải được GLTFLoader:', err.message);
  });
}



// ═══════════════════════════════════════════════════════
//  FLOATING SPRITE LABELS
// ═══════════════════════════════════════════════════════
let labelsGroup=new THREE.Group();S.add(labelsGroup);

// Static label (không update)
function makeLabel(txt,color,x,y,z){
  const cv=document.createElement('canvas');cv.width=300;cv.height=68;
  const ctx=cv.getContext('2d');
  // Nền gradient
  const bg=ctx.createLinearGradient(0,0,0,68);
  bg.addColorStop(0,'rgba(8,14,28,0.90)');bg.addColorStop(1,'rgba(4,8,18,0.85)');
  ctx.fillStyle=bg;
  ctx.beginPath();ctx.roundRect(3,3,294,62,12);ctx.fill();
  // Viền mờ
  ctx.strokeStyle=`rgba(${(color>>16)&255},${(color>>8)&255},${color&255},0.45)`;
  ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(3,3,294,62,12);ctx.stroke();
  ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;
  ctx.font='bold 21px Segoe UI';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(txt,150,36);
  const tex=new THREE.CanvasTexture(cv);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  spr.scale.set(3.4,.82,1);spr.position.set(x,y,z);
  labelsGroup.add(spr);return spr;
}

// Dynamic label – trả về {sprite, update(txt,pct,color)}
function makeDynLabel(x,y,z,w=340,h=80){
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const tex=new THREE.CanvasTexture(cv);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  spr.scale.set(3.8,h/w*3.8,1);spr.position.set(x,y,z);
  labelsGroup.add(spr);
  function update(line1,line2,hexColor,pct){
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,w,h);
    // Màu nền theo % (tối hơn màu chính)
    const r=(hexColor>>16)&255,g=(hexColor>>8)&255,b=hexColor&255;
    const bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,`rgba(${Math.round(r*.18)},${Math.round(g*.18)},${Math.round(b*.18)},0.94)`);
    bg.addColorStop(1,`rgba(${Math.round(r*.08)},${Math.round(g*.08)},${Math.round(b*.08)},0.90)`);
    ctx.fillStyle=bg;
    ctx.beginPath();ctx.roundRect(3,3,w-6,h-6,14);ctx.fill();
    // Viền màu
    ctx.strokeStyle=`rgba(${r},${g},${b},0.60)`;
    ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(3,3,w-6,h-6,14);ctx.stroke();
    // Thanh % nền mờ
    if(pct!=null){
      ctx.fillStyle=`rgba(${r},${g},${b},0.12)`;
      ctx.beginPath();ctx.roundRect(12,h-18,w-24,10,4);ctx.fill();
      // Fill theo %
      const fw=Math.max(0,Math.min(1,pct/100))*(w-24);
      ctx.fillStyle=`rgba(${r},${g},${b},0.75)`;
      ctx.beginPath();ctx.roundRect(12,h-18,fw,10,4);ctx.fill();
    }
    // Dòng 1 – tag
    ctx.fillStyle=`rgba(${r},${g},${b},0.85)`;
    ctx.font='bold 20px Segoe UI';ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillText(line1,16,9);
    // Dòng 2 – giá trị (lớn, trắng)
    ctx.fillStyle='#ffffff';
    ctx.font='bold 28px Segoe UI';ctx.textAlign='right';ctx.textBaseline='top';
    ctx.fillText(line2,w-14,6);
    tex.needsUpdate=true;
  }
  return {sprite:spr,update};
}


// Dynamic labels cho solar, battery, inverter và tải nhà (update mỗi giây)
const solarLabel = makeDynLabel(0,11.6,-3);
const battLabel  = makeDynLabel(-11.5,4.0,1.5);  // theo battG position mới
const invLabel   = makeDynLabel(-12.8,8.1, 1.8);
const loadLabel  = makeDynLabel(0,2.6, roofHalfD+1.9);
solarLabel.update('☀️ SOLAR PANELS','--.-kW',0xffcf5c,null);
battLabel.update('🔋 BATTERY','---%',0x00ff88,80);
invLabel.update( '⚙️ INVERTER','ONLINE',0x55bbff,null);
loadLabel.update('🏠 HOUSE LOAD','--.-kW',0xff6ec7,null);

// ═══════════════════════════════════════════════════════
//  WEATHER FX SYSTEM
// ═══════════════════════════════════════════════════════
let showWeather=true;

// ── Phân loại trạng thái thời tiết từ HA weather entity state ──
function classifyWeather(stateStr){
  if(!stateStr) return 'clear';
  const s=stateStr.toLowerCase();
  if(s.includes('thunder')||s.includes('lightning')) return 'thunder';
  if(s.includes('pouring')||s.includes('rainy')||s.includes('rain')) return 'rain';
  if(s.includes('snow')||s.includes('hail')) return 'snow';
  if(s.includes('fog')||s.includes('mist')||s.includes('haze')) return 'fog';
  if(s.includes('cloudy')||s.includes('overcast')) return 'cloudy';
  if(s.includes('partlycloudy')||s.includes('partly')) return 'partlycloudy';
  if(s.includes('windy')) return 'windy';
  return 'clear';
}

// Trạng thái thời tiết hiện tại (update từ HA entity)
let currentWeather='clear';
let weatherFxT=0; // timer nội bộ cho FX

// ── Cloud Group ──
const cloudGroup=new THREE.Group(); S.add(cloudGroup);
function makeCloud(x,y,z,scale=1){
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,transparent:true,opacity:.85});
  [[0,0,0,2.2,1.1,2.2],[1.6,0.3,0,1.7,.9,1.7],[-1.4,0.2,0.3,1.5,.8,1.4],
   [0.5,0.8,0,1.3,.7,1.3],[-0.5,0.7,.5,1.2,.65,1.1]].forEach(([cx,cy,cz,sw,sh,sd])=>{
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,6,4),mat.clone());
    m.scale.set(sw,sh,sd); m.position.set(cx,cy,cz);
    g.add(m);
  });
  g.position.set(x,y,z); g.scale.setScalar(scale);
  cloudGroup.add(g); return g;
}
// Tạo sẵn 8 đám mây ở các vị trí trải đều quanh scene
const clouds=[
  makeCloud(-18,28,-8,1.6), makeCloud(12,30,-12,1.3), makeCloud(-5,27,10,1.4),
  makeCloud(22,29,-5,1.1),  makeCloud(-28,26,4,1.2),  makeCloud(8,31,18,1.5),
  makeCloud(30,27,8,1.0),   makeCloud(-12,28,20,1.3),
];
// Cloud material refs để đổi màu
const cloudMats=[];
clouds.forEach(g=>g.children.forEach(c=>cloudMats.push(c.material)));

// ── Rain Particles ── (đã giảm mật độ để nhẹ & mưa thưa hơn)
const RAIN_COUNT=_isMobile?300:900;
const rainGeo=new THREE.BufferGeometry();
const rainPos=new Float32Array(RAIN_COUNT*3);
const rainVel=new Float32Array(RAIN_COUNT);   // tốc độ rơi riêng từng hạt
for(let i=0;i<RAIN_COUNT;i++){
  rainPos[i*3]   = (Math.random()-0.5)*80;
  rainPos[i*3+1] = Math.random()*50+5;
  rainPos[i*3+2] = (Math.random()-0.5)*80;
  rainVel[i]=0.55+Math.random()*0.45;
}
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rainMat=new THREE.PointsMaterial({color:0x99c8ff,size:0.14,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
const rainMesh=new THREE.Points(rainGeo,rainMat);
S.add(rainMesh);

// ── Snow Particles ──
const SNOW_COUNT=_isMobile?300:900;
const snowGeo=new THREE.BufferGeometry();
const snowPos=new Float32Array(SNOW_COUNT*3);
const snowVel=new Float32Array(SNOW_COUNT);
const snowWob=new Float32Array(SNOW_COUNT);   // lắc ngang
for(let i=0;i<SNOW_COUNT;i++){
  snowPos[i*3]   = (Math.random()-0.5)*80;
  snowPos[i*3+1] = Math.random()*50+5;
  snowPos[i*3+2] = (Math.random()-0.5)*80;
  snowVel[i]=0.08+Math.random()*0.08;
  snowWob[i]=Math.random()*Math.PI*2;
}
snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snowMat=new THREE.PointsMaterial({color:0xeef5ff,size:0.32,transparent:true,opacity:0,depthWrite:false});
const snowMesh=new THREE.Points(snowGeo,snowMat);
S.add(snowMesh);

// ── Lightning Flash (sét) – overlay màn hình + điểm sáng ──
const lightningLight=new THREE.PointLight(0xaaccff,0,120);
lightningLight.position.set(0,40,0);
S.add(lightningLight);
let lightningTimer=0, lightningFlash=0;

// ── Overlay tối mờ (rain/thunder) dùng một plane rất lớn trước camera ──
// Thực hiện bằng thay đổi ambLight + fog thay vì geometry

// ── Wind lines (windy weather) – vài trail nằm ngang ──
const windGroup=new THREE.Group(); S.add(windGroup);
const WIND_LINES=20;
const windData=[];
for(let i=0;i<WIND_LINES;i++){
  const pts=[new THREE.Vector3(0,0,0),new THREE.Vector3(6+Math.random()*4,0,0)];
  const geo=new THREE.BufferGeometry().setFromPoints(pts);
  const mat2=new THREE.LineBasicMaterial({color:0xaaddff,transparent:true,opacity:0});
  const line=new THREE.Line(geo,mat2);
  windData.push({line, ox:(Math.random()-0.5)*60, oy:Math.random()*20-5, oz:(Math.random()-0.5)*60, speed:0.3+Math.random()*0.4, t:Math.random()});
  windGroup.add(line);
}

// ── Hàm update FX mỗi frame ──
const WEATHER_BASE_FOG=0.004;
const weatherTargets={
  clear:       {fogD:0.004, cloudOp:0.0, cloudColor:0xffffff, ambMul:1.0, sunMul:1.0, rainOp:0,snowOp:0,windOp:0},
  partlycloudy:{fogD:0.005, cloudOp:0.6, cloudColor:0xeeeeee, ambMul:0.9, sunMul:0.85,rainOp:0,snowOp:0,windOp:0},
  cloudy:      {fogD:0.007, cloudOp:0.95,cloudColor:0xbbbbbb, ambMul:0.7, sunMul:0.4, rainOp:0,snowOp:0,windOp:0},
  rain:        {fogD:0.010, cloudOp:1.0, cloudColor:0x888898, ambMul:0.55,sunMul:0.2, rainOp:0.40,snowOp:0,windOp:0},
  thunder:     {fogD:0.013, cloudOp:1.0, cloudColor:0x555566, ambMul:0.4, sunMul:0.05,rainOp:0.55, snowOp:0,windOp:0.15},
  snow:        {fogD:0.009, cloudOp:0.9, cloudColor:0xdde0ee, ambMul:0.75,sunMul:0.5, rainOp:0,snowOp:0.80,windOp:0},
  fog:         {fogD:0.028, cloudOp:0.4, cloudColor:0xcccccc, ambMul:0.65,sunMul:0.3, rainOp:0,snowOp:0,windOp:0},
  windy:       {fogD:0.005, cloudOp:0.55,cloudColor:0xdddddd, ambMul:0.88,sunMul:0.8, rainOp:0,snowOp:0,windOp:0.8},
};
// Lerp targets (smooth transition)
let wxFog=WEATHER_BASE_FOG, wxCloudOp=0, wxAmbMul=1, wxSunMul=1;
let wxRainOp=0, wxSnowOp=0, wxWindOp=0;
const wxCloudColor=new THREE.Color(0xffffff);

function updateWeatherFX(now, elev, dt){
  if(!showWeather){
    // Tắt hết FX, trời clear
    rainMat.opacity=0; snowMat.opacity=0;
    cloudMats.forEach(m=>{m.opacity=0;});
    windData.forEach(d=>{d.line.material.opacity=0;});
    lightningLight.intensity=0;
    return;
  }

  const tgt=weatherTargets[currentWeather]||weatherTargets.clear;
  const spd=0.012; // tốc độ lerp (smooth ~1s)

  // Lerp các giá trị
  wxFog     += (tgt.fogD     - wxFog)     * spd;
  wxCloudOp += (tgt.cloudOp  - wxCloudOp) * spd;
  wxAmbMul  += (tgt.ambMul   - wxAmbMul)  * spd;
  wxSunMul  += (tgt.sunMul   - wxSunMul)  * spd;
  wxRainOp  += (tgt.rainOp   - wxRainOp)  * spd;
  wxSnowOp  += (tgt.snowOp   - wxSnowOp)  * spd;
  wxWindOp  += (tgt.windOp   - wxWindOp)  * spd;
  wxCloudColor.lerp(new THREE.Color(tgt.cloudColor), spd);

  // Apply fog density
  S.fog.density=wxFog;

  // Clouds: opacity + màu
  cloudMats.forEach(m=>{
    m.opacity=wxCloudOp;
    m.color.copy(wxCloudColor);
  });
  // Nhẹ nhàng trôi
  clouds.forEach((c,i)=>{
    c.position.x += 0.003*(i%2===0?1:-1);
    if(c.position.x>40) c.position.x=-40;
    if(c.position.x<-40) c.position.x=40;
  });

  // Rain
  rainMat.opacity=wxRainOp;
  if(wxRainOp>0.05){
    const pos=rainGeo.attributes.position.array;
    const windX = currentWeather==='thunder'?0.08:0.03;
    for(let i=0;i<RAIN_COUNT;i++){
      pos[i*3+1]-=rainVel[i]*(currentWeather==='thunder'?1.4:1.0);
      pos[i*3]  +=windX;
      if(pos[i*3+1]<-ISL_H-1){
        pos[i*3]  =(Math.random()-0.5)*80;
        pos[i*3+1]=50+Math.random()*10;
        pos[i*3+2]=(Math.random()-0.5)*80;
      }
    }
    rainGeo.attributes.position.needsUpdate=true;
  }

  // Snow
  snowMat.opacity=wxSnowOp;
  if(wxSnowOp>0.05){
    const pos=snowGeo.attributes.position.array;
    for(let i=0;i<SNOW_COUNT;i++){
      pos[i*3+1]-=snowVel[i];
      pos[i*3]  +=Math.sin(now*0.5+snowWob[i])*0.025;
      if(pos[i*3+1]<-ISL_H-1){
        pos[i*3]  =(Math.random()-0.5)*80;
        pos[i*3+1]=50+Math.random()*5;
        pos[i*3+2]=(Math.random()-0.5)*80;
      }
    }
    snowGeo.attributes.position.needsUpdate=true;
  }

  // Wind lines
  windData.forEach((d,i)=>{
    d.line.material.opacity=wxWindOp*(0.5+0.5*Math.sin(now*1.2+i));
    d.t=(d.t+d.speed*0.012)%1;
    const fade=Math.sin(d.t*Math.PI);
    d.line.position.set(d.ox+d.t*80-40, d.oy, d.oz);
    d.line.material.opacity=wxWindOp*fade*0.6;
  });

  // Lightning (thunder only)
  lightningTimer+=dt;
  if(currentWeather==='thunder'){
    if(lightningTimer>2.5+Math.random()*4){
      lightningFlash=1.0;
      lightningTimer=0;
    }
    if(lightningFlash>0){
      lightningFlash-=dt*4;
      const flicker=Math.abs(Math.sin(now*30));
      lightningLight.intensity=lightningFlash*flicker*8;
      lightningLight.color.set(Math.random()>0.5?0xaaccff:0xffffff);
    } else {
      lightningLight.intensity=0;
    }
  } else {
    lightningLight.intensity=0;
    lightningFlash=0;
  }

  // Modifier cho ánh sáng mặt trời & ambient (apply nhân vào trước khi sky update)
  // Lưu vào biến toàn cục để animate() dùng
  _wxAmbMul=wxAmbMul;
  _wxSunMul=wxSunMul;
}

// Biến shared với animate() để apply sky modifier
let _wxAmbMul=1.0, _wxSunMul=1.0;

// ═══════════════════════════════════════════════════════
//  ENERGY FLOW PARTICLES
// ═══════════════════════════════════════════════════════
let showFlow=true;
const flowGroup=new THREE.Group();S.add(flowGroup);

class Flow{
  // waypoints (optional): array of [x,y,z] points the flow bends through
  // between `from` and `to`, so it can route around geometry (e.g. outside
  // the roof edge and down the wall) instead of cutting straight through it.
  constructor(from,to,color,n=14,speed=0.0132,waypoints=[]){ // +10% vs original 0.012
    this.from=new THREE.Vector3(...from);
    this.to=new THREE.Vector3(...to);
    this.waypoints=(waypoints||[]).map(p=>new THREE.Vector3(...p));
    this.pts=[];this.active=true;
    this.color=color;
    // Thin glowing line along the path – using a slim tube so it has actual
    // visible thickness (THREE.Line width is unreliable cross-browser).
    // Geometry is rebuilt cheaply each time the endpoints move (sun-tracking
    // flow needs this); a flat 6-sided tube at this radius is inexpensive.
    this.lineMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.35,
      blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false});
    this.line=new THREE.Mesh(new THREE.BufferGeometry(),this.lineMat);
    flowGroup.add(this.line);
    this._rebuildLine();
    // Small bubble particles riding along the line – tiny core + a slightly
    // larger soft halo, both much smaller than before.
    const coreGeo=new THREE.SphereGeometry(.07,7,7);
    const coreMat=new THREE.MeshBasicMaterial({color,transparent:true,depthTest:false});
    const glowGeo=new THREE.SphereGeometry(.14,7,7);
    const glowMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.25,
      blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false});
    for(let i=0;i<n;i++){
      const core=new THREE.Mesh(coreGeo,coreMat.clone());
      const glow=new THREE.Mesh(glowGeo,glowMat.clone());
      core.userData.t=i/n;
      core.userData.speed=speed+Math.random()*.0044; // +10% jitter
      core.userData.glow=glow;
      flowGroup.add(core);flowGroup.add(glow);
      this.pts.push(core);
    }
  }
  _rebuildLine(){
    if(this.waypoints.length===0 && this.from.distanceToSquared(this.to)<0.0001){
      this.line.visible=false;this.curve=null;return;
    }
    this.line.visible=true;
    const allPts=[this.from.clone(),...this.waypoints.map(w=>w.clone()),this.to.clone()];
    this.curve=new THREE.CatmullRomCurve3(allPts);
    const geo=new THREE.TubeGeometry(this.curve,32,.018,6,false);
    this.line.geometry.dispose();
    this.line.geometry=geo;
  }
  update(){
    const on=this.active&&showFlow;
    this.lineMat.opacity=on?.35:0;
    this.pts.forEach(p=>{
      p.userData.t=(p.userData.t+p.userData.speed)%1;
      if(this.curve){
        this.curve.getPointAt(Math.min(p.userData.t,0.999999),p.position);
      }else{
        p.position.copy(this.to);
      }
      p.userData.glow.position.copy(p.position);
      const s=Math.sin(p.userData.t*Math.PI);
      p.material.opacity=on?s*.95+.05:0;
      p.userData.glow.material.opacity=on?(s*.95+.05)*.3:0;
    });
  }
  setActive(v){this.active=v;}
}

// ── Key points on the panel array, derived from the actual panel layout
// (panelCols / panelRowsT / roof-slope constants above) so they always
// line up with where the panels are actually drawn. ──
function _rowPoint(x,t){
  const dist=t*mainSlopeLen;
  const z=-roofHalfD+dist*Math.cos(mainSlopeAngle);
  const y=roofBaseY+dist*Math.sin(mainSlopeAngle)+0.15; // just above the cell surface
  return [x,y,z];
}
// Split point: just above/before the ridge, roughly centered over the array
// (x=0, the gap between the two panel groups). The sun beam dives straight
// down into this point, then fans out downhill into the 4 rows.
const SPLIT=_rowPoint(0,0.95);
// A point further above SPLIT (same x/z) so the last leg of the sun beam's
// path is a clean vertical drop instead of an angled approach.
const SUN_STEM=new THREE.Vector3(SPLIT[0],SPLIT[1]+1.6,SPLIT[2]);

// Left/right representative x for each half of the array (avg of the 3
// columns on that side), and the 4 row heights along the slope (ridge→eave).
const leftX=(panelCols[0]+panelCols[1]+panelCols[2])/3;
const rightX=(panelCols[3]+panelCols[4]+panelCols[5])/3;
const rowPointsLeft=panelRowsT.map(t=>_rowPoint(leftX,t));
const rowPointsRight=panelRowsT.map(t=>_rowPoint(rightX,t));

// Outer edge of the array, on the side closest to the inverter (leftmost
// column, nearest the ridge) — this is where the combined output cable
// leaves the array before running along the roof and down to the inverter.
const edgeCol=panelCols[0]; // -5.4, closest column to the inverter side
const edgeT=panelRowsT[panelRowsT.length-1]; // row nearest the ridge
const edgeDist=edgeT*mainSlopeLen;
const edgeZ=-roofHalfD+edgeDist*Math.cos(mainSlopeAngle);
const edgeY=roofBaseY+edgeDist*Math.sin(mainSlopeAngle)+0.15;
const SOLAR_EDGE=[edgeCol-0.75,edgeY,edgeZ]; // nudge just past the last panel's edge

const INV=[-11.85,5.0,1.8];
const BAT=[-12.5,0.88,1.5];  // sát nhà hơn – khớp với battG.position bên dưới
// Point between the 2 AC outdoor units behind the house — represents where
// the inverter's output cable reaches the household load.
const HOUSE_LOAD=[(-3.2+3.0)/2, 0.9, roofHalfD+0.5];

// Waypoints for the solar → inverter cable: starts at the array's outer
// edge, runs left along the ridge (clear above the roof), dips down just
// outside the roof's left edge/eave, then straight down the outside of the
// left wall before reaching the inverter — never cutting through the house.
const SOLAR_TO_INV_WAYPOINTS=[
  [-11.4,  8.6, edgeZ-0.4],  // continuing left along the ridge, clear of the roof
  [-10.6, 8.1,  0.2],       // dipping down just outside the roof's left eave
  [-10.4,  7.85, 1.2],       // outside the wall face, level with the eave
];

// Waypoints for the inverter → house-load cable: drops down the outside of
// the same wall the inverter is on, runs along the ground on the west side
// of the house, rounds the back-left corner, then reaches the AC units —
// never cutting through the house body.
const INV_TO_HOUSE_WAYPOINTS=[
  [-11.3, 1.0, 1.8],        // straight down the outside of the inverter's wall
  [-11.3, 0.6, 5.6],        // along the ground, west side, heading toward the back
  [-8.0,  0.6, 7.6],        // rounding the back-left corner of the house
];

// Branch lines fanning OUT from the split point down into the 4 rows on
// each side of the array (8 total: 4 rows × left/right) — bubbles travel
// outward from the split toward the panel edges, matching the sun feeding
// the array rather than the array feeding a single point.
// Color palette chosen so every flow is easy to tell apart at a glance:
//   pale sunlight → amber panel branches → orange solar cable →
//   teal battery-charge line → pink house-load line.
const panelFlows=[
  ...rowPointsLeft.map(p=>new Flow(SPLIT,p,0xffcf5c,4,.024)),
  ...rowPointsRight.map(p=>new Flow(SPLIT,p,0xffcf5c,4,.024)),
];

const flows={
  sunToSolar: new Flow(SPLIT,SPLIT,0xfff2a8,18,.022),
  solarToInv: new Flow(SOLAR_EDGE,INV,0xff9d4d,16,.0154,SOLAR_TO_INV_WAYPOINTS),
  invToBat:   new Flow(INV,BAT,0x3df2c0,12,.0132),
  // Chiều XẢ: pin cấp điện ngược lại cho inverter (ban đêm / solar không đủ
  // tải). Cùng đường dây vật lý với invToBat nhưng đảo chiều From/To, và
  // dùng màu khác (đỏ cam) để phân biệt rõ với chiều sạc (teal).
  batToInv:   new Flow(BAT,INV,0xff5544,12,.0132),
  invToHouse: new Flow(INV,HOUSE_LOAD,0xff6ec7,14,.0143,INV_TO_HOUSE_WAYPOINTS),
};
panelFlows.forEach((f,i)=>{ flows['panelBranch'+i]=f; });

// ═══════════════════════════════════════════════════════
//  UTILITY POLE (góc phải dưới lô đất) + GRID FLOW
// ═══════════════════════════════════════════════════════
// Góc trái trước của lô đất = X = ISL_CX - ISL_W/2, Z = ISL_CZ - ISL_D/2
// Đặt cột sát mép lô đất hơn (offset nhỏ) để lại gần nhà hơn trước
const POLE_X = ISL_CX - ISL_W/2 - 1.0;   // sát mép trái lô đất, ngoài ranh đất
const POLE_Z = ISL_CZ - ISL_D/2 - 0.8;   // sát mép trước lô đất, bên đường
const POLE_BASE_Y = -ISL_H;               // bằng mặt đường

{
  const poleMat = new THREE.MeshStandardMaterial({color:0x5a4a3a,roughness:.85,metalness:.08});
  const poleCapMat = new THREE.MeshStandardMaterial({color:0x8a7060,roughness:.7,metalness:.15});
  const insulatorMat = new THREE.MeshStandardMaterial({color:0xcc4422,roughness:.6,metalness:.05});
  const crossArmMat = new THREE.MeshStandardMaterial({color:0x6b5540,roughness:.8,metalness:.1});

  // Thân cột chính (trụ gỗ/bê tông tapered)
  const poleH = 8.5;
  const poleGeo = new THREE.CylinderGeometry(.10,.16,poleH,10);
  const poleMesh = new THREE.Mesh(poleGeo,poleMat);
  poleMesh.position.set(POLE_X, POLE_BASE_Y + poleH/2, POLE_Z);
  poleMesh.castShadow = true;
  S.add(poleMesh);

  // Đế cột (chân vuông nhô lên khỏi đất)
  const baseGeo = new THREE.BoxGeometry(.45,.3,.45);
  const baseMesh = new THREE.Mesh(baseGeo, poleMat);
  baseMesh.position.set(POLE_X, POLE_BASE_Y + .15, POLE_Z);
  S.add(baseMesh);

  // Xà ngang trên cùng (cross-arm)
  const armH = POLE_BASE_Y + poleH - .5;
  const armGeo = new THREE.BoxGeometry(3.2,.12,.14);
  const armMesh = new THREE.Mesh(armGeo, crossArmMat);
  armMesh.position.set(POLE_X, armH, POLE_Z);
  S.add(armMesh);

  // Xà ngang thứ 2 (hơi thấp hơn)
  const arm2Geo = new THREE.BoxGeometry(2.0,.10,.12);
  const arm2Mesh = new THREE.Mesh(arm2Geo, crossArmMat);
  arm2Mesh.position.set(POLE_X, armH - 1.2, POLE_Z);
  S.add(arm2Mesh);

  // Sứ cách điện (insulators) – 3 cái trên xà trên, 2 cái xà dưới
  const insGeo = new THREE.CylinderGeometry(.055,.055,.22,8);
  const insCapGeo = new THREE.CylinderGeometry(.11,.11,.06,8);
  function addInsulator(x,y,z){
    const ins = new THREE.Mesh(insGeo, insulatorMat);
    ins.position.set(x,y+.14,z);
    S.add(ins);
    const cap = new THREE.Mesh(insCapGeo, insulatorMat);
    cap.position.set(x,y+.29,z);
    S.add(cap);
    // Đĩa sứ (disc) – đặc trưng của cách điện cao thế
    [-0.04,0.04].forEach(dy=>{
      const discGeo = new THREE.CylinderGeometry(.09,.09,.03,10);
      const disc = new THREE.Mesh(discGeo, insulatorMat);
      disc.position.set(x,y+.20+dy*3,z);
      S.add(disc);
    });
  }
  [-1.1,0,1.1].forEach(dx=>addInsulator(POLE_X+dx, armH, POLE_Z));
  [-0.7,0.7].forEach(dx=>addInsulator(POLE_X+dx, armH-1.2, POLE_Z));

  // ── [ID-street-lamp] Đèn đường trên cột điện ──
  // Tọa độ gốc (0,0,0) của group = đỉnh cột điện (POLE_X, POLE_BASE_Y+poleH, POLE_Z)
  // 👉 SỬA VỊ TRÍ CẢ CỤM (cánh tay + chụp + bóng + ánh sáng) Ở DÒNG CUỐI PHẦN NÀY
  const streetLampG = new THREE.Group();
  S.add(streetLampG);

  // Cánh tay đèn – offset tính từ đỉnh cột
  const lampArmGeo = new THREE.CylinderGeometry(.03,.04,1.8,6);
  const lampArm = new THREE.Mesh(lampArmGeo, crossArmMat);
  lampArm.rotation.z = Math.PI/2 - 0.3;  // nghiêng nhẹ hướng ra đường
  lampArm.position.set(-.6, -.1, -.5);
  streetLampG.add(lampArm);

  // Chụp đèn
  const lampHeadGeo = new THREE.CylinderGeometry(.18,.12,.22,10);
  const lampHead = new THREE.Mesh(lampHeadGeo,
    new THREE.MeshStandardMaterial({color:0x888888,roughness:.5,metalness:.6}));
  lampHead.position.set(-1.35, .25, -.85);
  streetLampG.add(lampHead);

  // Bóng đèn (emissive)
  const lampBulbGeo = new THREE.CylinderGeometry(.10,.10,.08,10);
  const lampBulb = new THREE.Mesh(lampBulbGeo,
    new THREE.MeshStandardMaterial({color:0xfff8d0,emissive:0xffee88,emissiveIntensity:3.0,roughness:.1}));
  lampBulb.position.set(-1.35, .10, -.85);
  streetLampG.add(lampBulb);

  // Point light từ đèn đường
  const lampLight = new THREE.PointLight(0xffeeaa, 2.5, 12);
  lampLight.position.set(-1.35, .05, -.85);
  streetLampG.add(lampLight);

  // 👉 SỬA VỊ TRÍ Ở ĐÂY (x, y, z) — dịch cả cụm đèn đường
  streetLampG.position.set(POLE_X +1.3, POLE_BASE_Y + poleH, POLE_Z +0.8);

  // Dây điện (3 sợi) – từ đỉnh cột đến mép đảo (nhà)
  const wireY_top = POLE_BASE_Y + poleH - .42;
  const wireEndX = ISL_CX - ISL_W/2 + 2;  // mép trái đảo → tường trái nhà (inverter side)
  const wireEndY = 6.5;  // gắn vào tường nhà tương đối
  const wireEndZ = POLE_Z + 1.5;
  [-1.1,0,1.1].forEach((dx,wi)=>{
    const wirePts = [];
    const wSag = 0.8;  // độ võng dây
    for(let t=0;t<=12;t++){
      const tt = t/12;
      const wx = (POLE_X+dx) + (wireEndX-(POLE_X+dx))*tt;
      const wy = wireY_top + (wireEndY-wireY_top)*tt - Math.sin(tt*Math.PI)*wSag;
      const wz = POLE_Z + (wireEndZ-POLE_Z)*tt;
      wirePts.push(new THREE.Vector3(wx,wy,wz));
    }
    const wireCurve = new THREE.CatmullRomCurve3(wirePts);
    const wireTube = new THREE.Mesh(
      new THREE.TubeGeometry(wireCurve,20,.012,5,false),
      new THREE.MeshStandardMaterial({color:0x222222,roughness:.9,metalness:.3})
    );
    S.add(wireTube);
  });
}

// Điểm nối lưới điện (từ cột điện vào điện kế/inverter hoặc tủ điện nhà)
// Flow từ cột điện → điểm nhập điện tổng của nhà (gần inverter)
const POLE_TOP = [POLE_X, -ISL_H + 8.0, POLE_Z];
const GRID_ENTRY = [-10.85, 7.0, 1.8];  // cùng điểm với inverter INV
const GRID_TO_INV_WP = [
  [POLE_X + 1, -ISL_H + 7.0, POLE_Z + 4],   // đi lên từ đỉnh cột, hướng vào lô đất
  [ISL_CX - ISL_W/2 + 1, 5.5, -10],          // theo mép trái đảo về phía trước nhà
  [-11.0, 5.0, -2.0],                         // xuống dọc tường trái đến inverter
];
flows.gridToInv = new Flow(POLE_TOP, GRID_ENTRY, 0x5cc9ff, 16, .0132, GRID_TO_INV_WP);

// Label động hiển thị số kW lưới (gắn gần cột điện, hơi trên cao)
const gridPoleLabel = makeDynLabel(POLE_X + 2.5, -ISL_H + 5.8, POLE_Z + 1.5, 300, 72);
gridPoleLabel.update('⚡ LƯỚI ĐIỆN', '--.-kW', 0x5cc9ff, null);

// ═══════════════════════════════════════════════════════
//  SUN POSITION (realtime)
// ═══════════════════════════════════════════════════════
let manualMinutes=-1;
let autoTime=true;
const autoChk=this._q('autoTime');
const slider=this._q('timeSlider');

autoChk.onchange=()=>{
  autoTime=autoChk.checked;
  slider.disabled=autoTime;
};
slider.oninput=()=>{
  if(!autoTime)manualMinutes=parseInt(slider.value);
};
slider.disabled=true;

// Sun path: follows the visible 3D orbit arc, rising East, passing over
// the house, and setting West. Before sunrise / after sunset it dips
// below horizon. Sunrise/sunset are read from a `sun.*` entity (mặc định
// sun.sun) qua next_rising/next_setting -> đúng theo vị trí thực tế thay
// vì cố định 6h/18h (trước đây khiến solar buổi chiều muộn bị ẩn oan khi
// mặt trời lặn thực tế trễ hơn 18h).
let sunriseMin=360, sunsetMin=1080; // fallback 06:00–18:00 nếu chưa có entity
let _sunEntityWarned=false;
const _updateSunTimes=()=>{
  const entId=(this._cfg&&this._cfg.sun_entity)||'sun.sun';
  const ent=this.hass&&this.hass.states[entId];
  if(!ent||!ent.attributes){
    if(!_sunEntityWarned && this.hass){
      _sunEntityWarned=true;
      console.warn('[solar-3d-card] Không tìm thấy entity "'+entId+'" (hoặc chưa có attributes) — dùng tạm 06:00–18:00. Kiểm tra lại config sun_entity.');
    }
    return;
  }
  const nr=ent.attributes.next_rising, ns=ent.attributes.next_setting;
  if(!nr||!ns) return;
  const dRise=new Date(nr), dSet=new Date(ns);
  if(isNaN(dRise)||isNaN(dSet)) return;

  // next_rising/next_setting là timestamp tuyệt đối (UTC) của lần mọc/lặn TIẾP THEO.
  // Ban ngày: next_rising = sáng hôm SAU (> next_setting) → cần lấy giờ hôm nay.
  // Giải pháp: so sánh timestamp; nếu next_rising > next_setting thì mặt trời
  // đang mọc → giờ mọc thực tế = next_rising trừ đi 24h (hôm nay).
  let riseMs=dRise.getTime(), setMs=dSet.getTime();
  if(riseMs>setMs){
    // Mặt trời đang ở trên bầu trời: next_rising là sáng mai → lùi lại 1 ngày
    riseMs-=24*60*60*1000;
  }
  // Chuyển timestamp → phút trong ngày theo giờ LOCAL
  const toLocalMin=ms=>{const d=new Date(ms);return d.getHours()*60+d.getMinutes();};
  const newRise=toLocalMin(riseMs);
  const newSet =toLocalMin(setMs);
  // Kiểm tra hợp lệ: ban ngày phải 1h–23h
  const dayLen=newSet-newRise;
  if(Number.isFinite(newRise)&&Number.isFinite(newSet)&&dayLen>60&&dayLen<23*60){
    sunriseMin=newRise; sunsetMin=newSet;
    // Cập nhật lại tick 3D arc theo giờ thực tế
    _rebuildTickGroup();
  } else if(!_sunEntityWarned){
    _sunEntityWarned=true;
    console.warn('[solar-3d-card] Giá trị next_rising/next_setting của "'+entId+'" bất thường (rise='+nr+', set='+ns+') — giữ nguyên giờ trước đó.');
  }
};
function getSunPosition(totalMinutes){
  const t=totalMinutes/1440;
  let dayT=(totalMinutes-sunriseMin)/(sunsetMin-sunriseMin); // 0=dawn,1=dusk
  if(!Number.isFinite(dayT)) dayT=(totalMinutes/60-6)/12; // an toàn tuyệt đối, không bao giờ NaN
  if(dayT<0||dayT>1){
    // below horizon: extend the arc smoothly under the ground
    const clamped=dayT<0?dayT:dayT-1;
    const p=orbitPoint(dayT<0?0:1);
    return {x:p.x,y:-6+clamped*30,z:p.z,elevation:-0.3};
  }
  const p=orbitPoint(dayT);
  const elevation=Math.sin(dayT*Math.PI);
  return {x:p.x,y:p.y,z:p.z,elevation};
}

// Sun mesh
const sunMesh=new THREE.Mesh(
  new THREE.SphereGeometry(1.0,20,20),
  new THREE.MeshBasicMaterial({color:0xfff6c8})
);
S.add(sunMesh);

// Soft radial-gradient glow texture (much nicer than flat sprite)
function makeGlowTexture(){
  const cv=document.createElement('canvas');cv.width=256;cv.height=256;
  const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(128,128,0,128,128,128);
  g.addColorStop(0,'rgba(255,250,220,0.9)');
  g.addColorStop(0.25,'rgba(255,225,140,0.55)');
  g.addColorStop(0.55,'rgba(255,180,80,0.18)');
  g.addColorStop(1,'rgba(255,150,50,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(cv);
}
const glowTex=makeGlowTexture();
const coronaMat=new THREE.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
const corona=new THREE.Sprite(coronaMat);corona.scale.set(9,9,1);S.add(corona);
const coronaMat2=new THREE.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.6});
const corona2=new THREE.Sprite(coronaMat2);corona2.scale.set(4.5,4.5,1);S.add(corona2);

// ═══════════════════════════════════════════════════════
//  SUN ORBIT ARC (visible 3D path over the house, East→West)
// ═══════════════════════════════════════════════════════
const ORBIT_RADIUS=26;
const ORBIT_CENTER=new THREE.Vector3(-2,0,-2); // arc centered over island (ISL_CX=4), tilted toward back
function orbitPoint(dayT){ // dayT: 0=dawn(east,horizon) .. 1=dusk(west,horizon)
  const ang=dayT*Math.PI; // 0..PI sweeping east to west, over the top
  return new THREE.Vector3(
    ORBIT_CENTER.x + Math.cos(ang)*ORBIT_RADIUS,
    ORBIT_CENTER.y + Math.sin(ang)*ORBIT_RADIUS,
    ORBIT_CENTER.z + Math.sin(ang)*ORBIT_RADIUS*0.9
  );
}
// Draw the arc line (tube-ish using thin segments for glow look)
const arcPts=[];
for(let i=0;i<=64;i++) arcPts.push(orbitPoint(i/64));
const arcCurve=new THREE.CatmullRomCurve3(arcPts);
const arcTubeGeo=new THREE.TubeGeometry(arcCurve,80,0.06,8,false);
const arcTubeMat=new THREE.MeshBasicMaterial({color:0xd4a72c,transparent:true,opacity:.65});
const arcTube=new THREE.Mesh(arcTubeGeo,arcTubeMat);
S.add(arcTube);
// Thin bright core line on top
const arcLineGeo=new THREE.BufferGeometry().setFromPoints(arcPts);
const arcLine=new THREE.Line(arcLineGeo,new THREE.LineBasicMaterial({color:0xffe28a,transparent:true,opacity:.9}));
S.add(arcLine);

// Hour tick marks + labels along the arc – rebuilt dynamically khi giờ mọc/lặn thay đổi
const tickGroup=new THREE.Group();S.add(tickGroup);
function makeTickLabel(txt,pos){
  const cv=document.createElement('canvas');cv.width=64;cv.height=64;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='rgba(10,14,24,.0)';ctx.fillRect(0,0,64,64);
  ctx.fillStyle='#ffe28a';ctx.font='bold 30px Segoe UI';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='#000';ctx.shadowBlur=6;
  ctx.fillText(txt,32,32);
  const tex=new THREE.CanvasTexture(cv);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  spr.scale.set(1.6,1.6,1);spr.position.copy(pos);
  tickGroup.add(spr);
}
// Xây lại tick mỗi khi sunriseMin/sunsetMin cập nhật từ sun.sun
// Hiển thị giờ nguyên từ giờ mọc đến giờ lặn (theo giờ local thực tế)
let _lastTickRise=-1,_lastTickSet=-1;
function _rebuildTickGroup(){
  // Chỉ rebuild khi giá trị thực sự thay đổi
  if(_lastTickRise===sunriseMin&&_lastTickSet===sunsetMin) return;
  _lastTickRise=sunriseMin; _lastTickSet=sunsetMin;
  // Dọn sạch các tick cũ
  while(tickGroup.children.length) tickGroup.remove(tickGroup.children[0]);
  const riseH=sunriseMin/60;        // ví dụ 5.5 = 05:30
  const setH =sunsetMin/60;         // ví dụ 18.25 = 18:15
  const span =setH-riseH;           // số giờ ban ngày
  // Chọn giờ nguyên nằm trong khoảng [riseH, setH]
  const startH=Math.ceil(riseH);
  const endH  =Math.floor(setH);
  // Vẽ tối đa 13 tick (mỗi 1h hoặc thưa hơn nếu ban ngày dài)
  const step=span>14?2:1;
  for(let h=startH;h<=endH;h+=step){
    const dayT=(h*60-sunriseMin)/(sunsetMin-sunriseMin); // 0..1 trên arc
    if(dayT<0||dayT>1) continue;
    const p=orbitPoint(dayT);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.22,10,10),
      new THREE.MeshBasicMaterial({color:0xffcc55}));
    dot.position.copy(p);
    tickGroup.add(dot);
    const dir=p.clone().sub(ORBIT_CENTER).normalize();
    makeTickLabel(String(h),p.clone().addScaledVector(dir,2.2));
  }
}
// Gọi lần đầu với giờ fallback (6-18h) ngay khi khởi tạo
_rebuildTickGroup();

// Horizon color refs for sky
const skyColors={
  night:new THREE.Color(0x050814),
  dawn: new THREE.Color(0x1a0a0a),
  sunrise:new THREE.Color(0xff6633),
  morning:new THREE.Color(0x87ceeb),
  noon:  new THREE.Color(0x4488dd),
  afternoon:new THREE.Color(0x5599ee),
  sunset:new THREE.Color(0xff5522),
  dusk:  new THREE.Color(0x1a0818),
};

// ═══════════════════════════════════════════════════════
//  ARC MINI DISPLAY
// ═══════════════════════════════════════════════════════
const arcCv=this._q('arcCanvas');
const arcCtx=arcCv.getContext('2d');
function drawArc(sunT){
  arcCtx.clearRect(0,0,220,60);
  // Arc background
  arcCtx.strokeStyle='rgba(255,255,255,.1)';arcCtx.lineWidth=2;
  arcCtx.beginPath();arcCtx.arc(110,58,50,Math.PI,0,false);arcCtx.stroke();
  // Filled arc (daylight progress)
  if(sunT>=0&&sunT<=1){
    arcCtx.strokeStyle='rgba(251,191,36,.5)';arcCtx.lineWidth=3;
    arcCtx.beginPath();arcCtx.arc(110,58,50,Math.PI,Math.PI+sunT*Math.PI,false);arcCtx.stroke();
    // Sun dot
    const a=Math.PI+sunT*Math.PI;
    const sx=110+50*Math.cos(a),sy=58+50*Math.sin(a);
    arcCtx.beginPath();arcCtx.arc(sx,sy,5,0,Math.PI*2);
    arcCtx.fillStyle='#fbbf24';arcCtx.fill();
    arcCtx.shadowColor='#fbbf24';arcCtx.shadowBlur=8;arcCtx.fill();arcCtx.shadowBlur=0;
  }
  // Rise/set labels – lấy từ giờ mọc/lặn thực tế (sunriseMin/sunsetMin)
  const _fmt=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(Math.floor(m%60)).padStart(2,'0');
  arcCtx.fillStyle='rgba(255,255,255,.4)';arcCtx.font='10px Segoe UI';
  arcCtx.textAlign='left'; arcCtx.fillText(_fmt(sunriseMin),2,58);
  arcCtx.textAlign='right';arcCtx.fillText(_fmt(sunsetMin),218,58);
  arcCtx.textAlign='center';arcCtx.fillText(_fmt((sunriseMin+sunsetMin)/2),110,10);
}

// ═══════════════════════════════════════════════════════
//  STATE – reads real values from Home Assistant entities
//  configured via card YAML (this._cfg), falls back to a
//  light simulation for any entity that isn't mapped so the
//  card still looks alive before the user finishes config.
// ═══════════════════════════════════════════════════════
let state={solar:0,batt:80,load:1.8,kwh:0,charging:false};

// Reads a numeric entity state from hass; returns null if missing/unavailable
const _num=(entityId)=>{
  if(!entityId||!this.hass) return null;
  const ent=this.hass.states[entityId];
  if(!ent) return null;
  const v=parseFloat(ent.state);
  return Number.isFinite(v)?v:null;
};

// Same as _num but auto-converts W → kW based on the entity's unit_of_measurement
// attribute, so sensors like sensor.lux_solar_output_live (W) can be plugged
// straight into config keys that the card treats as kW, with no manual /1000.
const _numKw=(entityId)=>{
  const v=_num(entityId);
  if(v===null) return null;
  const ent=this.hass.states[entityId];
  const unit=(ent.attributes&&ent.attributes.unit_of_measurement||'').toLowerCase();
  if(unit==='w') return v/1000;
  return v; // already kW, or unitless
};

// Reads a text/attribute entity state safely
const _state=(entityId)=>{
  if(!entityId||!this.hass) return null;
  const ent=this.hass.states[entityId];
  return ent?ent.state:null;
};

const updateState=(elev)=>{
  _updateSunTimes();
  const maxSolar=this._cfg.max_solar_kw||5.5;
  const cfg=this._cfg;

  // ── Solar power (kW) ──
  const solarReal=_numKw(cfg.solar_power_entity);
  state.solar=solarReal!==null?solarReal:(elev>0?elev*maxSolar*(0.85+Math.random()*.1):0);

  // ── Battery level (%) ──
  const battReal=_num(cfg.battery_level_entity);
  if(battReal!==null){
    state.batt=battReal;
  } else if(elev>0.1){
    state.batt=Math.min(100,state.batt+.05);
  } else {
    state.batt=Math.max(10,state.batt-.03);
  }
  // Charging direction: prefer an explicit binary_sensor if given, otherwise
  // derive it from the sign of a battery flow/power sensor (e.g. Luxpower's
  // sensor.lux_battery_flow_live, where positive = charging, negative = discharging).
  const battFlowReal=_numKw(cfg.battery_flow_entity);
  const battCharging=cfg.battery_charging_entity?
    (this.hass&&this.hass.states[cfg.battery_charging_entity]&&
     this.hass.states[cfg.battery_charging_entity].state==='on') :
    (battFlowReal!==null?battFlowReal>0:(elev>0.1));
  state.charging=battCharging;
  // Xả pin: ưu tiên đọc dấu âm của battery_flow_entity (chính xác theo kW
  // thực tế); nếu không có sensor đó thì suy luận: không sạc + đang có tải
  // + pin còn điện để xả.
  const battDischarging = battFlowReal!==null
    ? battFlowReal<-0.02
    : (!battCharging && (state.load||0)>0.02 && (state.batt||0)>1);
  state.discharging=battDischarging;

  // ── House load (kW) ──
  const loadReal=_numKw(cfg.load_power_entity);
  state.load=loadReal!==null?loadReal:state.load;

  // ── Energy today (kWh) ──
  const kwhReal=_num(cfg.energy_today_entity);
  state.kwh=kwhReal!==null?kwhReal:state.kwh+state.solar*.0003;

  // ── Grid power (kW), e.g. sensor.lux_grid_flow_live (W, +import/-export) ──
  const gridReal=_numKw(cfg.grid_power_entity);

  // ── Outdoor weather (optional, purely informational) ──
  const tempReal=_num(cfg.outdoor_temp_entity);
  const humReal=_num(cfg.outdoor_humidity_entity);
  const uvReal=_num(cfg.uv_entity);
  const weatherState=_state(cfg.weather_entity);


  // Flow activity – driven by real solar/battery state when available
  const solarActive=state.solar>0.05;
  flows.solarToInv.setActive(solarActive);
  flows.invToBat.setActive(solarActive&&battCharging);
  flows.batToInv.setActive(battDischarging);
  flows.invToHouse.setActive((state.load||0)>0.02);
  panelFlows.forEach(f=>f.setActive(solarActive));

  // Grid flow: active when importing from grid (gridReal > 0) or always show as reference
  const gridActive = gridReal!==null ? Math.abs(gridReal)>0.02 : true;
  flows.gridToInv.setActive(gridActive);
  // Update pole label with live kW value
  if(gridReal!==null){
    const gridDir = gridReal>0.02?'↓ Nhập':'↑ Xuất';
    gridPoleLabel.update('⚡ LƯỚI ĐIỆN', Math.abs(gridReal).toFixed(1)+' kW '+gridDir, 0x5cc9ff, null);
  } else {
    gridPoleLabel.update('⚡ LƯỚI ĐIỆN', '--.- kW', 0x5cc9ff, null);
  }

  // Update panels glow
  solarGlow.intensity=state.solar>0?Math.min(1,state.solar/maxSolar)*1.5:0;
  panelGroup.children.forEach(ch=>{
    if(ch.material&&ch.material.emissiveIntensity!==undefined)
      ch.material.emissiveIntensity=Math.min(1,state.solar/maxSolar)*.5;
  });
  matSolar.emissiveIntensity=Math.min(1,state.solar/maxSolar)*.4;

  // Update HUD
  this._q('mv-solar').textContent=state.solar.toFixed(1)+' kW';
  const solarEffPct = maxSolar>0 ? Math.round(Math.min(100,state.solar/maxSolar*100)) : 0;
  this._q('ms-solar').textContent=state.solar>0.05?(solarEffPct+'% hiệu suất'):(elev>0?'Chờ dữ liệu':'Mặt trời chưa mọc');
  this._q('mf-solar').style.width=Math.min(100,Math.round(state.solar/maxSolar*100))+'%';
  this._q('mv-batt').textContent=Math.round(state.batt)+'%';
  this._q('ms-batt').textContent=battCharging?'Đang sạc ↑':'Đang xả ↓';
  this._q('mf-batt').style.width=Math.round(state.batt)+'%';
  const loadEl=this._q('mv-load');
  if(loadEl){
    loadEl.textContent=state.load.toFixed(1)+' kW';
    this._q('mf-load').style.width=Math.min(100,Math.round(state.load/4*100))+'%';
  }
  this._q('mv-today').textContent=state.kwh.toFixed(1)+' kWh';
  this._q('ms-today').textContent='Tiết kiệm ~'+Math.round(state.kwh*3000).toLocaleString('vi')+'₫';
  this._q('solarval').textContent=state.solar.toFixed(1)+' kW';

  // Grid card
  const gridEl=this._q('mv-grid');
  if(gridEl){
    if(gridReal!==null){
      gridEl.textContent=Math.abs(gridReal).toFixed(1)+' kW';
      this._q('ms-grid').textContent=gridReal>0.02?'Nhập lưới ↓':(gridReal<-0.02?'Xuất lưới ↑':'Cân bằng');
      this._q('mf-grid').style.width=Math.min(100,Math.round(Math.abs(gridReal)/3*100))+'%';
    } else {
      gridEl.textContent='—';
      this._q('ms-grid').textContent='Chưa cấu hình';
      this._q('mf-grid').style.width='0%';
    }
  }

  // Weather card + sync 3D weather FX
  const weatherEl=this._q('mv-weather');
  const WEATHER_ICONS={'clear':'☀️','partlycloudy':'⛅','cloudy':'☁️','rain':'🌧️','thunder':'⛈️','snow':'🌨️','fog':'🌫️','windy':'💨'};
  const WEATHER_NAMES={'clear':'Nắng đẹp','partlycloudy':'Ít mây','cloudy':'Nhiều mây','rain':'Mưa','thunder':'Dông bão','snow':'Tuyết','fog':'Sương mù','windy':'Có gió'};
  if(weatherState){
    currentWeather=classifyWeather(weatherState);
    const icon=WEATHER_ICONS[currentWeather]||'🌤️';
    const name=WEATHER_NAMES[currentWeather]||weatherState;
    if(weatherEl){
      weatherEl.textContent=(tempReal!==null?tempReal.toFixed(1)+'°C ':'')+icon;
      weatherEl.style.fontSize='15px';
    }
    const sub=this._q('ms-weather');
    if(sub){
      const humTxt=humReal!==null?Math.round(humReal)+'% ẩm':'--% ẩm';
      const uvTxt=uvReal!==null?'UV '+uvReal.toFixed(1):'UV --';
      sub.textContent=name+' · '+humTxt+' · '+uvTxt;
    }
    // Update nút weather label
    const btnW=this._q('btn-weather');
    if(btnW&&showWeather) btnW.textContent=(icon+' Thời tiết');
  } else {
    if(weatherEl){
      if(tempReal!==null) weatherEl.textContent=tempReal.toFixed(1)+'°C';
      else weatherEl.textContent='--°C';
    }
    const sub=this._q('ms-weather');
    if(sub){
      const humTxt=humReal!==null?Math.round(humReal)+'% ẩm':'--% ẩm';
      const uvTxt=uvReal!==null?'UV '+uvReal.toFixed(1):'UV --';
      sub.textContent=humTxt+' · '+uvTxt;
    }
  }
};

// ═══════════════════════════════════════════════════════
//  TOGGLE CONTROLS
// ═══════════════════════════════════════════════════════
const toggleFlow=btn=>{
  showFlow=!showFlow;btn.classList.toggle('on',showFlow);
};
const toggleShadow=btn=>{
  R.shadowMap.enabled=!R.shadowMap.enabled;btn.classList.toggle('on',R.shadowMap.enabled);
};
const toggleLabels=btn=>{
  labelsGroup.visible=!labelsGroup.visible;btn.classList.toggle('on',labelsGroup.visible);
};
const toggleWeather=btn=>{
  showWeather=!showWeather;btn.classList.toggle('on',showWeather);
  if(!showWeather){_wxAmbMul=1.0;_wxSunMul=1.0;}
};

// Wire control bar buttons/slider (replaces the old inline onclick="" handlers,
// which can't reach into the card's per-instance scope/Shadow DOM)
this._q('btn-flow').addEventListener('click',e=>toggleFlow(e.currentTarget));
this._q('btn-shadow').addEventListener('click',e=>toggleShadow(e.currentTarget));
this._q('btn-labels').addEventListener('click',e=>toggleLabels(e.currentTarget));
this._q('btn-weather').addEventListener('click',e=>toggleWeather(e.currentTarget));
this._q('btn-reset').addEventListener('click',()=>resetCam());
// Restore last known speed (survives tab navigation within same HA session)
this._q('rotSpeed').value=_lastRotSpeed;
this._q('rotSpeedVal').textContent=_lastRotSpeed+'%';
this._q('rotSpeed').addEventListener('input',e=>setRotSpeed(e.target.value));

// ═══════════════════════════════════════════════════════
//  MAIN RENDER LOOP
// ═══════════════════════════════════════════════════════
let simT=0;
// Mobile: giới hạn 30fps để giảm tải GPU (~16ms/frame → ~33ms/frame)
const _targetFPS = _isMobile ? 30 : 60;
const _frameInterval = 1000 / _targetFPS;
let _lastFrameTime = 0;
const animate=()=>{
  if(this._destroyed)return;
  this._rafId=requestAnimationFrame(animate);
  const _now=performance.now();
  if(_isMobile && _now-_lastFrameTime < _frameInterval) return;
  _lastFrameTime=_now;
  const now=Date.now()/1000;

  // Time of day
  let mins;
  if(autoTime){
    const d=new Date();
    mins=d.getHours()*60+d.getMinutes()+d.getSeconds()/60;
    slider.value=Math.round(mins);
  } else {
    mins=manualMinutes;
  }

  // Clock display
  const hh=Math.floor(mins/60)%24,mm=Math.floor(mins%60);
  this._q('clocktxt').textContent=
    String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');

  const sunPos=getSunPosition(mins);
  const dayT=(mins-sunriseMin)/(sunsetMin-sunriseMin);
  drawArc(dayT);

  // Sun phase label – buffer bình minh/hoàng hôn 30' quanh giờ mọc/lặn thực tế
  const midDay=(sunriseMin+sunsetMin)/2;
  const phase=mins<sunriseMin?'🌙 Ban đêm':mins<sunriseMin+30?'🌅 Bình minh':
    mins<midDay?'☀️ Buổi sáng':mins<midDay+60?'🌞 Giữa trưa':
    mins<sunsetMin-30?'☀️ Buổi chiều':mins<sunsetMin?'🌇 Hoàng hôn':'🌙 Ban đêm';
  this._q('sunphaselbl').textContent=phase;

  // Move sun
  sunMesh.position.set(sunPos.x,sunPos.y,sunPos.z);
  corona.position.copy(sunMesh.position);
  corona2.position.copy(sunMesh.position);
  sunMesh.visible=corona.visible=sunPos.elevation>-.1;

  // Sun color by elevation
  const elev=sunPos.elevation;
  // Tính dt (delta time) cho weather FX
  const _nowSec=now; // `now` đã là Date.now()/1000
  const dt=1/60; // approximate

  if(elev>0){
    const sunColor=elev<0.2?
      new THREE.Color(0xff8822):
      elev<0.5?new THREE.Color(0xffcc88):new THREE.Color(0xfff8e8);
    sunLight.color.copy(sunColor);
    sunLight.intensity=Math.max(0,(elev*3.5+.2)*_wxSunMul);
    sunLight.position.copy(sunMesh.position).normalize().multiplyScalar(80);
  } else {
    sunLight.intensity=0.05*_wxSunMul;
  }

  // Weather FX update (rain/snow/cloud/lightning) – trước sky lerp để fog density đã được set
  updateWeatherFX(now, elev, dt);

  // Sky color – realistic day/night cycle (bright blue day, orange sunset, dark night)
  // Thời tiết mây/mưa → kéo màu trời về xám
  const sc=elev>0.4?new THREE.Color(0x4a90d4):
    elev>0.15?new THREE.Color(0x7eb8de):
    elev>0?new THREE.Color(0xffaa66):
    elev>-.05?new THREE.Color(0x442a22):new THREE.Color(0x0a0e1c);
  // Blend về màu xám nếu có mây/mưa
  const cloudGray=new THREE.Color(currentWeather==='thunder'?0x333344:currentWeather==='rain'?0x5a6070:0x8899aa);
  const cloudBlend=Math.max(0,wxCloudOp-0.1);
  const skyTarget=sc.clone().lerp(cloudGray, Math.min(1,cloudBlend)*_wxSunMul<0.5?cloudBlend*0.8:cloudBlend);
  skySphere.material.color.lerp(skyTarget,.04);
  S.fog.color.lerp(skyTarget,.04);
  ambLight.intensity=Math.max(.35,(elev*.8+.4)*_wxAmbMul);

  // ── Interior + Outdoor lights: sáng dần khi trời tối, tắt dần ban ngày ──
  // nightFactor: 0 = ban ngày (elev >= 0.15), 1 = ban đêm sâu (elev <= -0.08)
  // Có hiệu ứng flicker nhẹ khi đèn vừa bật (giống đèn huỳnh quang)
  const _nightRaw = Math.max(0, Math.min(1, (-elev + 0.08) / 0.23));
  // Smooth step để chuyển cảnh mượt hơn
  const _nightF = _nightRaw*_nightRaw*(3-2*_nightRaw);
  // Flicker chỉ khi đang trong vùng chuyển tiếp (0.1 < _nightF < 0.5)
  const _flicker = (_nightF>0.05&&_nightF<0.55) ? (0.85+Math.sin(now*47)*0.08+Math.sin(now*113)*0.05) : 1.0;
  _interiorLights.forEach(({light,shadeMat,mat,dayI,nightI})=>{
    const target = dayI + (nightI-dayI)*_nightF;
    light.intensity = Math.max(0, target * _flicker);
    // Emissive của bóng đèn/chụp đèn cũng sáng theo
    if(shadeMat) shadeMat.emissiveIntensity = Math.max(0.05, _nightF*1.2*_flicker);
    if(mat)      mat.emissiveIntensity      = Math.max(0.10, 0.4+_nightF*1.6*_flicker);
  });

  // ── Outdoor lamp glass materials sáng dần theo đêm ──
  // (bóng đèn hiên, đèn trụ sân, đèn cổng – emissive tăng mượt)
  _outdoorLightMats.forEach(m=>{
    // emissiveIntensity: 0.04 ban ngày (đủ nhìn thấy vật liệu) → 2.4 đêm sâu
    m.emissiveIntensity = 0.04 + _nightF * 2.36 * _flicker;
    // opacity tăng nhẹ ban đêm để bóng đèn đọng sáng rõ hơn
    if(m.transparent) m.opacity = Math.min(1, 0.50 + _nightF * 0.45);
  });

  // Kính cửa sổ hơi phát sáng vàng nhạt từ ánh đèn bên trong ban đêm
  matGlass.emissive.setHex(0xffc87a);
  matDoorGlass.emissive.setHex(0xffc87a);
  matGlass.emissiveIntensity    = _nightF * 0.18;
  matDoorGlass.emissiveIntensity= _nightF * 0.14;

  // Periodic state update
  simT+=1/60;
  if(simT>1){updateState(elev);simT=0;}

  // Gentle pool water ripple animation
  poolWaterTex.offset.y=(now*0.015)%1;
  poolWaterTex.offset.x=Math.sin(now*0.05)*0.02;

  // Flow particle animation – the sun→solar beam tracks the sun's live
  // position so the light visually "flows" down from wherever the sun is.
  // Shaped as a soft arc that straightens into a clean vertical drop just
  // before reaching the panels (via SUN_STEM, directly above SPLIT).
  flows.sunToSolar.from.copy(sunMesh.position);
  {
    const from=flows.sunToSolar.from;
    const arcPt=from.clone().lerp(SUN_STEM,0.4);
    arcPt.y+=Math.max(2.0,from.distanceTo(SUN_STEM)*0.18); // upward bulge for a soft arc
    flows.sunToSolar.waypoints=[arcPt,SUN_STEM.clone()];
  }
  flows.sunToSolar.setActive(elev>0.02);
  flows.sunToSolar._rebuildLine();
  Object.values(flows).forEach(f=>f.update());

  // ── Animate battery: mực nước + màu theo state.batt ──
  if(battLiquidMesh){
    const pct   = Math.max(0,Math.min(100,state.batt)) / 100; // 0..1
    const H     = battG.userData.H     || 1.65;
    const FLOOR = battG.userData.FLOOR_Y || -H/2;

    // Mực nước thực: scale Y của cylinder để chỉ chiếm pct*H từ đáy lên
    const liqH   = Math.max(0.01, pct * H);           // chiều cao cột nước
    battLiquidMesh.scale.y = liqH / H;                // scale so với chiều cao đầy
    battLiquidMesh.position.y = FLOOR + liqH/2;       // đẩy lên từ đáy

    // Mặt nước (disc) – nằm ngay mặt trên cột nước
    const surf = battG.userData.liquidSurface;
    if(surf) surf.position.y = FLOOR + liqH - .005;

    // Màu theo %: đỏ (≤20%) → vàng (50%) → xanh lá (≥80%)
    const battColor = new THREE.Color();
    if(pct<=0.2){
      battColor.setHSL(0.0, 1.0, 0.50);          // đỏ
    } else if(pct<=0.5){
      const t=(pct-0.2)/0.3;
      battColor.setHSL(t*0.12, 1.0, 0.50);       // đỏ → vàng cam
    } else if(pct<=0.8){
      const t=(pct-0.5)/0.3;
      battColor.setHSL(0.12+t*0.21, 1.0, 0.50);  // vàng → xanh lá
    } else {
      battColor.setHSL(0.35, 1.0, 0.48);          // xanh lá đậm
    }
    const pulse = 1.3 + Math.sin(now*1.8)*0.5;
    battLiquidMat.color.copy(battColor);
    battLiquidMat.emissive.copy(battColor);
    battLiquidMat.emissiveIntensity = pulse;
    if(battG.userData.surfaceMat){
      battG.userData.surfaceMat.color.copy(battColor);
      battG.userData.surfaceMat.emissive.copy(battColor);
      battG.userData.surfaceMat.emissiveIntensity = pulse + 0.8;
    }
    // Tia sét cùng màu – chớp mạnh & nhanh hơn khi đang sạc nhanh (solar cao)
    const fastCharge = state.charging && (state.solar||0) > 1.5;
    const boltRate    = fastCharge ? 5.5 : 2.2;
    const boltAmp     = fastCharge ? 2.6 : 1.0;
    const boltBase    = fastCharge ? 6.5 : 4.5;
    if(battBoltMat){
      battBoltMat.color.copy(battColor);
      battBoltMat.emissive.copy(battColor);
      battBoltMat.emissiveIntensity = boltBase + Math.sin(now*boltRate)*boltAmp
        + (fastCharge && Math.sin(now*boltRate*3)>0.92 ? 2.5 : 0); // chớp giật thêm khi sạc nhanh
    }
    if(battBoltGlowMat){
      battBoltGlowMat.color.copy(battColor);
      battBoltGlowMat.opacity = (fastCharge?0.32:0.22) + Math.sin(now*boltRate)*(fastCharge?0.16:0.1);
    }
    // Point light cùng màu
    if(battGlowLight){
      battGlowLight.color.copy(battColor);
      battGlowLight.intensity = 1.4 + Math.sin(now*1.8)*0.4;
    }
    // Gân dọc thân bồn – vẫn giữ nền bạc, chỉ thêm glow nhẹ cùng tông màu %
    if(battRibMats){
      const ribPulse=0.35+Math.sin(now*1.8)*0.15;
      battRibMats.forEach(m=>{ m.emissive.copy(battColor); m.emissiveIntensity=ribPulse; });
    }
    // Vòng sáng đáy bồn – tint theo màu % + nhấp nháy nhẹ theo cùng nhịp
    if(battGroundGlowMat){
      battGroundGlowMat.color.copy(battColor);
      battGroundGlowMat.opacity = 0.55 + Math.sin(now*1.8)*0.15;
    }
    // Bong bóng nổi trong nước – chỉ hiện & chạy khi đang sạc, ẩn khi đang xả/đứng yên
    if(battBubbles){
      const liquidTop = FLOOR + liqH;
      battBubbles.forEach(b=>{
        b.visible = state.charging && pct>0.03;
        if(!b.visible) return;
        b.position.y += b.userData.speed;
        b.position.x = Math.cos(b.userData.ang)*b.userData.rad + Math.sin(now*2+b.userData.wob)*0.015;
        b.position.z = Math.sin(b.userData.ang)*b.userData.rad + Math.cos(now*2+b.userData.wob)*0.015;
        if(b.position.y>liquidTop-.04){
          b.position.y = FLOOR+.02;
        }
      });
    }
  }

  // ── Animate inverter: sóng sin AC chạy trên LCD + quạt tản nhiệt quay ──
  if(invLcdCtx){
    const cw=invLcdCanvas.width, ch=invLcdCanvas.height;
    invLcdCtx.clearRect(0,0,cw,ch);
    const bgGrad=invLcdCtx.createLinearGradient(0,0,0,ch);
    bgGrad.addColorStop(0,'#123244'); bgGrad.addColorStop(1,'#0a1e2a');
    invLcdCtx.fillStyle=bgGrad; invLcdCtx.fillRect(0,0,cw,ch);
    // Lưới mờ kiểu oscilloscope
    invLcdCtx.strokeStyle='rgba(140,200,220,0.14)'; invLcdCtx.lineWidth=1;
    for(let gx=0; gx<cw; gx+=cw/8){ invLcdCtx.beginPath(); invLcdCtx.moveTo(gx,0); invLcdCtx.lineTo(gx,ch); invLcdCtx.stroke(); }
    for(let gy=0; gy<ch; gy+=ch/4){ invLcdCtx.beginPath(); invLcdCtx.moveTo(0,gy); invLcdCtx.lineTo(cw,gy); invLcdCtx.stroke(); }
    // Sóng sin AC – biên độ theo công suất solar hiện tại, chạy theo thời gian thực
    const solarNow=state.solar||0;
    const amp = 0.16 + Math.min(1, solarNow/5)*0.16;   // biên độ theo % công suất
    const freq= 3, phase = now*6;
    invLcdCtx.strokeStyle='#7fe9ff'; invLcdCtx.lineWidth=2.4;
    invLcdCtx.shadowColor='#7fe9ff'; invLcdCtx.shadowBlur=6;
    invLcdCtx.beginPath();
    for(let x=0;x<=cw;x+=2){
      const t=x/cw;
      const y=ch/2 - Math.sin(t*Math.PI*2*freq + phase)*ch*amp;
      x===0?invLcdCtx.moveTo(x,y):invLcdCtx.lineTo(x,y);
    }
    invLcdCtx.stroke();
    invLcdCtx.shadowBlur=0;
    invLcdCtx.fillStyle='#bfe9ff';
    invLcdCtx.font='bold 15px Segoe UI';
    invLcdCtx.textAlign='left'; invLcdCtx.textBaseline='top';
    invLcdCtx.fillText('AC 220V ~ 50Hz',6,4);
    invLcdTex.needsUpdate=true;
  }
  // Quạt tản nhiệt: quay nhanh khi inverter đang tải (có solar), quay chậm (không tải) khi standby
  if(invFanMesh){
    const spin=(state.solar||0)>0.05 ? 0.22 : 0.06;
    invFanMesh.rotation.z += spin;
  }

  // ── Update dynamic labels (mỗi ~1 giây) ──
  if(Math.floor(now)!==Math.floor(now-.016)){
    // Solar: hiện công suất phát trực tiếp (kW live)
    const solarKw=state.solar||0;
    const solarTxt=solarKw>0.05?(solarKw.toFixed(2)+'kW'):'IDLE';
    solarLabel.update('☀️ SOLAR PANELS',solarTxt,0xffcf5c,null);
    const pct=Math.round(Math.max(0,Math.min(100,state.batt)));
    // Màu label battery theo %
    const lc=pct<=20?0xff3322:pct<=50?0xffaa00:pct<=80?0xaaee00:0x00ff88;
    battLabel.update('🔋 BATTERY',pct+'%',lc,pct);
    // Inverter: hiện công suất solar nếu có
    const invTxt=solarKw>0.05?(solarKw.toFixed(2)+'kW'):'STANDBY';
    invLabel.update('⚙️ INVERTER',invTxt,0x55bbff,null);
    // Tải nhà: hiện công suất tiêu thụ hiện tại (2 cục điều hòa phía sau nhà)
    const loadKw=state.load||0;
    const loadTxt=loadKw>0.02?(loadKw.toFixed(2)+'kW'):'IDLE';
    loadLabel.update('🏠 HOUSE LOAD',loadTxt,0xff6ec7,null);
  }

  // ── Animate hồ bơi trước nhà: cuộn UV lớp đáy + lớp sóng + displacement sóng + nhấp nháy glow ──
  _hpTexA.forEach((t,i)=>{
    t.offset.y=(now*0.012+i*0.3)%1;
    t.offset.x=Math.sin(now*0.08+i)*0.018;
    t.needsUpdate=true;
  });
  _hpTexB.forEach((t,i)=>{
    t.offset.y=(now*0.028+i*0.5)%1;        // lớp sóng chạy nhanh hơn
    t.offset.x=Math.cos(now*0.11+i)*0.025;
    t.needsUpdate=true;
  });
  // Displacement sóng trên lớp 2 (wB) – dịch chuyển từng đỉnh theo sin/cos
  _hpWaveB.forEach((mesh,mi)=>{
    const pos=mesh.geometry.attributes.position;
    for(let vi=0;vi<pos.count;vi++){
      const x=pos.getX(vi), z=pos.getZ(vi);
      const wave=Math.sin(x*1.1+now*2.2+mi)*0.018
               + Math.cos(z*0.9+now*1.7+mi*0.5)*0.012
               + Math.sin((x+z)*0.7+now*3.0)*0.008;
      pos.setY(vi, wave);
    }
    pos.needsUpdate=true;
    mesh.geometry.computeVertexNormals();
  });
  // Nhấp nháy glow ánh sáng dưới nước
  _hpGlows.forEach((gl,i)=>{
    gl.intensity=0.5+Math.sin(now*1.6+i*1.2)*0.15+Math.sin(now*3.1+i)*0.08;
  });

  // Auto rotate slowly when not interacting (speed adjustable via slider)
  if(!mdown&&!mright) camTheta+=camAutoSpeed;
  updateCam();

  R.render(S,CAM);
};
animate();

// Resize when the CARD's own container changes size (dashboard column width,
// sidebar toggle, etc.) – not just on full browser window resize.
const _ro=new ResizeObserver(()=>{
  const s=_size();
  if(s.w<10||s.h<10)return;
  CAM.aspect=s.w/s.h;CAM.updateProjectionMatrix();
  R.setSize(s.w,s.h);
});
_ro.observe(_wrap);
this._resizeObserver=_ro; // kept so disconnectedCallback can clean it up
this._animateRunning=true;

    }

    disconnectedCallback(){
      this._destroyed=true;
      if(this._rafId) cancelAnimationFrame(this._rafId);
      if(this._resizeObserver) this._resizeObserver.disconnect();
    }

    getCardSize(){
      return Math.ceil((this._cfg && this._cfg.height || 520)/50);
    }

    static getConfigForm(){ return null; } // replaced by custom editor below

    static getStubConfig(){
      return {
        villa_name:'03 Cao Lồi',
        car_model_url:'/local/ferrari.glb',
        house_model_url:'/local/cottage.glb',
        solar_power_entity:'',
        battery_level_entity:'',
        battery_charging_entity:'',
        battery_flow_entity:'',
        load_power_entity:'',
        energy_today_entity:'',
        grid_power_entity:'',
        outdoor_temp_entity:'',
        outdoor_humidity_entity:'',
        uv_entity:'',
        weather_entity:'',
        sun_entity:'sun.sun',
        max_solar_kw:5.5,
        height:520
      };
    }
  }

  customElements.define('solar-3d-card', Solar3dCard);

// ═══════════════════════════════════════════════════════
//  VISUAL EDITOR – Solar 3D Card
//  Designed by @doanlong1412
// ═══════════════════════════════════════════════════════
class Solar3dCardEditor extends HTMLElement {
  constructor(){ super(); this._cfg={}; }
  setConfig(cfg){ this._cfg=cfg||{}; if(this._built) this._refresh(); }
  set hass(h){
    this._hass=h;
    if(this._root){
      this._root.querySelectorAll('ha-entity-picker').forEach(p=>{ p.hass=h; });
    }
  }

  connectedCallback(){
    if(!this._built){ this._built=true; this._build(); }
  }

  _fire(cfg){
    this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:cfg},bubbles:true,composed:true}));
  }

  _set(key,val){
    const c=Object.assign({},this._cfg);
    if(val===''||val===null||val===undefined) delete c[key]; else c[key]=val;
    this._cfg=c; this._fire(c);
  }

  _entityPicker(key, domain, label){
    // Mount point — the actual <ha-entity-picker> is created imperatively in _build()/_mountPickers()
    // because it needs the `hass` and `value` set as JS properties, not HTML attributes.
    return `<div class="row">
      <label>${label}</label>
      <div class="entity-picker-mount" data-key="${key}" data-domain="${domain||''}"></div>
    </div>`;
  }

  _mountPickers(root){
    root.querySelectorAll('.entity-picker-mount').forEach(mount=>{
      const key=mount.dataset.key;
      const domain=mount.dataset.domain;
      const picker=document.createElement('ha-entity-picker');
      picker.hass=this._hass;
      picker.value=this._cfg[key]||'';
      picker.dataset.key=key;
      if(domain) picker.includeDomains=[domain];
      picker.style.width='100%';
      picker.addEventListener('value-changed',e=>{
        e.stopPropagation();
        this._set(key, e.detail.value||'');
      });
      mount.replaceWith(picker);
    });
  }

  _textInput(key, label, placeholder=''){
    const val=this._cfg[key]||'';
    return `<div class="row">
      <label>${label}</label>
      <input type="text" data-key="${key}" class="txt-inp" value="${val}" placeholder="${placeholder}">
    </div>`;
  }

  _numInput(key, label, min, max, step){
    const val=this._cfg[key]!==undefined?this._cfg[key]:'';
    return `<div class="row">
      <label>${label}</label>
      <input type="number" data-key="${key}" class="txt-inp num-inp" value="${val}" min="${min}" max="${max}" step="${step}" placeholder="Mặc định">
    </div>`;
  }

  _build(){
    const root=this.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      *{box-sizing:border-box;margin:0;padding:0}
      :host{display:block;font-family:'Segoe UI',sans-serif;font-size:13px;color:var(--primary-text-color)}

      /* ── Author header ── */
      .author-header{
        display:flex;align-items:center;justify-content:space-between;gap:8px;
        padding:10px 16px;
        background:linear-gradient(135deg,rgba(61,242,224,.08),rgba(30,80,160,.10));
        border-bottom:1px solid rgba(61,242,224,.25);margin-bottom:8px;
        border-radius:8px 8px 0 0;
      }
      .author-title{display:flex;flex-direction:column;gap:2px}
      .author-title .line1{font-size:14px;font-weight:700;color:#3df2e0;letter-spacing:.3px}
      .author-title .line2{font-size:11px;color:var(--secondary-text-color)}
      .author-title .line2 strong{color:#3df2e0}
      .coffee-btn{
        display:inline-flex;align-items:center;gap:5px;flex-shrink:0;
        padding:6px 14px;border-radius:20px;text-decoration:none;font-size:11px;font-weight:700;
        background:linear-gradient(135deg,rgba(255,180,0,.18),rgba(255,120,0,.12));
        border:1px solid rgba(255,160,0,.45);color:#ffb830;
        box-shadow:0 2px 8px rgba(255,150,0,.15);
        transition:all .2s;cursor:pointer;
      }
      .coffee-btn:hover{
        background:linear-gradient(135deg,rgba(255,180,0,.32),rgba(255,120,0,.22));
        border-color:rgba(255,160,0,.75);transform:translateY(-1px);
      }

      /* ── Section accordion ── */
      .section{margin-bottom:6px;border:1px solid rgba(61,242,224,.18);border-radius:8px;overflow:hidden}
      .sec-head{
        display:flex;align-items:center;justify-content:space-between;
        padding:9px 14px;cursor:pointer;user-select:none;
        background:rgba(61,242,224,.06);font-weight:600;font-size:12px;
        color:var(--primary-text-color);letter-spacing:.4px;
        transition:background .15s;
      }
      .sec-head:hover{background:rgba(61,242,224,.12)}
      .sec-head .arrow{font-size:10px;color:#3df2e0;transition:transform .2s}
      .sec-head.open .arrow{transform:rotate(90deg)}
      .sec-body{padding:10px 14px;display:none;background:rgba(0,0,0,.04)}
      .sec-body.open{display:block}

      /* ── Row / input ── */
      .row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .row:last-child{margin-bottom:0}
      .row label{flex:0 0 140px;font-size:11px;color:var(--secondary-text-color);line-height:1.3}
      .row .entity-picker-mount,.row ha-entity-picker{flex:1;min-width:0}
      .txt-inp{
        flex:1;padding:5px 9px;border-radius:6px;font-size:12px;
        background:var(--card-background-color,#1e2a38);
        border:1px solid rgba(61,242,224,.25);
        color:var(--primary-text-color,#e8eaf0);
        outline:none;transition:border-color .15s;
      }
      .txt-inp:focus{border-color:#3df2e0}
      .num-inp{max-width:110px;flex:0 0 110px}

      /* ── Tip box ── */
      .tip{
        margin:6px 0 2px;padding:8px 12px;
        background:rgba(61,242,224,.06);border-radius:6px;
        border:1px solid rgba(61,242,224,.15);
        font-size:10.5px;color:var(--secondary-text-color);line-height:1.6;
      }
      code{background:var(--secondary-background-color,rgba(127,127,127,.15));color:var(--primary-text-color);border-radius:3px;padding:1px 5px;font-size:10px}
    </style>

    <!-- ══ AUTHOR HEADER ══ -->
    <div class="author-header">
      <div class="author-title">
        <span class="line1">☀️ Solar 3D Card — Home Assistant</span>
        <span class="line2">Designed by <strong>@doanlong1412</strong> 🇻🇳</span>
      </div>
      <a class="coffee-btn" href="https://www.paypal.com/paypalme/doanlong1412" target="_blank" rel="noopener">☕ Buy me a coffee</a>
    </div>

    <!-- ══ SECTION: Hiển thị ══ -->
    <div class="section" id="sec-display">
      <div class="sec-head open" data-sec="display">🏛️ Hiển thị <span class="arrow">▶</span></div>
      <div class="sec-body open" id="body-display">
        ${this._textInput('villa_name','Tên villa','03 Cao Lồi')}
        ${this._numInput('height','Chiều cao (px)',300,1200,20)}
        ${this._numInput('height_offset','Offset chiều cao (px)',-100,200,5)}
        <div class="tip">Để <code>height</code> trống → card tự full màn hình (Panel view). Dùng <code>height_offset</code> để tinh chỉnh nếu bị lố/hụt.</div>
      </div>
    </div>

    <!-- ══ SECTION: Model 3D ══ -->
    <div class="section" id="sec-model">
      <div class="sec-head" data-sec="model">🚗 Model 3D <span class="arrow">▶</span></div>
      <div class="sec-body" id="body-model">
        ${this._textInput('car_model_url','URL xe (.glb)','/local/ferrari.glb')}
        ${this._textInput('house_model_url','URL nhà (.glb)','/local/cottage.glb')}
        <div class="tip">Đặt file <code>.glb</code> vào <code>/config/www/</code> rồi dùng đường dẫn <code>/local/tên-file.glb</code>.</div>
      </div>
    </div>

    <!-- ══ SECTION: Năng lượng mặt trời ══ -->
    <div class="section" id="sec-solar">
      <div class="sec-head" data-sec="solar">☀️ Năng lượng mặt trời <span class="arrow">▶</span></div>
      <div class="sec-body" id="body-solar">
        ${this._entityPicker('solar_power_entity','sensor','⚡ Công suất solar (kW)')}
        ${this._entityPicker('energy_today_entity','sensor','📊 Sản lượng hôm nay (kWh)')}
        ${this._numInput('max_solar_kw','Công suất tối đa (kW)',1,50,0.5)}
        ${this._entityPicker('sun_entity','sun','🌞 Thực thể mặt trời')}
      </div>
    </div>

    <!-- ══ SECTION: Pin lưu trữ ══ -->
    <div class="section" id="sec-batt">
      <div class="sec-head" data-sec="batt">🔋 Pin lưu trữ <span class="arrow">▶</span></div>
      <div class="sec-body" id="body-batt">
        ${this._entityPicker('battery_level_entity','sensor','🔋 Mức pin (%)')}
        ${this._entityPicker('battery_charging_entity','binary_sensor','⚡ Đang sạc (binary)')}
        ${this._entityPicker('battery_flow_entity','sensor','↕️ Dòng pin (kW)')}
      </div>
    </div>

    <!-- ══ SECTION: Điện tiêu thụ & lưới ══ -->
    <div class="section" id="sec-load">
      <div class="sec-head" data-sec="load">🏠 Tiêu thụ & Lưới điện <span class="arrow">▶</span></div>
      <div class="sec-body" id="body-load">
        ${this._entityPicker('load_power_entity','sensor','🏠 Tải nhà (kW)')}
        ${this._entityPicker('grid_power_entity','sensor','🔌 Lưới điện (kW)')}
      </div>
    </div>

    <!-- ══ SECTION: Thời tiết & môi trường ══ -->
    <div class="section" id="sec-weather">
      <div class="sec-head" data-sec="weather">🌤️ Thời tiết & Môi trường <span class="arrow">▶</span></div>
      <div class="sec-body" id="body-weather">
        ${this._entityPicker('weather_entity','weather','🌤️ Thực thể thời tiết')}
        ${this._entityPicker('outdoor_temp_entity','sensor','🌡️ Nhiệt độ ngoài trời')}
        ${this._entityPicker('outdoor_humidity_entity','sensor','💧 Độ ẩm ngoài trời')}
        ${this._entityPicker('uv_entity','sensor','☀️ Chỉ số UV')}
      </div>
    </div>`;

    this._mountPickers(root);

    // ── Accordion toggle ──
    root.querySelectorAll('.sec-head').forEach(h=>{
      h.addEventListener('click',()=>{
        const sec=h.dataset.sec;
        const body=root.getElementById('body-'+sec);
        const isOpen=body.classList.contains('open');
        body.classList.toggle('open',!isOpen);
        h.classList.toggle('open',!isOpen);
      });
    });

    // ── Text / number inputs (debounced) ──
    root.querySelectorAll('.txt-inp').forEach(inp=>{
      inp.addEventListener('input',e=>{
        clearTimeout(inp._t);
        inp._t=setTimeout(()=>{
          const v=e.target.type==='number'
            ? (e.target.value===''?undefined:Number(e.target.value))
            : e.target.value;
          this._set(e.target.dataset.key, v);
        },300);
      });
    });

    this._root=root;
  }

  _refresh(){
    // Update all inputs when config changes externally (e.g. YAML edit)
    if(!this._root) return;
    this._root.querySelectorAll('[data-key]').forEach(el=>{
      const k=el.dataset.key;
      const v=this._cfg[k]!==undefined?this._cfg[k]:'';
      if(el.tagName==='HA-ENTITY-PICKER'){
        if(el.value!==v) el.value=v;
      } else if(el.value!==String(v)) el.value=v;
    });
  }
}

if(!customElements.get('solar-3d-card-editor')){
  customElements.define('solar-3d-card-editor', Solar3dCardEditor);
}

Solar3dCard.getConfigElement=function(){
  return document.createElement('solar-3d-card-editor');
};

  window.customCards = window.customCards || [];
  window.customCards.push({
    type:'solar-3d-card',
    name:'Solar 3D Card',
    description:'☀️ Mô hình nhà 3D tương tác — Solar · Battery · Grid · Thời tiết theo thời gian thực. Designed by @doanlong1412',
    preview:true
  });
})();
