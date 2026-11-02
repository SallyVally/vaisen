import { NearestFilter, NoColorSpace, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget } from "three";
function packFogWeights(ambient, pressure) {
  return [ambient, pressure].flatMap((value) => {
    const integer = Math.round(Math.max(0, Math.min(1, value)) * 65535);
    return [Math.floor(integer / 256), integer % 256];
  });
}
function unpackFogWeights(bytes) {
  return [(bytes[0] * 256 + bytes[1]) / 65535, (bytes[2] * 256 + bytes[3]) / 65535];
}
function fogDepthWeight(center, neighbor) {
  const tolerance = Math.max(0.08, center * 0.015), distance = Math.abs(center - neighbor);
  const t = Math.max(0, Math.min(1, (distance - tolerance) / tolerance));
  return 1 - t * t * (3 - 2 * t);
}
function fogFieldShaders(source) {
  const main = source.indexOf("void main() {"), march = source.indexOf("float depth = texture2D(sceneDepth, vUv).x;", main);
  const opacity = source.indexOf("float opacity = 1.0 - exp(-opticalDepth);", march);
  const glow = source.indexOf("if(portrait>0.5){\n          vec3 glow=", opacity), output = source.indexOf("gl_FragColor = vec4(color, 1.0);", glow);
  if (main < 0 || march < main || opacity < march || glow < opacity || output < glow) throw new Error("Atmosphere field shader contract changed");
  const prefix = source.slice(0, main).replace("uniform float portrait;", "const float portrait=1.0;");
  if (!prefix.includes("const float portrait=1.0;")) throw new Error("Mixed fog requires the portrait shader");
  const coefficients = `
    vec2 vaisenFogWeights(){
      ${source.slice(march, opacity)}
      float ambient=1.0-exp(-opticalDepth);
      float pressure=(1.0-exp(-releaseDepth(ray,endDistance)))*strength;
      return vec2(ambient*(1.0-pressure),pressure);
    }
  `;
  const pack = `
    vec4 vaisenPackFog(vec2 weights){
      vec2 quantized=floor(clamp(weights,0.0,1.0)*65535.0+0.5);
      vec2 high=floor(quantized/256.0),low=quantized-high*256.0;
      return vec4(high.x,low.x,high.y,low.y)/255.0;
    }
  `;
  const gather = `
    uniform sampler2D fogField;
    uniform vec2 fogSize;
    vec2 vaisenUnpackFog(vec4 encoded){
      return vec2(dot(encoded.rg,vec2(256.0,1.0)),dot(encoded.ba,vec2(256.0,1.0)))*(255.0/65535.0);
    }
    float vaisenFogGuide(float depth){
      vec4 view=inverseProjection*vec4(0.0,0.0,depth*2.0-1.0,1.0);
      return min(75.0,abs(view.z/view.w));
    }
    vec3 vaisenFogSample(vec2 cell,float bilinear,float center){
      vec2 uv=(clamp(cell,vec2(0.0),fogSize-1.0)+0.5)/fogSize;
      float neighbor=vaisenFogGuide(texture2D(sceneDepth,uv).x);
      float tolerance=max(0.08,center*0.015);
      float weight=bilinear*(1.0-smoothstep(tolerance,2.0*tolerance,abs(center-neighbor)));
      return vec3(vaisenUnpackFog(texture2D(fogField,uv))*weight,weight);
    }
  `;
  return { integrate: prefix + coefficients + pack + "\nvoid main(){if(vUv.y>visibleCeiling){gl_FragColor=vec4(0.0);return;}gl_FragColor=vaisenPackFog(vaisenFogWeights());}\n", composite: prefix + coefficients + gather + `
      void main(){
        ${source.slice(main + "void main() {".length, march)}
        float center=vaisenFogGuide(texture2D(sceneDepth,vUv).x);
        vec2 grid=vUv*fogSize-0.5,cell=floor(grid),f=fract(grid);
        vec3 gathered=vaisenFogSample(cell,(1.0-f.x)*(1.0-f.y),center);
        gathered+=vaisenFogSample(cell+vec2(1.0,0.0),f.x*(1.0-f.y),center);
        gathered+=vaisenFogSample(cell+vec2(0.0,1.0),(1.0-f.x)*f.y,center);
        gathered+=vaisenFogSample(cell+vec2(1.0),f.x*f.y,center);

        vec2 weights;
        if(gathered.z>0.00001)weights=gathered.xy/gathered.z;
        else weights=vaisenFogWeights();
        vec3 fogColor=mix(vec3(0.11,0.125,0.14),vec3(0.055,0.064,0.075),cinematic);
        color=color*max(0.0,1.0-weights.x-weights.y)+fogColor*weights.x+vec3(0.34,0.38,0.41)*weights.y;
        ${source.slice(glow, output)}
        gl_FragColor=vec4(color,1.0);
        #include <colorspace_fragment>
      }
    ` };
}
class MixedResolutionFog {
  constructor(native, { scale = 0.5 } = {}) {
    if (![0.25, 0.5].includes(scale)) throw new Error("Unsupported fog field scale");
    this.scale = scale;
    if (native.uniforms.portrait?.value !== 1) throw new Error("Mixed fog requires the portrait profile");
    const shaders = fogFieldShaders(native.fragmentShader);
    this.target = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, colorSpace: NoColorSpace, type: UnsignedByteType, depthBuffer: false, stencilBuffer: false, samples: 0 });
    this.target.texture.name = "VAISEN / Packed fog weights";
    this.target.texture.generateMipmaps = false;
    this.integrate = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, uniforms: native.uniforms, vertexShader: native.vertexShader, fragmentShader: shaders.integrate });
    this.composite = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, uniforms: { ...native.uniforms, fogField: { value: this.target.texture }, fogSize: { value: new Vector2(1, 1) } }, vertexShader: native.vertexShader, fragmentShader: shaders.composite });
  }
  resize(width, height) {
    const w = Math.max(1, Math.ceil(width * this.scale)), h = Math.max(1, Math.ceil(height * this.scale));
    this.target.setSize(w, h);
    this.composite.uniforms.fogSize.value.set(w, h);
  }
  async prepare(renderer, screen, mesh, camera) {
    const original = mesh.material;
    try {
      for (const material of [this.integrate, this.composite]) {
        mesh.material = material;
        await renderer.compileAsync(screen, camera);
      }
    } finally {
      mesh.material = original;
    }
  }
  render(renderer, screen, mesh, camera) {
    mesh.material = this.integrate;
    renderer.setRenderTarget(this.target);
    renderer.render(screen, camera);
    mesh.material = this.composite;
    renderer.setRenderTarget(null);
    renderer.render(screen, camera);
  }
  dispose() {
    this.target.dispose();
    this.integrate.dispose();
    this.composite.dispose();
  }
}
export {
  MixedResolutionFog,
  fogDepthWeight,
  fogFieldShaders,
  packFogWeights,
  unpackFogWeights
};
