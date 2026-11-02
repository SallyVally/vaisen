import { ShaderChunk } from "three";
import { HARDWARE_SOFT_SHADOW_GLSL, HARDWARE_COMPACT_SHADOW_GLSL, PACKED_SPOT_SHADOW_CALL, HARDWARE_SPOT_SHADOW_CALL } from "./tower-hardware-shadow.js";
const shadowBindings = new WeakMap();
function usesPortraitShadowDepth(material, hardware) {
  const binding = shadowBindings.get(material);
  return Boolean(binding && binding.uniform === hardware?.uniform && binding.compile === material.onBeforeCompile);
}
function inheritPortraitShadowBinding(original, target, previousCompile) {
  const binding = shadowBindings.get(original);
  if (binding && binding.compile === previousCompile) shadowBindings.set(target, { uniform: binding.uniform, compile: target.onBeforeCompile });
}
const contribution = `
bool vaisenLightContributes( const in IncidentLight light, const in vec3 normal, const in vec3 clearcoatNormal ) {
  if ( ! light.visible ) return false;
  #ifdef USE_CLEARCOAT
    return max( dot( normal, light.direction ), dot( clearcoatNormal, light.direction ) ) > 0.0;
  #else
    return dot( normal, light.direction ) > 0.0;
  #endif
}
`;
function optimizedLightChunks(hardware = false) {
  const direct = "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
  const active = "vaisenLightContributes( directLight, geometryNormal, geometryClearcoatNormal )";
  let lights = ShaderChunk.lights_fragment_begin.replaceAll("( directLight.visible && receiveShadow )", `( ${active} && receiveShadow )`).replaceAll(direct, `if ( ${active} ) { ${direct} }`);
  if (hardware) {
    if (!lights.includes(PACKED_SPOT_SHADOW_CALL)) throw new Error("Unsupported Three shadow sampling chunk");
    lights = lights.replace(PACKED_SPOT_SHADOW_CALL, HARDWARE_SPOT_SHADOW_CALL);
  }
  const marker = "vec2 uv = LTC_Uv( normal, viewDir, roughness );";
  const physical = contribution + ShaderChunk.lights_physical_pars_fragment.replace(marker, `
    if ( dot( cross( rectCoords[ 1 ] - rectCoords[ 0 ], rectCoords[ 3 ] - rectCoords[ 0 ] ), position - rectCoords[ 0 ] ) < 0.0 ) return;
    ${marker}`);
  if (!lights.includes(active) || physical === contribution + ShaderChunk.lights_physical_pars_fragment) throw new Error("Unsupported Three lighting chunks");
  return { lights, physical };
}
function optimizePortraitLightWork(root, hardwareShadow = null) {
  const chunks = optimizedLightChunks(Boolean(hardwareShadow));
  const compact = hardwareShadow?.filter === "compact";
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material.isMeshStandardMaterial || material.userData.portraitLightWork) continue;
      const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", chunks.physical).replace("#include <lights_fragment_begin>", chunks.lights);
        if (hardwareShadow) {
          shader.uniforms.vaisenShadowDepth = hardwareShadow.uniform;
          shader.fragmentShader = shader.fragmentShader.replace("#include <shadowmap_pars_fragment>", "#include <shadowmap_pars_fragment>\n" + (compact ? HARDWARE_COMPACT_SHADOW_GLSL : HARDWARE_SOFT_SHADOW_GLSL));
        }
      };
      material.customProgramCacheKey = () => cacheKey() + "|vaisen-visible-light-work-v1" + (hardwareShadow ? compact ? "|hardware-pcf-compact-v1" : "|hardware-pcf-v1" : "");
      material.userData.portraitLightWork = true;
      material.needsUpdate = true;
      if (hardwareShadow) shadowBindings.set(material, { uniform: hardwareShadow.uniform, compile: material.onBeforeCompile });
    }
  });
}
export {
  inheritPortraitShadowBinding,
  optimizePortraitLightWork,
  optimizedLightChunks,
  usesPortraitShadowDepth
};
