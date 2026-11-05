import { Camera, FramebufferTexture, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from "three";

class SceneHandover {
  constructor(renderer, duration = 1.15) {
    this.renderer = renderer;
    this.duration = duration;
    this.age = 0;
    const size = renderer.getDrawingBufferSize(new Vector2());
    this.texture = new FramebufferTexture(size.x, size.y);
    renderer.copyFramebufferToTexture(this.texture);
    this.material = new ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { frame: { value: this.texture }, opacity: { value: 1 } },
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
      fragmentShader: "uniform sampler2D frame;uniform float opacity;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(frame,vUv).rgb,opacity);}"
    });
    this.geometry = new PlaneGeometry(2, 2);
    this.scene = new Scene();
    this.scene.add(new Mesh(this.geometry, this.material));
    this.camera = new Camera();
  }
  render(dt) {
    this.age = Math.min(this.duration, this.age + dt);
    const t = this.age / this.duration;
    if (t >= 1) {
      this.dispose();
      return false;
    }
    this.material.uniforms.opacity.value = 1 - t * t * (3 - 2 * t);
    const autoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.autoClear = autoClear;
    }
    return true;
  }
  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
export { SceneHandover };
