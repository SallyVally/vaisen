import { BoxGeometry, InstancedMesh, Object3D, MeshBasicMaterial, DoubleSide } from "three";
import { createBakedRoom } from "./l02-room-projection.js";
class SmartLightingBlend {
  constructor(mode = "day") {
    if (!["day", "evening"].includes(mode)) throw new Error("Unknown lighting scenario");
    this.value = mode === "evening" ? 1 : 0;
    this.from = this.value;
    this.target = this.value;
    this.age = 0.9;
  }
  request(mode, { immediate = false } = {}) {
    if (!["day", "evening"].includes(mode)) throw new Error("Unknown lighting scenario");
    const target = mode === "evening" ? 1 : 0;
    if (immediate) {
      this.value = this.from = this.target = target;
      this.age = 0.9;
      return;
    }
    if (target === this.target) return;
    this.from = this.value;
    this.target = target;
    this.age = 0;
  }
  tick(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid lighting step");
    this.age = Math.min(0.9, this.age + seconds);
    if (this.age >= 0.9 - 1e-9) {
      this.age = 0.9;
      this.value = this.target;
      return;
    }
    const t = this.age / 0.9, smooth = Math.max(0, Math.min(1, t * t * t * (t * (t * 6 - 15) + 10)));
    this.value = this.from + (this.target - this.from) * smooth;
  }
}
function replaceOnce(source, search, replacement) {
  if (source.split(search).length !== 2) throw new Error("Baked room shader contract changed");
  return source.replace(search, replacement);
}
function createSmartRoom(metadata, day, evening, blend, options = {}) {
  const portal = createBakedRoom(metadata, day.room, day.props, options), material = portal.material;
  Object.assign(material.uniforms, { eveningRoomAtlas: { value: evening.room }, eveningPropsAtlas: { value: evening.props }, lightingMix: blend });
  material.fragmentShader = replaceOnce(material.fragmentShader, "uniform sampler2D roomAtlas;", "uniform sampler2D roomAtlas;\nuniform sampler2D eveningRoomAtlas;\nuniform sampler2D eveningPropsAtlas;\nuniform float lightingMix;");
  material.fragmentShader = replaceOnce(material.fragmentShader, "texture2D(roomAtlas, atlasUv).rgb", "mix(texture2D(roomAtlas, atlasUv).rgb,texture2D(eveningRoomAtlas, atlasUv).rgb,lightingMix)");
  material.fragmentShader = replaceOnce(material.fragmentShader, "texture2D(propsAtlas, rect.xy + faceUv * rect.zw).rgb", "mix(texture2D(propsAtlas, rect.xy + faceUv * rect.zw).rgb,texture2D(eveningPropsAtlas, rect.xy + faceUv * rect.zw).rgb,lightingMix)");
  portal.name = "SMART_" + metadata.id.toUpperCase() + "_ROOM";
  return portal;
}
function createSmartFrontMaterial(day, evening, blend) {
  const material = new MeshBasicMaterial({ map: day, side: DoubleSide, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { eveningFrontAtlas: { value: evening }, lightingMix: blend });
    shader.fragmentShader = "uniform sampler2D eveningFrontAtlas;\nuniform float lightingMix;\n" + shader.fragmentShader;
    shader.fragmentShader = replaceOnce(shader.fragmentShader, "#include <map_fragment>", "#ifdef USE_MAP\n diffuseColor *= mix(texture2D(map,vMapUv),texture2D(eveningFrontAtlas,vMapUv),lightingMix);\n#endif");
  };
  material.customProgramCacheKey = () => "smart-light-baked-scenarios-v1";
  return material;
}
function createSmartSuspensions(records) {
  const rods = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 1449247, toneMapped: false }), records.length);
  rods.name = "SMART_PHYSICAL_SUSPENSIONS";
  const transform = new Object3D();
  records.forEach(({ min, max }, index) => {
    for (let axis = 0; axis < 3; axis++) {
      if (!Number.isFinite(min[axis]) || !Number.isFinite(max[axis]) || max[axis] <= min[axis]) throw new Error("Invalid suspension bounds");
      transform.position.setComponent(axis, (min[axis] + max[axis]) / 2);
      transform.scale.setComponent(axis, max[axis] - min[axis]);
    }
    transform.updateMatrix();
    rods.setMatrixAt(index, transform.matrix);
  });
  rods.computeBoundingSphere();
  return rods;
}
export {
  SmartLightingBlend,
  createSmartFrontMaterial,
  createSmartRoom,
  createSmartSuspensions
};
