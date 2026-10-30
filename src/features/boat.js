import * as THREE from 'three';
import { ll2v, pointInLand, stepLatLon, DEG } from '../core/geo.js';
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
 * W/↑ 前进、A/D 转向、S/↓ 后退；撞到陆地会被弹开（真实海岸线碰撞）。
 * 相机贴着船俯视跟随，船后会拖出一串渐隐的尾迹泡泡。
 */
export function createBoat({ globe, camera, controls }) {
  const state = { lat: 8, lon: 145, heading: 0.5, speed: 0, on: false };

  const sprite = new THREE.Sprite(spriteMaterial('boat'));
  sprite.scale.set(0.065, 0.065, 1);
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

  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function setActive(on) {
    state.on = on;
    sprite.visible = on;
    if (!on) wake.forEach((w) => { w.visible = false; });
  }

  function update(dt, elapsed) {
    if (!state.on) return;

    const turn = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
    const thrust = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    state.heading += turn * dt * 1.4;
    state.speed += thrust * dt * 0.09;
    state.speed = Math.max(-0.04, Math.min(0.12, state.speed));
    state.speed *= 1 - dt * 0.5;
    if (Math.abs(state.speed) < 0.0008) state.speed = 0;

    const stride = state.speed * dt;
    const next = stepLatLon(state.lat, state.lon, stride, state.heading);
    const nLat = Math.max(-85, Math.min(85, next.lat));
    const nLon = next.lon;
    if (!pointInLand(nLat, nLon)) {
      state.lat = nLat;
      state.lon = nLon;
    } else {
      state.speed *= -0.25; // 撞岸弹开
    }

    sprite.position.copy(ll2v(state.lat, state.lon, 1.014));
    // billboard 俯视时：帆船图默认船头朝屏幕右，heading=0(正北) 对应逆时针 90°
    sprite.material.rotation = 0.87 - state.heading;

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

    // 相机跟随
    const n = ll2v(state.lat, state.lon, 1).normalize();
    camera.position.copy(n).multiplyScalar(1.62);
    controls.update();
  }

  return { state, setActive, update };
}
