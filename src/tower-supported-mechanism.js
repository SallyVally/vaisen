import { Box3, Group, PerspectiveCamera, Vector3, Vector4 } from "three";
import { framePortrait, PORTRAIT_BOUNDS } from "./tower-lookdev.js";
import { applyPresentationCamera, boxCorners } from "./tower-presentation.js";
const BODY_STROKE = Object.freeze({ start: 0.45, liftEnd: 1.55, diagonalStart: 1.82, travelEnd: 4.85, seatEnd: 5.22, lift: 0.28, preload: 0.014 });
const MODULE_STROKE = Object.freeze({ start: 5.85, liftEnd: 6.6, diagonalStart: 6.82, travelEnd: 9.25, seatEnd: 9.55, lift: 0.18, preload: 9e-3 });
const CGI_RELEASE = Object.freeze({ duration: 10.1, bodyTravel: Object.freeze([0, 3, 2.4]), moduleTravel: Object.freeze([0, 2, 2.2]), body: BODY_STROKE, module: MODULE_STROKE, latchEnd: BODY_STROKE.start, bodyStart: BODY_STROKE.start, bodyEnd: BODY_STROKE.seatEnd, moduleStart: MODULE_STROKE.start, moduleEnd: MODULE_STROKE.seatEnd, cameraStart: 5.5, cameraEnd: 10.1 });
const clamp = (value) => Math.max(0, Math.min(1, value));
const minimumJerk = (value) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const phase = (time, start, end) => clamp((time - start) / (end - start));
const stickyLift = (t) => t ** 4 * (15 - 24 * t + 10 * t * t);
const heavyTravel = (t) => t ** 3 * (35 + t * (-105 + t * (126 + t * (-70 + 15 * t))));
function strokePose(time, stroke, travel) {
  const lift = stickyLift(phase(time, stroke.start, stroke.liftEnd));
  const progress = heavyTravel(phase(time, stroke.diagonalStart, stroke.travelEnd));
  const seat = minimumJerk(phase(time, stroke.travelEnd, stroke.seatEnd));
  const offset = new Vector3(0, stroke.lift * lift + (travel[1] + stroke.preload - stroke.lift) * progress - stroke.preload * seat, travel[2] * progress);
  if (time >= stroke.seatEnd) offset.fromArray(travel);
  const stage = time < stroke.start ? "Pressure" : time < stroke.liftEnd ? "Lifting" : time < stroke.diagonalStart ? "Interlock" : time < stroke.travelEnd ? "Travelling" : time < stroke.seatEnd ? "Seating" : "Locked";
  return { offset, progress, lift, seat, stage };
}
function supportedCGIPose(seconds) {
  const time = Math.max(0, Math.min(CGI_RELEASE.duration, seconds));
  const body = strokePose(time, CGI_RELEASE.body, CGI_RELEASE.bodyTravel);
  const module = strokePose(time, CGI_RELEASE.module, CGI_RELEASE.moduleTravel);
  const cameraMix = minimumJerk((time - CGI_RELEASE.cameraStart) / (CGI_RELEASE.cameraEnd - CGI_RELEASE.cameraStart));
  return { time, bodyOffset: body.offset, moduleOffset: module.offset, bodyProgress: body.progress, moduleProgress: module.progress, bodyLift: body.lift, moduleLift: module.lift, bodySeat: body.seat, moduleSeat: module.seat, bodyStage: body.stage, moduleStage: module.stage, cameraMix, releaseMist: new Vector4(0, 0, 0, 0) };
}
const MECHANICAL_CUES = Object.freeze([{ time: 0.05, assembly: "body", kind: "pressure" }, { time: BODY_STROKE.start, assembly: "body", kind: "home" }, { time: BODY_STROKE.start + 0.3, assembly: "body", kind: "release" }, { time: BODY_STROKE.diagonalStart, assembly: "body", kind: "drive" }, { time: BODY_STROKE.seatEnd, assembly: "body", kind: "lock" }, { time: MODULE_STROKE.start - 0.38, assembly: "module", kind: "pressure" }, { time: MODULE_STROKE.start, assembly: "module", kind: "home" }, { time: MODULE_STROKE.start + 0.18, assembly: "module", kind: "release" }, { time: MODULE_STROKE.diagonalStart, assembly: "module", kind: "drive" }, { time: MODULE_STROKE.seatEnd, assembly: "module", kind: "lock" }].map(Object.freeze));
function frameCGIInspection(sector, width, height, headerHeight = 76, footerHeight = 84) {
  const overview = framePortrait(width, height, headerHeight, footerHeight);
  const bounds = new Box3().setFromPoints(sector.glassCorners.map((p) => new Vector3(...p))).expandByVector(new Vector3(0.08, 0.15, 0.12));
  bounds.translate(new Vector3(...CGI_RELEASE.moduleTravel));
  const target = bounds.getCenter(new Vector3());
  const normal = new Vector3(1, 0, 0.14).normalize();
  const rect = overview.rect;
  const camera = new PerspectiveCamera(35, width / height, 0.1, 180);
  const endAt = (distance) => {
    const position = target.clone().addScaledVector(normal, distance);
    position.y = 2.6 + CGI_RELEASE.moduleTravel[1];
    return { position, target, fov: 35, shiftX: overview.shiftX, shiftY: overview.shiftY };
  };
  let low = 3, high = 100;
  for (let i = 0; i < 25; i++) {
    const distance = (low + high) / 2;
    applyPresentationCamera(camera, endAt(distance));
    const fits = boxCorners(bounds).every((point) => {
      const clip = point.project(camera), x = (clip.x + 1) / 2, y = (1 - clip.y) / 2;
      return x > rect.left + 0.025 && x < rect.right - 0.025 && y > rect.top + 0.025 && y < rect.bottom - 0.025;
    });
    if (fits) high = distance;
    else low = distance;
  }
  return { ...endAt(high), rect };
}
function frameCGIRelease(width, height, headerHeight = 76, footerHeight = 84) {
  const bounds = PORTRAIT_BOUNDS.clone().union(PORTRAIT_BOUNDS.clone().translate(new Vector3(...CGI_RELEASE.bodyTravel)));
  return framePortrait(width, height, headerHeight, footerHeight, bounds);
}
function supportedCGICamera(overview, inspection, seconds, release = overview) {
  const state = supportedCGIPose(seconds), t = state.cameraMix;
  const blend = (a, b, mix) => ({ position: a.position.clone().lerp(b.position, mix), target: a.target.clone().lerp(b.target, mix), fov: a.fov + (b.fov - a.fov) * mix, shiftX: a.shiftX + (b.shiftX - a.shiftX) * mix, shiftY: a.shiftY + (b.shiftY - a.shiftY) * mix, rect: a.rect });
  const wide = blend(overview, release, state.bodyProgress);
  const delta = state.moduleOffset.clone().sub(new Vector3(...CGI_RELEASE.moduleTravel));
  const following = { ...inspection, position: inspection.position.clone().add(delta), target: inspection.target.clone().add(delta) };
  return blend(wide, following, t);
}
class SupportedCGIMotion {
  constructor() {
    this.time = 0;
    this.direction = 0;
    this.requestedOpen = false;
    this.dwell = 0;
    this.cues = [];
  }
  request(open, { immediate = false } = {}) {
    this.requestedOpen = Boolean(open);
    if (immediate) {
      this.time = open ? CGI_RELEASE.duration : 0;
      this.direction = 0;
      this.dwell = 0;
      this.cues.length = 0;
    }
  }
  tick(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid mechanical animation step");
    let remaining = seconds;
    while (remaining > 0) {
      if (this.dwell > 0) {
        const step2 = Math.min(remaining, this.dwell);
        remaining -= step2;
        this.dwell -= step2;
        continue;
      }
      if (this.direction === 0) {
        const target = this.requestedOpen ? CGI_RELEASE.duration : 0;
        if (this.time === target) break;
        this.direction = target > this.time ? 1 : -1;
      }
      const endpoint = this.direction > 0 ? CGI_RELEASE.duration : 0;
      const step = Math.min(remaining, Math.abs(endpoint - this.time));
      const previous = this.time;
      this.time += this.direction * step;
      const crossed = MECHANICAL_CUES.filter((cue) => this.direction > 0 ? previous < cue.time && this.time >= cue.time : previous > cue.time && this.time <= cue.time);
      if (this.direction < 0) crossed.reverse();
      for (const cue of crossed) this.cues.push({ ...cue, direction: this.direction });
      remaining -= step;
      if (Math.abs(this.time - endpoint) < 1e-9) {
        this.time = endpoint;
        this.direction = 0;
        if (this.requestedOpen !== (endpoint === CGI_RELEASE.duration)) this.dwell = 0.35;
      }
    }
  }
  consumeCues() {
    return this.cues.splice(0);
  }
  get busy() {
    return this.direction !== 0 || this.dwell > 0 || this.time !== (this.requestedOpen ? CGI_RELEASE.duration : 0);
  }
  get status() {
    if (this.time === 0) return "Core online";
    if (this.time === CGI_RELEASE.duration) return "CGI online";
    const pose = supportedCGIPose(this.time);
    if (this.direction < 0) return this.time > CGI_RELEASE.moduleStart ? "CGI / Returning" : "V / Returning";
    if (this.time < CGI_RELEASE.bodyEnd) return `V / ${pose.bodyStage}`;
    if (this.time < CGI_RELEASE.moduleStart) return "CGI / Pressure";
    return this.time < CGI_RELEASE.moduleEnd ? `CGI / ${pose.moduleStage}` : "CGI / Framing";
  }
}
function bindSupportedCGI(tower, sector) {
  const bodies = [];
  tower.traverse((object) => {
    if (object.userData.source_object === "V_LEFT") bodies.push(object);
  });
  const body = bodies[0];
  const module = tower.getObjectByName("CLOSED_cgi");
  if (bodies.length !== 1 || body.userData.mechanical_role || !module || sector.id !== "cgi") throw new Error("Expected the whole source V_LEFT and complete CGI collection, not split skins");
  tower.updateMatrixWorld(true);
  const bodyCarrier = new Group();
  bodyCarrier.name = "V_LEFT_WHOLE_DIAGONAL_ASSEMBLY";
  tower.add(bodyCarrier);
  bodyCarrier.attach(body);
  const restBody = bodyCarrier.position.clone(), restModule = module.position.clone();
  return { bodyCarrier, module, apply(pose) {
    bodyCarrier.position.copy(restBody).add(pose.bodyOffset);
    module.position.copy(restModule).add(pose.moduleOffset);
  } };
}
export {
  CGI_RELEASE,
  MECHANICAL_CUES,
  SupportedCGIMotion,
  bindSupportedCGI,
  frameCGIInspection,
  frameCGIRelease,
  supportedCGICamera,
  supportedCGIPose
};
