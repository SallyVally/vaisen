import { Box3, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { frameTower, smooth } from "./tower-choreography.js";
const UP = new Vector3(0, 1, 0);
const STAGE_NORMAL = new Vector3(1, 0, 1.12).normalize();
const STAGE_RIGHT = UP.clone().cross(STAGE_NORMAL).normalize();
const STAGE_CENTER = STAGE_RIGHT.clone().multiplyScalar(24).addScaledVector(STAGE_NORMAL, 11);
const PRESENTATION_CLEARING = { x: STAGE_CENTER.x, z: STAGE_CENTER.z, radius: 5 };
const CLEARANCE = 11;
function sourceBounds(sector) {
  return new Box3(new Vector3(...sector.sourceBounds.min), new Vector3(...sector.sourceBounds.max));
}
function inspectionBounds(sector) {
  const bounds = new Box3().setFromPoints(sector.rooms.flatMap((room) => room.portalCorners.map((point) => new Vector3(...point))));
  bounds.min.x = sector.sourceBounds.min[0];
  bounds.max.x = sector.sourceBounds.max[0];
  return bounds.expandByVector(new Vector3(0.04, 0.16, 0.12));
}
function travelFocusBounds(sector, progress) {
  const bounds = sourceBounds(sector), focus = inspectionBounds(sector);
  const t = smooth((progress - 0.72) / 0.28);
  bounds.min.lerp(focus.min, t);
  bounds.max.lerp(focus.max, t);
  return bounds;
}
function detachedPose(sector, progress) {
  const center = sourceBounds(sector).getCenter(new Vector3());
  const normal = new Vector3(...sector.outward);
  const extraction = smooth((progress - 0.07) / 0.35);
  const transit = smooth((progress - 0.42) / 0.58);
  const turn = smooth((progress - 0.46) / 0.44);
  const clear = center.clone().addScaledVector(normal, CLEARANCE);
  const destination = STAGE_CENTER.clone();
  destination.y = center.y + 0.12;
  const position = center.clone().lerp(clear, extraction);
  if (progress > 0.42) {
    const startAngle = Math.atan2(clear.x, clear.z);
    const endAngle = Math.atan2(destination.x, destination.z);
    const delta = Math.atan2(Math.sin(endAngle - startAngle), Math.cos(endAngle - startAngle));
    const angle = startAngle + delta * transit;
    const radius = MathUtils.lerp(Math.hypot(clear.x, clear.z), Math.hypot(destination.x, destination.z), transit);
    position.set(Math.sin(angle) * radius, MathUtils.lerp(clear.y, destination.y, transit), Math.cos(angle) * radius);
  }
  position.y += Math.sin(Math.PI * smooth((progress - 0.12) / 0.88)) * 2.8;
  const sourceHeading = Math.atan2(normal.x, normal.z);
  const stageHeading = Math.atan2(STAGE_NORMAL.x, STAGE_NORMAL.z);
  const turnAngle = Math.atan2(Math.sin(stageHeading - sourceHeading), Math.cos(stageHeading - sourceHeading));
  const rotation = new Quaternion().setFromAxisAngle(UP, turnAngle * turn);
  const matrix = new Matrix4().compose(position, rotation, new Vector3(1, 1, 1)).multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  return { center, position, rotation, matrix, extraction, transit, steam: smooth((progress - 0.03) / 0.1) * (1 - smooth((progress - 0.28) / 0.22)) };
}
function presentationRect(width, height, { headerBottom = 76, footerTop = height - 100, info = null } = {}) {
  const landscape = width >= 800 || width / height >= 1.2;
  const top = Math.min(0.3, (headerBottom + 14) / height);
  const bottom = Math.max(top + 0.2, (footerTop - 42) / height);
  if (landscape) {
    return { left: Math.max(0.48, ((info?.right ?? width * 0.39) + 32) / width), right: 0.96, top, bottom };
  }
  return { left: 0.08, right: 0.92, top, bottom: Math.max(top + 0.2, Math.min(bottom, ((info?.top ?? height * 0.63) - 18) / height)) };
}
function framePresentation(sector, aspect, rect) {
  const bounds = inspectionBounds(sector).applyMatrix4(detachedPose(sector, 1).matrix);
  const target = bounds.getCenter(new Vector3());
  const fov = 35;
  const tangent = Math.tan(MathUtils.degToRad(fov / 2));
  const halfWidth = (rect.right - rect.left) * 0.9;
  const halfHeight = (rect.bottom - rect.top) * 0.9;
  let distance = 2;
  for (const corner of boxCorners(bounds)) {
    const relative = corner.sub(target);
    const depth = relative.dot(STAGE_NORMAL);
    distance = Math.max(distance, depth + Math.abs(relative.dot(STAGE_RIGHT)) / (tangent * aspect * halfWidth), depth + Math.abs(relative.y) / (tangent * halfHeight));
  }
  return { position: target.clone().addScaledVector(STAGE_NORMAL, distance), target, fov, shiftX: rect.left + rect.right - 1, shiftY: 1 - rect.top - rect.bottom, bounds };
}
function boxCorners(bounds) {
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    corners.push(new Vector3(x, y, z));
  }
  return corners;
}
function frameCore(sectors, aspect, padding) {
  return { ...frameTower(sectors, "core", aspect, padding), shiftX: 0, shiftY: 0 };
}
function blendPresentationCamera(from, to, progress, opening = false) {
  const t = smooth(opening ? (progress - 0.16) / 0.84 : progress);
  return { position: from.position.clone().lerp(to.position, t), target: from.target.clone().lerp(to.target, t), fov: MathUtils.lerp(from.fov, to.fov, t), shiftX: MathUtils.lerp(from.shiftX ?? 0, to.shiftX ?? 0, t), shiftY: MathUtils.lerp(from.shiftY ?? 0, to.shiftY ?? 0, t) };
}
function followDetachedCamera(move, progress, mechanismProgress) {
  if (!move.sector) return blendPresentationCamera(move.from, move.to, progress);
  const assembly = detachedPose(move.sector, mechanismProgress);
  const position = assembly.position.clone();
  let pose;
  if (move.kind === "opening") {
    const delta = position.sub(detachedPose(move.sector, 1).position);
    const movingTarget = { ...move.to, position: move.to.position.clone().add(delta), target: move.to.target.clone().add(delta) };
    pose = blendPresentationCamera(move.from, movingTarget, progress, true);
  } else {
    const delta = position.sub(move.anchor);
    const movingStart = { ...move.from, position: move.from.position.clone().add(delta), target: move.from.target.clone().add(delta) };
    pose = blendPresentationCamera(movingStart, move.to, progress);
  }
  return move.aspect ? containDuringTravel(pose, travelFocusBounds(move.sector, mechanismProgress).applyMatrix4(assembly.matrix), move.aspect, move.safeRect) : pose;
}
function containDuringTravel(pose, bounds, aspect, rect = { left: 0.04, right: 0.96, top: 0.12, bottom: 0.86 }) {
  const normal = pose.position.clone().sub(pose.target).normalize();
  const right = UP.clone().cross(normal).normalize(), up = normal.clone().cross(right).normalize();
  const tangent = Math.tan(MathUtils.degToRad(pose.fov / 2));
  let distance = pose.position.distanceTo(pose.target);
  for (const corner of boxCorners(bounds)) {
    const relative = corner.sub(pose.target), x = relative.dot(right), y = relative.dot(up);
    const marginX = x >= 0 ? rect.right * 2 - 1 - pose.shiftX : pose.shiftX - (rect.left * 2 - 1);
    const marginY = y >= 0 ? 1 - rect.top * 2 - pose.shiftY : pose.shiftY - (1 - rect.bottom * 2);
    const depth = relative.dot(normal);
    distance = Math.max(distance, depth + Math.abs(x) / (tangent * aspect * marginX * 0.97), depth + Math.abs(y) / (tangent * marginY * 0.97));
  }
  return { ...pose, position: pose.target.clone().addScaledVector(normal, distance) };
}
function pointerCamera(pose, pointer) {
  const x = MathUtils.clamp(pointer.x, -1, 1), y = MathUtils.clamp(pointer.y, -1, 1);
  const normal = pose.position.clone().sub(pose.target).normalize();
  const right = UP.clone().cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  return { ...pose, position: pose.position.clone().addScaledVector(right, x * 0.1).addScaledVector(up, y * 0.055), target: pose.target.clone().addScaledVector(right, x * 0.015).addScaledVector(up, y * 8e-3) };
}
function applyPresentationCamera(camera, pose) {
  camera.position.copy(pose.position);
  camera.fov = pose.fov;
  camera.lookAt(pose.target);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] -= pose.shiftX ?? 0;
  camera.projectionMatrix.elements[9] -= pose.shiftY ?? 0;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld();
}
const SECTOR_STORIES = { cgi: { number: "01", title: "CGI", description: "Art direction, product imagery and cinematic motion.", floors: ["Render infrastructure", "Production studio", "CGI stage"] }, music: { number: "02", title: "Trailer Music", description: "Composition and sound design for cinematic stories.", floors: ["Sound library", "Composition studio", "Scoring stage"] }, web: { number: "03", title: "Websites", description: "Digital design, development and real-time experiences.", floors: ["Design systems", "Product studio", "Interactive experiences"] }, "smart-light": { number: "04", title: "Smart Light", description: "Lighting systems shaped around people, spaces and atmosphere.", floors: ["Ambient light", "Meeting space", "Focus studio"] } };
export {
  PRESENTATION_CLEARING,
  SECTOR_STORIES,
  STAGE_NORMAL,
  applyPresentationCamera,
  blendPresentationCamera,
  boxCorners,
  detachedPose,
  followDetachedCamera,
  frameCore,
  framePresentation,
  inspectionBounds,
  pointerCamera,
  presentationRect,
  sourceBounds,
  travelFocusBounds
};
