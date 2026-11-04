function fadeWorld(root, visibility, excluded = new Set()) {
  const seen = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (seen.has(material) || excluded.has(material)) continue;
      seen.add(material);
      const compile = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader) => {
        compile(shader);
        shader.uniforms.uWorldVisibility = visibility;
        shader.fragmentShader = `uniform float uWorldVisibility;
${shader.fragmentShader}`.replace(/}\s*$/, "gl_FragColor.rgb *= uWorldVisibility;\n}");
      };
      material.customProgramCacheKey = () => `${key()}-world-reveal-v1`;
    }
  });
}
export {
  fadeWorld
};
