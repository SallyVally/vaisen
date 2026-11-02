import { PERSPECTIVE_DRAG_LIMIT } from "./site-perspective-drag.js";
const VAISEN_MARK = [[80.0315, 23.7132], [50.2292, 92.3407], [20.1213, 23.7132], [7.89473, 7.65932], [33.7234, 23.7132], [50.2292, 67.4632], [66.4294, 23.7132], [92.1053, 7.65932]];
const PERSPECTIVE_DISTANCE = 11;
const MARK_SCALE = 0.054;
function clip(points, axis, edge, keepGreater) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const insideA = keepGreater ? a[axis] >= edge : a[axis] <= edge;
    const insideB = keepGreater ? b[axis] >= edge : b[axis] <= edge;
    if (insideA) out.push([...a]);
    if (insideA !== insideB) {
      const t = (edge - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.filter((point, i) => !i || Math.hypot(point[0] - out[i - 1][0], point[1] - out[i - 1][1]) > 1e-7);
}
function perspectivePieces() {
  const bands = [7.65932, 23.7132, 38, 52, 67.4632, 80, 92.3407];
  const depths = [[-2.5, 1.6], [1.1, -1.8], [-1.4, 2.1], [2.3, -0.7], [-0.5, 1.3], [1.8, -2.2]];
  const pieces = [];
  for (let band = 0; band < bands.length - 1; band++) {
    for (let side = 0; side < 2; side++) {
      let polygon = clip(VAISEN_MARK, 0, 50.2292, side === 1);
      polygon = clip(clip(polygon, 1, bands[band], true), 1, bands[band + 1], false);
      if (polygon.length >= 3) pieces.push({ polygon, depth: depths[band][side], thickness: 0.32 + band * 0.055, band, side });
    }
  }
  return pieces;
}
function projectMarkPoint(point, z) {
  const scale = (PERSPECTIVE_DISTANCE - z) / PERSPECTIVE_DISTANCE;
  return [(point[0] - 50) * MARK_SCALE * scale, (50 - point[1]) * MARK_SCALE * scale, z];
}
const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
function perspectivePose(progress, { reduced = false, yaw = 0 } = {}) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const offset = Number.isFinite(yaw) ? Math.max(-PERSPECTIVE_DRAG_LIMIT, Math.min(PERSPECTIVE_DRAG_LIMIT, yaw)) : 0;
  const angle = (reduced ? 0 : 0.88 * (1 - smooth(0.02, 0.52, p)) - 0.34 * smooth(0.76, 1, p)) + offset;
  return { position: [Math.sin(angle) * PERSPECTIVE_DISTANCE, 1.4 * Math.pow(Math.abs(angle) / 0.88, 2), Math.cos(angle) * PERSPECTIVE_DISTANCE], target: [0, 0, 0], aligned: Math.abs(angle) < 2e-3 };
}
export {
  MARK_SCALE,
  PERSPECTIVE_DISTANCE,
  VAISEN_MARK,
  perspectivePieces,
  perspectivePose,
  projectMarkPoint
};
