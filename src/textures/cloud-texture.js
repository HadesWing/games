import * as THREE from 'three';

/** 细碎絮状云层贴图：大量小椭圆 + 轻微模糊，比大块云更透气 */
export function createCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.filter = 'blur(0.8px)';
  for (let i = 0; i < 170; i++) {
    const cx = Math.random() * 1024;
    const cy = 25 + Math.random() * 460;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < n; j++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.28})`;
      g.beginPath();
      g.ellipse(
        cx + (Math.random() * 30 - 15),
        cy + (Math.random() * 10 - 5),
        2.5 + Math.random() * 6, 1.5 + Math.random() * 3,
        Math.random() * 3, 0, 7,
      );
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 云层网格（半透明壳，独立慢速旋转） */
export function createCloudLayer(globe) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.025, 48, 32),
    new THREE.MeshLambertMaterial({
      map: createCloudTexture(), transparent: true,
      opacity: 0.58, depthWrite: false,
    }),
  );
  globe.add(mesh);
  return {
    mesh,
    update(dt) { mesh.rotation.y += dt * 0.012; },
  };
}
