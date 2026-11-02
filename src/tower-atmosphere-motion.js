import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
const PORTRAIT_FLOW = Object.freeze({ worldScale: 0.026, eddyScale: 0.014, detailScale: 0.074, warp: 0.14, detailWarp: 0.21, windX: -0.014, windZ: 4e-3, eddyX: 22e-4, eddyZ: -16e-4 });
const MIST_ANCHORS = [[-2, 0.2, -6, 0.1], [-3, 0.1, 4, 0.07], [1, 0, -9, 0.08], [5, 0.05, 9, 0.045]];
function updatePortraitFlow(time, target) {
  const wrap = (value) => (value % 1 + 1) % 1;
  return target.set(wrap(time * PORTRAIT_FLOW.windX), wrap(time * PORTRAIT_FLOW.windZ), wrap(time * PORTRAIT_FLOW.eddyX), wrap(time * PORTRAIT_FLOW.eddyZ));
}
function updatePortraitMist(time, targets) {
  MIST_ANCHORS.forEach(([x, y, z, strength], index) => {
    const phase = index * 1.7, speed = 0.14 + index * 0.018;
    targets[index].set(x + (Math.sin(time * speed + phase) - Math.sin(phase)) * 2.8, y + (Math.sin(time * 0.22 + phase) - Math.sin(phase)) * 0.12, z + (Math.cos(time * speed * 0.7 + phase) - Math.cos(phase)) * 1.8, strength);
  });
  return targets;
}
function portraitFlowPixels(random, size = 128) {
  const noise = new SimplexNoise({ random });
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size * Math.PI * 2, v = (y + 0.5) / size * Math.PI * 2;
    const sample = (radius, offset) => noise.noise4d(Math.cos(u) * radius + offset, Math.sin(u) * radius, Math.cos(v) * radius, Math.sin(v) * radius + offset);
    const channels = [0.5 + (sample(1.35, 0) * 0.75 + sample(2.7, 11) * 0.25) * 0.85, 0.5 + sample(1.1, 23) * 0.6, 0.5 + sample(1.1, 47) * 0.6, 0.5 + sample(2.4, 71) * 0.65];
    channels.forEach((value, channel) => {
      pixels[(y * size + x) * 4 + channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
    });
  }
  return pixels;
}
export {
  PORTRAIT_FLOW,
  portraitFlowPixels,
  updatePortraitFlow,
  updatePortraitMist
};
