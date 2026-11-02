import { assetUrl } from "./asset-paths.js";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createPortraitFoundation, framePortrait, PORTRAIT_BOUNDS } from "./tower-lookdev.js";
import { applyPresentationCamera, boxCorners } from "./tower-presentation.js";
import { CGI_RELEASE } from "./tower-supported-mechanism.js";
const A2_CARDS = Object.freeze([{ position: [13, 20, 8], size: [3.4, 16], color: [5.2, 5.6, 6] }, { position: [-7, 14, -9], size: [2.4, 15], color: [4.5, 4.8, 5.1] }, { position: [5, 9, 1], size: [0.65, 11], color: [2.2, 2.5, 2.8] }]);
function applyA2Materials(materials, { mobile = false } = {}) {
  materials.body.color.setRGB(0.34, 0.38, 0.42);
  materials.body.roughness = 0.56;
  materials.body.normalScale.set(0.085, 0.085);
  materials.casing.color.setRGB(0.045, 0.055, 0.067);
  materials.casing.roughness = 0.8;
  materials.casing.normalScale.set(0.1, 0.1);
  materials.stone.color.setRGB(0.011, 0.013, 0.015);
  materials.stone.roughness = mobile ? 0.94 : 0.86;
  materials.stone.metalness = 0;
  materials.stone.normalScale.set(0.12, 0.12);
  return materials;
}
async function createA2Landscape(materials, { loader = new GLTFLoader() } = {}) {
  const group = createPortraitFoundation(materials);
  const shore = (await loader.loadAsync(assetUrl("/art-direction/a2-shore-v01.glb"))).scene;
  shore.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = materials.stone;
      obj.castShadow = false;
      obj.receiveShadow = true;
    }
  });
  group.add(shore);
  group.userData.artDirection = "A2";
  return group;
}
function configureA2Lighting(rig) {
  const settings = { PORTRAIT_SCULPTING_KEY: { position: [13, 20, 8], target: [0, 7, 0], intensity: 5200, angle: 0.42, penumbra: 0.85 }, PORTRAIT_REAR_KEY: { position: [-7, 14, -9], target: [0, 7, 0], intensity: 3400, angle: 0.44, penumbra: 0.9 }, PORTRAIT_EDGE_RIM: { position: [-6, 12, -9], target: [0, 7, 0], intensity: 0.8 }, PORTRAIT_FOUNDATION_GRAZE: { position: [4, 2, 9], target: [0, 0.1, 0], intensity: 4, width: 7, height: 0.5 }, PORTRAIT_CORE_AREA: { position: [5, 9, 1], target: [0, 6, 0], intensity: 10, width: 0.65, height: 11 }, PORTRAIT_CORE_GLOW: { position: [0.98, 2, 0], intensity: 3 } };
  for (const [name, values] of Object.entries(settings)) {
    const light = rig.getObjectByName(name);
    for (const key of ["intensity", "angle", "penumbra", "width", "height"]) if (values[key] !== void 0) light[key] = values[key];
    light.position.fromArray(values.position);
    if (values.target) {
      if (light.target) light.target.position.fromArray(values.target);
      else light.lookAt(...values.target);
    }
    light.userData.a2Intensity = light.intensity;
  }
  return rig;
}
function updateA2Lighting(scene, progress) {
  progress = Math.max(0, Math.min(1, progress));
  for (const name of ["PORTRAIT_SCULPTING_KEY", "PORTRAIT_CORE_AREA"]) {
    const light = scene.getObjectByName(name);
    light.intensity = light.userData.a2Intensity * (1 - 0.55 * progress);
  }
  scene.getObjectByName("PORTRAIT_CORE_AREA").position.x = 5 - 0.8 * progress;
}
function frameA2(width, height, header = 88, footer = 100, bounds = PORTRAIT_BOUNDS) {
  if (width / height <= 1.15) return framePortrait(width, height, header, footer, bounds);
  const aspect = width / height;
  const rect = { left: 0.38, right: 0.91, top: (header + 16) / height, bottom: 1 - (footer + 28) / height };
  const target = bounds.getCenter(new Vector3());
  target.x = 0;
  target.z = 0;
  target.y -= 0.29;
  const direction = new Vector3(32, 0, 23).normalize();
  const fov = 2 * Math.atan(36 / (2 * 37 * aspect)) * 180 / Math.PI;
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 180);
  const poseAt = (distance) => {
    const position = direction.clone().multiplyScalar(distance);
    position.y = 1.55;
    return { position, target, fov, shiftX: 0.28, shiftY: -0.03, rect };
  };
  let low = 10, high = 180;
  for (let i = 0; i < 26; i++) {
    const distance = (low + high) / 2;
    applyPresentationCamera(camera, poseAt(distance));
    const fits = boxCorners(bounds).every((corner) => {
      const p = corner.project(camera), x = (p.x + 1) / 2, y = (1 - p.y) / 2;
      return x > rect.left + 0.012 && x < rect.right - 0.012 && y > rect.top + 0.012 && y < rect.bottom - 0.012;
    });
    if (fits) high = distance;
    else low = distance;
  }
  return poseAt(high);
}
function frameA2Release(width, height, header, footer) {
  const bounds = new Box3().copy(PORTRAIT_BOUNDS).union(PORTRAIT_BOUNDS.clone().translate(new Vector3(...CGI_RELEASE.bodyTravel)));
  return frameA2(width, height, header, footer, bounds);
}
export {
  A2_CARDS,
  applyA2Materials,
  configureA2Lighting,
  createA2Landscape,
  frameA2,
  frameA2Release,
  updateA2Lighting
};
