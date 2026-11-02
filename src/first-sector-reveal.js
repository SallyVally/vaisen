const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
function firstRevealShape(time) {
  const enter = smooth((time - 0.3) / 1.65), exit = 1 - smooth((time - 3.55) / 2.15);
  return { weight: enter * exit, travel: smooth((time - 0.5) / 4.65) };
}
class FirstSectorReveal {
  constructor() {
    this.state = "idle";
    this.sector = null;
    this.used = false;
    this.weight = 0;
    this.travel = 0;
    this.cancelAge = 0;
    this.cancelFrom = 0;
  }
  select(sector, { enabled = true, fromCore = false } = {}) {
    if (this.state === "active" && sector !== this.sector) {
      this.cancel();
      return;
    }
    if (this.state === "pending") {
      if (!enabled || sector === "core") {
        this.state = "idle";
        this.sector = null;
      } else this.sector = sector;
      return;
    }
    if (!this.used && this.state === "idle" && enabled && fromCore && sector !== "core") {
      this.state = "pending";
      this.sector = sector;
    }
  }
  cancel() {
    if (this.state === "pending") {
      this.state = "idle";
      this.sector = null;
      return;
    }
    if (this.state !== "active") return;
    this.state = "cancelling";
    this.cancelAge = 0;
    this.cancelFrom = this.weight;
  }
  tick(dt, { active, requested, time, route = false, enabled = true } = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid first reveal step");
    const before = this.weight, previousTravel = this.travel;
    if (!enabled && (this.state === "active" || this.state === "pending")) this.cancel();
    if (this.state === "pending" && enabled && requested === this.sector && active === this.sector && !route && time > 0) {
      this.state = "active";
      this.used = true;
    }
    if (this.state === "active") {
      if (requested !== this.sector) this.cancel();
      else {
        const sample = firstRevealShape(time);
        this.weight = sample.weight;
        this.travel = sample.travel;
        if (time >= 5.7) {
          this.weight = 0;
          this.state = "done";
        }
      }
    }
    if (this.state === "cancelling") {
      this.cancelAge = Math.min(0.45, this.cancelAge + dt);
      this.weight = this.cancelFrom * (1 - smooth(this.cancelAge / 0.45));
      if (this.cancelAge === 0.45) {
        this.weight = 0;
        this.state = "done";
      }
    }
    return Math.abs(this.weight - before) > 1e-8 || Math.abs(this.travel - previousTravel) > 1e-8;
  }
}
function firstRevealCamera(pose, weight) {
  const w = clamp(weight);
  if (w === 0) return pose;
  const position = pose.position.clone().lerp(pose.target, 0.015 * w);
  const target = pose.target.clone();
  position.y += 0.07 * w;
  target.y += 0.04 * w;
  return { ...pose, position, target };
}
function firstRevealLight(base, weight, travel, sector) {
  const w = clamp(weight), t = clamp(travel), direction = sector === "music" || sector === "smart-light" ? -1 : 1;
  return [base[0] + direction * 1.15 * (2 * t - 1) * w, base[1] + 1.65 * (2 * t - 1) * w, base[2]];
}
export {
  FirstSectorReveal,
  firstRevealCamera,
  firstRevealLight,
  firstRevealShape
};
