import { Vector2, Vector3, Vector4 } from "three";
import { supportedCGIPose } from "./tower-supported-mechanism.js";
const clamp = (value) => Math.max(0, Math.min(1, value));
class MechanicalSteam {
  constructor() {
    this.events = { body: null, module: null };
    this.puffs = Array.from({ length: 4 }, () => new Vector4());
    this.axes = Array.from({ length: 4 }, () => new Vector4(1, 0, 0, 1));
    this.shapes = Array.from({ length: 4 }, () => new Vector2(0.1, 0));
  }
  reset() {
    this.events = { body: null, module: null };
    this.puffs.forEach((p) => p.set(0, 0, 0, 0));
  }
  update(seconds, cues = []) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid mechanical steam step");
    for (const key of ["body", "module"]) if (this.events[key]) this.events[key].age += seconds;
    for (const cue of cues) {
      if (!["pressure", "release", "lock"].includes(cue.kind)) continue;
      const pose = supportedCGIPose(cue.time), body = cue.assembly === "body";
      const origin = new Vector3(...body ? [0.98, 0.22, 1.4] : [0.66, 0.18, 5.3]);
      origin.add(body ? pose.bodyOffset : pose.moduleOffset);
      const release = cue.direction < 0 ? cue.kind === "lock" : cue.kind === "release";
      this.events[cue.assembly] = { origin, age: 0, power: release ? 1 : cue.kind === "lock" ? 0.22 : 0.12, life: release ? body ? 5.2 : 4 : 0.7 };
    }
    for (const [index, key] of ["body", "module"].entries()) {
      const event = this.events[key], jet = index * 2, cloud = jet + 1;
      this.puffs[jet].w = this.puffs[cloud].w = 0;
      if (!event || event.age >= event.life) continue;
      const age = event.age, attack = clamp(age / 0.08), tail = clamp((event.life - age) / 0.8);
      const direction = new Vector3(1, 0.22, key === "body" ? -0.34 : 0.32).normalize();
      const center = event.origin.clone().addScaledVector(direction, 0.12 + age * 0.36);
      const jetPower = event.power * attack * Math.exp(-age * 4.1) * tail;
      this.puffs[jet].set(center.x, center.y, center.z, jetPower * 1.4);
      this.axes[jet].set(direction.x, direction.y, direction.z, 0.32 + Math.min(age, 0.8) * 0.65);
      this.shapes[jet].set(0.12 + Math.min(age, 0.8) * 0.16, age);
      const cloudCenter = event.origin.clone().add(new Vector3(0.25 + age * 0.13 + Math.sin(age * 1.7) * 0.06, age * 0.22, Math.sin(age * 1.1) * 0.1));
      const cloudPower = event.power * clamp(age / 0.22) * Math.exp(-age * 0.53) * tail;
      this.puffs[cloud].set(cloudCenter.x, cloudCenter.y, cloudCenter.z, cloudPower * 0.55);
      this.axes[cloud].set(0.35, 0.936, 0, 0.23 + age * 0.25);
      this.shapes[cloud].set(0.22 + age * 0.22, age);
    }
  }
}
export {
  MechanicalSteam
};
