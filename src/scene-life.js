import { BufferGeometry, Float32BufferAttribute, Group, Points, ShaderMaterial, Vector3 } from "three";
class SceneLife {
  constructor(water) {
    this.time = 0;
    this.elapsed = 0;
    this.pending = 0;
    this.water = water;
    this.group = new Group();
    this.group.name = "VAISEN_STAGE_LIFE";
    let seed = 42;
    const random = () => {
      seed = 1664525 * seed + 1013904223 >>> 0;
      return seed / 4294967296;
    };
    const positions = [], seeds = [];
    for (let i = 0; i < 54; i++) {
      const angle = random() * Math.PI * 2, radius = 6 + random() * 13;
      positions.push(Math.cos(angle) * radius, 0.6 + random() * 9, Math.sin(angle) * radius);
      seeds.push(random());
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
    const material = new ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, uniforms: { lifeTime: { value: 0 }, pixelRatio: { value: 1 }, visibility: { value: 1 } }, vertexShader: `attribute float aSeed;uniform float lifeTime;uniform float pixelRatio;uniform float visibility;varying float vAlpha;
        void main(){
          vec3 p=position;
          p.x+=sin(lifeTime*.17+aSeed*6.28)*1.8;
          p.z+=cos(lifeTime*.11+aSeed*11.0)*1.1;
          p.y+=sin(lifeTime*.14+aSeed*8.0)*.65;
          vec4 view=modelViewMatrix*vec4(p,1.0);
          float glint=.35+.65*pow(.5+.5*sin(lifeTime*.37+aSeed*19.0),2.0);
          vAlpha=glint*.28*visibility;
          gl_PointSize=clamp((2.2+aSeed*2.8)*pixelRatio*28.0/max(1.0,-view.z),1.0,4.5*pixelRatio);
          gl_Position=projectionMatrix*view;
        }`, fragmentShader: `varying float vAlpha;
        void main(){float d=length(gl_PointCoord-.5);float soft=1.0-smoothstep(.05,.5,d);
          gl_FragColor=vec4(vec3(.56,.63,.68),soft*vAlpha);
          #include <colorspace_fragment>
        }` });
    this.particles = new Points(geometry, material);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
    this.position = new Vector3();
  }
  tick(dt, { enabled = true, mobile = false, pixelRatio = 1, strength = 1 } = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error("Invalid scene-life step");
    if (!enabled) {
      this.pending = 0;
      return false;
    }
    this.elapsed += dt;
    this.pending += dt;
    if (this.pending < 1 / (mobile ? 12 : 30)) return false;
    this.pending = 0;
    this.time = this.elapsed;
    this.particles.geometry.setDrawRange(0, mobile ? 18 : 54);
    this.particles.material.uniforms.lifeTime.value = this.time;
    this.particles.material.uniforms.pixelRatio.value = pixelRatio;
    this.water.material.uniforms.motionTime.value = this.time;
    this.water.material.uniforms.motionStrength.value = (mobile ? 0.6 : 1) * strength;
    return true;
  }
  setVisibility(value) {
    this.particles.material.uniforms.visibility.value = Math.max(0, Math.min(1, value));
  }
  lightPosition(base, weight = 1) {
    return this.position.set(base[0] + 0.65 * Math.sin(this.time * 0.16) * weight, base[1] + 0.38 * Math.sin(this.time * 0.11) * weight, base[2] + 0.48 * Math.sin(this.time * 0.13) * weight);
  }
  dispose() {
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.group.removeFromParent();
  }
}
export {
  SceneLife
};
