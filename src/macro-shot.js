import { MathUtils, Vector3, Quaternion, Matrix4 } from "three";
const DURATION = 18;
const smooth = (a, b, x) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return MathUtils.clamp(t * t * t * (t * (t * 6 - 15) + 10), 0, 1);
};
const up = new Vector3(0, 1, 0);
const rotation = new Quaternion();
const matrix = new Matrix4();
function sweepLightAt(seconds) {
  const travel = smooth(2.2, 14.8, seconds);
  const y = MathUtils.lerp(10.15, 8.4, travel);
  return {
    x: MathUtils.lerp(2.7, 3.35, travel),
    y,
    z: MathUtils.lerp(2.2, 3.1, travel),
    targetY: y - 0.05,
    targetZ: 0.3144 * y + 1.8464,
    weight: smooth(1, 3.4, seconds) * (1 - smooth(13, 16.8, seconds))
  };
}
function shotAt(seconds, farPose) {
  const t = MathUtils.clamp(seconds, 0, DURATION);
  const travel = smooth(0, 8, t);
  const y = MathUtils.lerp(10.65, 9.7, travel);
  const surface = new Vector3(0.9, y, 0.3144 * y + 1.9114 - 0.065);
  const direction = new Vector3(MathUtils.lerp(1.25, 0.9, travel), MathUtils.lerp(0.22, -0.08, travel), 1.52).normalize();
  const distance = MathUtils.lerp(0.68, 0.94, smooth(0, 6, t));
  const closePosition = surface.clone().addScaledVector(direction, distance);
  const pull = smooth(6, 18, t);
  const farDistance = farPose.position.distanceTo(farPose.target);
  const dolly = Math.exp(MathUtils.lerp(Math.log(distance), Math.log(farDistance), pull));
  const aim = smooth(8, 18, t);
  const target = surface.clone().lerp(farPose.target, aim);
  const farDirection = farPose.position.clone().sub(farPose.target).normalize();
  const lookDirection = direction.clone().lerp(farDirection, smooth(7, 18, t)).normalize();
  const position = target.clone().addScaledVector(lookDirection, dolly);
  if (t < 6) position.copy(closePosition);
  const fov = MathUtils.lerp(29, farPose.fov, smooth(7, 18, t));
  const shiftX = (farPose.shiftX ?? 0) * smooth(10, 18, t);
  const shiftY = (farPose.shiftY ?? 0) * smooth(10, 18, t);
  matrix.lookAt(position, target, up);
  rotation.setFromRotationMatrix(matrix);
  rotation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(MathUtils.lerp(-15, -3, smooth(0, 8, t))) * (1 - smooth(8, 14, t))));
  return { position, target, quaternion: rotation.clone(), fov, shiftX, shiftY, detail: 1 - smooth(13.4, 17.6, t), light: 1 - smooth(7, 12.4, t), world: smooth(4.2, 10.8, t), key: smooth(5.2, 12.5, t), opening: smooth(0.6, 1.6, t), reveal: smooth(15.4, 18, t) };
}
function applyShot(camera, pose) {
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.fov = pose.fov;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] -= pose.shiftX;
  camera.projectionMatrix.elements[9] -= pose.shiftY;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld();
}
export {
  DURATION,
  applyShot,
  shotAt,
  smooth,
  sweepLightAt
};
