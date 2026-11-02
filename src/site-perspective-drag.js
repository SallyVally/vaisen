const PERSPECTIVE_DRAG_LIMIT = Math.PI / 6;
const clamp = (value) => Math.max(-1, Math.min(1, value));
function canGrabPerspective(progress, reduced = false) {
  return reduced || Number.isFinite(progress) && progress >= 0.52 && progress <= 0.76;
}
class PerspectiveDrag {
  constructor() {
    this.value = 0;
    this.velocity = 0;
    this.target = 0;
    this.pointer = null;
    this.keyHeld = false;
  }
  get held() {
    return Boolean(this.pointer) || this.keyHeld;
  }
  get moving() {
    return this.value !== this.target || this.velocity !== 0;
  }
  get yaw() {
    return this.value * PERSPECTIVE_DRAG_LIMIT;
  }
  begin(id, x, y, width) {
    if (this.pointer) return false;
    this.keyHeld = false;
    this.target = this.value;
    this.pointer = { id, x, y, origin: this.value, span: Math.max(80, Math.min(360, width * 0.55)), axis: null };
    return true;
  }
  move(id, x, y) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== id) return "ignore";
    const dx = x - pointer.x, dy = y - pointer.y;
    if (!pointer.axis) {
      if (Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx) * 1.15) {
        this.release();
        return "vertical";
      }
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.2) return "pending";
      pointer.axis = "horizontal";
    }
    this.target = clamp(pointer.origin + dx / pointer.span);
    return "drag";
  }
  key(direction) {
    if (this.pointer) return;
    this.keyHeld = true;
    this.target = clamp(this.target + direction * 0.14);
  }
  release() {
    this.pointer = null;
    this.keyHeld = false;
    this.target = 0;
  }
  reset() {
    this.release();
    this.value = 0;
    this.velocity = 0;
  }
  tick(dt, { reduced = false } = {}) {
    if (reduced) {
      this.value = this.target;
      this.velocity = 0;
      return this.yaw;
    }
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const omega = this.held ? 32 : 11, decay = Math.exp(-omega * elapsed);
    const delta = this.value - this.target, coefficient = this.velocity + omega * delta;
    this.value = this.target + (delta + coefficient * elapsed) * decay;
    this.velocity = (this.velocity - omega * coefficient * elapsed) * decay;
    if (Math.abs(this.value) > 1) {
      this.value = clamp(this.value);
      this.velocity = 0;
    }
    if (Math.abs(this.value - this.target) < 5e-5 && Math.abs(this.velocity) < 5e-4) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.yaw;
  }
}
export {
  PERSPECTIVE_DRAG_LIMIT,
  PerspectiveDrag,
  canGrabPerspective
};
