import * as THREE from 'three';
import { ll2v } from '../core/geo.js';

/**
 * 经纬网：每 30° 一条经线、每 15° 一条纬线。
 * 赤道 / 南北回归线 / 南北极圈用彩色加粗线单独标出 —— 这四条线是
 * "五带划分"和"太阳直射点范围"的教学抓手。
 */
export function createGraticule(globe) {
  const R = 1.042;
  const gridPts = [];
  const specialPts = [];

  // 纬线圈
  for (let lat = -75; lat <= 75; lat += 15) {
    const isSpecial = lat === 0 || Math.abs(lat) === 23.5 || Math.abs(lat) === 66.5;
    const target = isSpecial ? specialPts : gridPts;
    for (let lon = -180; lon < 180; lon += 4) {
      const a = ll2v(lat, lon, R);
      const b = ll2v(lat, lon + 4, R);
      target.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  // 回归线 / 极圈（15° 网格里没有，单独补）
  for (const lat of [23.5, -23.5, 66.5, -66.5]) {
    for (let lon = -180; lon < 180; lon += 2) {
      const a = ll2v(lat, lon, R);
      const b = ll2v(lat, lon + 2, R);
      specialPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  // 经线
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -88; lat < 88; lat += 4) {
      const a = ll2v(lat, lon, R);
      const b = ll2v(lat + 4, lon, R);
      gridPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const build = (pts, color, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
    }));
  };

  const group = new THREE.Group();
  group.visible = false;
  group.add(build(gridPts, 0xffffff, 0.28));
  group.add(build(specialPts, 0xffa726, 0.6));
  globe.add(group);

  return { group, setVisible: (v) => { group.visible = v; } };
}
