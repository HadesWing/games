import { setSunAngle } from '../core/scene.js';
import { seasonName } from '../features/snow-layer.js';

const $ = (id) => document.getElementById(id);

/** 给按钮绑定 on/off 开关语义 */
function bindToggle(id, onChange) {
  const btn = $(id);
  btn.addEventListener('click', () => {
    const on = btn.classList.toggle('on');
    onChange(on);
  });
  return btn;
}

/**
 * 控制面板连线：图层开关、时间滑块、季节滑块 + 四季按钮。
 */
export function initControls({ controls, sun, cloud, climateBands, circulation, graticule, currents, snow, boat, onBoatChange }) {
  const tip = $('tip');
  const boatTip = $('boatTip');
  const flowLegend = $('flowLegend');
  const btnBoat = $('btnBoat');
  const btnSpin = $('btnSpin');

  bindToggle('btnCloud', (on) => { cloud.mesh.visible = on; });
  bindToggle('btnBand', (on) => climateBands.setVisible(on));
  bindToggle('btnGrid', (on) => graticule.setVisible(on));
  bindToggle('btnCurrent', (on) => currents.setVisible(on));
  bindToggle('btnFlow', (on) => {
    circulation.setVisible(on);
    flowLegend.hidden = !on;
  });

  // 自转
  btnSpin.addEventListener('click', () => {
    const on = btnSpin.classList.toggle('on');
    if (!boat.state.on) controls.autoRotate = on;
  });

  // 驾船
  btnBoat.addEventListener('click', () => {
    const on = !boat.state.on;
    boat.setActive(on);
    btnBoat.classList.toggle('on', on);
    btnBoat.textContent = on ? '⚓ 下船' : '🚤 驾船';
    boatTip.hidden = !on;
    controls.autoRotate = on ? false : btnSpin.classList.contains('on');
    tip.textContent = on
      ? '你在开船啦！开去哪儿？'
      : '滚轮放大中国，看沙漠 · 雪山 · 桂林山水 · 草原';
    if (on) boat.state.speed = 0;
    if (onBoatChange) onBoatChange(on);
  });

  // 时间
  const sunSlider = $('sun');
  const applySun = () => setSunAngle(sun, parseFloat(sunSlider.value));
  sunSlider.addEventListener('input', applySun);
  applySun();

  // 季节
  const seasonSlider = $('season');
  const seasonLabel = $('seasonLabel');
  const sbtns = Array.from(document.querySelectorAll('.sbtn'));
  const seasonOf = (m) => (m >= 3 && m <= 5 ? 4 : m >= 6 && m <= 8 ? 7 : m >= 9 && m <= 11 ? 10 : 1);

  let snowTimer = null;
  function applySeason() {
    const month = parseInt(seasonSlider.value, 10);
    seasonLabel.textContent = `${month}月 · ${seasonName(month)}`;
    clearTimeout(snowTimer);
    snowTimer = setTimeout(() => snow.draw(month), 80);
    circulation.setSeason(month);
  }

  seasonSlider.addEventListener('input', () => {
    applySeason();
    const k = seasonOf(parseInt(seasonSlider.value, 10));
    sbtns.forEach((b) => b.classList.toggle('on', parseInt(b.dataset.month, 10) === k));
  });

  sbtns.forEach((btn) => btn.addEventListener('click', () => {
    seasonSlider.value = btn.dataset.month;
    sbtns.forEach((b) => b.classList.toggle('on', b === btn));
    applySeason();
  }));

  applySeason();
  return { applySeason };
}
