import { Matrix4 } from "three";
class SceneCaptureCache {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.dirty = true;
    this.width = 0;
    this.height = 0;
    this.world = new Matrix4();
    this.projection = new Matrix4();
  }
  invalidate() {
    this.dirty = true;
  }
  resize(width, height) {
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.invalidate();
    }
  }
  needsCapture(camera) {
    return !this.enabled || this.dirty || !this.world.equals(camera.matrixWorld) || !this.projection.equals(camera.projectionMatrix);
  }
  captured(camera) {
    this.world.copy(camera.matrixWorld);
    this.projection.copy(camera.projectionMatrix);
    this.dirty = false;
  }
}
export {
  SceneCaptureCache
};
