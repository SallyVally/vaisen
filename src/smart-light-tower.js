import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSmartFrontMaterial, createSmartRoom, createSmartSuspensions } from "./smart-light-room.js";
import { createRoomRearCovers, createSectorGlass } from "./tower-cassette.js";
import { createWindowMullions, meterUV } from "./tower-lookdev.js";
import { displayPbrMaterial } from "./tower-materials.js";
import { installInteriorMotion } from "./interior-motion.js";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function smartTowerSector(original, study, structure) {
  if (original.id !== "smart-light" || original.bodyNode !== "V_RIGHT" || study.id !== "smart-light" || study.assetVersion !== "v02" || !structure.roomAndFrontAssetsUnchanged) throw new Error("Invalid approved Smart Light integration");
  for (const [index, room] of study.rooms.entries()) {
    const before = original.rooms[index];
    if (room.id !== before.id || !equal(room.portalCorners, before.portalCorners) || !equal(room.faces.map((f) => f.corners), before.faces.map((f) => f.corners))) throw new Error("Smart Light source geometry changed");
  }
  return { ...original, rooms: study.rooms, stage: "baked-study", projection: "smart-light", frontUrl: study.frontUrl, frontTriangles: study.frontTriangles, structureUrl: structure.structureUrl, structureTriangles: structure.structureTriangles, suspensions: study.suspensions };
}
async function buildSmartTowerModule(sector, study, materials, texture, blend, { loader = new GLTFLoader() } = {}) {
  const group = new THREE.Group();
  group.name = "CLOSED_smart-light";
  const [model, structure, dayRoom, dayProps, eveningRoom, eveningProps, eveningFront] = await Promise.all([loader.loadAsync(study.frontUrl), loader.loadAsync(sector.structureUrl), texture(study.assets.day.atlasUrl), texture(study.assets.day.propsAtlasUrl), texture(study.assets.evening.atlasUrl), texture(study.assets.evening.propsAtlasUrl), texture(study.assets.evening.frontAtlasUrl)]);
  eveningFront.flipY = false;
  const converted = new Map();
  model.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const convert = (original) => {
      if (!converted.has(original)) {
        const map = original.map ?? original.emissiveMap;
        if (!map) throw new Error("Missing approved Smart Light bake");
        converted.set(original, createSmartFrontMaterial(map, eveningFront, blend));
      }
      return converted.get(original);
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(convert) : convert(obj.material);
  });
  for (const material of converted.keys()) material.dispose();
  structure.scene.updateMatrixWorld(true);
  structure.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    if ((Array.isArray(obj.material) ? obj.material : [obj.material]).some((m) => m.name === "COLLECTION_Titanium")) {
      meterUV(obj);
      obj.material = materials.casing;
    } else for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) displayPbrMaterial(m);
  });
  group.add(model.scene, structure.scene, createSmartSuspensions(study.suspensions));
  const cover = displayPbrMaterial(new THREE.MeshStandardMaterial({ color: 724496, roughness: 0.6, side: THREE.DoubleSide }));
  group.add(createRoomRearCovers(sector, cover));
  for (const room of study.rooms) {
    const portal = createSmartRoom(room, { room: dayRoom, props: dayProps }, { room: eveningRoom, props: eveningProps }, blend, { physicalFirst: true, movable: true });
    installInteriorMotion(portal, room);
    portal.material.depthWrite = true;
    portal.material.side = THREE.FrontSide;
    portal.userData.virtualRoom = true;
    portal.userData.roomFaces = room.faces;
    group.add(portal);
  }
  const glass = displayPbrMaterial(new THREE.MeshPhysicalMaterial({ color: 14279398, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.FrontSide, envMapIntensity: 1 }));
  group.add(createSectorGlass(sector, glass), createWindowMullions(sector, materials.casing));
  group.traverse((obj) => {
    if (obj.isMesh) {
      const transparent = (Array.isArray(obj.material) ? obj.material : [obj.material]).some((m) => m.transparent);
      obj.castShadow = !obj.userData.virtualRoom && !transparent;
      obj.receiveShadow = true;
    }
  });
  return group;
}
import { SectorAssetLoader, replaceSectorLayout } from "./sector-asset-loader.js";
export {
  SectorAssetLoader as SmartTowerLoader,
  buildSmartTowerModule,
  replaceSectorLayout as replaceSmartTowerLayout,
  smartTowerSector
};
