import { Box3, MathUtils, Vector3 } from "three";
const OPEN_DURATION = 3.8;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
function rigPose(sector, progress) {
  const unlock = smooth(progress / 0.16);
  const clearance = smooth((progress - 0.12) / 0.36);
  const extension = smooth((progress - 0.57) / 0.43);
  return { extension, moduleOffset: new Vector3(...sector.outward).multiplyScalar(extension * sector.moduleTravel), skinOffset: new Vector3(sector.skinTravel[0] * unlock, sector.skinTravel[1] * clearance, sector.skinTravel[2] * clearance), steam: smooth((progress - 0.09) / 0.1) * (1 - smooth((progress - 0.38) / 0.3)) };
}
function sectorBounds(sector, extended = true) {
  const offset = new Vector3(...sector.outward).multiplyScalar(extended ? sector.moduleTravel : 0);
  const box = new Box3().setFromPoints(sector.rooms.flatMap((room) => room.portalCorners.map((p) => new Vector3(...p).add(offset))));
  box.expandByVector(new Vector3(0.45, 0.12, 0.12));
  return box;
}
function fits(bounds, position, target, aspect, fov, padding) {
  const direction = position.clone().sub(target).normalize();
  const right = new Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right).normalize();
  const tangent = Math.tan(MathUtils.degToRad(fov / 2));
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const v = new Vector3(x, y, z).sub(position);
    const depth = -v.dot(direction);
    if (depth <= 0.1 || Math.abs(v.dot(right)) * padding > depth * tangent * aspect || Math.abs(v.dot(up)) * padding > depth * tangent) return false;
  }
  return true;
}
function frameTower(sectors, id, aspect, minimumPadding = 1) {
  const sector = sectors.find((entry) => entry.id === id);
  const fov = sector ? 37 : 42;
  const bounds = sector ? sectorBounds(sector) : new Box3(new Vector3(-1, -0.3, -6.2), new Vector3(1, 13.6, 6.2));
  const direction = sector ? new Vector3(sector.outward[0], 0.055, bounds.getCenter(new Vector3()).z > 0 ? 0.19 : -0.19).normalize() : new Vector3(1, 0, 1.12).normalize();
  return fitTowerBounds(bounds, direction, aspect, { fov, padding: Math.max(minimumPadding, aspect < 0.85 ? 1.62 : 1.32), lowEyeHeight: sector ? null : 1.35 });
}
function fitTowerBounds(bounds, viewDirection, aspect, { fov = 42, padding = 1.32, lowEyeHeight = null } = {}) {
  const target = bounds.getCenter(new Vector3());
  const direction = viewDirection.clone().normalize();
  let low = 2;
  let high = 140;
  let position;
  for (let step = 0; step < 24; step++) {
    const distance = (low + high) / 2;
    position = target.clone().addScaledVector(direction, distance);
    if (lowEyeHeight !== null) position.y = lowEyeHeight;
    if (fits(bounds, position, target, Math.max(0.15, aspect), fov, padding)) high = distance;
    else low = distance;
  }
  position = target.clone().addScaledVector(direction, high);
  if (lowEyeHeight !== null) position.y = lowEyeHeight;
  return { position, target, fov, bounds };
}
function arcCamera(from, to, progress) {
  const t = smooth(progress);
  const startAngle = Math.atan2(from.position.x, from.position.z);
  const endAngle = Math.atan2(to.position.x, to.position.z);
  const delta = Math.atan2(Math.sin(endAngle - startAngle), Math.cos(endAngle - startAngle));
  const startRadius = Math.hypot(from.position.x, from.position.z);
  const endRadius = Math.hypot(to.position.x, to.position.z);
  const radius = MathUtils.lerp(startRadius, endRadius, t) + Math.sin(Math.PI * t) * 2;
  const angle = startAngle + delta * t;
  return { position: new Vector3(Math.sin(angle) * radius, MathUtils.lerp(from.position.y, to.position.y, t), Math.cos(angle) * radius), target: from.target.clone().lerp(to.target, t), fov: MathUtils.lerp(from.fov, to.fov, t) };
}
export {
  OPEN_DURATION,
  arcCamera,
  clamp01,
  fitTowerBounds,
  frameTower,
  rigPose,
  sectorBounds,
  smooth
};
