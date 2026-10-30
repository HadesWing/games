import * as THREE from 'three';
import { traceLand } from '../core/geo.js';
import earthPhotoUrl from '../assets/earth-2k.jpg';

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/**
 * 真实卫星影像 → 绘本卡通地图。
 * 管线：提亮提饱和 → 6 级色阶量化（块面感）→ 糖果蓝海洋罩色（rect 挖陆地）
 *      → 近岸浅海光晕 → 白色海岸描边 → 北极海冰。
 */
export async function createEarthTexture() {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = await loadImage(earthPhotoUrl);

  // 1. 底图：提亮提饱和
  g.filter = 'saturate(1.68) brightness(1.36) contrast(1.03)';
  g.drawImage(img, 0, 0, W, H);
  g.filter = 'none';

  // 2. 色阶量化 + 伽马提亮
  const imageData = g.getImageData(0, 0, W, H);
  const d = imageData.data;
  const step = 255 / 6;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = Math.pow(d[i + k] / 255, 0.85) * 255;
      d[i + k] = Math.min(255, Math.round(v / step) * step);
    }
  }
  g.putImageData(imageData, 0, 0);

  // 3. 海洋：糖果蓝水彩罩色（rect 打底 + 陆地挖洞 = 只染海洋）
  g.beginPath();
  g.rect(0, 0, W, H);
  traceLand(g, W, H);
  g.fillStyle = 'rgba(105,203,242,0.74)';
  g.fill('evenodd');

  // 4. 近岸浅海光晕
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.save();
  g.filter = 'blur(9px)';
  g.beginPath(); traceLand(g, W, H);
  g.lineWidth = 26; g.strokeStyle = 'rgba(190,242,255,0.72)'; g.stroke();
  g.restore();

  // 5. 白色海岸描边 + 淡青内描边
  g.beginPath(); traceLand(g, W, H);
  g.lineWidth = 5.5; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
  g.beginPath(); traceLand(g, W, H);
  g.lineWidth = 2; g.strokeStyle = 'rgba(30,105,120,0.28)'; g.stroke();

  // 6. 北极海冰（海面被罩色后补回白帽子）
  const yEdge = ((90 - 75) / 180) * H;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, yEdge);
  for (let x = W; x >= 0; x -= 20) {
    const wob = Math.sin(x * 0.021) * H * 0.010 + Math.sin(x * 0.009) * H * 0.016;
    g.lineTo(x, yEdge + wob);
  }
  g.closePath(); g.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 地球本体（真实贴图 + 卡通化后处理） */
export async function createGlobeMesh(globe) {
  const tex = await createEarthTexture();
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 48),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  globe.add(earth);
  return earth;
}
