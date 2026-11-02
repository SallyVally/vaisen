import { HalfFloatType, LinearFilter, NoColorSpace, RGFormat, ShaderMaterial, WebGLRenderTarget } from "three";
const FOG_DENSITY_GRID = Object.freeze({ cells: 128, layers: 32, columns: 4, padding: 1, min: -32, max: 32, bottom: -0.6, top: 9 });
const G = FOG_DENSITY_GRID, tile = G.cells + 2 * G.padding, rows = Math.ceil(G.layers / G.columns);
const width = tile * G.columns, height = tile * rows;
const glsl = (value) => Number.isInteger(value) ? `${value}.0` : `${value}`;
function densityGridAddress(point) {
  const layer = Math.max(0, Math.min(G.layers - 1, (point[1] - G.bottom) / (G.top - G.bottom) * (G.layers - 1)));
  const address = (slice) => [(slice % G.columns * tile + G.padding + (point[0] - G.min) / (G.max - G.min) * G.cells) / width, (Math.floor(slice / G.columns) * tile + G.padding + (point[2] - G.min) / (G.max - G.min) * G.cells) / height];
  return { lower: address(Math.floor(layer)), upper: address(Math.min(G.layers - 1, Math.floor(layer) + 1)), blend: layer % 1 };
}
function fogDensityShaders(source) {
  const density = source.indexOf("float density(vec3 p, float footprint) {"), main = source.indexOf("void main() {");
  const march = "opticalDepth += density(p, stepLength) * stepLength;";
  if (density < 0 || main < density || !source.includes(march) || !source.includes("uniform float portrait;") || !source.includes("uniform vec4 releaseMist;")) throw new Error("Fog density shader contract changed");
  const native = source.replace("uniform float portrait;", "const float portrait=1.0;").replace("float density(vec3 p, float footprint) {", "float vaisenNativeDensity(vec3 p, float footprint) {");
  const prefix = native.slice(0, native.indexOf("void main() {"));
  const field = prefix.replace("uniform vec4 releaseMist;", "const vec4 releaseMist=vec4(0.0);") + `
    void main(){
      vec2 cell=mod(gl_FragCoord.xy,${glsl(tile)})-${glsl(G.padding)};
      vec2 atlasTile=floor(gl_FragCoord.xy/${glsl(tile)});
      float layer=atlasTile.x+atlasTile.y*${glsl(G.columns)};
      vec2 horizontal=${glsl(G.min)}+cell*${glsl((G.max - G.min) / G.cells)};
      float vertical=mix(${glsl(G.bottom)},${glsl(G.top)},layer/${glsl(G.layers - 1)});
      vec3 p=vec3(horizontal.x,vertical,horizontal.y);
      gl_FragColor=vec4(vaisenNativeDensity(p,0.0),vaisenNativeDensity(p,3.0),0.0,1.0);
    }
  `;
  const sampling = `
    uniform sampler2D vaisenDensityGrid;
    vec2 vaisenDensitySlice(vec2 plane,float slice){
      vec2 atlasTile=vec2(mod(slice,${glsl(G.columns)}),floor(slice/${glsl(G.columns)}));
      return texture2D(vaisenDensityGrid,(atlasTile*${glsl(tile)}+plane)/vec2(${glsl(width)},${glsl(height)})).rg;
    }
    float density(vec3 p,float footprint){
      if(any(lessThan(p,vec3(${glsl(G.min)},${glsl(G.bottom)},${glsl(G.min)})))||
         any(greaterThan(p,vec3(${glsl(G.max)},${glsl(G.top)},${glsl(G.max)}))))return vaisenNativeDensity(p,footprint);

      if(releaseMist.w>0.0){
        vec3 local=(p-releaseMist.xyz)/vec3(0.48,0.8,0.85);
        if(dot(local,local)<25.0)return vaisenNativeDensity(p,footprint);
      }
      vec2 plane=(p.xz-(${glsl(G.min)}))*${glsl(G.cells / (G.max - G.min))}+${glsl(G.padding)};
      float layer=clamp((p.y-(${glsl(G.bottom)}))*${glsl((G.layers - 1) / (G.top - G.bottom))},0.0,${glsl(G.layers - 1)});
      float lower=floor(layer),upper=min(lower+1.0,${glsl(G.layers - 1)});
      vec2 coefficients=mix(vaisenDensitySlice(plane,lower),vaisenDensitySlice(plane,upper),fract(layer));
      float detail=1.0-smoothstep(0.7,3.0,footprint);
      return mix(coefficients.g,coefficients.r,detail);
    }
  `;
  return { field, composite: prefix + sampling + native.slice(native.indexOf("void main() {")) };
}
class DensityCachedFog {
  static create(native, renderer) {
    if (native.uniforms.portrait?.value !== 1 || !renderer.extensions?.has("EXT_color_buffer_float") || renderer.capabilities.maxTextureSize < Math.max(width, height)) return null;
    return new DensityCachedFog(native);
  }
  constructor(native) {
    const shaders = fogDensityShaders(native.fragmentShader);
    this.uniforms = native.uniforms;
    this.state = null;
    this.renders = 0;
    this.target = new WebGLRenderTarget(width, height, { type: HalfFloatType, format: RGFormat, colorSpace: NoColorSpace, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, stencilBuffer: false, samples: 0 });
    this.target.texture.name = "VAISEN / World-space fog density";
    this.target.texture.generateMipmaps = false;
    this.field = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, uniforms: native.uniforms, vertexShader: native.vertexShader, fragmentShader: shaders.field });
    this.composite = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, uniforms: { ...native.uniforms, vaisenDensityGrid: { value: this.target.texture } }, vertexShader: native.vertexShader, fragmentShader: shaders.composite });
  }
  async prepare(renderer, screen, mesh, camera) {
    const original = mesh.material;
    try {
      for (const material of [this.field, this.composite]) {
        mesh.material = material;
        await renderer.compileAsync(screen, camera);
      }
    } finally {
      mesh.material = original;
    }
  }
  currentState() {
    const u = this.uniforms;
    return [u.flowMap.value, u.flowMap.value.version, u.strength.value, u.cinematic.value, ...u.flowDrift.value.toArray(), ...u.steam.value.flatMap((entry) => entry.toArray())];
  }
  render(renderer, screen, mesh, camera) {
    const state = this.currentState(), original = mesh.material;
    try {
      if (!this.state || state.some((value, index) => value !== this.state[index])) {
        mesh.material = this.field;
        renderer.setRenderTarget(this.target);
        renderer.render(screen, camera);
        this.state = state;
        this.renders++;
      }
      mesh.material = this.composite;
      renderer.setRenderTarget(null);
      renderer.render(screen, camera);
    } finally {
      mesh.material = original;
    }
  }
  dispose() {
    this.target.dispose();
    this.field.dispose();
    this.composite.dispose();
  }
}
export {
  DensityCachedFog,
  FOG_DENSITY_GRID,
  densityGridAddress,
  fogDensityShaders
};
