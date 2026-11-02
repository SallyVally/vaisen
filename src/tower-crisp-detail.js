import { inheritPortraitShadowBinding } from "./tower-light-work.js";
const CRISP_SHADOW_SIZE = 1024;
function configureCrispShadow(light) {
  if (!light?.isSpotLight || light.shadow.map) throw new Error("Configure crisp shadow detail before target allocation");
  light.shadow.mapSize.set(CRISP_SHADOW_SIZE, CRISP_SHADOW_SIZE);
}
function reduceBakedInteriorShadows(root) {
  let removed = 0;
  root.traverse((group) => {
    if (!/^CLOSED_(cgi|music|smart-light|web)$/.test(group.name)) return;
    group.traverse((object) => {
      if (!object.isMesh || !object.castShadow) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.length && materials.every((material) => material.isMeshBasicMaterial)) {
        object.castShadow = false;
        removed++;
      }
    });
  });
  return removed;
}
const ROUGH_LANDSCAPE_AREA_GLSL = `
#if NUM_RECT_AREA_LIGHTS > 0 && defined( RE_Direct_RectArea )
void vaisenRoughLandscapeArea(const in RectAreaLight rectAreaLight,const in vec3 geometryPosition,
  const in vec3 geometryNormal,const in vec3 geometryViewDir,const in vec3 geometryClearcoatNormal,
  const in PhysicalMaterial material,inout ReflectedLight reflectedLight) {
  vec3 rectCoords[4];
  rectCoords[0]=rectAreaLight.position+rectAreaLight.halfWidth-rectAreaLight.halfHeight;
  rectCoords[1]=rectAreaLight.position-rectAreaLight.halfWidth-rectAreaLight.halfHeight;
  rectCoords[2]=rectAreaLight.position-rectAreaLight.halfWidth+rectAreaLight.halfHeight;
  rectCoords[3]=rectAreaLight.position+rectAreaLight.halfWidth+rectAreaLight.halfHeight;
  if(dot(cross(rectCoords[1]-rectCoords[0],rectCoords[3]-rectCoords[0]),geometryPosition-rectCoords[0])<0.0)return;
  vec3 a=normalize(rectCoords[0]-geometryPosition),b=normalize(rectCoords[1]-geometryPosition);
  vec3 c=normalize(rectCoords[2]-geometryPosition),d=normalize(rectCoords[3]-geometryPosition);
  vec3 factor=LTC_EdgeVectorFormFactor(a,b)+LTC_EdgeVectorFormFactor(b,c)+
    LTC_EdgeVectorFormFactor(c,d)+LTC_EdgeVectorFormFactor(d,a);
  float magnitude=length(factor);
  float irradiance=max((magnitude*magnitude-dot(geometryNormal,factor))/(magnitude+1.0),0.0);
  reflectedLight.directDiffuse+=rectAreaLight.color*material.diffuseColor*irradiance;
}
#undef RE_Direct_RectArea
#define RE_Direct_RectArea vaisenRoughLandscapeArea
#endif
`;
function simplifyRoughLandscapeArea(root) {
  let count = 0;
  root.traverse((group) => {
    if (group.name !== "PORTRAIT_FOUNDATION_AND_SHORE") return;
    group.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!["VAISEN / Wet basalt", "VAISEN / Fractured basalt"].includes(material.name) || !material.isMeshStandardMaterial || material.isMeshPhysicalMaterial || material.roughness < 0.9 || material.metalness > 0.05 || material.roughnessMap || material.metalnessMap || material.userData.crispRoughArea) continue;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
        material.onBeforeCompile = function(shader, renderer) {
          compile.call(this, shader, renderer);
          const main = "void main() {";
          if (!shader.fragmentShader.includes(main)) throw new Error("Unsupported rough landscape shader");
          shader.fragmentShader = shader.fragmentShader.replace(main, ROUGH_LANDSCAPE_AREA_GLSL + "\n" + main);
        };
        inheritPortraitShadowBinding(material, material, compile);
        material.customProgramCacheKey = () => key + "|crisp-rough-area-v1";
        material.userData.crispRoughArea = true;
        material.needsUpdate = true;
        count++;
      }
    });
  });
  return count;
}
export {
  CRISP_SHADOW_SIZE,
  ROUGH_LANDSCAPE_AREA_GLSL,
  configureCrispShadow,
  reduceBakedInteriorShadows,
  simplifyRoughLandscapeArea
};
