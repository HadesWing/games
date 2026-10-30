import './styles/main.css';
import * as THREE from 'three';

import { createScene } from './core/scene.js';
import { createGlobeMesh } from './textures/earth-texture.js';
import { createCloudLayer } from './textures/cloud-texture.js';
import { createClimateBands } from './features/climate-bands.js';
import { createCirculation } from './features/circulation.js';
import { createGraticule } from './features/graticule.js';
import { createOceanCurrents } from './features/ocean-currents.js';
import { createSnowLayer } from './features/snow-layer.js';
import { createLandmarks, regionAt } from './features/landmarks.js';
import { createPicking } from './features/picking.js';
import { createBoat } from './features/boat.js';
import { createWeather } from './features/weather.js';
import { updateAnims } from './features/stickers.js';
import { pickFact } from './data/facts.js';
import { baikeUrl } from './data/regions.js';
import { showFact } from './ui/fact-card.js';
import { initControls } from './ui/controls.js';

async function boot() {
  const canvas = document.getElementById('scene');
  const { renderer, scene, camera, controls, globe, sun } = createScene(canvas);

  const earth = await createGlobeMesh(globe);
  const cloud = createCloudLayer(globe);
  const snow = createSnowLayer(globe);
  const climateBands = createClimateBands(globe);
  const circulation = createCirculation(globe);
  const graticule = createGraticule(globe);
  const currents = createOceanCurrents(globe);
  const landmarks = createLandmarks(globe);
  const boat = createBoat({ globe, camera, controls });
  const weather = createWeather(globe);

  // 点击球面：下一小片天气（热带/温带下雨、寒带下雪）；
  // 优先命中地标（带百科链接），否则按纬度给一条小知识
  createPicking({
    canvas,
    camera,
    earth,
    onClick(lat, lon) {
      weather.spawn(lat, lon, weather.kindAt(lat));
      const region = regionAt(lat, lon);
      if (region) {
        showFact({
          title: region.name,
          text: region.fact,
          link: baikeUrl(region.baike || region.name),
        });
        return;
      }
      const [title, text] = pickFact(lat);
      showFact({ title, text, link: null });
    },
  });

  initControls({
    controls, sun, cloud, climateBands, circulation, graticule, currents, snow, boat,
  });

  // 调试句柄（浏览器控制台 / 自动化截图用）
  window.__earth = { camera, controls, globe, boat, circulation, snow };

  const clock = new THREE.Clock();
  let elapsed = 0;

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;

    cloud.update(dt);
    circulation.update(dt, elapsed);
    currents.update(dt, elapsed);
    weather.update(dt);
    boat.update(dt, elapsed);
    landmarks.setVisible(controls.getDistance() < 2.0); // 拉近才显示地标
    updateAnims(elapsed);

    if (!boat.state.on) controls.update(); // 开船时镜头由 boat 模块全权接管
    renderer.render(scene, camera);
  }
  loop();

  document.getElementById('loading').style.display = 'none';
}

boot();
