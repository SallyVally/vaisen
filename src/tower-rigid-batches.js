import { Float32BufferAttribute, Material, Matrix4, Mesh, NoBlending, NormalBlending, ObjectSpaceNormalMap } from "three";
import { deinterleaveGeometry, mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
function eligible(mesh, root) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.isSkinnedMesh || mesh.children.length || !mesh.visible || mesh.userData.virtualRoom || mesh.userData.rigidBatch) return false;
  if (mesh.userData.mechanical_role || ["V_LEFT", "V_RIGHT"].includes(mesh.userData.source_object)) return false;
  if (mesh.morphTargetInfluences?.length || mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  const material = mesh.material, geometry = mesh.geometry;
  if (Array.isArray(material) || !material.visible || material.transparent || material.alphaHash || material.displacementMap) return false;
  if (!material.depthWrite || !material.depthTest || material.stencilWrite || ![NormalBlending, NoBlending].includes(material.blending)) return false;
  if (!material.isMeshBasicMaterial && !material.isMeshStandardMaterial) return false;
  const key = material.customProgramCacheKey();
  if (material.onBeforeCompile !== Material.prototype.onBeforeCompile && !key.startsWith("vaisen-display-pbr-v2") && key !== "smart-light-baked-scenarios-v1") return false;
  if (material.normalMap && material.normalMapType === ObjectSpaceNormalMap) return false;
  if (material.onBeforeRender !== Material.prototype.onBeforeRender) return false;
  for (const hook of ["onBeforeRender", "onAfterRender", "onBeforeShadow", "onAfterShadow"]) if (mesh[hook] !== Mesh.prototype[hook]) return false;
  if (!geometry?.attributes.position || geometry.isInstancedBufferGeometry || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  if (Object.values(geometry.morphAttributes).some((attributes) => attributes.length)) return false;
  if ((geometry.index?.count ?? geometry.attributes.position.count) % 3 !== 0) return false;
  if (Math.abs(mesh.matrixWorld.determinant()) < 1e-12) return false;
  for (let parent = mesh.parent; parent; parent = parent.parent) {
    if (!parent.visible || parent.isGroup && parent.renderOrder !== 0) return false;
    if (parent !== root && (parent.userData.mechanical_role || ["V_LEFT", "V_RIGHT"].includes(parent.userData.source_object))) return false;
    if (parent === root) return true;
  }
  return false;
}
function attributeSignature(geometry) {
  return Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, attribute]) => `${name}:${attribute.itemSize}`).join("|");
}
function transformedGeometry(mesh, inverse) {
  const geometry = mesh.geometry.clone();
  deinterleaveGeometry(geometry);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let axis = 0; axis < attribute.itemSize; axis++) values[i * attribute.itemSize + axis] = attribute.getComponent(i, axis);
    geometry.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
  }
  const relative = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
  geometry.applyMatrix4(relative);
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, index) => index));
  if (relative.determinant() < 0) {
    const indices = geometry.index;
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      const b = indices.getX(triangle + 1);
      indices.setX(triangle + 1, indices.getX(triangle + 2));
      indices.setX(triangle + 2, b);
    }
  }
  geometry.clearGroups();
  return geometry;
}
function batchRigidRoot(root) {
  if (root.userData.rigidBatching) return root.userData.rigidBatching;
  root.updateWorldMatrix(true, true);
  if (Math.abs(root.matrixWorld.determinant()) < 1e-12) return { inputMeshes: 0, mergedMeshes: 0, batches: 0, savedDraws: 0, savedShadowDraws: 0 };
  const inverse = root.matrixWorld.clone().invert(), buckets = new Map();
  root.traverse((mesh) => {
    if (!eligible(mesh, root)) return;
    const key = [mesh.material.uuid, mesh.renderOrder, mesh.castShadow, mesh.receiveShadow, mesh.layers.mask, mesh.frustumCulled, attributeSignature(mesh.geometry)].join(";");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(mesh);
  });
  const stats = { inputMeshes: 0, mergedMeshes: 0, batches: 0, savedDraws: 0, savedShadowDraws: 0 };
  for (const meshes of buckets.values()) {
    stats.inputMeshes += meshes.length;
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => transformedGeometry(mesh, inverse));
    const geometry = mergeGeometries(geometries, false);
    for (const item of geometries) item.dispose();
    if (!geometry) throw new Error("Compatible rigid batch failed to merge");
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const source = meshes[0], batch = new Mesh(geometry, source.material);
    batch.name = `${root.name}_RIGID_BATCH_${stats.batches}`;
    batch.castShadow = source.castShadow;
    batch.receiveShadow = source.receiveShadow;
    batch.renderOrder = source.renderOrder;
    batch.layers.mask = source.layers.mask;
    batch.frustumCulled = source.frustumCulled;
    batch.userData.rigidBatch = true;
    batch.userData.sourceMeshes = meshes.map((mesh) => mesh.name);
    root.add(batch);
    for (const mesh of meshes) {
      mesh.visible = false;
      mesh.userData.rigidBatchSource = true;
    }
    stats.mergedMeshes += meshes.length;
    stats.batches++;
    stats.savedDraws += meshes.length - 1;
    if (source.castShadow) stats.savedShadowDraws += meshes.length - 1;
  }
  root.userData.rigidBatching = stats;
  return stats;
}
function batchPortraitModules(root) {
  const groups = [];
  root.traverse((object) => {
    if (/^CLOSED_(cgi|music|smart-light|web)$/.test(object.name) || object.name === "PORTRAIT_FOUNDATION_AND_SHORE") groups.push(object);
  });
  return groups.map((group) => ({ name: group.name, ...batchRigidRoot(group) }));
}
export {
  batchPortraitModules,
  batchRigidRoot
};
