import { DataTexture, RGBAFormat, ShaderChunk, SRGBColorSpace } from "three";
function displayPbrMaterial(material) {
  if (!material.isMeshStandardMaterial || material.userData.displayPbr) return material;
  material.userData.displayPbr = true;
  material.toneMapped = false;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = ShaderChunk.tonemapping_pars_fragment + "\n" + shader.fragmentShader.replace("#include <tonemapping_fragment>", "gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);");
  };
  material.customProgramCacheKey = () => "vaisen-display-pbr-v2";
  return material;
}
function prepareDisplayPbr(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) displayPbrMaterial(material);
  });
}
function createLayoutRoomAtlas() {
  const colors = [[54, 58, 56], [16, 18, 17], [32, 35, 33], [38, 41, 39], [38, 41, 39]];
  const pixels = new Uint8Array(20 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 20; x++) pixels.set([...colors[Math.floor(x / 4)], 255], (y * 20 + x) * 4);
  const texture = new DataTexture(pixels, 20, 4, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
function layoutRoomMetadata(room) {
  return { ...room, faces: room.faces.map((face, i) => ({ ...face, rect: [(i * 4 + 0.5) / 20, 0.125, 3 / 20, 0.75] })) };
}
export {
  createLayoutRoomAtlas,
  displayPbrMaterial,
  layoutRoomMetadata,
  prepareDisplayPbr
};
