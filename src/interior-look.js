const INTERIOR_LOOK = Object.freeze({ cgi: 1.1, music: 1.65, web: 0.78, "smart-light": 1 });
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function interiorLookMultiplier(sector, luminance) {
  const amount = INTERIOR_LOOK[sector] ?? 1;
  return 1 + (amount - 1) * smooth(4e-4, 0.025, luminance) * (1 - smooth(0.28, 0.78, luminance));
}
function shaderCode(sector, variable) {
  const amount = (INTERIOR_LOOK[sector] ?? 1).toFixed(4);
  return `
    float vaisenLookLuma=dot(${variable},vec3(.2126,.7152,.0722));
    float vaisenLookWeight=smoothstep(.0004,.025,vaisenLookLuma)*(1.0-smoothstep(.28,.78,vaisenLookLuma));
    ${variable}*=1.0+(${amount}-1.0)*vaisenLookWeight;
  `;
}
function gradeInteriorRoom(portal, sector, roomId) {
  if (!INTERIOR_LOOK[sector] || INTERIOR_LOOK[sector] === 1) return false;
  const material = portal.material, hook = "gl_FragColor = vec4(color, 1.0);";
  if (material.fragmentShader.split(hook).length !== 2) throw new Error("Interior look room hook changed");
  const bounce = sector === "music" && roomId === "l02" ? `
    vec3 vaisenBouncePoint=(origin+ray*nearest-vec3(1.50,3.06,4.82))/vec3(.55,.48,.72);
    float vaisenBounce=exp(-dot(vaisenBouncePoint,vaisenBouncePoint));
    color*=1.0+0.32*vaisenBounce;
  ` : "";
  material.fragmentShader = material.fragmentShader.replace(hook, shaderCode(sector, "color") + bounce + "\n        " + hook);
  material.needsUpdate = true;
  return true;
}
function gradeInteriorFront(material, sector) {
  if (!INTERIOR_LOOK[sector] || INTERIOR_LOOK[sector] === 1) return false;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    const hook = "#include <opaque_fragment>";
    if (shader.fragmentShader.split(hook).length !== 2) throw new Error("Interior look front hook changed");
    shader.fragmentShader = shader.fragmentShader.replace(hook, shaderCode(sector, "diffuseColor.rgb") + "\n" + hook);
  };
  material.customProgramCacheKey = () => previousKey + "|vaisen-interior-look-v1-" + sector;
  material.needsUpdate = true;
  return true;
}
export {
  INTERIOR_LOOK,
  gradeInteriorFront,
  gradeInteriorRoom,
  interiorLookMultiplier
};
