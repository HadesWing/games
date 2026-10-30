import * as THREE from 'three';
import { traceLand } from '../core/geo.js';

const SEASON_NAMES = {
  1: '冬❄️', 2: '冬❄️', 3: '春🌸', 4: '春🌸', 5: '春🌸', 6: '夏☀️',
  7: '夏☀️', 8: '夏☀️', 9: '秋🍂', 10: '秋🍂', 11: '秋🍂', 12: '冬❄️',
};

export const seasonName = (month) => `北半球${SEASON_NAMES[month]}`;

/**
 * 季节性积雪层。
 * 做法：先在离屏画布上画南北两个弧形雪帽（雪线随月份正弦摆动），
 * 再用「陆地形状」做 destination-in 遮罩 —— 雪只落在陆地上，海洋不积雪。
 * 冬季雪线约 48°N、夏季约 66°N，比真实略夸张一点点但不出戏。
 */
export function createSnowLayer(globe) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.008, 48, 32),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  globe.add(mesh);

  const off = document.createElement('canvas');
  off.width = canvas.width;
  off.height = canvas.height;
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d');
  const o = off.getContext('2d');

  function drawCap(latLimit, south) {
    if (latLimit >= 88) return;
    const yEdge = south ? ((90 + latLimit) / 180) * H : ((90 - latLimit) / 180) * H;
    o.save();
    o.filter = 'blur(7px)';
    o.fillStyle = 'rgba(255,255,255,0.82)';
    o.beginPath();
    if (south) { o.moveTo(0, H); o.lineTo(W, H); o.lineTo(W, yEdge); }
    else { o.moveTo(0, 0); o.lineTo(W, 0); o.lineTo(W, yEdge); }
    for (let x = W; x >= 0; x -= 12) {
      const wob = Math.sin(x * 0.031) * H * 0.010 + Math.sin(x * 0.012) * H * 0.015;
      o.lineTo(x, yEdge + (south ? -wob : wob));
    }
    o.closePath();
    o.fill();
    o.restore();
  }

  function draw(month) {
    g.clearRect(0, 0, W, H);
    o.clearRect(0, 0, W, H);

    const phase = (2 * Math.PI * (month - 1)) / 12;
    drawCap(57 - 9 * Math.cos(phase), false);   // 北半球
    drawCap(57 + 9 * Math.cos(phase), true);    // 南半球

    // 陆地遮罩
    o.globalCompositeOperation = 'destination-in';
    o.beginPath();
    traceLand(o, W, H);
    o.fillStyle = '#fff';
    o.fill('evenodd');
    o.globalCompositeOperation = 'source-over';

    g.drawImage(off, 0, 0);
    tex.needsUpdate = true;
  }

  draw(1);
  return { mesh, draw };
}
