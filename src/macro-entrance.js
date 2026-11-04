import * as THREE from "three";
import { createPortraitLighting } from "./tower-portrait-lighting.js";
import { configureA2Lighting } from "./stage-a2.js";
import { createWetSurface, createCoreEmitter } from "./tower-lookdev.js";
import { createDetailTower } from "./macro-metal.js";
import { fadeWorld } from "./macro-world.js";
import { DURATION, smooth, shotAt, applyShot } from "./macro-shot.js";
import { optimizePortraitLightWork } from "./tower-light-work.js";
import { batchPortraitModules } from "./tower-rigid-batches.js";
import { MobileSurfaceWork } from "./tower-mobile-surface.js";
import { MobileReflectionProxy } from "./tower-mobile-reflection.js";
import { optimizeAreaTree } from "./tower-area-work.js";
import { reduceBakedInteriorShadows, simplifyRoughLandscapeArea } from "./tower-crisp-detail.js";
function cloneStage(source, cache) {
  const material = (original) => {
    if (!cache.has(original)) {
      const copy = original.clone(), key = original.customProgramCacheKey();
      copy.onBeforeCompile = original.onBeforeCompile;
      copy.customProgramCacheKey = () => key + "|macro-copy-v1";
      if (copy.uniforms) {
        for (const [name, uniform] of Object.entries(original.uniforms)) if (uniform.value?.isTexture) copy.uniforms[name].value = uniform.value;
      }
      cache.set(original, copy);
    }
    return cache.get(original);
  };
  const visit = (object) => {
    let copy;
    if (object.isMesh) {
      const materials = Array.isArray(object.material) ? object.material.map(material) : material(object.material);
      if (object.isInstancedMesh) {
        copy = new THREE.InstancedMesh(object.geometry, materials, object.count);
        copy.instanceMatrix.copy(object.instanceMatrix);
        if (object.instanceColor) copy.instanceColor = object.instanceColor.clone();
      } else copy = new THREE.Mesh(object.geometry, materials);
      copy.castShadow = object.castShadow;
      copy.receiveShadow = object.receiveShadow;
      if (copy.material.uniforms?.roomWorldInverse) copy.onBeforeRender = () => copy.material.uniforms.roomWorldInverse.value.copy(copy.matrixWorld).invert();
    } else if (object.isLight) copy = object.clone();
    else copy = new THREE.Group();
    copy.name = object.name;
    copy.position.copy(object.position);
    copy.quaternion.copy(object.quaternion);
    copy.scale.copy(object.scale);
    copy.matrix.copy(object.matrix);
    copy.matrixAutoUpdate = object.matrixAutoUpdate;
    copy.visible = object.visible;
    copy.frustumCulled = object.frustumCulled;
    copy.renderOrder = object.renderOrder;
    copy.layers.mask = object.layers.mask;
    copy.userData = { ...object.userData };
    if (!object.isLight) for (const child of object.children) copy.add(visit(child));
    return copy;
  };
  return visit(source);
}
class MacroEntrance {
  constructor({ renderer, mainScene, tower, landscape, materials, maps, farPose, mobile = false, publish = () => {
  } }) {
    Object.assign(this, { renderer, mainScene, farPose, mobile, publish });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0);
    this.scene.fog = new THREE.FogExp2(0, 0.012);
    this.scene.environment = mainScene.environment;
    this.scene.environmentIntensity = 0.38;
    this.materialCopies = new Map();
    const model = cloneStage(tower, this.materialCopies);
    this.scene.add(model, cloneStage(landscape, this.materialCopies), createCoreEmitter());
    this.rig = configureA2Lighting(createPortraitLighting());
    this.scene.add(this.rig);
    if (mobile) this.rig.traverse((light) => {
      if (light.castShadow) light.shadow.mapSize.set(1024, 1024);
    });
    this.lights = [];
    this.rig.traverse((light) => {
      if (light.isLight) this.lights.push({ light, intensity: light.intensity });
    });
    this.reflectionWork = mobile ? new MobileReflectionProxy() : null;
    this.water = createWetSurface(maps.stoneNormal, mobile ? 512 : 768, { crop: true, captureWork: this.reflectionWork, depthFirst: mobile });
    this.scene.add(this.water);
    this.detail = { value: 1 };
    this.world = { value: 0 };
    const body = this.materialCopies.get(materials.body);
    this.hero = createDetailTower(model, { body }, maps, renderer, this.detail, { mobile });
    this.macroRig = new THREE.Group();
    this.scene.add(this.macroRig);
    const area = (color, intensity, w, h, position, target, opening) => {
      const light = new THREE.RectAreaLight(color, 0, w, h);
      light.position.fromArray(position);
      light.lookAt(...target);
      light.userData = { intensity, opening };
      this.macroRig.add(light);
      return light;
    };
    this.strip = area(15199992, 27, 0.11, 5.5, [2.7, 10.2, 2.4], [0.9, 10.1, 5.05], [1, 3.4]);
    if (!mobile) area(13359598, 1.8, 2.8, 5.8, [4.8, 12.4, 6.1], [0.9, 10, 4.9], [1.6, 3.8]);
    area(16766880, 12, 0.055, 3.5, [1.1, 10.2, 6.7], [0.9, 10, 4.9], [0.55, 2.2]);
    if (mobile) {
      reduceBakedInteriorShadows(this.scene);
      batchPortraitModules(this.scene);
      optimizePortraitLightWork(this.scene);
      optimizeAreaTree(this.scene, { world: true });
      simplifyRoughLandscapeArea(this.scene);
      new MobileSurfaceWork(this.scene).register(this.scene);
      this.reflectionWork.register(this.scene);
    }
    fadeWorld(this.scene, this.world, this.hero.materials);
    this.worldMeshes = [];
    if (mobile) this.scene.traverse((object) => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every((material) => !this.hero.materials.has(material))) this.worldMeshes.push(object);
    });
    const reflect = this.water.onBeforeRender, world = this.world;
    this.water.onBeforeRender = function(...args) {
      if (world.value > 0) reflect.apply(this, args);
    };
    this.age = 0;
    this.active = false;
    this.disposed = false;
    this.started = false;
    this.lastPublish = -Infinity;
    this.skipping = null;
  }
  async prepare(camera) {
    const warm = camera.clone();
    warm.near = 8e-3;
    applyShot(warm, shotAt(3, this.farPose()));
    this.hero.update(1);
    await this.renderer.compileAsync(this.scene, warm);
    if (this.reflectionWork) await this.reflectionWork.prepare(this.renderer, this.scene, warm);
  }
  start() {
    if (this.disposed || this.started) return false;
    this.age = 0;
    this.active = true;
    this.started = true;
    this.lastPublish = -Infinity;
    this.notify(shotAt(0, this.farPose()), true);
    return true;
  }
  skip(immediate = false) {
    if (this.disposed) return;
    if (!this.active || immediate) {
      this.age = DURATION;
      this.release();
      return;
    }
    if (!this.skipping) this.skipping = { from: this.age, age: 0, duration: Math.min(0.85, Math.max(0.2, (DURATION - this.age) * 0.16)) };
  }
  tick(dt) {
    if (this.skipping) {
      const skip = this.skipping;
      skip.age = Math.min(skip.duration, skip.age + dt);
      const u = skip.age / skip.duration;
      this.age = (2 * u * u * u - 3 * u * u + 1) * skip.from + (u * u * u - 2 * u * u + u) * skip.duration + (-2 * u * u * u + 3 * u * u) * DURATION;
    } else this.age = Math.min(DURATION, this.age + dt);
    return this.age >= DURATION - 1e-8;
  }
  notify(pose, force = false) {
    if (!force && this.age - this.lastPublish < 1 / 15) return;
    this.lastPublish = this.age;
    this.publish({ active: true, progress: this.age / DURATION, opening: pose.opening, reveal: pose.reveal, ui: smooth(0.6, 2.2, this.age) });
  }
  render(camera, atmosphere, steam) {
    const pose = shotAt(this.age, this.farPose()), post = smooth(14, 18, this.age);
    camera.near = 8e-3;
    applyShot(camera, pose);
    this.detail.value = pose.detail;
    this.hero.update(pose.detail);
    this.world.value = pose.world;
    for (const object of this.worldMeshes) object.visible = pose.world > 0;
    const boost = THREE.MathUtils.lerp(1, this.hero.lightBoost, pose.light);
    this.scene.environmentIntensity = 0.38 * boost * smooth(1.3, 3.6, this.age);
    this.scene.fog.density = 0.012 * (1 - post);
    for (const light of this.macroRig.children) {
      const { intensity, opening } = light.userData;
      light.intensity = intensity * pose.light * boost * smooth(...opening, this.age);
    }
    this.strip.position.z = THREE.MathUtils.lerp(2.2, 3.7, smooth(0, 8, this.age));
    this.strip.position.y = 10.15 - 0.65 * smooth(0, 8, this.age);
    this.strip.lookAt(0.9, 10.1, 5.03);
    for (const { light, intensity } of this.lights) light.intensity = intensity * pose.key;
    if (pose.world > 0) this.water.userData.invalidate();
    atmosphere.setLayered(false);
    atmosphere.setMacroWeight(post);
    atmosphere.invalidateScene();
    if (this.mobile && post === 0) atmosphere.renderWithoutAtmosphere(this.scene, camera);
    else atmosphere.render(this.scene, camera, 0, steam, post);
    this.notify(pose);
  }
  release() {
    if (this.disposed) return;
    this.active = false;
    this.disposed = true;
    const retained = new Set();
    this.mainScene.traverse((object) => {
      if (object.geometry) retained.add(object.geometry);
    });
    const geometries = new Set(), materials = new Set(this.materialCopies.values());
    this.scene.traverse((object) => {
      if (object.geometry && !retained.has(object.geometry)) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object.isLight) object.shadow?.map?.dispose();
    });
    this.water.getRenderTarget().dispose();
    this.reflectionWork?.dispose();
    this.hero.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.scene.clear();
    this.materialCopies.clear();
    this.scene = null;
    this.hero = null;
    this.water = null;
    this.rig = null;
    this.macroRig = null;
    this.strip = null;
    this.lights = [];
    this.worldMeshes = [];
    this.reflectionWork = null;
    this.publish({ active: false, progress: 1, opening: 1, reveal: 1, ui: 1 });
  }
}
export {
  MacroEntrance
};
