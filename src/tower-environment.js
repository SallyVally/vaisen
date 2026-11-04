import * as THREE from "three";
import { PORTRAIT_FLOW, portraitFlowPixels, updatePortraitFlow } from "./tower-atmosphere-motion.js";
import { SceneCaptureCache } from "./tower-render-cache.js";
import { SceneResolutionTargets } from "./tower-render-budget.js";
import { MixedResolutionFog } from "./tower-fog-field.js";
import { DensityCachedFog } from "./tower-fog-density.js";
import { captureAAPolicy, fuseCaptureFXAA } from "./tower-capture-aa.js";
import { mobileFogShader } from "./tower-mobile-fog.js";
import { MobileSceneLayers } from "./tower-mobile-layers.js";
function seededRandom(seed = 1421) {
  return () => {
    seed = Math.imul(1664525, seed) + 1013904223 >>> 0;
    return seed / 4294967296;
  };
}
function terrainHeight(x, z) {
  const edge = THREE.MathUtils.smoothstep(Math.hypot(x, z), 7, 21);
  const ridges = Math.abs(Math.sin(x * 0.23 + z * 0.12) * Math.cos(z * 0.31 - x * 0.08));
  const detail = Math.sin(x * 1.13 + z * 0.39) * Math.cos(z * 0.82) * 0.16;
  const corridor = x > 0 && z > 0 ? THREE.MathUtils.smoothstep(Math.abs(z - x * 1.12), 2, 5) : 1;
  return -0.34 + edge * corridor * (ridges * 0.9 + detail * 0.6);
}
function createTerrain({ clearings = [] } = {}) {
  const heightAt = (x, z) => {
    let height = terrainHeight(x, z);
    for (const clearing of clearings) {
      const distance = Math.hypot(x - clearing.x, z - clearing.z);
      const blend = THREE.MathUtils.smoothstep(distance, clearing.radius, clearing.radius + 3);
      height = THREE.MathUtils.lerp(-0.34, height, blend);
    }
    return height;
  };
  const group = new THREE.Group();
  group.name = "ROCKY_TERRAIN";
  const groundGeometry = new THREE.PlaneGeometry(100, 100, 96, 96);
  groundGeometry.rotateX(-Math.PI / 2);
  const positions = groundGeometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const y = heightAt(x, z);
    positions.setY(i, y);
    color.setRGB(0.012 + y * 2e-3, 0.014 + y * 2e-3, 0.013 + y * 2e-3);
    colors.push(color.r, color.g, color.b);
  }
  groundGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.02 }));
  group.add(ground);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 2);
  const rockPositions = rockGeometry.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
    const distortion = 0.85 + Math.sin(x * 5.3 + y * 8.1 + z * 3.8) * 0.19;
    rockPositions.setXYZ(i, x * distortion, y * distortion, z * distortion);
  }
  rockGeometry.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ color: 3685433, roughness: 0.85, flatShading: true }), 72);
  const random = seededRandom();
  const transform = new THREE.Object3D();
  for (let i = 0; i < rocks.count; i++) {
    let x, z;
    do {
      const angle = random() * Math.PI * 2;
      const radius = 9 + random() * 24;
      x = Math.sin(angle) * radius;
      z = Math.cos(angle) * radius;
    } while (Math.abs(Math.abs(z) - 4.8) < 4.5 && Math.abs(x) > 3 || x > 0 && z > 0 && Math.abs(z - 1.12 * x) < 7 || clearings.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius + 5));
    const size = 0.35 + random() ** 2 * 2.5;
    transform.position.set(x, heightAt(x, z) + size * 0.12, z);
    transform.scale.set(size * (0.8 + random()), size * (0.45 + random() * 0.35), size);
    transform.rotation.set(random(), random() * 6, random());
    transform.updateMatrix();
    rocks.setMatrixAt(i, transform.matrix);
  }
  rocks.computeBoundingSphere();
  group.add(rocks);
  return group;
}
function createAtmosphere(renderer, { portrait = false, cacheScene = false, mixedFog = false, densityFog = false, captureAA = "msaa", fogFieldScale = 0.5, cinematic = false, analyticFog = false, layeredScene = false } = {}) {
  const captureCache = new SceneCaptureCache(cacheScene);
  const layers = layeredScene ? new MobileSceneLayers() : null;
  let layersActive = false;
  const aa = captureAAPolicy(captureAA, portrait, renderer.capabilities.maxSamples);
  const stats = { sceneRenders: 0, liveRenders: 0, composites: 0, captureScale: 1, captureWidth: 1, captureHeight: 1, fogScale: 1, fieldRenders: 0, densityRenders: 0, fogMode: "native", captureAA: aa.label };
  const targets = new SceneResolutionTargets(() => new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace, samples: aa.samples, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) }));
  const target = targets.get(1);
  let currentTarget = target;
  const noiseBytes = fogNoisePixels();
  const noise = new THREE.DataTexture(noiseBytes, 128, 128);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.needsUpdate = true;
  const flow = portrait ? new THREE.DataTexture(portraitFlowPixels(seededRandom(811)), 128, 128) : noise;
  flow.wrapS = flow.wrapT = THREE.RepeatWrapping;
  flow.minFilter = flow.magFilter = THREE.LinearFilter;
  flow.needsUpdate = true;
  const material = new THREE.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, uniforms: { sceneColor: { value: target.texture }, sceneDepth: { value: target.depthTexture }, noiseMap: { value: noise }, inverseProjection: { value: new THREE.Matrix4() }, flowMap: { value: flow }, flowDrift: { value: new THREE.Vector4(0, 0, 0, 0) }, cameraWorld: { value: new THREE.Matrix4() }, eye: { value: new THREE.Vector3() }, time: { value: 0 }, strength: { value: 1 }, cinematic: { value: cinematic ? 1 : 0 }, visibleCeiling: { value: 1 }, liveLayer: { value: 0 }, introProgress: { value: 1 }, introLine: { value: new THREE.Vector4() }, introAspect: { value: 1 }, moodTint: { value: new THREE.Color(1, 1, 1) }, portrait: { value: portrait ? 1 : 0 }, texel: { value: new THREE.Vector2(1, 1) }, captureTexel: { value: new THREE.Vector2(1, 1) }, steam: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, releaseMist: { value: new THREE.Vector4(0, 0, 0, 0) }, releasePuffs: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, releaseAxes: { value: Array.from({ length: 4 }, () => new THREE.Vector4(1, 0, 0, 1)) }, releaseShapes: { value: Array.from({ length: 4 }, () => new THREE.Vector2(0.1, 0)) } }, vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `, fragmentShader: `
      uniform float visibleCeiling;
      uniform float liveLayer;
      uniform sampler2D sceneColor;
      uniform sampler2D sceneDepth;
      uniform sampler2D noiseMap;
      uniform sampler2D flowMap;
      uniform vec4 flowDrift;
      uniform mat4 inverseProjection;
      uniform mat4 cameraWorld;
      uniform vec3 eye;
      uniform float time;
      uniform float strength;
      uniform float cinematic;
      uniform float macroWeight;
      uniform float introProgress;
      uniform vec4 introLine;
      uniform float introAspect;
      uniform vec3 moodTint;
      uniform float portrait;
      uniform vec2 texel;
      uniform vec4 steam[4];
      uniform vec4 releaseMist;
      uniform vec4 releasePuffs[4];
      uniform vec4 releaseAxes[4];
      uniform vec2 releaseShapes[4];
      varying vec2 vUv;
      vec3 reconstruct(float depth) {
        vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        return (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
      }
      float density(vec3 p, float footprint) {
        float broad;
        float detail;
        vec2 flowWarp=vec2(0.0);
        if(portrait>0.5){
          flowWarp=texture2D(flowMap,p.xz*${PORTRAIT_FLOW.eddyScale}+flowDrift.zw+p.y*0.012).gb-0.5;
          broad=texture2D(flowMap,p.xz*${PORTRAIT_FLOW.worldScale}+flowDrift.xy+
            flowWarp*${PORTRAIT_FLOW.warp}+vec2(p.y*0.018,-p.y*0.009)).r;
          detail=texture2D(flowMap,p.xz*${PORTRAIT_FLOW.detailScale}-flowDrift.yx+
            flowWarp*${PORTRAIT_FLOW.detailWarp}+p.y*0.05).a;

          detail=mix(0.5,detail,1.0-smoothstep(0.7,3.0,footprint));
        }else{
          vec2 wind=vec2(time*0.007,time*-0.003);
          broad=texture2D(noiseMap,p.xz*0.013+wind).r;
          detail=texture2D(noiseMap,p.xz*0.047-wind*0.7+p.y*0.011).r;
        }
        float ground = exp(-max(p.y + 0.25, 0.0) * mix(1.8,0.85,portrait)) *
                       smoothstep(mix(0.25,0.30,portrait), mix(0.7,0.68,portrait), broad * 0.7 + detail * 0.3) * mix(0.07,0.105,portrait);
        float backdrop = exp(-pow((p.x + 3.0) / 6.0,2.0)-pow((p.z + 5.0) / 8.0,2.0)) *
                         exp(-max(p.y - 3.0,0.0)*0.16) * (0.35+detail*0.65) * portrait * 0.018;


        ground *= mix(1.0, .52 * (1.0-smoothstep(8.0,26.0,length(p.xz))), cinematic);
        backdrop *= mix(1.0, .10, cinematic);
        float vapor = 0.0;
        vec3 distortion=vec3(flowWarp.x*2.4,0.0,flowWarp.y*3.0)*portrait;
        for (int i = 0; i < 4; i++) {
          vec3 d = (p - steam[i].xyz - distortion) / mix(vec3(0.65, 2.6, 1.5),vec3(3.4,1.0,4.0),portrait);
          vapor += exp(-dot(d, d) * 1.8) * steam[i].w * (0.2 + detail * 0.8) * 0.65;
        }
        vapor *= mix(1.0, .55, cinematic);
        if(portrait>0.5 && releaseMist.w>0.0){
          vec3 local=(p-releaseMist.xyz-vec3(flowWarp.x*0.18,0.0,flowWarp.y*0.18))/vec3(0.48,0.8,0.85);
          vapor+=exp(-dot(local,local)*1.6)*releaseMist.w*(0.35+detail*0.65);
        }
        return (ground + vapor + backdrop) * strength;
      }
      float releaseDepth(vec3 ray,float endDistance){
        float result=0.0;
        for(int i=0;i<4;i++){
          if(releasePuffs[i].w<=0.0)continue;
          vec3 axis=normalize(releaseAxes[i].xyz);
          vec3 delta=eye-releasePuffs[i].xyz;
          float radial=1.0/max(0.001,releaseShapes[i].x*releaseShapes[i].x);
          float stretch=1.0/max(0.001,releaseAxes[i].w*releaseAxes[i].w)-radial;
          float along=dot(ray,axis),offset=dot(delta,axis);
          float a=radial+stretch*along*along;
          float b=radial*dot(delta,ray)+stretch*offset*along;
          float c=radial*dot(delta,delta)+stretch*offset*offset;
          float nearest=-b/a,sigma=inversesqrt(a);
          float visible=smoothstep(-2.0*sigma,2.0*sigma,endDistance-nearest)-smoothstep(-2.0*sigma,2.0*sigma,-nearest);
          vec3 closest=eye+ray*clamp(nearest,0.0,endDistance);
          float billow=texture2D(flowMap,closest.xz*0.16+vec2(releaseShapes[i].y*0.03,-releaseShapes[i].y*0.016)).r;
          result+=1.772454*sigma*exp(-max(0.0,c-b*b/a))*max(0.0,visible)*releasePuffs[i].w*(0.65+billow*0.55);
        }
        return result;
      }
      void main() {
        if(vUv.y>visibleCeiling){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}
        vec3 color = texture2D(sceneColor, vUv).rgb;
        float depth = texture2D(sceneDepth, vUv).x;
        vec3 surface = reconstruct(depth);
        vec3 ray = normalize(surface - eye);
        float endDistance = min(length(surface - eye), 75.0);
        float safeY = abs(ray.y) < 0.00001 ? (ray.y < 0.0 ? -0.00001 : 0.00001) : ray.y;
        float a = (-0.6 - eye.y) / safeY;
        float b = (9.0 - eye.y) / safeY;
        float start = max(0.0, min(a, b));
        float end = min(endDistance, max(a, b));
        float opticalDepth = 0.0;
        if (end > start) {
          float stepLength = (end - start) / 14.0;
          float jitter = portrait>0.5 ? 0.5 : texture2D(noiseMap, gl_FragCoord.xy / 128.0).r;
          for (int i = 0; i < 14; i++) {
            vec3 p = eye + ray * (start + (float(i) + jitter) * stepLength);
            opticalDepth += density(p, stepLength) * stepLength;
          }
        }
        float opacity = 1.0 - exp(-opticalDepth);
        vec3 fogColor=mix(vec3(0.028,0.033,0.032),mix(vec3(0.11,0.125,0.14),vec3(0.055,0.064,0.075),cinematic),portrait);
        color = mix(color, fogColor, opacity);
        if(portrait>0.5){
          float pressureOpacity=1.0-exp(-releaseDepth(ray,endDistance));
          color=mix(color,vec3(0.34,0.38,0.41),pressureOpacity*strength);
        }
        if(portrait>0.5){
          vec3 glow=vec3(0.0);
          for(int i=0;i<4;i++){
            vec2 offset=vec2(i==0?1.0:(i==1?-1.0:0.0),i==2?1.0:(i==3?-1.0:0.0))*texel*2.2;
            vec3 sampleColor=texture2D(sceneColor,vUv+offset).rgb;
            glow+=sampleColor*smoothstep(0.62,0.95,max(sampleColor.r,max(sampleColor.g,sampleColor.b)));
          }
          color+=glow*0.055*macroWeight;
        }
        if(cinematic>0.5){
          vec3 halo=vec3(0.0);
          for(int i=0;i<4;i++){
            vec2 offset=vec2(i==0?1.0:(i==1?-1.0:0.0),i==2?1.0:(i==3?-1.0:0.0))*texel*7.0;
            vec3 sampleColor=texture2D(sceneColor,vUv+offset).rgb;
            halo+=sampleColor*smoothstep(0.88,0.99,max(sampleColor.r,max(sampleColor.g,sampleColor.b)));
          }
          color+=halo*.018*macroWeight;
          vec2 edge=(vUv-.5)*vec2(1.0,.85);
          color*=1.0-.13*macroWeight*smoothstep(.18,.70,dot(edge,edge));
          float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
          color+=grain*.004*macroWeight*smoothstep(.015,.25,dot(color,vec3(.2126,.7152,.0722)));
        }

        if(liveLayer>.5){
          float luminous=smoothstep(.32,.90,max(color.r,max(color.g,color.b)));
          color*=1.0+.012*sin(time*.6+vUv.y*3.0)*luminous;
        }
        float gradeWeight=smoothstep(.012,.18,dot(color,vec3(.2126,.7152,.0722)));
        color*=mix(vec3(1.0),moodTint,gradeWeight);
        if(introProgress<1.0){
          vec2 point=vec2(vUv.x*introAspect,vUv.y);
          vec2 start=vec2(introLine.x*introAspect,introLine.y);
          vec2 end=vec2(introLine.z*introAspect,introLine.w);
          vec2 segment=end-start;
          float along=clamp(dot(point-start,segment)/max(dot(segment,segment),.000001),0.0,1.0);
          float lineDistance=length(point-(start+segment*along));
          float lineMask=1.0-smoothstep(.002,.007,lineDistance);
          float luminous=smoothstep(.32,.85,max(color.r,max(color.g,color.b)));
          float reveal=smoothstep(.20,.85,introProgress);
          color*=mix(.012,1.0,reveal)+(1.0-reveal)*lineMask*luminous*.94;
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    ` });
  material.uniforms.macroWeight = { value: 1 };
  if (analyticFog) material.fragmentShader = mobileFogShader(material.fragmentShader);
  const fxaaOptions = captureAA === "hybrid" ? { subpixel: 0.5, contrast: 8e-3 } : void 0;
  if (aa.fxaa) fuseCaptureFXAA(material, fxaaOptions);
  const screen = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const screenMesh = new THREE.Mesh(geometry, material);
  screen.add(screenMesh);
  const screenCamera = new THREE.Camera();
  const field = mixedFog && portrait && !analyticFog ? new MixedResolutionFog(material, { scale: fogFieldScale }) : null;
  const density = densityFog && !analyticFog ? DensityCachedFog.create(material, renderer) : null;
  let copyMaterial = null;
  function copyShader() {
    copyMaterial ??= new THREE.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, uniforms: { sceneColor: material.uniforms.sceneColor, captureTexel: material.uniforms.captureTexel, visibleCeiling: material.uniforms.visibleCeiling }, vertexShader: material.vertexShader, fragmentShader: `uniform sampler2D sceneColor;uniform float visibleCeiling;varying vec2 vUv;
        void main(){if(vUv.y>visibleCeiling){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}gl_FragColor=texture2D(sceneColor,vUv);
#include <colorspace_fragment>
}` });
    if (aa.fxaa) fuseCaptureFXAA(copyMaterial, fxaaOptions);
    return copyMaterial;
  }
  function capture(scene, camera, scale) {
    const selected = targets.get(scale);
    if (selected !== currentTarget) {
      currentTarget = selected;
      captureCache.invalidate();
    }
    material.uniforms.sceneColor.value = currentTarget.texture;
    material.uniforms.sceneDepth.value = currentTarget.depthTexture;
    material.uniforms.captureTexel.value.set(1 / currentTarget.width, 1 / currentTarget.height);
    stats.captureScale = scale;
    stats.captureWidth = currentTarget.width;
    stats.captureHeight = currentTarget.height;
    if (captureCache.needsCapture(camera)) {
      const scissor = currentTarget.scissor.clone(), scissorTest = currentTarget.scissorTest;
      try {
        const h = Math.min(currentTarget.height, Math.ceil(currentTarget.height * material.uniforms.visibleCeiling.value) + 4);
        currentTarget.scissor.set(0, 0, currentTarget.width, h);
        currentTarget.scissorTest = h < currentTarget.height;
        if (layersActive) {
          const before = layers.stats.baseRenders;
          layers.render(renderer, scene, camera, currentTarget);
          stats.sceneRenders += layers.stats.baseRenders - before;
          stats.liveRenders = layers.stats.liveRenders;
        } else {
          renderer.setRenderTarget(currentTarget);
          renderer.render(scene, camera);
          stats.sceneRenders++;
        }
      } finally {
        currentTarget.scissor.copy(scissor);
        currentTarget.scissorTest = scissorTest;
      }
      captureCache.captured(camera);
    }
  }
  function present(shader) {
    screenMesh.material = shader;
    renderer.setRenderTarget(null);
    renderer.render(screen, screenCamera);
    stats.composites++;
  }
  return { stats, setOpaqueTop(fraction) {
    const ceiling = 1 - Math.max(0, Math.min(0.8, Number.isFinite(fraction) ? fraction : 0));
    if (ceiling !== material.uniforms.visibleCeiling.value) {
      material.uniforms.visibleCeiling.value = ceiling;
      captureCache.invalidate();
      layers?.invalidate();
    }
  }, setLayered(enabled) {
    const next = Boolean(layers && enabled);
    if (next !== layersActive) {
      layersActive = next;
      material.uniforms.liveLayer.value = next ? 1 : 0;
      captureCache.invalidate();
      layers?.invalidate();
    }
  }, setCinematic(enabled) {
    material.uniforms.cinematic.value = enabled ? 1 : 0;
  }, setMacroWeight(value) {
    material.uniforms.macroWeight.value = value;
  }, setMoodTint(tint) {
    material.uniforms.moodTint.value.copy(tint);
  }, setIntro(progress, line, aspect) {
    material.uniforms.introProgress.value = progress;
    if (line) material.uniforms.introLine.value.copy(line);
    if (aspect) material.uniforms.introAspect.value = aspect;
  }, prepareMixedFog() {
    return field?.prepare(renderer, screen, screenMesh, screenCamera);
  }, prepareDensityFog() {
    return density?.prepare(renderer, screen, screenMesh, screenCamera);
  }, async prepareCaptureAA() {
    if (!aa.fxaa) return;
    const original = screenMesh.material;
    try {
      screenMesh.material = material;
      await renderer.compileAsync(screen, screenCamera);
    } finally {
      screenMesh.material = original;
    }
  }, async prepareCopy() {
    const original = screenMesh.material;
    try {
      screenMesh.material = copyShader();
      await renderer.compileAsync(screen, screenCamera);
    } finally {
      screenMesh.material = original;
    }
  }, async prepareScene(scene, camera, captureWork = null) {
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(currentTarget);
      await renderer.compileAsync(scene, camera);
      if (captureWork) await captureWork.prepare(renderer, scene, camera);
    } finally {
      renderer.setRenderTarget(previous);
    }
  }, invalidateScene() {
    captureCache.invalidate();
    layers?.invalidate();
  }, invalidateDynamic() {
    captureCache.invalidate();
  }, resize(width, height) {
    captureCache.resize(width, height);
    if (targets.resize(width, height)) currentTarget = targets.get(1);
    material.uniforms.texel.value.set(1 / width, 1 / height);
    field?.resize(width, height);
  }, render(scene, camera, time, steam, strength, releaseMist = null, releaseFX = null, captureScale = 1, fogScale = 1) {
    material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    material.uniforms.cameraWorld.value.copy(camera.matrixWorld);
    material.uniforms.eye.value.copy(camera.position);
    material.uniforms.time.value = time;
    if (portrait) updatePortraitFlow(time, material.uniforms.flowDrift.value);
    material.uniforms.strength.value = strength;
    material.uniforms.steam.value.forEach((entry, index) => entry.copy(steam[index]));
    if (releaseMist) material.uniforms.releaseMist.value.copy(releaseMist);
    else material.uniforms.releaseMist.value.set(0, 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      if (releaseFX) {
        material.uniforms.releasePuffs.value[i].copy(releaseFX.puffs[i]);
        material.uniforms.releaseAxes.value[i].copy(releaseFX.axes[i]);
        material.uniforms.releaseShapes.value[i].copy(releaseFX.shapes[i]);
      } else material.uniforms.releasePuffs.value[i].set(0, 0, 0, 0);
    }
    capture(scene, camera, captureScale);
    if (analyticFog) {
      stats.fogScale = 1;
      stats.fogMode = "analytic";
      present(material);
    } else if (density) {
      density.render(renderer, screen, screenMesh, screenCamera);
      stats.fogScale = 1;
      stats.fogMode = "grid";
      stats.densityRenders = density.renders;
      stats.composites++;
    } else if (field && fogScale === field.scale && strength >= 0 && strength <= 1) {
      field.render(renderer, screen, screenMesh, screenCamera);
      stats.fogScale = field.scale;
      stats.fogMode = field.scale === 0.5 ? "half" : "quarter";
      stats.fieldRenders++;
      stats.composites++;
    } else {
      stats.fogScale = 1;
      stats.fogMode = "native";
      present(material);
    }
  }, renderWithoutAtmosphere(scene, camera, captureScale = 1) {
    stats.fogScale = 0;
    stats.fogMode = "off";
    capture(scene, camera, captureScale);
    present(copyShader());
  }, dispose() {
    targets.dispose();
    layers?.dispose();
    field?.dispose();
    density?.dispose();
    copyMaterial?.dispose();
    noise.dispose();
    if (portrait) flow.dispose();
    material.dispose();
    geometry.dispose();
  } };
}
function fogNoisePixels() {
  const random = seededRandom(73);
  const pixels = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.floor(random() * 256);
    pixels.set([value, value, value, 255], i);
  }
  return pixels;
}
function createStudioEnvironment() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(197892);
  const panels = [{ position: [12, 8, 10], size: [8, 23], color: [4.5, 4.7, 4.6] }, { position: [-10, 7, -12], size: [3, 20], color: [3.8, 4.1, 4.2] }, { position: [0, 21, 1], size: [12, 8], color: [2.5, 2.4, 2.2] }];
  for (const panel of panels) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...panel.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(...panel.color), toneMapped: false, side: THREE.DoubleSide }));
    mesh.position.fromArray(panel.position);
    mesh.lookAt(0, 6, 0);
    scene.add(mesh);
  }
  return scene;
}
export {
  createAtmosphere,
  createStudioEnvironment,
  createTerrain,
  fogNoisePixels,
  seededRandom,
  terrainHeight
};
