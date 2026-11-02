class SceneIntro {
  constructor(duration = 2.6) {
    this.duration = duration;
    this.progress = 1;
    this.active = false;
    this.skipping = false;
    this.age = 0;
    this.from = 0;
  }
  start() {
    this.progress = 0;
    this.active = true;
    this.skipping = false;
    this.age = 0;
  }
  skip() {
    if (!this.active) return;
    this.from = this.progress;
    this.age = 0;
    this.skipping = true;
  }
  finish() {
    this.progress = 1;
    this.active = false;
    this.skipping = false;
  }
  tick(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid intro step");
    if (!this.active) return false;
    this.age += dt;
    if (this.skipping) {
      const t = Math.min(1, this.age / 0.24), e = t * t * (3 - 2 * t);
      this.progress = this.from + (1 - this.from) * e;
      if (t === 1) this.finish();
    } else {
      this.progress = Math.min(1, this.age / this.duration);
      if (this.progress === 1) this.finish();
    }
    return true;
  }
}
function introLightPosition(progress, inspection = 0) {
  const t = Math.max(0, Math.min(1, progress)), e = t * t * (3 - 2 * t);
  return [5 - 0.8 * Math.max(0, Math.min(1, inspection)) + 2 * (1 - e), 9 - 1.1 * (1 - e), 1];
}
export {
  SceneIntro,
  introLightPosition
};
