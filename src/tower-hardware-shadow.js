import { DepthTexture, LessEqualCompare, LinearFilter, NearestFilter, UnsignedIntType, WebGLRenderTarget } from "three";
const HARDWARE_SOFT_SHADOW_GLSL = `
#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
uniform highp sampler2DShadow vaisenShadowDepth;
float vaisenHardwareShadow( vec2 shadowMapSize, float shadowIntensity, float shadowBias, vec4 shadowCoord ) {
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  bool inside = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z <= 1.0;
  if ( !inside ) return 1.0;
  vec2 texel = 1.0 / shadowMapSize;
  vec2 f = fract( shadowCoord.xy * shadowMapSize + 0.5 );
  vec2 base = shadowCoord.xy - f * texel;
  vec2 a = 2.0 - f;
  vec2 b = 1.0 + f;
  vec2 u0 = base + ( -1.0 + 1.0 / a ) * texel;
  vec2 u1 = base + ( 1.0 + f / b ) * texel;
  float value =
    a.x * a.y * texture( vaisenShadowDepth, vec3( u0.x, u0.y, shadowCoord.z ) ) +
    b.x * a.y * texture( vaisenShadowDepth, vec3( u1.x, u0.y, shadowCoord.z ) ) +
    a.x * b.y * texture( vaisenShadowDepth, vec3( u0.x, u1.y, shadowCoord.z ) ) +
    b.x * b.y * texture( vaisenShadowDepth, vec3( u1.x, u1.y, shadowCoord.z ) );
  return mix( 1.0, value / 9.0, shadowIntensity );
}
#endif
`;
const HARDWARE_COMPACT_SHADOW_GLSL = `
#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
uniform highp sampler2DShadow vaisenShadowDepth;
float vaisenHardwareShadow( vec2 shadowMapSize, float shadowIntensity, float shadowBias, vec4 shadowCoord ) {
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  bool inside = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z <= 1.0;
  if ( !inside ) return 1.0;
  return mix( 1.0, texture( vaisenShadowDepth, shadowCoord.xyz ), shadowIntensity );
}
#endif
`;
const PACKED_SPOT_SHADOW_CALL = "getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] )";
const HARDWARE_SPOT_SHADOW_CALL = "vaisenHardwareShadow( spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, vSpotLightCoord[ i ] )";
function createHardwareShadow(light, { filter = "soft" } = {}) {
  if (!["soft", "compact"].includes(filter)) throw new Error("Unsupported hardware shadow filter");
  if (!light?.isSpotLight || !light.castShadow || light.shadow.map) throw new Error("Hardware PCF requires the uninitialized main shadowed spotlight");
  const { x: width, y: height } = light.shadow.mapSize;
  const depth = new DepthTexture(width, height, UnsignedIntType);
  depth.name = "VAISEN / Comparison shadow depth";
  depth.minFilter = depth.magFilter = LinearFilter;
  depth.compareFunction = LessEqualCompare;
  const target = new WebGLRenderTarget(width, height, { minFilter: NearestFilter, magFilter: NearestFilter, depthTexture: depth });
  target.texture.name = light.name + ".shadowMap";
  light.shadow.map = target;
  light.shadow.camera.updateProjectionMatrix();
  return { uniform: { value: depth }, target, filter };
}
function softShadowPairs(f) {
  return [{ offset: -1 + 1 / (2 - f), weight: 2 - f }, { offset: 1 + f / (1 + f), weight: 1 + f }];
}
export {
  HARDWARE_COMPACT_SHADOW_GLSL,
  HARDWARE_SOFT_SHADOW_GLSL,
  HARDWARE_SPOT_SHADOW_CALL,
  PACKED_SPOT_SHADOW_CALL,
  createHardwareShadow,
  softShadowPairs
};
