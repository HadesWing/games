import * as THREE from 'three';
import { vec2ll } from '../core/geo.js';

/**
 * 点击拾取：拖动不算点击（位移 > 5px 视为转地球），点中球面后回调经纬度。
 */
export function createPicking({ canvas, camera, earth, onClick }) {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let down = null;

  canvas.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down[0];
    const dy = e.clientY - down[1];
    down = null;
    if (dx * dx + dy * dy > 25) return;

    ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObject(earth, false)[0];
    if (!hit) return;

    const local = earth.worldToLocal(hit.point.clone()).normalize();
    const { lat, lon } = vec2ll(local);
    onClick(lat, lon);
  });
}
