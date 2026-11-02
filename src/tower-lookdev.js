import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { applyPresentationCamera, boxCorners } from "./tower-presentation.js";
import { displayPbrMaterial } from "./tower-materials.js";
import { seededRandom } from "./tower-environment.js";
import { PORTRAIT_CARDS } from "./tower-portrait-lighting.js";
import { reflectionScissor } from "./reflection-bounds.js";
import { PORTRAIT_CARDS as PORTRAIT_CARDS2 } from "./tower-portrait-lighting.js";
const PORTRAIT_BOUNDS = new THREE.Box3(new THREE.Vector3(-1.05, -0.02, -6.1), new THREE.Vector3(1.05, 13, 6.1));
function framePortrait(width, height, headerHeight = 76, footerHeight = 58, bounds = PORTRAIT_BOUNDS) {
  const portrait = width / height <= 1.15;
  const rect = portrait ? { left: 0.06, right: 0.94, top: Math.max(0.28, (headerHeight + 124) / height), bottom: 1 - (footerHeight + 30) / height } : { left: 0.43, right: 0.91, top: (headerHeight + 16) / height, bottom: 1 - (footerHeight + 48) / height };
  const target = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(1, 0, portrait ? 1.25 : 0.9).normalize();
  const fov = portrait ? 38 : 35;
  const shiftX = rect.left + rect.right - 1, shiftY = 1 - rect.top - rect.bottom;
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 180);
  let low = 10, high = 140;
  const poseAt = (distance) => {
    const position = target.clone().addScaledVector(direction, distance);
    position.y = 1.25;
    return { position, target, fov, shiftX, shiftY };
  };
  for (let i = 0; i < 25; i++) {
    const distance = (low + high) / 2;
    applyPresentationCamera(camera, poseAt(distance));
    const fits = boxCorners(bounds).every((corner) => {
      const p = corner.project(camera), x = (p.x + 1) / 2, y = (1 - p.y) / 2;
      return x > rect.left + 0.012 && x < rect.right - 0.012 && y > rect.top + 0.012 && y < rect.bottom - 0.012;
    });
    if (fits) high = distance;
    else low = distance;
  }
  return { ...poseAt(high), rect };
}
function createPortraitEnvironment(cards = PORTRAIT_CARDS) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(65794);
  for (const card of cards) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...card.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(...card.color), side: THREE.DoubleSide, toneMapped: false }));
    mesh.position.fromArray(card.position);
    mesh.lookAt(0, 6, 0);
    scene.add(mesh);
  }
  return scene;
}
function createPortraitMaterials(maps) {
  const body = displayPbrMaterial(new THREE.MeshStandardMaterial({ name: "VAISEN / Brushed platinum", color: new THREE.Color(0.095, 0.105, 0.115), map: maps.color, roughnessMap: maps.roughness, roughness: 0.78, metalness: 0.98, normalMap: maps.normal, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1 }));
  const casing = body.clone();
  casing.name = "VAISEN / Dark machined coating";
  casing.color.setRGB(0.065, 0.075, 0.09);
  casing.roughness = 0.95;
  casing.normalScale.set(0.12, 0.12);
  delete casing.userData.displayPbr;
  displayPbrMaterial(casing);
  const stone = displayPbrMaterial(new THREE.MeshStandardMaterial({ name: "VAISEN / Wet basalt", color: new THREE.Color(0.018, 0.021, 0.024), roughness: 0.94, metalness: 0.03, normalMap: maps.stoneNormal, normalScale: new THREE.Vector2(0.8, 0.8) }));
  const podium = displayPbrMaterial(new THREE.MeshStandardMaterial({ name: "VAISEN / Honed foundation", color: new THREE.Color(0.035, 0.039, 0.043), roughness: 0.4, metalness: 0.36, normalMap: maps.stoneNormal, normalScale: new THREE.Vector2(0.11, 0.11) }));
  return { body, casing, stone, podium };
}
function meterUV(mesh, tileSize = 2.4) {
  const old = mesh.geometry;
  const geometry = old.index ? old.toNonIndexed() : old.clone();
  const positions = geometry.attributes.position, uv = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    const points = [a.fromBufferAttribute(positions, i), b.fromBufferAttribute(positions, i + 1), c.fromBufferAttribute(positions, i + 2)].map((point) => point.clone().applyMatrix4(mesh.matrixWorld));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    const axis = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].indexOf(Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)));
    for (const p of points) uv.push(...(axis === 0 ? [p.z, p.y] : axis === 1 ? [p.x, p.z] : [p.x, p.y]).map((value) => value / tileSize));
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  mesh.geometry = geometry;
  old.dispose();
}
function landscapeHeight(x, z) {
  const edge = THREE.MathUtils.smoothstep(Math.hypot(x, z), 9, 24);
  return -0.59 + edge * (0.12 + 0.31 * Math.sin(x * 0.12 + z * 0.17) ** 2 + 0.055 * Math.sin(x * 0.8 - z * 0.4));
}
function createPortraitFoundation(materials) {
  const group = new THREE.Group();
  group.name = "PORTRAIT_FOUNDATION_AND_SHORE";
  const tiers = [[5.8, 14.8, -0.58, 0.38], [7.1, 16.3, -0.39, 0.12], [6.3, 15.5, -0.27, 0.12], [5.5, 14.7, -0.15, 0.12], [4.6, 14, -0.015, 0.15]];
  for (const [width, depth, y, thickness] of tiers) {
    const step = new THREE.Mesh(new RoundedBoxGeometry(width, thickness, depth, 2, 0.015), materials.podium);
    step.name = "FOUNDATION_STEP";
    step.position.y = y;
    step.castShadow = step.receiveShadow = true;
    group.add(step);
  }
  return group;
}
function createPortraitLandscape(materials) {
  const group = createPortraitFoundation(materials);
  const ground = new THREE.PlaneGeometry(110, 110, 88, 88);
  ground.rotateX(-Math.PI / 2);
  for (let i = 0; i < ground.attributes.position.count; i++) {
    const x = ground.attributes.position.getX(i), z = ground.attributes.position.getZ(i);
    ground.attributes.position.setY(i, landscapeHeight(x, z));
  }
  ground.computeVertexNormals();
  const shore = new THREE.Mesh(ground, materials.stone);
  shore.name = "WET_SHORE";
  shore.receiveShadow = true;
  group.add(shore);
  const random = seededRandom(601);
  const placements = [[-7, 8, 2.5], [-9, 12, 3], [-4, 16, 1.6], [2, 18, 1.3], [16, -4, 2.8], [19, -1, 2.3], [-7, -10, 3.4], [3, -12, 2.4], [10, -10, 4.2], [13, -5, 2.1], [-13, 0, 2.6], [-11, 7, 1.5], [-3, 20, 1.1], [1, 22, 1.4], [-6, 22, 1.6], [-15, 14, 2.4], [22, -5, 2.3], [-14, -16, 2.4], [15, -18, 2.7], [-18, -8, 1.5], [5, -20, 1.2], [20, 2, 2], [-10, 20, 2], [-18, 23, 1.8]];
  const rockMaterial = materials.stone.clone();
  rockMaterial.name = "VAISEN / Fractured basalt";
  rockMaterial.flatShading = true;
  delete rockMaterial.userData.displayPbr;
  displayPbrMaterial(rockMaterial);
  for (let variant = 0; variant < 3; variant++) {
    const sourceGeometry = new THREE.IcosahedronGeometry(1, 4);
    const geometry = mergeVertices(sourceGeometry);
    sourceGeometry.dispose();
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const shape = 0.85 + Math.sin(x * 4.1 + z * 3.3 + variant) * Math.cos(y * 5.6 - z * 2.4) * 0.16;
      p.setXYZ(i, THREE.MathUtils.clamp(x * shape, -0.78, 0.84), THREE.MathUtils.clamp(y * shape, -0.7, 0.72), THREE.MathUtils.clamp(z * shape, -0.8, 0.76));
    }
    geometry.computeVertexNormals();
    const positions = placements.filter((_, index) => index % 3 === variant);
    const rocks = new THREE.InstancedMesh(geometry, rockMaterial, positions.length);
    const transform = new THREE.Object3D();
    positions.forEach(([x, z, size], index) => {
      transform.position.set(x, landscapeHeight(x, z) + size * 0.24, z);
      transform.rotation.set(random() * 0.3, random() * Math.PI * 2, random() * 0.2);
      transform.scale.set(size * (0.9 + random() * 0.5), size * (0.45 + random() * 0.25), size * (0.8 + random() * 0.4));
      transform.updateMatrix();
      rocks.setMatrixAt(index, transform.matrix);
    });
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.computeBoundingSphere();
    group.add(rocks);
  }
  return group;
}
function createCoreEmitter() {
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.055, 3.8, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.9, 1.7), toneMapped: false }));
  light.name = "CORE_LIGHT_CHANNEL";
  light.position.set(0.725, 2.2, 0);
  return light;
}
function createWindowMullions(sector, material) {
  const group = new THREE.Group();
  group.name = `PORTRAIT_${sector.id}_MULLIONS`;
  const points = sector.glassCorners.map((p) => new THREE.Vector3(...p));
  for (const fraction of [1 / 3, 2 / 3]) {
    const bottom = points[0].clone().lerp(points[1], fraction);
    const top = points[3].clone().lerp(points[2], fraction);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.035, top.y - bottom.y, 0.026), material);
    beam.position.copy(bottom).lerp(top, 0.5);
    beam.position.x += sector.outward[0] * 0.018;
    beam.updateMatrixWorld();
    meterUV(beam);
    beam.castShadow = beam.receiveShadow = true;
    group.add(beam);
  }
  return group;
}
function createWetSurface(texture, resolution = 768, { crop = true, captureWork = null, depthFirst = false } = {}) {
  const surface = new Reflector(new THREE.PlaneGeometry(100, 100), { textureWidth: resolution, textureHeight: resolution, multisample: 0, clipBias: 3e-3, color: 263430, shader: { name: "VAISEN / Shallow water", uniforms: { tDiffuse: { value: null }, color: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, normalMap: { value: texture }, texel: { value: new THREE.Vector2(1 / resolution, 1 / resolution) }, motionTime: { value: 0 }, motionStrength: { value: 0 } }, vertexShader: `uniform mat4 textureMatrix; varying vec4 projected; varying vec3 worldPoint;
        void main(){ projected=textureMatrix*vec4(position,1.0); worldPoint=(modelMatrix*vec4(position,1.0)).xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`, fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D normalMap; uniform vec3 color; uniform vec2 texel;
        uniform float motionTime; uniform float motionStrength;
        varying vec4 projected; varying vec3 worldPoint;
        void main(){
          vec2 ripple=texture2D(normalMap,worldPoint.xz*0.085).rg*2.0-1.0;
          if(motionStrength>0.0){
            vec2 wind=vec2(motionTime*.008,-motionTime*.005);
            vec2 a=texture2D(normalMap,worldPoint.xz*.085+wind).rg*2.0-1.0;
            vec2 b=texture2D(normalMap,worldPoint.zx*.12-wind*.7).rg*2.0-1.0;
            ripple=mix(ripple,a*.65+b*.35,motionStrength);
          }
          vec2 uv=projected.xy/projected.w+ripple*vec2(0.0012,0.003);
          vec3 reflection=texture2D(tDiffuse,uv).rgb*0.4;
          reflection+=texture2D(tDiffuse,uv+texel*vec2(1.8,0.8)).rgb*0.15;
          reflection+=texture2D(tDiffuse,uv-texel*vec2(1.8,0.8)).rgb*0.15;
          reflection+=texture2D(tDiffuse,uv+texel*vec2(-1.8,0.8)).rgb*0.15;
          reflection+=texture2D(tDiffuse,uv-texel*vec2(-1.8,0.8)).rgb*0.15;
          float grazing=pow(1.0-clamp(normalize(cameraPosition-worldPoint).y,0.0,1.0),3.0);
          vec3 waterColor=color+reflection*(0.12+grazing*0.38);
          float ribbon=pow(.5+.5*sin(worldPoint.z*.9+sin(worldPoint.x*.35-motionTime*.16)+motionTime*.45),18.0);
          float radius=length(worldPoint.xz);
          float ribbonMask=smoothstep(4.0,7.0,radius)*(1.0-smoothstep(18.0,32.0,radius));
          waterColor+=vec3(.003,.0045,.006)*ribbon*ribbonMask*motionStrength;
          gl_FragColor=vec4(waterColor,1.0);
          #include <colorspace_fragment>
        }` } });
  surface.name = "PORTRAIT_REFLECTING_WATER";
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = -0.47;
  surface.material.toneMapped = false;
  if (depthFirst) surface.renderOrder = -10;
  let dirty = true;
  const reflect = surface.onBeforeRender;
  surface.userData.reflectionStats = { captures: 0, pixelFraction: 1 };
  surface.onBeforeRender = function(...args) {
    if (!dirty) return;
    const target = surface.getRenderTarget(), rect = crop ? reflectionScissor(surface, args[2], target.width, target.height) : new THREE.Vector4(0, 0, target.width, target.height);
    if (!rect) {
      surface.userData.reflectionStats.pixelFraction = 0;
      return;
    }
    target.scissor.copy(rect);
    target.scissorTest = true;
    const draw = () => reflect.apply(this, args);
    if (captureWork) captureWork.run(args[1], draw);
    else draw();
    dirty = false;
    surface.userData.reflectionStats.captures++;
    surface.userData.reflectionStats.pixelFraction = rect.z * rect.w / (target.width * target.height);
  };
  surface.userData.invalidate = () => {
    dirty = true;
  };
  return surface;
}
export {
  PORTRAIT_BOUNDS,
  PORTRAIT_CARDS2 as PORTRAIT_CARDS,
  createCoreEmitter,
  createPortraitEnvironment,
  createPortraitFoundation,
  createPortraitLandscape,
  createPortraitMaterials,
  createWetSurface,
  createWindowMullions,
  framePortrait,
  landscapeHeight,
  meterUV
};
