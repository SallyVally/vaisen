function skipDarkLights(materials) {
  for (const material of materials) {
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = function(shader, renderer) {
      compile.call(this, shader, renderer);
      const direct = "if ( ! light.visible ) return false;", area = "vec3 rectCoords[4];";
      if (!shader.fragmentShader.includes(direct) || !shader.fragmentShader.includes(area)) throw new Error("Macro lighting shader contract changed");
      shader.fragmentShader = shader.fragmentShader
        .replace(direct, "if ( ! light.visible || all(equal(light.color,vec3(0.0))) ) return false;")
        .replace(area, "if(all(equal(rectAreaLight.color,vec3(0.0))))return;\n" + area);
    };
    material.customProgramCacheKey = () => key + "|macro-dark-lights-v1";
  }
}

async function waitForGpu(renderer) {
  const gl = renderer.getContext();
  if (!gl.fenceSync) return;
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) return;
  gl.flush();
  try {
    for (let attempt = 0; attempt < 250; attempt++) {
      if (gl.clientWaitSync(fence, 0, 0) !== gl.TIMEOUT_EXPIRED) return;
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  } finally {
    gl.deleteSync(fence);
  }
}

export { skipDarkLights, waitForGpu };
