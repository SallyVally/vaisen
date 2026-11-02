import { PerspectiveCamera, Vector3 } from "three";
import { PORTRAIT_BOUNDS } from "./tower-lookdev.js";
import { applyPresentationCamera, boxCorners } from "./tower-presentation.js";
function frameMobileTower(width, height, footer = 67) {
  const rect = { left: -0.22, right: 1.22, top: 0.08, bottom: Math.max(0.78, 1 - (Math.min(footer, 85) + 16) / height) };
  const target = PORTRAIT_BOUNDS.getCenter(new Vector3());
  const direction = new Vector3(1, 0, 1.25).normalize();
  const camera = new PerspectiveCamera(44, width / height, 0.1, 180);
  const at = (distance) => ({ position: target.clone().addScaledVector(direction, distance).setY(1.1), target, fov: 44, shiftX: 0, shiftY: 1 - rect.top - rect.bottom, rect });
  const corners = boxCorners(PORTRAIT_BOUNDS);
  let low = 10, high = 100;
  for (let i = 0; i < 26; i++) {
    const distance = (low + high) / 2;
    applyPresentationCamera(camera, at(distance));
    const fits = corners.every((point) => {
      const p = point.clone().project(camera), y = (1 - p.y) / 2;
      return p.z > -1 && p.z < 1 && y > rect.top + 0.012 && y < rect.bottom - 0.012;
    });
    if (fits) high = distance;
    else low = distance;
  }
  return at(high);
}
export {
  frameMobileTower
};
