import * as THREE from 'three';
import { ll2v } from '../core/geo.js';

/** 世界主要洋流（简化路径，按真实走向手工描点；warm=暖流，cold=寒流） */
export const CURRENTS = [
  { name: '黑潮', warm: true, path: [[18, 122], [24, 124], [29, 129], [33, 137], [38, 143]] },
  { name: '北太平洋暖流', warm: true, path: [[38, 143], [43, 170], [46, -165], [48, -150], [49, -135]] },
  { name: '加利福尼亚寒流', warm: false, path: [[49, -135], [42, -127], [33, -120], [26, -114]] },
  { name: '墨西哥湾暖流', warm: true, path: [[22, -84], [28, -80], [33, -76], [38, -70], [43, -58], [47, -45]] },
  { name: '北大西洋暖流', warm: true, path: [[47, -45], [53, -33], [58, -22], [63, -12]] },
  { name: '拉布拉多寒流', warm: false, path: [[63, -58], [56, -54], [48, -50], [42, -52]] },
  { name: '南赤道暖流', warm: true, path: [[-4, 150], [-4, 180], [-4, -150], [-4, -120]] },
  { name: '秘鲁寒流', warm: false, path: [[-42, -76], [-32, -72], [-22, -74], [-12, -78], [-4, -82]] },
  { name: '巴西暖流', warm: true, path: [[-6, -35], [-18, -38], [-28, -47], [-38, -54]] },
  { name: '本格拉寒流', warm: false, path: [[-34, 18], [-24, 13], [-14, 11], [-6, 9]] },
  { name: '西澳大利亚寒流', warm: false, path: [[-34, 113], [-24, 110], [-16, 108]] },
  { name: '东澳大利亚暖流', warm: true, path: [[-18, 152], [-28, 154], [-36, 151]] },
  {
    name: '南极绕极流', warm: false,
    path: [[-55, -180], [-56, -120], [-55, -60], [-54, 0], [-55, 60], [-55, 120], [-55, 180]],
  },
];

const WARM = 0xff7043;
const COLD = 0x2d8cf0;

/** 流动小圆点贴图 */
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(24, 24, 1, 24, 24, 22);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 48, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 洋流图层：静态淡色路径 + 沿线流动的光点（暖流红、寒流蓝）。
 * 光点方向就是水流方向，比箭头更直观。
 */
export function createOceanCurrents(globe) {
  const group = new THREE.Group();
  group.visible = false;
  globe.add(group);

  const dotTex = makeDotTexture();
  const flows = [];

  for (const cur of CURRENTS) {
    const color = cur.warm ? WARM : COLD;
    const pts = cur.path.map(([lat, lon]) => ll2v(lat, lon, 1.004));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);

    // 路径线
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(120));
    group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.5, depthWrite: false,
    })));

    // 流动光点
    const dots = [];
    const count = Math.max(2, Math.round(curve.getLength() * 26));
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex, color, transparent: true,
        opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sp.scale.setScalar(0.011);
      group.add(sp);
      dots.push(sp);
    }
    flows.push({ curve, dots, speed: 0.035 + Math.random() * 0.01 });
  }

  function update(dt, t) {
    if (!group.visible) return;
    for (const { curve, dots, speed } of flows) {
      dots.forEach((sp, i) => {
        const u = ((t * speed + i / dots.length) % 1 + 1) % 1;
        sp.position.copy(curve.getPointAt(u));
        sp.material.opacity = 0.35 + 0.55 * Math.sin(Math.PI * u);
      });
    }
  }

  return { group, update, setVisible: (v) => { group.visible = v; } };
}
