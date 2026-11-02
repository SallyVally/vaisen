import { PCFSoftShadowMap } from "three";
import { usesPortraitShadowDepth } from "./tower-light-work.js";
const textureFields = ["map", "lightMap", "aoMap", "envMap", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "alphaMap", "bumpMap", "displacementMap", "specularMap", "specularColorMap", "transmissionMap"];
function depthOnlyReceivers(scene, hardware, packedTexture = null) {
  if (scene.overrideMaterial) return false;
  let compatible = true;
  scene.traverseVisible((object) => {
    if (!compatible || !object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material.visible) continue;
      if (packedTexture && (textureFields.some((field) => material[field] === packedTexture) || material.uniforms && Object.values(material.uniforms).some(({ value }) => value === packedTexture || Array.isArray(value) && value.includes(packedTexture)))) {
        compatible = false;
        break;
      }
      if (!object.receiveShadow || material.isMeshBasicMaterial) continue;
      if (material.isMeshStandardMaterial && usesPortraitShadowDepth(material, hardware)) continue;
      if (object.userData.virtualRoom && material.isShaderMaterial && !material.lights && !/\b(spotShadowMap|directionalShadowMap|pointShadowMap|getShadow)\b/.test(material.fragmentShader)) continue;
      compatible = false;
      break;
    }
  });
  return compatible;
}
function installDepthOnlyShadowPass(renderer, light, hardware) {
  if (!light?.isSpotLight || !hardware?.uniform?.value?.isDepthTexture || light.shadow.map?.depthTexture !== hardware.uniform.value) throw new Error("Depth-only pass requires the active hardware shadow texture");
  const original = renderer.shadowMap.render;
  const state = { enabled: true, stats: { mode: "native", passes: 0, draws: 0 }, staleColor: false };
  function render(lights, scene, camera) {
    if (!lights.includes(light)) return original.call(this, lights, scene, camera);
    const supported = state.enabled && lights.length === 1 && light.isSpotLight && renderer.shadowMap.type === PCFSoftShadowMap && light.shadow.map?.depthTexture === hardware.uniform.value && depthOnlyReceivers(scene, hardware, light.shadow.map.texture);
    if (!supported) {
      state.stats.mode = "native";
      if (state.staleColor) {
        renderer.shadowMap.needsUpdate = true;
        light.shadow.needsUpdate = true;
      }
      const result = original.call(this, lights, scene, camera);
      if (renderer.shadowMap.enabled && !renderer.shadowMap.needsUpdate && !light.shadow.needsUpdate) state.staleColor = false;
      return result;
    }
    state.stats.mode = "depth-only";
    if (!renderer.shadowMap.enabled || renderer.shadowMap.autoUpdate === false && !renderer.shadowMap.needsUpdate || light.shadow.autoUpdate === false && !light.shadow.needsUpdate) return original.call(this, lights, scene, camera);
    const draw = renderer.renderBufferDirect, clear = renderer.clear;
    state.staleColor = true;
    renderer.clear = function(color, depth, stencil) {
      return clear.call(this, renderer.getRenderTarget() === light.shadow.map ? false : color, depth, stencil);
    };
    renderer.renderBufferDirect = function(...args) {
      const material = args[3];
      if (args[0] !== light.shadow.camera || !material?.isMeshDepthMaterial) return draw.apply(this, args);
      const colorWrite = material.colorWrite;
      material.colorWrite = false;
      try {
        state.stats.draws++;
        return draw.apply(this, args);
      } finally {
        material.colorWrite = colorWrite;
      }
    };
    try {
      const result = original.call(this, lights, scene, camera);
      state.stats.passes++;
      return result;
    } finally {
      renderer.renderBufferDirect = draw;
      renderer.clear = clear;
      renderer.state.buffers.color.setMask(true);
    }
  }
  renderer.shadowMap.render = render;
  state.dispose = () => {
    if (renderer.shadowMap.render === render) renderer.shadowMap.render = original;
    if (state.staleColor) {
      renderer.shadowMap.needsUpdate = true;
      light.shadow.needsUpdate = true;
    }
  };
  return state;
}
export {
  depthOnlyReceivers,
  installDepthOnlyShadowPass
};
