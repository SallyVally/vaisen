import { Color } from "three";
const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const SECTOR_LIGHT_MOODS = Object.freeze({ core: Object.freeze({}), cgi: Object.freeze({ PORTRAIT_SCULPTING_KEY: { color: 14150143, scale: 1.04 }, PORTRAIT_REAR_KEY: { color: 14871544, scale: 0.96 }, PORTRAIT_EDGE_RIM: { color: 11851514, scale: 1.12 }, PORTRAIT_CORE_AREA: { color: 14215935, scale: 1.08 } }), music: Object.freeze({ PORTRAIT_SCULPTING_KEY: { color: 16768963, scale: 0.92 }, PORTRAIT_REAR_KEY: { color: 16762781, scale: 1.04 }, PORTRAIT_EDGE_RIM: { color: 15388087, scale: 0.93 }, PORTRAIT_CORE_AREA: { color: 16765871, scale: 1.08 }, PORTRAIT_CORE_GLOW: { color: 16764327, scale: 1.12 } }), web: Object.freeze({ PORTRAIT_SCULPTING_KEY: { color: 15791615, scale: 1.07 }, PORTRAIT_REAR_KEY: { color: 15790315, scale: 0.98 }, PORTRAIT_EDGE_RIM: { color: 13886714, scale: 1.06 }, PORTRAIT_CORE_AREA: { color: 15135487, scale: 1.04 } }), "smart-light": Object.freeze({ PORTRAIT_SCULPTING_KEY: { color: 16772824, scale: 0.95 }, PORTRAIT_REAR_KEY: { color: 16768184, scale: 1.06 }, PORTRAIT_EDGE_RIM: { color: 16771538, scale: 0.96 }, PORTRAIT_FOUNDATION_GRAZE: { color: 16767927, scale: 1.1 }, PORTRAIT_CORE_AREA: { color: 16767932, scale: 1.15 }, PORTRAIT_CORE_GLOW: { color: 16768187, scale: 1.14 } }) });
const NAMES = Object.keys(SECTOR_LIGHT_MOODS);
const LIGHTS = ["PORTRAIT_SCULPTING_KEY", "PORTRAIT_REAR_KEY", "PORTRAIT_EDGE_RIM", "PORTRAIT_FOUNDATION_GRAZE", "PORTRAIT_CORE_AREA", "PORTRAIT_CORE_GLOW"];
const TINTS = { core: [1, 1, 1], cgi: [0.97, 1, 1.065], music: [1.09, 0.99, 0.92], web: [1, 1.01, 1.025], "smart-light": [1.075, 1.015, 0.95] };
const weighted = (sector) => NAMES.map((id) => Number(id === sector));
class SectorLightMood {
  constructor(rig, { duration = 1.8 } = {}) {
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid light transition duration");
    this.duration = duration;
    this.sector = "core";
    this.age = duration;
    this.weights = weighted("core");
    this.from = this.weights.slice();
    this.target = this.weights.slice();
    this.tint = new Color(1, 1, 1);
    this.lights = LIGHTS.map((name) => {
      const light = rig.getObjectByName(name);
      if (!light?.isLight) throw new Error(`Missing portrait light: ${name}`);
      const baseColor = light.color.clone(), baseIntensity = light.userData.a2Intensity ?? light.intensity;
      const palette = NAMES.map((sector) => {
        const entry = SECTOR_LIGHT_MOODS[sector][name];
        return { color: entry?.color === void 0 ? baseColor.clone() : new Color(entry.color), scale: entry?.scale ?? 1 };
      });
      return { name, light, baseColor, baseIntensity, palette, result: new Color(0, 0, 0) };
    });
  }
  request(sector, { immediate = false } = {}) {
    if (!NAMES.includes(sector)) throw new Error(`Unknown light mood: ${sector}`);
    if (sector === this.sector && !immediate) return;
    this.sector = sector;
    this.from = this.weights.slice();
    this.target = weighted(sector);
    this.age = 0;
    if (immediate) {
      this.weights = this.target.slice();
      this.from = this.weights.slice();
      this.age = this.duration;
    }
  }
  tick(dt, { inspection = 0, strength = 1, reveal = 1 } = {}) {
    if (!Number.isFinite(dt) || dt < 0 || ![inspection, strength, reveal].every(Number.isFinite)) throw new Error("Invalid light step");
    if (this.age < this.duration) {
      this.age = Math.min(this.duration, this.age + dt);
      const t = ease(this.age / this.duration);
      this.weights = this.from.map((start, index) => start + (this.target[index] - start) * t);
      if (this.age === this.duration) this.weights = this.target.slice();
    }
    const mix = clamp(strength), fade = 1 - 0.55 * clamp(inspection), opening = clamp(reveal);
    let changed = false;
    const grade = [0, 0, 0];
    for (let i = 0; i < NAMES.length; i++) for (let c = 0; c < 3; c++) grade[c] += TINTS[NAMES[i]][c] * this.weights[i];
    const r = 1 + (grade[0] - 1) * mix, g = 1 + (grade[1] - 1) * mix, b = 1 + (grade[2] - 1) * mix;
    if (Math.abs(this.tint.r - r) > 1e-8 || Math.abs(this.tint.g - g) > 1e-8 || Math.abs(this.tint.b - b) > 1e-8) changed = true;
    this.tint.setRGB(r, g, b);
    for (const record of this.lights) {
      const { light, palette, result, baseColor, baseIntensity, name } = record;
      result.setRGB(0, 0, 0);
      let scale = 0;
      for (let index = 0; index < NAMES.length; index++) {
        const color = palette[index].color, weight = this.weights[index];
        result.r += color.r * weight;
        result.g += color.g * weight;
        result.b += color.b * weight;
        scale += palette[index].scale * weight;
      }
      result.lerpColors(baseColor, result, mix);
      scale = 1 + (scale - 1) * mix;
      const inspectionScale = name === "PORTRAIT_SCULPTING_KEY" || name === "PORTRAIT_CORE_AREA" ? fade : 1;
      const openingScale = name === "PORTRAIT_CORE_GLOW" ? 1 : opening;
      const intensity = baseIntensity * scale * inspectionScale * openingScale;
      if (Math.abs(light.intensity - intensity) > 1e-8 || !light.color.equals(result)) changed = true;
      light.intensity = intensity;
      light.color.copy(result);
    }
    return changed;
  }
  get busy() {
    return this.age < this.duration;
  }
}
export {
  SECTOR_LIGHT_MOODS,
  SectorLightMood
};
