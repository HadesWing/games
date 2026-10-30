import * as THREE from 'three';
import { ll2v } from '../core/geo.js';

/** 雨滴贴图：一颗竖着的蓝色水滴 */
function makeRainTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 28;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(8, 1);
  g.bezierCurveTo(14, 12, 14, 18, 8, 25);
  g.bezierCurveTo(2, 18, 2, 12, 8, 1);
  g.closePath();
  const grd = g.createLinearGradient(0, 0, 0, 26);
  grd.addColorStop(0, '#bfe6ff');
  grd.addColorStop(1, '#4aa8e8');
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 雪花贴图：六臂小白花 */
function makeSnowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 28;
  const g = c.getContext('2d');
  g.translate(14, 14);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -10);
    g.moveTo(0, -5.5);
    g.lineTo(-3, -8.5);
    g.moveTo(0, -5.5);
    g.lineTo(3, -8.5);
    g.stroke();
    g.rotate(Math.PI / 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 天气互动（Roadmap #1）：点哪里，哪里就"下天气"。
 * 热带/温带（|纬度| < 60°）下雨，寒带下雪 —— 和气候带对得上。
 * 一小撮粒子从空中往地面落，落地渐隐消失。
 */
export function createWeather(globe) {
  const group = new THREE.Group();
  globe.add(group);
  const rainTex = makeRainTexture();
  const snowTex = makeSnowTexture();
  const bursts = [];

  /** 判断这个点该下什么 */
  function kindAt(lat) {
    return Math.abs(lat) >= 60 ? 'snow' : 'rain';
  }

  function spawn(lat, lon, kind) {
    const n = ll2v(lat, lon, 1).normalize();
    let t1 = new THREE.Vector3(0, 1, 0).cross(n);
    if (t1.lengthSq() < 1e-6) t1 = new THREE.Vector3(1, 0, 0).cross(n);
    t1.normalize();
    const t2 = n.clone().cross(t1).normalize();

    const tex = kind === 'snow' ? snowTex : rainTex;
    const drops = [];
    for (let i = 0; i < 11; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
      }));
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.05;
      const base = n.clone()
        .addScaledVector(t1, Math.cos(a) * r)
        .addScaledVector(t2, Math.sin(a) * r).normalize();
      sp.position.copy(base).multiplyScalar(1.045);
      const s = kind === 'snow' ? 0.02 : 0.016;
      sp.scale.set(s, kind === 'snow' ? s : s * 1.7, 1);
      sp.material.rotation = kind === 'snow' ? Math.random() * Math.PI : 0;
      sp.material.opacity = 0;
      group.add(sp);
      drops.push({ sp, base, t: -Math.random() * 0.4, dur: 1.0 + Math.random() * 0.4 });
    }
    bursts.push({ drops });
  }

  function update(dt) {
    for (let bi = bursts.length - 1; bi >= 0; bi--) {
      const b = bursts[bi];
      let alive = false;
      for (const d of b.drops) {
        d.t += dt;
        if (d.t < 0) { alive = true; continue; }
        const p = d.t / d.dur;
        if (p >= 1) { d.sp.visible = false; continue; }
        alive = true;
        d.sp.position.copy(d.base).multiplyScalar(1.045 - p * 0.038);
        d.sp.material.opacity = Math.min(1, p * 5) * (1 - p * p);
      }
      if (!alive) {
        b.drops.forEach((d) => { group.remove(d.sp); d.sp.material.dispose(); });
        bursts.splice(bi, 1);
      }
    }
  }

  return { spawn, update, kindAt };
}
