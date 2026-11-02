import { Vector3, Vector4 } from "three";
import { INTERIOR_EFFECT_FUNCTIONS } from "./interior-motion-effects.js";
function motionKind(name) {
  if (/^L03_PRODUCT_FOLDED_PLATE_\d+$/.test(name)) return 5;
  if (/^L02_WORKSTATION_\d+_MONITOR$/.test(name)) return 1;
  if (name === "MUSIC_ULTRAWIDE_SCORE") return 2;
  if (/^WEB_(REVIEW_TABLET|PORTRAIT_PROTOTYPE|RESPONSIVE_DISPLAY(?:\.\d+)?)$/.test(name)) return 3;
  if (name === "SMART_MEETING_PENDANT_DIFFUSER" || name === "SMART_LIGHT_CANOPY_DIFFUSER") return 4;
  if (/^MUSIC_(DEEP_NEARFIELD|SURROUND_TOWER)(\.\d+)?$/.test(name)) return 6;
  if (/^MUSIC_SYNTH_RACK(\.\d+)?$/.test(name)) return 7;
  if (/^L01_RENDER_ROW_/.test(name)) return 10;
  return 0;
}
function interiorProfile(metadata) {
  const names = [...metadata.faces ?? [], ...metadata.props ?? []].map((entry) => entry.name ?? "");
  if (names.some((name) => name.startsWith("MUSIC_"))) return 2;
  if (names.some((name) => name.startsWith("WEB_"))) return 3;
  if (names.some((name) => name.startsWith("SMART_"))) return 4;
  if (names.some((name) => /^L0[123]_/.test(name))) return 1;
  return 0;
}
const replaceOne = (text, needle, replacement) => {
  if (text.split(needle).length !== 2) throw new Error("Interior motion shader hook changed");
  return text.replace(needle, replacement);
};
function installInteriorMotion(portal, metadata) {
  if (portal.userData.interiorMotion) return true;
  const boxes = metadata.props ?? [], flags = boxes.map((box) => motionKind(box.name));
  const profile = interiorProfile(metadata);
  if (!flags.some(Boolean) && !profile) return false;
  const product = boxes.filter((_, i) => flags[i] === 5);
  const pivot = new Vector3();
  if (product.length) {
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const box of product) {
      min.min(new Vector3(...box.min));
      max.max(new Vector3(...box.max));
    }
    pivot.addVectors(min, max).multiplyScalar(0.5);
  }
  const material = portal.material;
  const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const face of metadata.faces) for (const point of face.corners) {
    minimum.min(new Vector3(...point));
    maximum.max(new Vector3(...point));
  }
  Object.assign(material.uniforms, { interiorTime: { value: 0 }, interiorStrength: { value: 0 }, interiorFlags: { value: new Float32Array(flags) }, interiorPivot: { value: pivot }, interiorProfile: { value: profile }, interiorFloor: { value: Number(metadata.id?.slice(-1)) || 1 }, interiorMinimum: { value: minimum }, interiorSize: { value: maximum.sub(minimum) }, interiorSignal: { value: new Vector4() } });
  let shader = material.fragmentShader;
  shader = replaceOne(shader, "uniform vec3 boxMinimums[PROP_BOXES];", `uniform vec3 boxMinimums[PROP_BOXES];
        uniform float interiorFlags[PROP_BOXES];`);
  shader = replaceOne(shader, "uniform mat4 roomWorldInverse;", `uniform mat4 roomWorldInverse;
        uniform float interiorTime;
        uniform float interiorStrength;
        uniform vec3 interiorPivot;
        uniform float interiorProfile;
        uniform float interiorFloor;
        uniform vec3 interiorMinimum;
        uniform vec3 interiorSize;
        uniform vec4 interiorSignal;`);
  shader = replaceOne(shader, "void main() {", INTERIOR_EFFECT_FUNCTIONS + "\nvoid main() {");
  shader = replaceOne(shader, "bool found = false;", "bool found = false;vec3 interiorNormal=vec3(1.0,0.0,0.0);float interiorKind=0.0;");
  shader = replaceOne(shader, "atlasUv = faceRects[i].xy", "interiorNormal=normalize(normal);\n          atlasUv = faceRects[i].xy");
  const entry = "vec3 a = (boxMinimums[i] - origin) * inverseRay;";
  shader = replaceOne(shader, entry, `
            vec3 boxOrigin=origin, boxRay=ray, boxInverse=inverseRay;
            if(interiorFlags[i]>4.5 && interiorFlags[i]<5.5 && interiorStrength>0.0){
              float angle=0.58*sin(interiorTime*0.32)*interiorLife();
              float c=cos(angle),s=sin(angle);
              mat2 rotation=mat2(c,-s,s,c);
              boxOrigin.xz=rotation*(origin.xz-interiorPivot.xz)+interiorPivot.xz;
              boxRay.xz=rotation*ray.xz;
              vec3 safeBoxRay=vec3(
                abs(boxRay.x)<0.00000001?(boxRay.x<0.0?-0.00000001:0.00000001):boxRay.x,
                abs(boxRay.y)<0.00000001?(boxRay.y<0.0?-0.00000001:0.00000001):boxRay.y,
                abs(boxRay.z)<0.00000001?(boxRay.z<0.0?-0.00000001:0.00000001):boxRay.z);
              boxInverse=1.0/safeBoxRay;
            }
            vec3 a = (boxMinimums[i] - boxOrigin) * boxInverse;`);
  shader = replaceOne(shader, "vec3 b = (boxMaximums[i] - origin) * inverseRay;", "vec3 b = (boxMaximums[i] - boxOrigin) * boxInverse;");
  shader = replaceOne(shader, "(origin + ray * distance - boxMinimums[i])", "(boxOrigin + boxRay * distance - boxMinimums[i])");
  const sample = /            color = [^\n]+;/g;
  const matches = [...shader.matchAll(sample)];
  if (matches.length !== 1) throw new Error("Interior motion prop sampling hook changed");
  const sampling = matches[0][0].replace(/faceUv \* rect.zw/g, "interiorScreenUv(faceUv,interiorFlags[i],axis,component,float(i))*rect.zw");
  shader = shader.replace(sample, `${sampling}
            float kind=interiorFlags[i];
            interiorKind=kind;
            interiorNormal=axis==0?vec3(1.0,0.0,0.0):axis==1?vec3(0.0,1.0,0.0):vec3(0.0,0.0,1.0);
            color=interiorScreen(color,faceUv,kind,axis,component,float(i));
            if(kind>3.5 && kind<4.5 && axis==1){
              float sweep=.5+.5*sin(faceUv.x*4.0-interiorTime*.32);
              color*=1.0+.34*(sweep-.5)*interiorLife();
            }`);
  shader = replaceOne(shader, "gl_FragColor = vec4(color, 1.0);", "if(nearest<1e9)color=interiorRoomLight(color,origin+ray*nearest,interiorNormal,interiorKind);\n        gl_FragColor = vec4(color, 1.0);");
  material.fragmentShader = shader;
  portal.userData.interiorMotion = true;
  portal.userData.interiorProfile = profile;
  return true;
}
class InteriorMotion {
  constructor() {
    this.times = new WeakMap();
    this.pending = 0;
    this.active = null;
    this.audio = { time: 0, level: 0, playing: false, age: 1, known: false };
    this.level = 0;
  }
  setAudio({ time, level, playing }) {
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(level) || level < 0 || level > 1 || typeof playing !== "boolean") throw new Error("Invalid interior audio signal");
    this.audio = { time, level, playing, age: 0, known: true };
  }
  tick(seconds, { module = null, enabled = false, fps = 15, frameReady = true } = {}) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid interior motion step");
    this.audio.age += seconds;
    if (this.audio.playing && this.audio.age < 0.8) this.audio.time += seconds;
    const live = this.audio.playing && this.audio.age < 0.8;
    this.level += ((live ? this.audio.level : 0) - this.level) * (1 - Math.exp(-seconds * 10));
    if (!enabled || !module) {
      this.active = null;
      this.pending = 0;
      return false;
    }
    if (this.active !== module) {
      this.active = module;
      this.pending = 0;
    }
    const elapsed = (this.times.get(module) ?? 0) + seconds;
    this.times.set(module, elapsed);
    this.pending += seconds;
    if (this.pending < 1 / fps || !frameReady) return false;
    this.pending = 0;
    let changed = false;
    module.traverse((obj) => {
      if (!obj.userData.interiorMotion) return;
      obj.material.uniforms.interiorTime.value = elapsed;
      obj.material.uniforms.interiorStrength.value = 1;
      obj.material.uniforms.interiorSignal.value.set(this.audio.time, live ? this.level : 0, live ? 1 : 0, this.audio.known ? 1 : 0);
      changed = true;
    });
    return changed;
  }
}
export {
  InteriorMotion,
  installInteriorMotion,
  interiorProfile
};
