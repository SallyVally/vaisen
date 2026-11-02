import { DataTexture, LinearFilter, MeshMatcapMaterial, RGBAFormat, SRGBColorSpace } from "three";
function attached(object, scene) {
  for (let p = object; p; p = p.parent) if (p === scene) return true;
  return false;
}
function reflectionStudioPixels(size = 128) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + 0.5) / size * 2 - 1, ny = (y + 0.5) / size * 2 - 1, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const key = Math.exp(-((nx - 0.42) ** 2 / 0.032 + (ny - 0.12) ** 2 / 0.7));
    const rim = Math.exp(-((nx + 0.72) ** 2 / 0.012 + ny * ny / 1.5));
    const top = Math.exp(-((ny - 0.8) ** 2 / 0.022 + nx * nx / 1.4));
    const value = Math.min(1, 0.1 + 0.13 * nz + 0.68 * key + 0.5 * rim + 0.25 * top);
    const offset = (y * size + x) * 4;
    pixels.set([Math.round(value * 242), Math.round(value * 249), Math.round(value * 255), 255], offset);
  }
  return pixels;
}
class MobileReflectionProxy {
  constructor() {
    this.mode = "proxy";
    this.entries = [];
    this.seen = new WeakSet();
    this.materials = new Map();
    this.matcap = new DataTexture(reflectionStudioPixels(), 128, 128, RGBAFormat);
    this.matcap.colorSpace = SRGBColorSpace;
    this.matcap.minFilter = this.matcap.magFilter = LinearFilter;
    this.matcap.needsUpdate = true;
  }
  register(root) {
    root.traverse((object) => {
      if (this.seen.has(object) || !object.isMesh && !object.isLight && !object.isPoints) return;
      this.seen.add(object);
      this.entries.push(object);
    });
  }
  material(original) {
    if (!original.isMeshStandardMaterial) return original;
    if (!this.materials.has(original)) {
      const material = new MeshMatcapMaterial({ name: "Mobile mirror proxy / " + original.name, color: original.color.clone(), map: original.map, matcap: this.matcap, side: original.side, vertexColors: original.vertexColors, alphaTest: original.alphaTest, alphaMap: original.alphaMap, depthTest: original.depthTest, depthWrite: original.depthWrite, toneMapped: false });
      this.materials.set(original, material);
    }
    return this.materials.get(original);
  }
  apply(scene) {
    const changed = [];
    for (const object of this.entries) {
      if (!object.visible || !attached(object, scene)) continue;
      const materials = object.isMesh ? Array.isArray(object.material) ? object.material : [object.material] : [];
      if (object.isLight || object.isPoints || object.userData.virtualRoom || materials.length && materials.every((m) => m.transparent)) {
        changed.push([object, "visible", object.visible]);
        object.visible = false;
      } else if (object.isMesh) {
        const original = object.material, next = Array.isArray(original) ? original.map((m) => this.material(m)) : this.material(original);
        if (next !== original) {
          changed.push([object, "material", original]);
          object.material = next;
        }
      }
    }
    return () => {
      for (let i = changed.length - 1; i >= 0; i--) {
        const [object, key, value] = changed[i];
        object[key] = value;
      }
    };
  }
  run(scene, draw) {
    const restore = this.apply(scene);
    try {
      return draw();
    } finally {
      restore();
    }
  }
  async prepare(renderer, scene, camera) {
    const restore = this.apply(scene);
    try {
      await renderer.compileAsync(scene, camera);
    } finally {
      restore();
    }
  }
  dispose() {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.matcap.dispose();
    this.entries.length = 0;
  }
}
export {
  MobileReflectionProxy,
  reflectionStudioPixels
};
