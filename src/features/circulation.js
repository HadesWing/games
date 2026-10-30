import * as THREE from 'three';

/** 确定性伪随机（保证每次生成的流线形状一致，便于调试） */
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * 三圈环流的风带（纬度区间 + 流向）
 * dir = -1 向西（信风 / 极地东风），+1 向东（盛行西风）
 */
export const FLOW_BANDS = [
  { low: 60, high: 90, dir: -1 },
  { low: 30, high: 60, dir: 1 },
  { low: 0, high: 30, dir: -1 },
  { low: -30, high: 0, dir: -1 },
  { low: -60, high: -30, dir: 1 },
  { low: -90, high: -60, dir: -1 },
];

/** 几何段比名义风带宽出的余量（度）：季节移动时风带在此范围内滑动，不用重建几何 */
const MARGIN = 10;
const TEX_W = 512;
const TEX_H = 128;

/** 画一条彗星状流线：头部粗亮、尾部细淡 */
function drawStreak(g, x0, y, length, bend, alpha) {
  const SEG = 8;
  for (let s = 0; s < SEG; s++) {
    const t0 = s / SEG;
    const t1 = (s + 1) / SEG;
    const w = (1 - t0) ** 1.5 * 2.1 + 0.3;
    const a = alpha * (1 - t0 * 0.8);
    g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0 + length * t0, y + Math.sin(t0 * Math.PI) * bend);
    g.lineTo(x0 + length * t1, y + Math.sin(t1 * Math.PI) * bend);
    g.stroke();
  }
}

/**
 * 生成一条风带的贴图：几何段覆盖 [low-MARGIN, high+MARGIN]，
 * 流线只画在随季节滑动的 [low+shift, high+shift] 内，上下边缘柔和淡出。
 */
function makeBandTexture(latLow, latHigh, shift, seed) {
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, TEX_W, TEX_H);

  const geoLow = latLow - MARGIN;
  const geoHigh = latHigh + MARGIN;
  // 几何段只覆盖 [geoLow, geoHigh]，画布顶部 = geoHigh（北缘）
  const yOf = (lat) => ((geoHigh - lat) / (geoHigh - geoLow)) * TEX_H;
  const yTop = yOf(latHigh + shift);
  const yBottom = yOf(latLow + shift);
  const ySpan = yBottom - yTop;
  if (ySpan < 6) return new THREE.CanvasTexture(c);

  const rnd = mulberry32(seed);
  const rows = ySpan > 60 ? 4 : 3;
  for (let r = 0; r < rows; r++) {
    const y = yTop + ySpan * ((r + 0.5) / rows + (rnd() - 0.5) * 0.1);
    const perRow = 6 + Math.floor(rnd() * 3);
    for (let i = 0; i < perRow; i++) {
      const len = TEX_W * (0.06 + rnd() * 0.09);
      const x0 = rnd() * TEX_W;
      const bend = (rnd() - 0.5) * 6;
      const alpha = 0.48 + rnd() * 0.3;
      drawStreak(g, x0, y, len, bend, alpha);
      if (x0 + len > TEX_W) drawStreak(g, x0 - TEX_W, y, len, bend, alpha); // 水平无缝
    }
  }

  // 纬度方向淡出：中间实、边缘虚
  g.globalCompositeOperation = 'destination-in';
  const grd = g.createLinearGradient(0, yTop, 0, yBottom);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.22, 'rgba(0,0,0,1)');
  grd.addColorStop(0.78, 'rgba(0,0,0,1)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

/**
 * 大气环流图层（三圈环流 + 赤道辐合带）
 * - 每条风带是一段球面壳 + 专属贴图（流线清晰不糊）
 * - 流向用 scale.x = -1 镜像，保证"粗头在前"
 * - 季节移动只重画贴图（滑块拖动期间由 controls 层节流）
 */
export function createCirculation(globe) {
  const group = new THREE.Group();
  group.visible = false;
  globe.add(group);

  const D = Math.PI / 180;
  const bands = FLOW_BANDS.map((band, i) => {
    const geoLow = band.low - MARGIN;
    const geoHigh = band.high + MARGIN;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(
        1.042 + i * 0.0007, 128, 24,
        0, Math.PI * 2,
        (90 - geoHigh) * D, (geoHigh - geoLow) * D,
      ),
      new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    mesh.scale.x = band.dir < 0 ? -1 : 1;
    group.add(mesh);
    return { band, mesh, tex: null, seed: 9000 + i * 53 };
  });

  // 赤道辐合带（ITCZ）：一条会呼吸的亮带，夏季北移、冬季南移
  const itcz = new THREE.Mesh(
    new THREE.SphereGeometry(1.048, 64, 8, 0, Math.PI * 2, 0, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  group.add(itcz);

  let shift = 0;

  function redraw() {
    for (const item of bands) {
      const next = makeBandTexture(item.band.low, item.band.high, shift, item.seed);
      if (item.tex) item.tex.dispose();
      item.tex = next;
      item.mesh.material.map = next;
      item.mesh.material.needsUpdate = true;
    }
    const thetaStart = (90 - (shift + 5)) * D;
    itcz.geometry.dispose();
    itcz.geometry = new THREE.SphereGeometry(1.048, 64, 8, 0, Math.PI * 2, thetaStart, 10 * D);
  }

  function setSeason(month) {
    const next = -7 * Math.cos((2 * Math.PI * (month - 1)) / 12);
    if (Math.abs(next - shift) < 0.4) return;
    shift = next;
    redraw();
  }

  function update(dt, t) {
    if (!group.visible) return;
    for (const item of bands) {
      item.mesh.material.map.offset.x -= item.band.dir * dt * 0.1;
    }
    itcz.material.opacity = 0.28 + Math.sin(t * 1.1) * 0.1;
  }

  redraw();
  return {
    group,
    update,
    setSeason,
    setVisible(v) { group.visible = v; },
  };
}
