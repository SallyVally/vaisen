function webTowerSector(original, study) {
  if (original.id !== "web" || original.bodyNode !== "V_RIGHT" || study.id !== "web" || study.rooms.length !== 3) throw new Error("Invalid Web studio");
  for (const [i, room] of study.rooms.entries()) {
    if (JSON.stringify(room.portalCorners) !== JSON.stringify(original.rooms[i].portalCorners) || JSON.stringify(room.faces.map((f) => f.corners)) !== JSON.stringify(original.rooms[i].faces.map((f) => f.corners))) throw new Error("Web source planes changed");
  }
  return { ...original, rooms: study.rooms, frontUrl: study.frontUrl, frontTriangles: study.frontTriangles, structureUrl: study.structureUrl, structureTriangles: study.structureTriangles, stage: "baked-study", projection: "cuboid" };
}
export {
  webTowerSector
};
