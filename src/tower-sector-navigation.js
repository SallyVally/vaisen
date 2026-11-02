import { Group, PerspectiveCamera, Vector3 } from "three";
import { CGI_RELEASE, MECHANICAL_CUES, SupportedCGIMotion, frameCGIInspection, supportedCGIPose, supportedCGICamera as supportedCamera } from "./tower-supported-mechanism.js";
import { PORTRAIT_BOUNDS } from "./tower-lookdev.js";
import { applyPresentationCamera, boxCorners } from "./tower-presentation.js";
const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const SECTOR_ORBIT_DURATION = 3.4;
const SECTOR_HANDOVER = Object.freeze({ retract: 1.8, orbit: 1.6, deploy: 2, parkedTime: CGI_RELEASE.cameraStart });
const SECTOR_CROSSOVER = Object.freeze({ retract: 2.6, orbit: 1.6, deploy: 3, parkedTime: 0 });
const sectorSide = (sector) => sector === "web" ? 3 : sector === "smart-light" ? 2 : sector === "music" ? 1 : 0;
const isRightSector = (id) => id === "smart-light" || id === "web";
const sectorLabel = (id) => id === "web" ? "Web" : id === "smart-light" ? "Smart light" : id === "music" ? "Music" : "CGI";
const sectorAtSide = (side) => ["cgi", "music", "smart-light", "web"][side];
const sectorFromHash = (hash) => ["#web", "#web-release", "#sites"].includes(hash) ? "web" : ["#smart-light", "#smart-light-release", "#light"].includes(hash) ? "smart-light" : hash === "#music-release" || hash === "#music" ? "music" : hash === "#cgi-release" || hash === "#cgi" ? "cgi" : "core";
class RedirectableMotion extends SupportedCGIMotion {
  constructor() {
    super();
    this.targetTime = 0;
    this.velocity = 0;
  }
  request(open, { immediate = false } = {}) {
    this.seek(open ? CGI_RELEASE.duration : 0);
    if (immediate) {
      this.time = this.targetTime;
      this.velocity = 0;
      this.direction = 0;
      this.dwell = 0;
      this.cues.length = 0;
    }
  }
  seek(time) {
    this.targetTime = Math.max(0, Math.min(CGI_RELEASE.duration, time));
    this.requestedOpen = this.targetTime === CGI_RELEASE.duration;
  }
  tick(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid mechanical animation step");
    let remaining = seconds;
    while (remaining > 1e-10) {
      const dt = Math.min(0.01, remaining);
      remaining -= dt;
      const distance = this.targetTime - this.time, acceleration = 3.5, maxSpeed = 1.2;
      const wanted = Math.sign(distance) * Math.min(maxSpeed, Math.sqrt(2 * acceleration * Math.abs(distance)));
      this.velocity += Math.max(-acceleration * dt, Math.min(acceleration * dt, wanted - this.velocity));
      const previous = this.time;
      let next = Math.max(0, Math.min(CGI_RELEASE.duration, previous + this.velocity * dt));
      if ((this.targetTime - previous) * (this.targetTime - next) < 0) {
        next = this.targetTime;
        this.velocity = 0;
      }
      if (next === 0 && this.velocity < 0 || next === CGI_RELEASE.duration && this.velocity > 0) this.velocity = 0;
      if (Math.abs(next - this.targetTime) < 1e-8 && Math.abs(this.velocity) < acceleration * dt) {
        next = this.targetTime;
        this.velocity = 0;
      }
      this.time = next;
      this.direction = Math.sign(this.velocity);
      const crossed = MECHANICAL_CUES.filter((cue) => next > previous ? previous < cue.time && next >= cue.time : previous > cue.time && next <= cue.time);
      if (next < previous) crossed.reverse();
      for (const cue of crossed) this.cues.push({ ...cue, direction: Math.sign(next - previous) });
    }
  }
  get busy() {
    return Math.abs(this.time - this.targetTime) > 1e-8 || Math.abs(this.velocity) > 1e-8;
  }
}
class TowerSectorNavigation {
  constructor({ orbitDuration = SECTOR_ORBIT_DURATION, handover = SECTOR_HANDOVER, crossover = SECTOR_CROSSOVER, easeTransfers = false, interruptible = false, overlapOrbit = false, parallelCrossWing = false } = {}) {
    this.orbitDuration = orbitDuration;
    this.handover = handover;
    this.crossover = crossover;
    this.easeTransfers = easeTransfers;
    this.interruptible = interruptible;
    this.overlapOrbit = overlapOrbit;
    this.parallelCrossWing = parallelCrossWing;
    this.ready = true;
    this.parkKey = "";
    this.parkTime = 0;
    this.motion = interruptible ? new RedirectableMotion() : new SupportedCGIMotion();
    this.active = "cgi";
    this.requested = "core";
    this.side = 0;
    this.route = null;
    this.transfer = null;
    this.cues = [];
  }
  request(sector, { immediate = false, ready = true } = {}) {
    if (!["core", "cgi", "music", "smart-light", "web"].includes(sector)) throw new Error("Unknown tower sector");
    this.requested = sector;
    this.ready = ready;
    if (immediate) {
      this.active = sector === "core" ? "cgi" : sector;
      this.side = sectorSide(sector);
      this.route = null;
      this.transfer = null;
      this.parkKey = "";
      this.motion.request(sector !== "core", { immediate: true });
      this.cues.length = 0;
    }
  }
  tick(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid tower navigation step");
    let remaining = seconds;
    while (remaining > 1e-10) {
      const step = Math.min(0.05, remaining);
      this.advance(step);
      remaining -= step;
    }
  }
  advance(seconds) {
    if (this.interruptible) {
      this.advanceResponsive(seconds);
      return;
    }
    if (this.transfer) {
      this.advanceTransfer(seconds);
      return;
    }
    if (this.route) {
      this.route.age = Math.min(this.orbitDuration, this.route.age + seconds);
      this.route.progress = ease(this.route.age / this.orbitDuration);
      this.side = this.route.from + (this.route.to - this.route.from) * this.route.progress;
      if (this.route.age === this.orbitDuration) {
        this.side = this.route.to;
        this.route = null;
      }
      return;
    }
    const wantedSide = sectorSide(this.requested);
    if (this.requested !== "core" && this.requested !== this.active && this.motion.time > 0 && this.motion.direction >= 0) {
      this.motion.request(true);
      if (this.motion.time === CGI_RELEASE.duration && !this.motion.busy) {
        const crossWing = isRightSector(this.active) !== isRightSector(this.requested);
        this.transfer = { to: this.requested, phase: "retract", age: 0, crossWing };
        this.advanceTransfer(seconds);
      } else this.tickMotion(seconds);
      return;
    }
    const open = this.requested !== "core" && this.requested === this.active && this.side === wantedSide;
    this.motion.request(open);
    if (this.motion.time !== 0 || this.motion.busy) {
      this.tickMotion(seconds);
      return;
    }
    if (this.side !== wantedSide) {
      this.route = { from: this.side, to: wantedSide, age: 0, progress: 0 };
      this.advance(seconds);
      return;
    }
    if (this.requested !== "core") {
      this.active = this.requested;
      this.motion.request(true);
      this.tickMotion(seconds);
    }
  }
  advanceResponsive(seconds) {
    const wantedSide = sectorSide(this.requested);
    if (this.route) {
      const route = this.route;
      if (route.parallel) {
        const parallel = route.parallel;
        this.motion.seek(this.requested === this.active ? CGI_RELEASE.duration : 0);
        this.tickMotion(seconds);
        parallel.motion.seek(this.requested === parallel.sector && this.ready ? CGI_RELEASE.duration : 0);
        parallel.motion.tick(seconds);
        parallel.motion.consumeCues();
      } else if (route.overlap) {
        this.motion.seek(route.parkedTime);
        this.tickMotion(seconds);
      }
      const end = wantedSide === route.from || wantedSide === route.to ? wantedSide : route.progress < 0.5 ? route.from : route.to;
      if (end === route.from) {
        [route.from, route.to] = [route.to, route.from];
        route.age = route.duration - route.age;
        route.progress = 1 - route.progress;
      }
      route.age = Math.min(route.duration, route.age + seconds);
      route.progress = ease(route.age / route.duration);
      this.side = route.from + (route.to - route.from) * route.progress;
      if (route.age === route.duration) {
        if (route.parallel) {
          const parallel = route.parallel;
          const back = route.to === parallel.fromSide;
          const clear = back ? !parallel.motion.busy && parallel.motion.time === 0 : !this.motion.busy && this.motion.time === 0;
          if (clear) {
            this.side = route.to;
            if (!back) {
              this.active = parallel.sector;
              Object.assign(this.motion, parallel.motion);
            }
            this.route = null;
            this.parkKey = "";
          }
        } else if (route.to === sectorSide(this.active) || !this.motion.busy) {
          this.side = route.to;
          this.active = sectorAtSide(route.to);
          this.route = null;
        }
      }
      return;
    }
    const different = this.requested !== "core" && this.requested !== this.active;
    const crossWing = different && isRightSector(this.active) !== isRightSector(this.requested);
    const key = `${this.active}/${this.requested}`;
    if (key !== this.parkKey) {
      this.parkKey = key;
      this.parkTime = different && !crossWing && this.motion.time >= CGI_RELEASE.cameraStart / 2 ? CGI_RELEASE.cameraStart : 0;
    }
    const park = this.parkTime;
    const target = this.requested === "core" ? 0 : different ? park : CGI_RELEASE.duration;
    this.motion.seek(target);
    this.tickMotion(seconds);
    if (this.parallelCrossWing && crossWing && this.ready && this.motion.velocity <= 0 && this.motion.time <= 7.2) {
      this.route = { from: this.side, to: wantedSide, age: 0, progress: 0, duration: this.crossover.orbit, handover: false, crossWing: true, parallel: { sector: this.requested, fromSide: this.side, motion: new RedirectableMotion() } };
      return;
    }
    const overlap = this.overlapOrbit && different && this.ready && this.motion.busy && this.motion.velocity <= 0 && this.motion.time >= park && this.motion.time <= park + (park > 0 ? 1.7 : 1.8);
    if (this.motion.busy && !overlap) return;
    if (this.requested === "core" && this.side === 0) return;
    if (!different && this.requested !== "core") return;
    if (!this.ready) return;
    const raised = park > 0;
    this.route = { from: this.side, to: wantedSide, age: 0, progress: 0, duration: raised ? this.handover.orbit : crossWing ? this.crossover.orbit : this.orbitDuration, handover: raised, crossWing, overlap, parkedTime: park };
  }
  advanceTransfer(seconds) {
    const transfer = this.transfer;
    const timing = transfer.crossWing ? this.crossover : this.handover;
    const duration = timing[transfer.phase];
    const step = Math.min(seconds, duration - transfer.age);
    transfer.age = Math.min(duration, transfer.age + step);
    const progress = transfer.age / duration, parked = timing.parkedTime;
    if (transfer.phase === "orbit") {
      this.route.age = transfer.age;
      this.route.progress = ease(progress);
      this.side = this.route.from + (this.route.to - this.route.from) * this.route.progress;
    } else {
      const returning = transfer.phase === "retract";
      const cameraProgress = this.easeTransfers ? ease(progress) : progress;
      const target = returning ? CGI_RELEASE.duration - (CGI_RELEASE.duration - parked) * cameraProgress : parked + (CGI_RELEASE.duration - parked) * cameraProgress;
      this.motion.request(!returning);
      this.tickMotion(Math.abs(target - this.motion.time));
    }
    if (transfer.age === duration) {
      transfer.age = 0;
      if (transfer.phase === "retract") {
        this.motion.time = parked;
        this.motion.direction = 0;
        transfer.phase = "orbit";
        this.route = { from: this.side, to: sectorSide(transfer.to), age: 0, progress: 0, handover: true, crossWing: transfer.crossWing };
      } else if (transfer.phase === "orbit") {
        this.side = this.route.to;
        this.route = null;
        this.active = transfer.to;
        transfer.phase = "deploy";
      } else this.transfer = null;
    }
    if (seconds - step > 1e-10) this.advance(seconds - step);
  }
  tickMotion(seconds) {
    this.motion.tick(seconds);
    this.cues.push(...this.motion.consumeCues().map((cue) => ({ ...cue, sector: this.active })));
  }
  consumeCues() {
    return this.cues.splice(0);
  }
  get busy() {
    return Boolean(this.transfer) || Boolean(this.route) || this.motion.busy || this.side !== sectorSide(this.requested) || (this.requested === "core" ? this.motion.time !== 0 : this.active !== this.requested || this.motion.time !== CGI_RELEASE.duration);
  }
  get status() {
    if (this.route) return this.route.to === 3 ? "Web / Approaching" : this.route.to === 2 ? "Smart light / Approaching" : this.route.to === 1 ? "Music / Approaching" : this.route.handover ? "CGI / Approaching" : "Core / Returning";
    if (this.motion.time === 0) return this.requested === "core" && this.side === 0 ? "Core online" : "Tower / Interlock";
    const status = this.motion.status.replaceAll("CGI", sectorLabel(this.active));
    return isRightSector(this.active) ? status.replace("V /", "V RIGHT /") : status;
  }
}
function mirrorPortraitCamera(pose) {
  const position = pose.position.clone(), target = pose.target.clone();
  position.x *= -1;
  target.x *= -1;
  return { ...pose, position, target };
}
function mirrorSmartCamera(pose) {
  const mirrored = mirrorPortraitCamera(pose);
  mirrored.position.z *= -1;
  mirrored.target.z *= -1;
  return mirrored;
}
function mirrorWebCamera(pose) {
  const position = pose.position.clone(), target = pose.target.clone();
  position.z *= -1;
  target.z *= -1;
  return { ...pose, position, target };
}
function frameWebInspection(sector, width, height, header, footer) {
  const reflected = { ...sector, glassCorners: sector.glassCorners.map(([x, y, z]) => [x, y, -z]) };
  return mirrorWebCamera(frameCGIInspection(reflected, width, height, header, footer));
}
function frameSmartInspection(sector, width, height, header, footer) {
  const reflected = { ...sector, glassCorners: sector.glassCorners.map(([x, y, z]) => [-x, y, -z]) };
  return mirrorSmartCamera(frameCGIInspection(reflected, width, height, header, footer));
}
function sectorMechanicalPose(id, time) {
  const pose = supportedCGIPose(time);
  if (isRightSector(id)) {
    pose.bodyOffset.z *= -1;
    pose.moduleOffset.z *= -1;
  }
  return pose;
}
function sectorMechanicalCamera(id, overview, inspection, time, release) {
  if (id === "web") return mirrorWebCamera(supportedCamera(mirrorWebCamera(overview), mirrorWebCamera(inspection), time, mirrorWebCamera(release)));
  if (id !== "smart-light") return supportedCamera(overview, inspection, time, release);
  return mirrorSmartCamera(supportedCamera(mirrorSmartCamera(overview), mirrorSmartCamera(inspection), time, mirrorSmartCamera(release)));
}
function frameMusicInspection(sector, width, height, header, footer) {
  const reflected = { ...sector, glassCorners: sector.glassCorners.map(([x, y, z]) => [-x, y, z]) };
  return mirrorPortraitCamera(frameCGIInspection(reflected, width, height, header, footer));
}
function orbitPortraitCamera(front, rear, side, aspect, bounds = PORTRAIT_BOUNDS, { crop = false } = {}) {
  if (side <= 0) return front;
  if (side >= 1) return rear;
  const target = front.target.clone().lerp(rear.target, side);
  const a = front.position.clone().sub(front.target), b = rear.position.clone().sub(rear.target);
  const start = Math.atan2(a.x, a.z), end = Math.atan2(b.x, b.z);
  const angle = start + Math.atan2(Math.sin(end - start), Math.cos(end - start)) * side;
  const wave = Math.sin(Math.PI * side) ** 2;
  const radius = (Math.hypot(a.x, a.z) * (1 - side) + Math.hypot(b.x, b.z) * side) * (1 + (crop ? 0.02 : 0.09) * wave);
  const y = front.position.y * (1 - side) + rear.position.y * side + (crop ? 0.25 : 2) * wave;
  const base = { target, fov: front.fov * (1 - side) + rear.fov * side, shiftX: front.shiftX * (1 - side) + rear.shiftX * side, shiftY: front.shiftY * (1 - side) + rear.shiftY * side, rect: front.rect };
  const pose = (distance) => ({ ...base, position: new Vector3(target.x + Math.sin(angle) * distance, y, target.z + Math.cos(angle) * distance) });
  if (crop) return pose(radius);
  const camera = new PerspectiveCamera(base.fov, aspect, 0.1, 180), corners = boxCorners(bounds);
  const fits = (distance) => {
    applyPresentationCamera(camera, pose(distance));
    return corners.every((point) => {
      const p = point.clone().project(camera), x = (p.x + 1) / 2, yy = (1 - p.y) / 2;
      return p.z < 1 && x > base.rect.left + 0.012 && x < base.rect.right - 0.012 && yy > base.rect.top + 0.012 && yy < base.rect.bottom - 0.012;
    });
  };
  if (fits(radius)) return pose(radius);
  let low = radius, high = Math.max(radius, 140);
  for (let index = 0; index < 18; index++) {
    const middle = (low + high) / 2;
    if (fits(middle)) high = middle;
    else low = middle;
  }
  return pose(high);
}
function bindSupportedMusic(tower, cgiRig, sector) {
  const module = tower.getObjectByName("CLOSED_music");
  if (sector.id !== "music" || sector.bodyNode !== "V_LEFT" || !module || !cgiRig.bodyCarrier) throw new Error("Expected music and CGI on the same complete V_LEFT assembly");
  const restBody = cgiRig.bodyCarrier.position.clone(), restModule = module.position.clone();
  return { bodyCarrier: cgiRig.bodyCarrier, module, apply(pose) {
    cgiRig.bodyCarrier.position.copy(restBody).add(pose.bodyOffset);
    module.position.copy(restModule).add(pose.moduleOffset);
  } };
}
function bindRightSector(tower, sector) {
  const bodies = [];
  tower.traverse((obj) => {
    if (obj.userData.source_object === "V_RIGHT") bodies.push(obj);
  });
  const module = tower.getObjectByName("CLOSED_" + sector.id);
  if (bodies.length !== 1 || sector.bodyNode !== "V_RIGHT" || !module) throw new Error("Expected the whole V_RIGHT and complete right-wing sector");
  let carrier = tower.getObjectByName("V_RIGHT_WHOLE_DIAGONAL_ASSEMBLY");
  if (!carrier) {
    carrier = new Group();
    carrier.name = "V_RIGHT_WHOLE_DIAGONAL_ASSEMBLY";
    tower.add(carrier);
    tower.updateMatrixWorld(true);
    carrier.attach(bodies[0]);
    carrier.userData.closedPosition = carrier.position.clone();
  }
  const restBody = carrier.userData.closedPosition.clone(), restModule = module.position.clone();
  return { bodyCarrier: carrier, module, apply(pose) {
    carrier.position.copy(restBody).add(pose.bodyOffset);
    module.position.copy(restModule).add(pose.moduleOffset);
  } };
}
function bindSupportedSmartLight(tower, sector) {
  if (sector.id !== "smart-light") throw new Error("Expected Smart Light");
  return bindRightSector(tower, sector);
}
function bindSupportedWeb(tower, sector) {
  if (sector.id !== "web") throw new Error("Expected Web");
  return bindRightSector(tower, sector);
}
function applySectorMechanics(rigs, active, pose) {
  const rest = supportedCGIPose(0);
  for (const [id, rig] of Object.entries(rigs)) if (id !== active) rig.apply(rest);
  rigs[active].apply(pose);
}
function applyParallelSectorMechanics(rigs, active, pose, incoming, incomingPose) {
  if (isRightSector(active) === isRightSector(incoming)) throw new Error("Parallel sectors must use independent V halves");
  const rest = supportedCGIPose(0);
  for (const [id, rig] of Object.entries(rigs)) if (id !== active && id !== incoming) rig.apply(rest);
  rigs[active].apply(pose);
  rigs[incoming].apply(incomingPose);
}
function reflectMechanicalSteam(fx, oppositeWing = false, reflectX = true) {
  for (const puff of fx.puffs) {
    if (reflectX) puff.x *= -1;
    if (oppositeWing) puff.z *= -1;
  }
  for (const axis of fx.axes) {
    if (reflectX) axis.x *= -1;
    if (oppositeWing) axis.z *= -1;
  }
}
export {
  RedirectableMotion,
  SECTOR_CROSSOVER,
  SECTOR_HANDOVER,
  SECTOR_ORBIT_DURATION,
  TowerSectorNavigation,
  applyParallelSectorMechanics,
  applySectorMechanics,
  bindSupportedMusic,
  bindSupportedSmartLight,
  bindSupportedWeb,
  frameMusicInspection,
  frameSmartInspection,
  frameWebInspection,
  isRightSector,
  mirrorPortraitCamera,
  mirrorSmartCamera,
  mirrorWebCamera,
  orbitPortraitCamera,
  reflectMechanicalSteam,
  sectorFromHash,
  sectorMechanicalCamera,
  sectorMechanicalPose,
  sectorSide
};
