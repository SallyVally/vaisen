import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createBakedRoom } from "./l02-room-projection.js";
import { createMusicRoom } from "./music-room-projection.js";
import { createRoomRearCovers, createSectorGlass } from "./tower-cassette.js";
import { displayPbrMaterial, prepareDisplayPbr } from "./tower-materials.js";
import { installInteriorMotion } from "./interior-motion.js";
import { gradeInteriorFront, gradeInteriorRoom } from "./interior-look.js";
import { createWindowMullions, meterUV } from "./tower-lookdev.js";
function previewRoomMetadata(room, template) {
  return { ...room, faces: room.faces.map((face, index) => ({ ...face, rect: template.faces[index].rect })) };
}
async function loadPortraitModule(sector, previewRooms, materials, texture, { loader = new GLTFLoader(), interiorLook = false } = {}) {
  const module = new THREE.Group();
  module.name = `CLOSED_${sector.id}`;
  const urls = [sector.frontUrl, sector.structureUrl].filter(Boolean);
  const roomSpecs = sector.rooms.map((room, level) => {
    const original = sector.stage === "baked-study";
    const source = original ? room : previewRooms[level];
    return { original, source, data: original ? room : previewRoomMetadata(room, source) };
  });
  const [roots, roomMaps] = await Promise.all([
    Promise.all(urls.map((url) => loader.loadAsync(url))),
    Promise.all(roomSpecs.map(({ original, source }) => Promise.all([
      texture(source.atlasUrl),
      original && source.propsAtlasUrl ? texture(source.propsAtlasUrl) : null
    ])))
  ]);
  for (const [index, url] of urls.entries()) {
    const root = roots[index].scene;
    root.updateMatrixWorld(true);
    const baked = sector.stage === "baked-study" && url === sector.frontUrl;
    const converted = new Map();
    root.traverse((object) => {
      if (!object.isMesh) return;
      if (baked) {
        const convert = (original) => {
          if (!converted.has(original)) {
            const map = original.map ?? original.emissiveMap;
            if (!map) throw new Error(`Missing display bake: ${object.name}`);
            const front = new THREE.MeshBasicMaterial({ name: original.name, map, side: THREE.DoubleSide, toneMapped: false });
            if (interiorLook) gradeInteriorFront(front, sector.id);
            converted.set(original, front);
          }
          return converted.get(original);
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
      } else {
        const metal = (Array.isArray(object.material) ? object.material : [object.material]).some((mat) => mat.name === "COLLECTION_Titanium");
        if (metal) {
          meterUV(object);
          object.material = materials.casing;
        } else for (const mat of Array.isArray(object.material) ? object.material : [object.material]) displayPbrMaterial(mat);
      }
    });
    for (const material of converted.keys()) material.dispose();
    module.add(root);
  }
  const cover = displayPbrMaterial(new THREE.MeshStandardMaterial({ color: 724496, roughness: 0.6, side: THREE.DoubleSide }));
  module.add(createRoomRearCovers(sector, cover));
  for (const [level, { original, data }] of roomSpecs.entries()) {
    const [atlas, props] = roomMaps[level];
    const projection = sector.projection === "music" ? createMusicRoom : createBakedRoom;
    const portal = projection(data, atlas, props, { physicalFirst: true, movable: true });
    if (original) installInteriorMotion(portal, data);
    if (original && interiorLook) gradeInteriorRoom(portal, sector.id, data.id);
    portal.material.depthWrite = true;
    portal.material.side = THREE.FrontSide;
    portal.userData.previewLighting = !original;
    portal.userData.virtualRoom = true;
    portal.userData.roomFaces = data.faces;
    module.add(portal);
  }
  const glass = displayPbrMaterial(new THREE.MeshPhysicalMaterial({ color: 14279398, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.FrontSide, envMapIntensity: 1 }));
  module.add(createSectorGlass(sector, glass), createWindowMullions(sector, materials.casing));
  module.traverse((object) => {
    if (object.isMesh) {
      const transparent = (Array.isArray(object.material) ? object.material : [object.material]).some((mat) => mat.transparent);
      object.castShadow = !object.userData.virtualRoom && !transparent;
      object.receiveShadow = true;
    }
  });
  return module;
}
async function loadPortraitTower(metadata, assets, materials, texture, progress = () => {
}, { interiorLook = false } = {}) {
  const loader = new GLTFLoader(), group = new THREE.Group();
  group.name = "VAISEN_CLOSED_PORTRAIT";
  const template = metadata.sectors.find((sector) => sector.id === "cgi");
  let loaded = 0;
  const [shellAsset, letterAsset, modules] = await Promise.all([
    loader.loadAsync(metadata.shellUrl),
    loader.loadAsync(assets.letterUrl),
    Promise.all(metadata.sectors.map((sector) => loadPortraitModule(sector, metadata.previewRooms ?? template.rooms, materials, texture, { loader, interiorLook }).then((module) => {
      progress(++loaded, metadata.sectors.length);
      return module;
    })))
  ]);
  const shell = shellAsset.scene;
  const replaced = [];
  shell.traverse((object) => {
    if (["V_LEFT", "V_RIGHT"].includes(object.userData.source_object)) replaced.push(object);
  });
  for (const object of replaced) {
    object.removeFromParent();
    object.geometry.dispose();
  }
  prepareDisplayPbr(shell);
  group.add(shell);
  const letter = letterAsset.scene;
  letter.traverse((object) => {
    if (object.isMesh) object.material = materials.body;
  });
  group.add(letter);
  group.add(...modules);
  group.traverse((object) => {
    if (object.isMesh) {
      const transparent = (Array.isArray(object.material) ? object.material : [object.material]).some((mat) => mat.transparent);
      object.castShadow = !object.userData.virtualRoom && !transparent;
      object.receiveShadow = true;
    }
  });
  return group;
}
export {
  loadPortraitModule,
  loadPortraitTower,
  previewRoomMetadata
};
