const SCENE_SCALES = Object.freeze([1]);
class SceneResolutionTargets {
  constructor(create) {
    this.create = create;
    this.width = 1;
    this.height = 1;
    this.targets = new Map([[1, create()]]);
  }
  get(scale = 1) {
    if (!SCENE_SCALES.includes(scale)) throw new Error("Unsupported scene capture scale");
    if (!this.targets.has(scale)) {
      const target = this.create();
      target.setSize(Math.max(1, Math.round(this.width * scale)), Math.max(1, Math.round(this.height * scale)));
      this.targets.set(scale, target);
    }
    return this.targets.get(scale);
  }
  resize(width, height) {
    if (width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    for (const [scale, target] of this.targets) if (scale !== 1) {
      target.dispose();
      this.targets.delete(scale);
    }
    this.targets.get(1).setSize(width, height);
    return true;
  }
  dispose() {
    for (const target of this.targets.values()) target.dispose();
    this.targets.clear();
  }
}
export {
  SCENE_SCALES,
  SceneResolutionTargets
};
