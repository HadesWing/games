import * as THREE from 'three';
import { ll2v } from '../core/geo.js';

/**
 * 贴纸资源表：自动收集 assets/sprites 下所有图片。
 * 新增一个贴纸只要把 webp/png 丢进目录，无需改代码。
 */
const modules = import.meta.glob('../assets/sprites/*.{webp,png}', {
  eager: true, query: '?url', import: 'default',
});

export const SPRITES = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [
    path.split('/').pop().replace(/\.\w+$/, ''),
    url,
  ]),
);

const texCache = {};

/** 金字塔：Fluent 表情里没有，用 canvas 画一个几何贴纸 */
function makePyramidTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const cx = S * 0.5, baseY = S * 0.84, topY = S * 0.20, halfW = S * 0.34;

  g.beginPath(); g.moveTo(cx - halfW, baseY); g.lineTo(cx, topY); g.lineTo(cx, baseY); g.closePath();
  const gl = g.createLinearGradient(cx - halfW, topY, cx, baseY);
  gl.addColorStop(0, '#f7e3b0'); gl.addColorStop(1, '#e8c987');
  g.fillStyle = gl; g.fill();

  g.beginPath(); g.moveTo(cx + halfW, baseY); g.lineTo(cx, topY); g.lineTo(cx, baseY); g.closePath();
  const gr = g.createLinearGradient(cx, topY, cx + halfW, baseY);
  gr.addColorStop(0, '#d9b877'); gr.addColorStop(1, '#b5904f');
  g.fillStyle = gr; g.fill();

  g.save();
  g.globalAlpha = 0.22; g.strokeStyle = '#8a6a34'; g.lineWidth = 1.6;
  for (let k = 1; k <= 5; k++) {
    const y = topY + (baseY - topY) * (k / 6);
    const w = halfW * (k / 6);
    g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx, y); g.lineTo(cx + w, y); g.stroke();
  }
  g.restore();

  g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx - halfW, baseY); g.lineTo(cx, topY); g.lineTo(cx + halfW, baseY);
  g.closePath(); g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 统一贴纸质感：图片 → 细白描边（贴纸边）+ 右下柔和投影（浮起感）+ 轻微降饱和。
 * 白色主体（熊猫、城堡、富士山）靠投影分辨轮廓。
 */
export function stickerTexture(name) {
  if (texCache[name]) return texCache[name];
  if (name === 'pyramid') {
    texCache[name] = makePyramidTexture();
    return texCache[name];
  }

  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache[name] = tex;

  const img = new Image();
  img.onload = () => {
    const pad = Math.max(6, Math.round(Math.max(img.width, img.height) * 0.05));
    const c = document.createElement('canvas');
    c.width = img.width + pad * 2;
    c.height = img.height + pad * 2;
    const g = c.getContext('2d');
    const base = 'saturate(0.88) brightness(1.04) contrast(1.04)';
    const R = 2.5;
    for (const [dx, dy] of [[R, 0], [-R, 0], [0, R], [0, -R],
      [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7]]) {
      g.save();
      g.filter = `${base} drop-shadow(${dx}px ${dy}px 0 rgba(255,255,255,0.9))`;
      g.drawImage(img, pad, pad);
      g.restore();
    }
    g.save();
    g.filter = `${base} drop-shadow(5px 7px 3px rgba(35,70,95,0.4))`;
    g.drawImage(img, pad, pad);
    g.restore();
    tex.image = c;
    tex.needsUpdate = true;
  };
  img.src = SPRITES[name] || '';
  return tex;
}

export function spriteMaterial(name) {
  return new THREE.SpriteMaterial({
    map: stickerTexture(name), transparent: true, depthWrite: false,
  });
}

/** 贴纸动画集合：sway 摇摆 / breathe 呼吸 / walk 走动 / fly 飞行 / swim 游动 / bob 漂浮 */
const anims = [];

export function addSprite(parent, name, lat, lon, size, anim) {
  const sp = new THREE.Sprite(spriteMaterial(name));
  const base = ll2v(lat, lon, 1.012);
  sp.position.copy(base);
  sp.scale.set(size, size, 1);
  parent.add(sp);
  if (anim) anims.push({ sp, base, size, ...anim, phase: Math.random() * Math.PI * 2 });
  return sp;
}

const UP = new THREE.Vector3(0, 1, 0);

/** 以某点为原点、球面切向为参考的正交基 */
function tangentBasis(n) {
  let t1 = UP.clone().cross(n);
  if (t1.lengthSq() < 1e-6) t1 = new THREE.Vector3(1, 0, 0).cross(n);
  t1.normalize();
  const t2 = n.clone().cross(t1).normalize();
  return [t1, t2];
}

export function updateAnims(t) {
  for (const a of anims) {
    switch (a.kind) {
      case 'sway':
        a.sp.material.rotation = Math.sin(t * 1.7 + a.phase) * 0.075;
        break;
      case 'breathe': {
        const s = a.size * (1 + Math.sin(t * 2.1 + a.phase) * 0.025);
        a.sp.scale.set(s, s, 1);
        break;
      }
      case 'walk':
      case 'orbit':
      case 'fly': {
        const ang = t * a.speed + a.phase;
        const n = a.base.clone().normalize();
        const [t1, t2] = tangentBasis(n);
        const radius = a.kind === 'fly'
          ? a.radius * (1 + Math.sin(t * 0.7 + a.phase) * 0.25)
          : a.radius;
        const p = a.base.clone()
          .addScaledVector(t1, Math.cos(ang) * radius)
          .addScaledVector(t2, Math.sin(ang) * radius)
          .addScaledVector(n, a.kind === 'fly' ? 0.045 : 0.002);
        a.sp.position.copy(p);
        if (a.kind !== 'fly') a.sp.scale.set(a.size * (Math.sin(ang) > 0 ? 1 : -1), a.size, 1);
        break;
      }
      case 'swim': {
        const n = a.base.clone().normalize();
        const [t1] = tangentBasis(n);
        const p = a.base.clone()
          .addScaledVector(t1, Math.sin(t * 0.35 + a.phase) * 0.05)
          .addScaledVector(n, 0.004 + Math.sin(t * 1.3 + a.phase) * 0.003);
        a.sp.position.copy(p);
        a.sp.scale.set(a.size * (Math.cos(t * 0.35 + a.phase) > 0 ? -1 : 1), a.size, 1);
        a.sp.material.rotation = Math.sin(t * 1.1 + a.phase) * 0.04;
        break;
      }
      case 'bob': {
        const n = a.base.clone().normalize();
        a.sp.position.copy(a.base).addScaledVector(n, 0.002 + Math.abs(Math.sin(t * 1.4 + a.phase)) * 0.006);
        a.sp.material.rotation = Math.sin(t * 1.2 + a.phase) * 0.12;
        break;
      }
      default:
        break;
    }
  }
}

export function clearAnims() {
  anims.length = 0;
}
