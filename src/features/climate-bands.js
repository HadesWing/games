import * as THREE from 'three';

const D = Math.PI / 180;

/**
 * 五带（气候带）示意层：热带 / 南北温带 / 南北寒带。
 * 用半球壳片段上色，打开后一眼能看出"纬度决定冷暖"。
 */
export function createClimateBands(globe) {
  const group = new THREE.Group();
  group.visible = false;
  globe.add(group);

  const shell = (latLow, latHigh, color, opacity) => new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 64, 16, 0, Math.PI * 2, (90 - latHigh) * D, (latHigh - latLow) * D),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );

  group.add(shell(-23.5, 23.5, 0xa8d8f0, 0.30));   // 热带
  group.add(shell(23.5, 66.5, 0x9fe07c, 0.22));    // 北温带
  group.add(shell(66.5, 90, 0xffd166, 0.26));      // 北寒带
  group.add(shell(-66.5, -23.5, 0x9fe07c, 0.22));  // 南温带
  group.add(shell(-90, -66.5, 0xa8d8f0, 0.30));    // 南寒带

  return { group, setVisible: (v) => { group.visible = v; } };
}
