import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
function captureAAPolicy(mode, portrait, maxSamples) {
  if (!["msaa", "fxaa", "hybrid", "none"].includes(mode)) throw new Error("Unknown scene-capture antialiasing");
  const samples = mode === "hybrid" ? Math.min(4, maxSamples) : mode === "msaa" ? Math.min(portrait ? 2 : 4, maxSamples) : 0;
  return { samples, fxaa: mode === "fxaa" || mode === "hybrid", label: mode === "hybrid" ? `MSAA ${samples} + FXAA` : mode === "fxaa" ? "FXAA" : mode === "none" ? "off" : `MSAA ${samples}` };
}
function portraitPixelRatio(width, height, dpr = 1, { presentation = false, mobile = false } = {}) {
  if (width < 740 || mobile) return Math.min(dpr, 1);
  if (!presentation) return Math.min(dpr, 1.25, Math.sqrt(26e5 / (width * height)));
  return Math.min(Math.max(1.5, dpr), 2, Math.max(1, Math.sqrt(6e6 / (width * height))));
}
function fuseCaptureFXAA(material, { subpixel = 0.25, contrast = 0.0312 } = {}) {
  if (material.userData.captureFXAA) return;
  const main = /void main\(\)\s*\{/, sample = /texture2D\(sceneColor,\s*vUv\)/;
  const official = FXAAShader.fragmentShader, index = official.search(main);
  if (index < 0 || !sample.test(material.fragmentShader) || !main.test(material.fragmentShader) || !material.uniforms.sceneColor || !(material.uniforms.captureTexel ?? material.uniforms.texel)) throw new Error("Capture FXAA shader contract changed");
  const library = official.slice(0, index).replace("varying vec2 vUv;", "").replace("float _SubpixelBlending = 1.0;", `float _SubpixelBlending = ${Number(subpixel).toFixed(2)};`).replace("float _ContrastThreshold = 0.0312;", `float _ContrastThreshold = ${Number(contrast).toFixed(4)};`);
  if (!library.includes(`float _SubpixelBlending = ${Number(subpixel).toFixed(2)};`)) throw new Error("Three FXAA configuration changed");
  material.fragmentShader = material.fragmentShader.replace(sample, "ApplyFXAA(tDiffuse,resolution,vUv)").replace(main, (match) => `${library}
${match}`);
  material.uniforms.tDiffuse = material.uniforms.sceneColor;
  material.uniforms.resolution = material.uniforms.captureTexel ?? material.uniforms.texel;
  material.userData.captureFXAA = true;
  material.needsUpdate = true;
}
export {
  captureAAPolicy,
  fuseCaptureFXAA,
  portraitPixelRatio
};
