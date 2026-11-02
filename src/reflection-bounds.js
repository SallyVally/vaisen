import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from "three";
const clipDistances = [(p) => p.w + p.x, (p) => p.w - p.x, (p) => p.w + p.y, (p) => p.w - p.y, (p) => p.w + p.z, (p) => p.w - p.z];
function clippedPlanePolygon(surface, camera) {
  const mvp = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(surface.matrixWorld);
  const positions = surface.geometry.attributes.position;
  let polygon = [0, 1, 3, 2].map((i) => {
    const local = new Vector4(positions.getX(i), positions.getY(i), positions.getZ(i), 1);
    return { local, clip: local.clone().applyMatrix4(mvp) };
  });
  for (const distance of clipDistances) {
    const next = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a.clip), db = distance(b.clip);
      if (da >= 0) next.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        next.push({ local: a.local.clone().lerp(b.local, t), clip: a.clip.clone().lerp(b.clip, t) });
      }
    }
    polygon = next;
    if (!polygon.length) break;
  }
  return polygon;
}
function reflectionTextureMatrix(surface, camera) {
  const origin = new Vector3().setFromMatrixPosition(surface.matrixWorld), eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const rotation = new Matrix4().extractRotation(surface.matrixWorld), normal = new Vector3(0, 0, 1).applyMatrix4(rotation);
  const view = origin.clone().sub(eye);
  if (view.dot(normal) > 0) return null;
  const reflected = new PerspectiveCamera();
  reflected.position.copy(view.reflect(normal).negate().add(origin));
  rotation.extractRotation(camera.matrixWorld);
  const look = new Vector3(0, 0, -1).applyMatrix4(rotation).add(eye);
  const target = origin.clone().sub(look).reflect(normal).negate().add(origin);
  reflected.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
  reflected.lookAt(target);
  reflected.updateMatrixWorld();
  reflected.projectionMatrix.copy(camera.projectionMatrix);
  return new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(reflected.projectionMatrix).multiply(reflected.matrixWorldInverse).multiply(surface.matrixWorld);
}
function reflectionScissor(surface, camera, width, height, padding = 8) {
  const polygon = clippedPlanePolygon(surface, camera), matrix = reflectionTextureMatrix(surface, camera);
  if (!polygon.length || !matrix) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const vertex of polygon) {
    const p = vertex.local.clone().applyMatrix4(matrix);
    if (p.w <= 1e-8 || !Number.isFinite(p.x + p.y + p.w)) return new Vector4(0, 0, width, height);
    const x = p.x / p.w, y = p.y / p.w;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const left = Math.max(0, Math.floor(minX * width) - padding), bottom = Math.max(0, Math.floor(minY * height) - padding);
  const right = Math.min(width, Math.ceil(maxX * width) + padding), top = Math.min(height, Math.ceil(maxY * height) + padding);
  return right > left && top > bottom ? new Vector4(left, bottom, right - left, top - bottom) : null;
}
export {
  clippedPlanePolygon,
  reflectionScissor,
  reflectionTextureMatrix
};
