import * as THREE from 'three';
import { angularDistance } from '../core/geo.js';
import { addSprite } from './stickers.js';
import { REGIONS } from '../data/regions.js';

/**
 * 每种地标的贴纸布局（数据驱动，改布局只动这里）：
 * [贴纸名, 纬度偏移, 经度偏移, 尺寸, 动效]
 */
const LAYOUT = {
  desert: [['camel', 0, 0, 0.07, { kind: 'walk', radius: 0.02, speed: 0.22 }],
    ['camel', -1.1, -1.3, 0.042, { kind: 'walk', radius: 0.014, speed: 0.3 }]],
  gobi: [['camel', 1.0, 1.2, 0.055, { kind: 'walk', radius: 0.02, speed: 0.26 }],
    ['goat', -1.2, 0.8, 0.032, { kind: 'walk', radius: 0.012, speed: 0.4 }]],
  tibet: [['mountain', 0, 0, 0.07, { kind: 'sway' }],
    ['goat', 1.4, 1.6, 0.032, { kind: 'walk', radius: 0.014, speed: 0.35 }]],
  everest: [['mountain', 0, 0, 0.16, { kind: 'breathe' }]],
  karst: [['canoe', 0, 0, 0.06, { kind: 'bob' }],
    ['blossom', 0.9, -0.9, 0.045, { kind: 'sway' }]],
  palm: [['palm', 0, 0, 0.075, { kind: 'sway' }],
    ['palm', 1.0, 1.1, 0.055, { kind: 'sway' }],
    ['palm', -0.9, -1.2, 0.05, { kind: 'sway' }]],
  forest: [['pine', 0, 0, 0.07, { kind: 'sway' }],
    ['pine', 0.9, 1.0, 0.055, { kind: 'sway' }],
    ['pine', -1.0, -0.8, 0.05, { kind: 'sway' }],
    ['pine', 1.2, -1.1, 0.045, { kind: 'sway' }]],
  grass: [['yurt', 0, 0, 0.11, { kind: 'breathe' }],
    ['sheep', 1.6, 1.4, 0.035, { kind: 'walk', radius: 0.015, speed: 0.3 }],
    ['sheep', -1.5, -1.2, 0.03, { kind: 'walk', radius: 0.012, speed: 0.38 }],
    ['sheep', 0.8, -1.8, 0.028, { kind: 'walk', radius: 0.01, speed: 0.45 }]],
  loess: [['rice', 0, 0, 0.055, { kind: 'sway' }],
    ['rice', 0.9, 1.0, 0.045, { kind: 'sway' }],
    ['goat', -1.2, 0.9, 0.03, { kind: 'walk', radius: 0.012, speed: 0.4 }]],
  jiangnan: [['blossom', 0, 0, 0.05, { kind: 'sway' }],
    ['blossom', 0.8, 1.0, 0.04, { kind: 'sway' }],
    ['pine', -0.9, -1.1, 0.042, { kind: 'sway' }],
    ['canoe', 1.2, -0.7, 0.048, { kind: 'bob' }],
    ['bird', -1.6, 0.9, 0.028, { kind: 'fly', radius: 0.05, speed: 0.9 }],
    ['bird', -1.2, 1.5, 0.024, { kind: 'fly', radius: 0.04, speed: 1.15 }]],
  panda: [['pine', 0, 0, 0.06, { kind: 'sway' }],
    ['panda', 0.6, 0.5, 0.065, { kind: 'breathe' }],
    ['pine', -1.0, -0.9, 0.05, { kind: 'sway' }]],
  pyramid: [['pyramid', 0, 0, 0.105, { kind: 'breathe' }],
    ['camel', -1.3, -1.5, 0.045, { kind: 'walk', radius: 0.016, speed: 0.25 }]],
  statue: [['statue', 0, 0, 0.09, { kind: 'breathe' }],
    ['boat', -1.3, 1.6, 0.042, { kind: 'bob' }]],
  fuji: [['fuji', 0, 0, 0.1, { kind: 'breathe' }],
    ['blossom', -1.5, -1.3, 0.042, { kind: 'sway' }]],
  taj: [['taj', 0, 0, 0.095, { kind: 'breathe' }],
    ['blossom', 1.1, 1.2, 0.038, { kind: 'sway' }]],
  moai: [['moai', 0, 0, 0.08, { kind: 'breathe' }],
    ['moai', -1.1, -1.3, 0.055, { kind: 'breathe' }],
    ['palm', 1.3, 1.1, 0.05, { kind: 'sway' }]],
  castle: [['castle', 0, 0, 0.09, { kind: 'breathe' }],
    ['pine', 1.1, 1.3, 0.048, { kind: 'sway' }]],
  bridge: [['bridge', 0, 0, 0.09, { kind: 'breathe' }],
    ['boat', -1.5, 0.9, 0.042, { kind: 'bob' }]],
  savanna: [['lion', 0, 0, 0.065, { kind: 'breathe' }],
    ['giraffe', 1.4, 1.6, 0.07, { kind: 'walk', radius: 0.018, speed: 0.2 }],
    ['goat', -1.5, -1.2, 0.03, { kind: 'walk', radius: 0.012, speed: 0.42 }]],
  kangaroo: [['kangaroo', 0, 0, 0.07, { kind: 'walk', radius: 0.016, speed: 0.35 }],
    ['kangaroo', -1.5, 1.3, 0.055, { kind: 'walk', radius: 0.012, speed: 0.5 }]],
  polar: [['polar', 0, 0, 0.075, { kind: 'walk', radius: 0.014, speed: 0.28 }]],
  penguin: [['penguin', 0, 0, 0.06, { kind: 'walk', radius: 0.012, speed: 0.35 }],
    ['penguin', 1.2, 1.1, 0.05, { kind: 'walk', radius: 0.01, speed: 0.45 }],
    ['penguin', -1.1, -1.2, 0.045, { kind: 'walk', radius: 0.011, speed: 0.4 }]],
  amazon: [['parrot', 1.2, 1.4, 0.055, { kind: 'fly', radius: 0.04, speed: 1.0 }],
    ['monkey', 0, 0, 0.055, { kind: 'breathe' }],
    ['pine', -1.3, -1.0, 0.055, { kind: 'sway' }]],
  whale: [['whale', 0, 0, 0.15, { kind: 'swim' }],
    ['fish', 2.2, 2.2, 0.03, { kind: 'orbit', radius: 0.025, speed: 0.8 }],
    ['tropfish', -2.0, -2.4, 0.026, { kind: 'orbit', radius: 0.02, speed: 1.1 }],
    ['tropfish', 1.8, -2.6, 0.024, { kind: 'orbit', radius: 0.03, speed: 0.65 }],
    ['boat', 3.0, 3.4, 0.05, { kind: 'bob' }]],
};

/**
 * 地标图层：只在拉近（相机距离 < 2.0）时显示，远景保持干净。
 * 每个地标是一组会动的小贴纸，点中后弹出知识卡 + 百科链接。
 */
export function createLandmarks(globe) {
  const group = new THREE.Group();
  group.visible = false;
  globe.add(group);

  for (const region of REGIONS) {
    const items = LAYOUT[region.type] || [];
    for (const [sprite, dLat, dLon, size, anim] of items) {
      addSprite(group, sprite, region.lat + dLat, region.lon + dLon, size, anim);
    }
  }

  return {
    group,
    setVisible(v) {
      if (group.visible === v) return;
      group.visible = v;
    },
  };
}

/** 点击位置命中的地标（按球面距离取最近且在半径内的） */
export function regionAt(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const region of REGIONS) {
    const d = angularDistance(lat, lon, region.lat, region.lon);
    if (d < (region.r || 3) && d < bestDist) {
      best = region;
      bestDist = d;
    }
  }
  return best;
}
