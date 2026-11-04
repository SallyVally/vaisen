import * as THREE from "three";
import { displayPbrMaterial } from "./tower-materials.js";
function hash(x, y = 0) {
  let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 71, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function brushedMaps(renderer, mobile = false) {
  const size = mobile ? 1024 : 2048, heights = new Float32Array(size * size), normals = new Uint8Array(size * size * 4), roughness = mobile ? null : new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const block = y / 256, blend = block % 1, by = Math.floor(block), e = blend * blend * (3 - 2 * blend);
    for (let x = 0; x < size; x++) {
      const line = hash(x) * 0.72 + (hash(x, by) * (1 - e) + hash(x, by + 1) * e) * 0.28;
      const fine = hash(x, y) * 0.11;
      const cut = hash(Math.floor(x / 3), 12) > 0.989 ? -0.28 * (0.6 + 0.4 * Math.sin(y * 4e-3 + x)) : 0;
      heights[y * size + x] = line + fine + cut;
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x, i = index * 4;
    const dx = (heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size]) * 1.05;
    const dy = (heights[(y + 1) % size * size + x] - heights[(y + size - 1) % size * size + x]) * 0.32;
    const length = Math.hypot(dx, dy, 1);
    normals.set([Math.round(127.5 - dx / length * 127.5), Math.round(127.5 - dy / length * 127.5), Math.round(127.5 + 127.5 / length), 255], i);
    const r = Math.round(166 + heights[index] * 42 + hash(x, y) * 5);
    if (mobile) normals[i + 3] = r;
    else roughness.set([r, r, r, 255], i);
  }
  const make = (bytes) => {
    const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  };
  const normal = make(normals);
  return { normal, roughness: mobile ? normal : make(roughness) };
}
function groupedGeometry(original) {
  const geometry = original.geometry.clone(), p = geometry.attributes.position, index = geometry.index, front = [], edge = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const count = index ? index.count : p.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((n) => index ? index.getX(i + n) : i + n);
    a.fromBufferAttribute(p, ids[0]);
    b.fromBufferAttribute(p, ids[1]);
    c.fromBufferAttribute(p, ids[2]);
    normal.crossVectors(b.sub(a), c.sub(a)).normalize();
    (Math.abs(normal.x) > 0.998 ? front : edge).push(...ids);
  }
  geometry.setIndex([...front, ...edge]);
  geometry.clearGroups();
  geometry.addGroup(0, front.length, 0);
  geometry.addGroup(front.length, edge.length, 1);
  return geometry;
}
function averageColor(texture) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(texture.image, 0, 0, 32, 32);
  const data = context.getImageData(0, 0, 32, 32).data, result = new THREE.Color(0, 0, 0), pixel = new THREE.Color();
  for (let i = 0; i < data.length; i += 4) result.add(pixel.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace));
  return result.multiplyScalar(1 / 1024);
}
function blendSurface(material, maps, detail, mean, packed = false) {
  const compile = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader) => {
    compile(shader);
    shader.uniforms.uMacroDetail = detail;
    shader.uniforms.uMainNormal = { value: maps.normal };
    shader.uniforms.uMainRoughness = { value: maps.roughness };
    shader.uniforms.uMeanColor = { value: mean };
    shader.vertexShader = `varying vec2 vMacroUv;
${shader.vertexShader}`.replace("#include <uv_vertex>", "#include <uv_vertex>\nvMacroUv=uv;");
    shader.fragmentShader = `varying vec2 vMacroUv;uniform float uMacroDetail;uniform vec3 uMeanColor;uniform sampler2D uMainNormal;uniform sampler2D uMainRoughness;
${shader.fragmentShader}`.replace("#include <normal_fragment_maps>", THREE.ShaderChunk.normal_fragment_maps.replaceAll("texture2D( normalMap, vNormalMapUv ).xyz", packed ? "vaisenMacroNormal" : "mix(texture2D(uMainNormal,vMacroUv).xyz,texture2D(normalMap,vNormalMapUv).xyz,uMacroDetail)")).replace("#include <roughnessmap_fragment>", THREE.ShaderChunk.roughnessmap_fragment.replace("texture2D( roughnessMap, vRoughnessMapUv )", packed ? "vec4(vaisenMacroRoughness)" : "mix(texture2D(uMainRoughness,vMacroUv),texture2D(roughnessMap,vRoughnessMapUv),uMacroDetail)")).replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", "diffuseColor *= mix(sampledDiffuseColor,vec4(uMeanColor,1.0),uMacroDetail*.95);"));
    if (packed) shader.fragmentShader = shader.fragmentShader.replace("void main() {", `void main() {
      vec4 vaisenMacroSample=texture2D(normalMap,vNormalMapUv);
      vec3 vaisenMacroNormal=vaisenMacroSample.xyz;
      float vaisenMacroRoughness=vaisenMacroSample.a;
      if(uMacroDetail<1.0){
        vaisenMacroNormal=mix(texture2D(uMainNormal,vMacroUv).xyz,vaisenMacroNormal,uMacroDetail);
        vaisenMacroRoughness=mix(texture2D(uMainRoughness,vMacroUv).g,vaisenMacroRoughness,uMacroDetail);
      }
    `);
  };
  material.customProgramCacheKey = () => `${key()}-macro-surface-v3${packed ? "-packed" : ""}`;
}
function createDetailTower(tower, materials, maps, renderer, detail, { mobile = false } = {}) {
  const textures = brushedMaps(renderer, mobile);
  const face = displayPbrMaterial(new THREE.MeshPhysicalMaterial({ name: "VAISEN / Macro satin titanium", color: new THREE.Color(0.18, 0.205, 0.24), map: maps.color, metalness: 1, roughness: 0.34, roughnessMap: textures.roughness, normalMap: textures.normal, normalScale: new THREE.Vector2(0.21, 0.21), anisotropy: 0.82, anisotropyRotation: Math.PI / 2, clearcoat: 0.16, clearcoatRoughness: 0.16, envMapIntensity: 1.4 }));
  const edge = displayPbrMaterial(new THREE.MeshPhysicalMaterial({ name: "VAISEN / Polished cut", color: new THREE.Color(0.32, 0.35, 0.39), map: maps.color, metalness: 1, roughness: 0.19, roughnessMap: textures.roughness, normalMap: textures.normal, normalScale: new THREE.Vector2(0.035, 0.035), anisotropy: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.1, envMapIntensity: 1.15 }));
  const mean = averageColor(maps.color);
  blendSurface(face, maps, detail, mean, mobile);
  blendSurface(edge, maps, detail, mean, mobile);
  const originals = [];
  tower.updateMatrixWorld(true);
  tower.traverse((object) => {
    if (object.isMesh && object.material === materials.body) originals.push(object);
  });
  for (const original of originals) {
    original.geometry = groupedGeometry(original);
    original.material = [face, edge];
  }
  const targetColor = materials.body.color.clone(), average = targetColor.clone().multiply(mean);
  const lightBoost = THREE.MathUtils.clamp((0.18 + 0.205 + 0.24) / (average.r + average.g + average.b), 1, 5);
  return { materials: new Set([face, edge]), lightBoost, dispose() {
    for (const texture of new Set(Object.values(textures))) texture.dispose();
  }, update(weight) {
    const blend = 1 - weight;
    face.color.copy(targetColor);
    face.roughness = THREE.MathUtils.lerp(0.34, 0.56, blend);
    face.anisotropy = Math.max(1e-6, 0.82 * weight);
    face.metalness = THREE.MathUtils.lerp(1, 0.98, blend);
    face.clearcoat = mobile ? 0 : Math.max(1e-6, 0.16 * weight);
    face.envMapIntensity = THREE.MathUtils.lerp(1.4, 1, blend);
    face.normalScale.setScalar(THREE.MathUtils.lerp(0.21, 0.085, blend));
    edge.color.copy(targetColor);
    edge.roughness = THREE.MathUtils.lerp(0.19, 0.56, blend);
    edge.metalness = THREE.MathUtils.lerp(1, 0.98, blend);
    edge.anisotropy = Math.max(1e-6, 0.3 * weight);
    edge.clearcoat = mobile ? 0 : Math.max(1e-6, 0.2 * weight);
    edge.envMapIntensity = THREE.MathUtils.lerp(1.15, 1, blend);
    edge.normalScale.setScalar(THREE.MathUtils.lerp(0.035, 0.085, blend));
  } };
}
export {
  brushedMaps,
  createDetailTower,
  groupedGeometry
};
