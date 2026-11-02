const clamp = (value) => Math.max(0, Math.min(1, value));
function cgiGlassAlpha(opacity, facing, inspection) {
  const fresnel = (1 - clamp(Math.abs(facing))) ** 3;
  return opacity * (1 + (0.08 + 0.62 * fresnel - 1) * clamp(inspection));
}
function cgiInspectionAtmosphere(inspection) {
  return 0.26 * (1 - 0.55 * clamp(inspection));
}
function prepareInspectionGlass(module, sector) {
  const pane = module?.getObjectByName(`${sector}_GLASS`);
  if (!pane?.material?.isMeshPhysicalMaterial) throw new Error(`Missing ${sector} inspection glass`);
  if (pane.userData.inspectionGlass) return pane.userData.inspectionGlass;
  const original = pane.material, compile = original.onBeforeCompile, key = original.customProgramCacheKey();
  const uniform = { value: 0 }, glass = original.clone();
  glass.name = `VAISEN / ${sector} inspection glass`;
  glass.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    const color = "#include <color_fragment>", output = "#include <opaque_fragment>";
    if (!shader.fragmentShader.includes(color) || !shader.fragmentShader.includes(output)) throw new Error("Unsupported CGI glass shader");
    shader.uniforms.vaisenCgiInspection = uniform;
    shader.fragmentShader = "uniform float vaisenCgiInspection;\n" + shader.fragmentShader.replace(color, color + "\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(0.22, 0.26, 0.30), vaisenCgiInspection);\n").replace(output, `
        float vaisenCgiFacing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
        float vaisenCgiFresnel = pow(1.0 - vaisenCgiFacing, 3.0);
        diffuseColor.a *= mix(1.0, 0.08 + 0.62 * vaisenCgiFresnel, vaisenCgiInspection);
        ${output}
      `);
  };
  glass.customProgramCacheKey = () => key + "|cgi-inspection-glass-v1";
  pane.material = glass;
  const art = { uniform, get progress() {
    return uniform.value;
  }, update(value) {
    const next = clamp(value);
    if (next === uniform.value) return false;
    uniform.value = next;
    return true;
  } };
  pane.userData.inspectionGlass = art;
  return art;
}
function prepareCgiInspection(tower) {
  const module = tower.getObjectByName("CLOSED_cgi");
  const pane = module?.getObjectByName("cgi_GLASS");
  const mullions = module?.getObjectByName("PORTRAIT_cgi_MULLIONS");
  if (!pane?.material?.isMeshPhysicalMaterial || !mullions) throw new Error("Missing CGI inspection facade");
  if (pane.userData.cgiInspectionArt) return pane.userData.cgiInspectionArt;
  const glassArt = prepareInspectionGlass(module, "cgi"), uniform = glassArt.uniform, bounceUniform = { value: 0 };
  let cinematic = false;
  const room = module.getObjectByName("CGI_L02_BAKED_ROOM_PORTAL");
  if (room?.material?.isShaderMaterial) {
    const material = room.material;
    const marker = "#include <colorspace_fragment>";
    if (!material.fragmentShader.includes(marker)) throw new Error("Unsupported CGI room shader");
    material.uniforms.vaisenInspectionLight = bounceUniform;
    material.fragmentShader = "uniform float vaisenInspectionLight;\n" + material.fragmentShader.replace(marker, `

      if (vaisenInspectionLight > 0.001) {
      vec3 vaisenHit = origin + ray * nearest;
      vec3 vaisenA = (vaisenHit - vec3(-.32, 2.37, 5.46)) / vec3(.46, .42, .60);
      vec3 vaisenB = (vaisenHit - vec3(-.32, 2.38, 4.24)) / vec3(.46, .42, .60);
      vec3 vaisenC = (vaisenHit - vec3(-1.10, 2.37, 5.46)) / vec3(.46, .42, .60);
      vec3 vaisenD = (vaisenHit - vec3(-1.10, 2.38, 4.24)) / vec3(.46, .42, .60);
      float vaisenBounce = max(max(exp(-dot(vaisenA,vaisenA)),exp(-dot(vaisenB,vaisenB))),
                               max(exp(-dot(vaisenC,vaisenC)),exp(-dot(vaisenD,vaisenD))));
      gl_FragColor.rgb += vec3(.016, .021, .030) * vaisenBounce * vaisenInspectionLight;
      gl_FragColor.rgb += gl_FragColor.rgb * vec3(.07, .065, .055) * vaisenInspectionLight;
      }
      ${marker}`);
    material.needsUpdate = true;
  }
  for (const beam of mullions.children) {
    beam.scale.x *= 0.72;
    beam.scale.z *= 0.42;
  }
  const art = { uniform, get progress() {
    return uniform.value;
  }, setCinematic(enabled) {
    cinematic = Boolean(enabled);
    bounceUniform.value = cinematic ? uniform.value : 0;
  }, update(value) {
    const next = clamp(value);
    if (next === uniform.value) return false;
    uniform.value = next;
    bounceUniform.value = cinematic ? next : 0;
    return true;
  } };
  pane.userData.cgiInspectionArt = art;
  return art;
}
export {
  cgiGlassAlpha,
  cgiInspectionAtmosphere,
  prepareCgiInspection,
  prepareInspectionGlass
};
