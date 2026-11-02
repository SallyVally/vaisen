import { Box3, PerspectiveCamera, Vector3 } from "three";
import { framePortrait } from "./tower-lookdev.js";
import { CGI_RELEASE } from "./tower-supported-mechanism.js";
import { applyPresentationCamera, boxCorners } from "./tower-presentation.js";
const STAGE_NAVIGATION_TIMING = Object.freeze({ orbitDuration: 4.6, interruptible: true, overlapOrbit: true, parallelCrossWing: true, easeTransfers: true, handover: Object.freeze({ retract: 2.8, orbit: 3.4, deploy: 3, parkedTime: CGI_RELEASE.cameraStart }), crossover: Object.freeze({ retract: 5, orbit: 4.2, deploy: 5.8, parkedTime: 0 }) });
const ease = (t) => Math.max(0, Math.min(1, t * t * t * (t * (t * 6 - 15) + 10)));
function blendInspection(a, b, t) {
  return { ...a, position: a.position.clone().lerp(b.position, t), target: a.target.clone().lerp(b.target, t), fov: a.fov + (b.fov - a.fov) * t, shiftX: a.shiftX + (b.shiftX - a.shiftX) * t, shiftY: a.shiftY + (b.shiftY - a.shiftY) * t };
}
function blendOrbitTransition(current, orbit, route, activeSide) {
  if (!route.overlap) return orbit;
  const away = route.from === activeSide ? route.progress : 1 - route.progress;
  const t = Math.min(1, Math.max(0, away / 0.22));
  return blendInspection(current, orbit, t * t * t * (t * (t * 6 - 15) + 10));
}
function blendParallelOrbit(current, orbit, incoming, route) {
  const distance = route.from === route.parallel.fromSide ? route.progress : 1 - route.progress;
  const smooth = (value) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  return blendInspection(blendInspection(current, orbit, smooth(distance / 0.22)), incoming, smooth((distance - 0.78) / 0.22));
}
function frameStageFloor(sector, floor, width, height, header, footer) {
  const room = sector.rooms[floor];
  if (!room) throw new Error("Unknown inspection floor");
  const cgi = sector.id === "cgi";
  const bounds = new Box3().setFromPoints(room.portalCorners.map((point) => new Vector3(...point))).expandByVector(new Vector3(cgi ? 0.45 : 0.7, 0.12, 0.14));
  const travel = new Vector3(...CGI_RELEASE.moduleTravel);
  if (sector.id === "web" || sector.id === "smart-light") travel.z *= -1;
  bounds.translate(travel);
  const target = bounds.getCenter(new Vector3());
  const overview = framePortrait(width, height, header, footer);
  const rect = { ...overview.rect };
  if (width / height > 1.15) {
    rect.left = cgi ? 0.46 : 0.44;
    rect.right = cgi ? 0.96 : 0.95;
  }
  const normal = new Vector3(...sector.outward).add(new Vector3(0, 0, cgi ? 0.32 : sector.id === "web" || sector.id === "smart-light" ? -0.12 : 0.12)).normalize();
  const camera = new PerspectiveCamera(35, width / height, 0.1, 180);
  const poseAt = (distance) => ({ target, position: target.clone().addScaledVector(normal, distance).add(new Vector3(0, cgi ? Math.min(0.6, distance * 0.065) : 0.18, 0)), fov: 35, shiftX: rect.left + rect.right - 1, shiftY: 1 - rect.top - rect.bottom, rect });
  let low = 3.2, high = 100;
  for (let i = 0; i < 25; i++) {
    const distance = (low + high) / 2;
    applyPresentationCamera(camera, poseAt(distance));
    const fits = boxCorners(bounds).every((point) => {
      const clip = point.project(camera), x = (clip.x + 1) / 2, y = (1 - clip.y) / 2;
      return clip.z < 1 && x > rect.left + 0.025 && x < rect.right - 0.025 && y > rect.top + 0.025 && y < rect.bottom - 0.025;
    });
    if (fits) high = distance;
    else low = distance;
  }
  return { ...poseAt(high), bounds };
}
class StageFloorFocus {
  constructor() {
    this.states = new Map();
  }
  state(sector) {
    if (!this.states.has(sector)) this.states.set(sector, { value: 1, from: 1, target: 1, age: 1.6 });
    return this.states.get(sector);
  }
  request(sector, floor, immediate = false) {
    if (!["cgi", "music", "smart-light", "web"].includes(sector) || !Number.isInteger(floor) || floor < 0 || floor > 2) throw new Error("Unknown inspection floor");
    const state = this.state(sector);
    if (immediate) {
      state.value = state.from = state.target = floor;
      state.age = 1.6;
      return;
    }
    if (state.target === floor) return;
    state.from = state.value;
    state.target = floor;
    state.age = 0;
  }
  tick(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid inspection step");
    let changed = false;
    for (const state of this.states.values()) if (state.age < 1.6) {
      state.age = Math.min(1.6, state.age + dt);
      state.value = state.age === 1.6 ? state.target : Math.max(0, Math.min(2, state.from + (state.target - state.from) * ease(state.age / 1.6)));
      changed = true;
    }
    return changed;
  }
  camera(sector, views) {
    const value = Math.max(0, Math.min(views.length - 1, this.state(sector).value)), low = Math.floor(value), high = Math.ceil(value);
    return blendInspection(views[low], views[high], value - low);
  }
  get busy() {
    for (const state of this.states.values()) if (state.age < 1.6) return true;
    return false;
  }
}
export {
  STAGE_NAVIGATION_TIMING,
  StageFloorFocus,
  blendInspection,
  blendOrbitTransition,
  blendParallelOrbit,
  frameStageFloor
};
