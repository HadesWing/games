import * as THREE from 'three';
import LAND from '../data/land.json';

export { LAND };

export const DEG = Math.PI / 180;

/** 经纬度 → 球面单位向量（r 为半径倍数） */
export function ll2v(lat, lon, r = 1) {
  const la = lat * DEG;
  const lo = lon * DEG;
  return new THREE.Vector3(
    r * Math.cos(la) * Math.cos(lo),
    r * Math.sin(la),
    -r * Math.cos(la) * Math.sin(lo),
  );
}

/** 球面单位向量 → 经纬度 */
export function vec2ll(v) {
  const n = v.clone().normalize();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(n.y)),
    lon: THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x)),
  };
}

/**
 * 在 2D 画布上描出所有陆地轮廓（等距圆柱投影）。
 * 经度画 -360/0/+360 三份，超出画布的部分自动被裁剪 —— 这样骑在 180° 日界线上的
 * 大陆（楚科奇、斐济）不会被拉出一条横贯全球的直线。
 * 注意：本函数不调用 beginPath，路径由调用方管理（填充靠 rect 打底 + 挖洞）。
 */
export function traceLand(g, w, h) {
  for (const poly of LAND) {
    for (const ring of poly) {
      for (let k = -1; k <= 1; k++) {
        for (let n = 0; n < ring.length; n += 2) {
          const x = ((ring[n] + k * 360 + 180) / 360) * w;
          const y = ((90 - ring[n + 1]) / 180) * h;
          if (n === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
      }
    }
  }
}

/** 点是否落在陆地上（射线法，处理经度环绕） */
export function pointInLand(lat, lon) {
  let inside = false;
  for (const poly of LAND) {
    for (const ring of poly) {
      for (const k of [-360, 0, 360]) {
        let cross = false;
        const n = ring.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = ring[i * 2] + k, yi = ring[i * 2 + 1];
          const xj = ring[j * 2] + k, yj = ring[j * 2 + 1];
          if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
            cross = !cross;
          }
        }
        if (cross) inside = !inside;
      }
    }
  }
  return inside;
}

/** 球面两点距离（单位：度，只用于小范围判定） */
export function angularDistance(lat1, lon1, lat2, lon2) {
  const dLat = lat1 - lat2;
  let dLon = Math.abs(lon1 - lon2);
  if (dLon > 180) dLon = 360 - dLon;
  return Math.hypot(dLat, dLon * Math.cos(lat1 * DEG));
}

/** 沿地表朝某方向前进一小步（heading：0=正北，顺时针） */
export function stepLatLon(lat, lon, distance, heading) {
  const dLat = (distance * Math.cos(heading)) / DEG;
  const dLon = (distance * Math.sin(heading)) / (DEG * Math.max(0.15, Math.cos(lat * DEG)));
  return { lat: lat + dLat, lon: lon + dLon };
}
