import { Color, Float32BufferAttribute, Matrix3, ShaderChunk, Vector3 } from "three";
import { inheritPortraitShadowBinding } from "./tower-light-work.js";
function mobileSurfaceLighting(source) {
  const start = source.indexOf("IncidentLight directLight;");
  const indirect = source.indexOf("#if defined( RE_IndirectDiffuse )", start);
  const spots = source.indexOf("#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )", start);
  const endSpots = source.indexOf("#if ( NUM_DIR_LIGHTS > 0 )", spots);
  if (start < 0 || indirect < 0 || spots < 0 || endSpots < 0) throw new Error("Mobile surface lighting contract changed");
  return source.slice(0, start) + "IncidentLight directLight;\n" + source.slice(spots, endSpots) + "\nreflectedLight.directDiffuse += material.diffuseColor * vVaisenFill * RECIPROCAL_PI;\n" + source.slice(indirect);
}
function fillIrradiance(point, normal, lights) {
  const result = new Color(0, 0, 0), delta = new Vector3(), position = new Vector3(), direction = new Vector3();
  for (const light of lights) {
    if (!light.visible || light.isSpotLight || light.isHemisphereLight || light.isAmbientLight) continue;
    light.getWorldPosition(position);
    let amount = 0;
    if (light.isDirectionalLight) {
      light.target.getWorldPosition(direction);
      delta.copy(position).sub(direction).normalize();
      amount = Math.max(0, normal.dot(delta)) * light.intensity;
    } else if (light.isPointLight || light.isRectAreaLight) {
      delta.copy(position).sub(point);
      const distance = Math.max(0.1, delta.length());
      delta.divideScalar(distance);
      amount = Math.max(0, normal.dot(delta)) * light.intensity;
      if (light.isRectAreaLight) {
        const area = light.width * light.height;
        direction.set(0, 0, -1).transformDirection(light.matrixWorld);
        amount *= Math.max(0, -direction.dot(delta)) * area / (distance * distance + 0.25 * area);
      } else {
        amount /= Math.max(0.01, distance ** light.decay);
        if (light.distance > 0) amount *= Math.max(0, 1 - (distance / light.distance) ** 4) ** 2;
      }
    }
    result.r += light.color.r * amount;
    result.g += light.color.g * amount;
    result.b += light.color.b * amount;
  }
  result.r = Math.min(16, result.r);
  result.g = Math.min(16, result.g);
  result.b = Math.min(16, result.b);
  return result;
}
class MobileSurfaceWork {
  constructor(scene) {
    this.scene = scene;
    this.materials = new Map();
    this.geometries = new WeakSet();
    this.count = 0;
  }
  material(original) {
    if (!original.isMeshStandardMaterial || original.transparent || original.isMeshPhysicalMaterial) return original;
    if (original.userData.mobileSurface) return original;
    if (!this.materials.has(original)) {
      const material = original.clone(), compile = original.onBeforeCompile, key = original.customProgramCacheKey();
      material.name = original.name + " / mobile studio";
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer);
        shader.vertexShader = "attribute vec3 vaisenFill; varying vec3 vVaisenFill;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvVaisenFill=vaisenFill;");
        shader.fragmentShader = "varying vec3 vVaisenFill;\n" + mobileSurfaceLighting(shader.fragmentShader.includes("#include <lights_fragment_begin>") ? shader.fragmentShader.replace("#include <lights_fragment_begin>", ShaderChunk.lights_fragment_begin) : shader.fragmentShader);
      };
      material.customProgramCacheKey = () => key + "|mobile-studio-surface-v1";
      material.userData.mobileSurface = true;
      inheritPortraitShadowBinding(original, material, compile);
      this.materials.set(original, material);
    }
    return this.materials.get(original);
  }
  register(root) {
    this.scene.updateMatrixWorld(true);
    root.updateWorldMatrix(true, true);
    const lights = [];
    this.scene.traverse((obj) => {
      if (obj.isLight) lights.push(obj);
    });
    const point = new Vector3(), normal = new Vector3();
    root.traverse((object) => {
      if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      if (!source.some((m) => m.isMeshStandardMaterial && !m.transparent && !m.isMeshPhysicalMaterial && !m.userData.mobileSurface)) return;
      const geometry = object.geometry.clone(), positions = geometry.attributes.position, normals = geometry.attributes.normal;
      if (!normals) {
        geometry.dispose();
        return;
      }
      const values = new Float32Array(positions.count * 3), normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
        const fill = fillIrradiance(point, normal, lights);
        values.set([fill.r, fill.g, fill.b], i * 3);
      }
      geometry.setAttribute("vaisenFill", new Float32BufferAttribute(values, 3));
      object.geometry = geometry;
      this.geometries.add(geometry);
      object.material = Array.isArray(object.material) ? source.map((m) => this.material(m)) : this.material(object.material);
      this.count++;
    });
  }
}
export {
  MobileSurfaceWork,
  fillIrradiance,
  mobileSurfaceLighting
};
