import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 创建渲染场景：渲染器、相机、轨道控制器、灯光、地球根节点、大气光圈。
 * 所有图层（贴图球、云、雪、环流、贴纸）都挂在 globe 下，一起转。
 */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe6f7');

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.6, 3.2);
  if (new URLSearchParams(location.search).has('china')) camera.position.set(1.0, 0.5, 1.35); // 调试：直飞中国

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.32;   // 手感放慢，轻拖只转一点
  controls.zoomSpeed = 0.45;
  controls.minDistance = 1.35;
  controls.maxDistance = 4.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.35);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfe4ff, 0.35);
  fill.position.set(-4, -2, -3);
  scene.add(fill);

  const globe = new THREE.Group();
  scene.add(globe);

  // 大气光圈：一层反面渲染的淡蓝壳，边缘有柔和的"空气感"
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.09, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x9fd8f5, transparent: true, opacity: 0.16,
      side: THREE.BackSide, depthWrite: false,
    }),
  );
  scene.add(atmosphere);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, controls, globe, sun, fill, atmosphere };
}

/** 日光位置：hour ∈ [0,24]，太阳绕地球一圈 */
export function setSunAngle(sun, hour) {
  const a = (hour / 24) * Math.PI * 2 - Math.PI / 2;
  sun.position.set(Math.cos(a) * 5, 1.6, Math.sin(a) * 5);
}
