import { ShaderChunk } from "three";
import { inheritPortraitShadowBinding } from "./tower-light-work.js";
const sharedArea = `
  bool vaisenAreaReady=false;
  mat3 vaisenAreaDiffuseTransform;
  mat3 vaisenAreaSpecularTransform;
  vec3 vaisenAreaFresnel;

  vec3 vaisenAreaIntegral(const in vec3 position,const in mat3 transform,const in vec3 rectCoords[4]) {
    vec3 coords[4];
    coords[0]=normalize(transform*(rectCoords[0]-position));
    coords[1]=normalize(transform*(rectCoords[1]-position));
    coords[2]=normalize(transform*(rectCoords[2]-position));
    coords[3]=normalize(transform*(rectCoords[3]-position));
    vec3 factor=vec3(0.0);
    factor+=LTC_EdgeVectorFormFactor(coords[0],coords[1]);
    factor+=LTC_EdgeVectorFormFactor(coords[1],coords[2]);
    factor+=LTC_EdgeVectorFormFactor(coords[2],coords[3]);
    factor+=LTC_EdgeVectorFormFactor(coords[3],coords[0]);
    return vec3(LTC_ClippedSphereFormFactor(factor));
  }

  void RE_Direct_RectArea_Physical(const in RectAreaLight rectAreaLight,const in vec3 geometryPosition,
    const in vec3 geometryNormal,const in vec3 geometryViewDir,const in vec3 geometryClearcoatNormal,
    const in PhysicalMaterial material,inout ReflectedLight reflectedLight) {
    vec3 rectCoords[4];
    rectCoords[0]=rectAreaLight.position+rectAreaLight.halfWidth-rectAreaLight.halfHeight;
    rectCoords[1]=rectAreaLight.position-rectAreaLight.halfWidth-rectAreaLight.halfHeight;
    rectCoords[2]=rectAreaLight.position-rectAreaLight.halfWidth+rectAreaLight.halfHeight;
    rectCoords[3]=rectAreaLight.position+rectAreaLight.halfWidth+rectAreaLight.halfHeight;
    if(dot(cross(rectCoords[1]-rectCoords[0],rectCoords[3]-rectCoords[0]),geometryPosition-rectCoords[0])<0.0)return;

    if(!vaisenAreaReady){
      vec2 uv=LTC_Uv(geometryNormal,geometryViewDir,material.roughness);
      vec4 t1=texture2D(ltc_1,uv);
      vec4 t2=texture2D(ltc_2,uv);
      mat3 inverseLtc=mat3(vec3(t1.x,0.0,t1.y),vec3(0.0,1.0,0.0),vec3(t1.z,0.0,t1.w));
      vec3 tangent=normalize(geometryViewDir-geometryNormal*dot(geometryViewDir,geometryNormal));
      vec3 bitangent=-cross(geometryNormal,tangent);
      vaisenAreaDiffuseTransform=transposeMat3(mat3(tangent,bitangent,geometryNormal));
      vaisenAreaSpecularTransform=inverseLtc*vaisenAreaDiffuseTransform;
      vaisenAreaFresnel=material.specularColor*t2.x+(vec3(1.0)-material.specularColor)*t2.y;
      vaisenAreaReady=true;
    }
    reflectedLight.directSpecular+=rectAreaLight.color*vaisenAreaFresnel*
      vaisenAreaIntegral(geometryPosition,vaisenAreaSpecularTransform,rectCoords);
    reflectedLight.directDiffuse+=rectAreaLight.color*material.diffuseColor*
      vaisenAreaIntegral(geometryPosition,vaisenAreaDiffuseTransform,rectCoords);
  }
`;
const worldDiffuse = `
  vec3 vaisenWorldDiffuse(const in vec3 normal,const in vec3 position,const in vec3 rect[4]) {
    vec3 a=normalize(rect[0]-position),b=normalize(rect[1]-position);
    vec3 c=normalize(rect[2]-position),d=normalize(rect[3]-position);
    vec3 factor=LTC_EdgeVectorFormFactor(a,b)+LTC_EdgeVectorFormFactor(b,c)+
      LTC_EdgeVectorFormFactor(c,d)+LTC_EdgeVectorFormFactor(d,a);
    float magnitude=length(factor);
    return vec3(max((magnitude*magnitude-dot(normal,factor))/(magnitude+1.0),0.0));
  }
`;
function sharedAreaChunk(source, { world = false } = {}) {
  const start = source.indexOf("	void RE_Direct_RectArea_Physical("), endMarker = "\n	}\n";
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Area lighting shader contract changed");
  const original = source.slice(start, end + endMarker.length);
  for (const marker of ["LTC_Uv( normal, viewDir, roughness )", "LTC_Evaluate( normal, viewDir, position, mInv, rectCoords )", "LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords )"]) {
    if (!original.includes(marker)) throw new Error("Unsupported area light integration");
  }
  const implementation = world ? worldDiffuse + sharedArea.replace("vaisenAreaIntegral(geometryPosition,vaisenAreaDiffuseTransform,rectCoords);", "vaisenWorldDiffuse(geometryNormal,geometryPosition,rectCoords);") : sharedArea;
  return source.slice(0, start) + implementation + source.slice(end + endMarker.length);
}
function installSharedAreaWork(material, { world = false } = {}) {
  if (!material.isMeshStandardMaterial || material.userData.sharedAreaWork) return material;
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    const include = "#include <lights_physical_pars_fragment>";
    shader.fragmentShader = shader.fragmentShader.includes(include) ? shader.fragmentShader.replace(include, sharedAreaChunk(ShaderChunk.lights_physical_pars_fragment, { world })) : sharedAreaChunk(shader.fragmentShader, { world });
  };
  inheritPortraitShadowBinding(material, material, compile);
  material.customProgramCacheKey = () => key + (world ? "|vaisen-shared-area-world-v1" : "|vaisen-shared-area-v1");
  material.userData.sharedAreaWork = true;
  material.userData.worldAreaWork = world;
  return material;
}
function createSharedAreaMaterial(original) {
  if (!original.isMeshStandardMaterial || original.userData.sharedAreaWork) return original;
  const material = original.clone(), key = original.customProgramCacheKey();
  material.onBeforeCompile = original.onBeforeCompile;
  material.customProgramCacheKey = () => key;
  inheritPortraitShadowBinding(original, material, original.onBeforeCompile);
  return installSharedAreaWork(material);
}
function optimizeAreaTree(root, options) {
  root.traverse((object) => {
    if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) installSharedAreaWork(material, options);
  });
}
export {
  createSharedAreaMaterial,
  optimizeAreaTree,
  sharedAreaChunk
};
