class SectorAssetLoader {
  constructor(prepare, commit) {
    this.prepare = prepare;
    this.commit = commit;
    this.promise = null;
    this.value = null;
  }
  load() {
    if (!this.promise) this.promise = Promise.resolve().then(this.prepare).then((value) => {
      this.commit(value);
      this.value = value;
      return value;
    }).catch((error) => {
      this.promise = null;
      throw error;
    });
    return this.promise;
  }
}
function replaceSectorLayout(tower, module, materials) {
  const old = tower.getObjectByName(module.name);
  if (!old || old.parent !== tower) throw new Error("Missing original sector collection: " + module.name);
  old.removeFromParent();
  tower.add(module);
  const shared = new Set(Object.values(materials)), geometries = new Set(), disposable = new Set();
  old.traverse((obj) => {
    if (obj.isMesh) {
      geometries.add(obj.geometry);
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) if (!shared.has(mat)) disposable.add(mat);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of disposable) material.dispose();
}
export {
  SectorAssetLoader,
  replaceSectorLayout
};
