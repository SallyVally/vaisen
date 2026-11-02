import { AlwaysDepth, Camera, DepthTexture, Mesh, NoBlending, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, UnsignedIntType, WebGLRenderTarget } from "three";
import { SceneCaptureCache } from "./tower-render-cache.js";
function liveSceneObject(object) {
  return object.name === "PORTRAIT_REFLECTING_WATER" || object.isPoints && object.parent?.name === "VAISEN_STAGE_LIFE" || object.isMesh && object.name.endsWith("_GLASS") || Boolean(object.userData.virtualRoom && object.userData.interiorMotion);
}
function sceneLayerScope(scene, live) {
  const changed = [];
  scene.traverse((object) => {
    if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite) || liveSceneObject(object) === live) return;
    changed.push([object, object.layers.mask]);
    object.layers.mask = 0;
  });
  return () => {
    for (const [object, mask] of changed) object.layers.mask = mask;
  };
}
class MobileSceneLayers {
  constructor() {
    this.cache = new SceneCaptureCache(true);
    this.target = null;
    this.stats = { baseRenders: 0, liveRenders: 0 };
    this.screen = new Scene();
    this.camera = new Camera();
    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({ depthTest: true, depthWrite: true, depthFunc: AlwaysDepth, blending: NoBlending, toneMapped: false, uniforms: { baseColor: { value: null }, baseDepth: { value: null } }, vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}", fragmentShader: `uniform sampler2D baseColor;uniform sampler2D baseDepth;varying vec2 vUv;
        void main(){gl_FragColor=texture2D(baseColor,vUv);gl_FragDepth=texture2D(baseDepth,vUv).x;
        #include <colorspace_fragment>
        }` });
    this.screen.add(new Mesh(this.geometry, this.material));
  }
  invalidate() {
    this.cache.invalidate();
  }
  render(renderer, scene, camera, output) {
    if (!this.target || this.target.width !== output.width || this.target.height !== output.height) {
      this.target?.dispose();
      this.target = new WebGLRenderTarget(output.width, output.height, { colorSpace: SRGBColorSpace, depthTexture: new DepthTexture(output.width, output.height, UnsignedIntType) });
      this.cache.resize(output.width, output.height);
      this.material.uniforms.baseColor.value = this.target.texture;
      this.material.uniforms.baseDepth.value = this.target.depthTexture;
    }
    this.target.scissor.copy(output.scissor);
    this.target.scissorTest = output.scissorTest;
    const previous = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, background: scene.background, shadow: renderer.shadowMap.enabled };
    try {
      if (this.cache.needsCapture(camera)) {
        const water = scene.getObjectByName("PORTRAIT_REFLECTING_WATER");
        if (water?.visible) water.onBeforeRender(renderer, scene, camera);
        const restore2 = sceneLayerScope(scene, false);
        try {
          renderer.autoClear = true;
          renderer.setRenderTarget(this.target);
          renderer.render(scene, camera);
        } finally {
          restore2();
        }
        this.cache.captured(camera);
        this.stats.baseRenders++;
      }
      renderer.autoClear = true;
      renderer.setRenderTarget(output);
      renderer.render(this.screen, this.camera);
      const restore = sceneLayerScope(scene, true);
      try {
        renderer.autoClear = false;
        scene.background = null;
        renderer.render(scene, camera);
        this.stats.liveRenders++;
      } finally {
        restore();
      }
    } finally {
      scene.background = previous.background;
      renderer.autoClear = previous.autoClear;
      renderer.shadowMap.enabled = previous.shadow;
      renderer.setRenderTarget(previous.target);
    }
  }
  dispose() {
    this.target?.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
export {
  MobileSceneLayers,
  liveSceneObject,
  sceneLayerScope
};
