import * as THREE from 'three';
import { ll2v, pointInLand, stepLatLon } from '../core/geo.js';
import { spriteMaterial } from './stickers.js';

const WAKE_COUNT = 5;

/** 小船尾迹用的柔光圆点贴图 */
function makeWakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 14);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 驾船模式：在海上环游世界。
 * 第三人称跟随镜头：镜头挂在船尾后上方，屏幕上方永远是船头 ——
 * 按 ↑ 就是"往前开"，A/D（←→）就是"往左/往右转"，小朋友不会迷路。
 * 撞到陆地会被弹开（真实海岸线碰撞），船后拖出一串渐隐的尾迹泡泡。
 */
export function createBoat({ globe, camera, controls }) {
  const state = { lat: 8, lon: 145, heading: 0.5, speed: 0, on: false };

  const sprite = new THREE.Sprite(spriteMaterial('boat'));
  sprite.scale.set(0.075, 0.075, 1);
  sprite.visible = false;
  globe.add(sprite);

  const wakeTex = makeWakeTexture();
  const wake = Array.from({ length: WAKE_COUNT }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: wakeTex, transparent: true, depthWrite: false,
    }));
    sp.visible = false;
    globe.add(sp);
    return sp;
  });

  // 按键状态：方向键在开船时阻止默认行为（防页面滚动），切走/失焦立刻清空
  const keys = {};
  const ARROWS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (state.on && ARROWS.includes(k)) e.preventDefault();
    keys[k] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function setActive(on) {
    state.on = on;
    sprite.visible = on;
    if (!on) {
      wake.forEach((w) => { w.visible = false; });
      camera.up.set(0, 1, 0); // 还给轨道控制器一个正经的上方向
    }
  }

  /** 船的正交基：n=球面法线，east=东，north=北 */
  function basis() {
    const n = ll2v(state.lat, state.lon, 1).normalize();
    const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const north = n.clone().cross(east).normalize();
    return { n, east, north };
  }

  function update(dt, elapsed) {
    if (!state.on) return;

    const turn = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
    const thrust = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    // 低速时转向也全功率 —— 小朋友不用先加速才能掉头
    state.heading += turn * dt * 2.1;
    state.speed += thrust * dt * 0.18;
    state.speed = Math.max(-0.05, Math.min(0.15, state.speed));
    state.speed *= Math.max(0, 1 - dt * 1.1); // 松手很快停下，可控
    if (Math.abs(state.speed) < 0.0008) state.speed = 0;

    const stride = state.speed * dt;
    const next = stepLatLon(state.lat, state.lon, stride, state.heading);
    const nLat = Math.max(-85, Math.min(85, next.lat));
    const nLon = next.lon;
    if (!pointInLand(nLat, nLon)) {
      state.lat = nLat;
      state.lon = nLon;
    } else {
      state.speed *= -0.3; // 撞岸弹开
    }

    sprite.position.copy(ll2v(state.lat, state.lon, 1.014));
    // 第三人称镜头里船头永远朝屏幕上方（图片朝向差一个固定角，截图校准）
    sprite.material.rotation = Math.PI;

    // 尾迹
    const backDir = state.heading + Math.PI;
    wake.forEach((w, i) => {
      const t = ((elapsed * 0.9 + i * 0.42) % 1 + 1) % 1;
      const dist = 0.012 + t * 0.05;
      const ang = backDir + (i % 2 ? 0.25 : -0.25) * t;
      const p = stepLatLon(state.lat, state.lon, stride * 8 + dist, ang);
      w.position.copy(ll2v(p.lat, p.lon, 1.006));
      const s = 0.018 + t * 0.03;
      w.scale.set(s, s, 1);
      w.material.opacity = (1 - t) * Math.min(1, Math.abs(state.speed) * 22);
      w.visible = Math.abs(state.speed) > 0.01;
    });

    // 船尾第三人称镜头：挂在船后上方，微微看向前方，带平滑跟随
    const { n, east, north } = basis();
    const fwd = north.multiplyScalar(Math.cos(state.heading))
      .addScaledVector(east, Math.sin(state.heading)).normalize();
    const want = n.clone().multiplyScalar(0.9)
      .addScaledVector(fwd, -0.55).setLength(1.42);
    const k = 1 - Math.exp(-dt * 7);
    camera.position.lerp(want, k);
    camera.up.copy(n);
    camera.lookAt(
      n.x * 1.0 + fwd.x * 0.35,
      n.y * 1.0 + fwd.y * 0.35,
      n.z * 1.0 + fwd.z * 0.35,
    );
  }

  return { state, setActive, update };
}
