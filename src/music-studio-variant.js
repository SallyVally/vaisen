const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function musicStudyMetadata(study, { quality = "full" } = {}) {
  const assets = quality === "presentation" && study.assets?.tower && study.assets?.full ? { ...study.assets.tower, frontUrl: study.assets.full.frontUrl } : study.assets?.[quality];
  if (study.version !== 1 || study.id !== "music" || study.rooms.length !== 3 || !assets) throw new Error("Invalid music studio");
  return { ...study, frontUrl: assets.frontUrl, rooms: study.rooms.map((room) => ({ ...room, atlasUrl: assets.atlasUrl, propsAtlasUrl: assets.propsAtlasUrl })) };
}
function applyMusicStudy(metadata, study, { quality = "tower" } = {}) {
  const original = metadata.sectors.find((sector) => sector.id === "music");
  if (!original || study.baseFrontUrl !== original.frontUrl) throw new Error("Music source collection does not match");
  const active = musicStudyMetadata(study, { quality });
  for (const [index, room] of active.rooms.entries()) {
    const source = original.rooms[index];
    if (room.id !== source.id || (room.props?.length ?? 0) > 20) throw new Error("Music room budget/order mismatch");
    if (index > 0 && (!equal(room.portalCorners, source.portalCorners) || !equal(room.faces.map((f) => f.corners), source.faces.map((f) => f.corners)))) throw new Error("Music source room changed");
    if (index === 0 && (!equal(study.floorRepair.originalCorners, source.faces[0].corners) || study.floorRepair.height !== 0.07294964790344238)) throw new Error("Unverified music floor repair");
  }
  return { ...metadata, sectors: metadata.sectors.map((sector) => sector.id === "music" ? { ...sector, stage: "baked-study", projection: "music", rooms: active.rooms, frontUrl: active.frontUrl, frontTriangles: study.frontTriangles, structureUrl: study.structureUrl, structureTriangles: study.structureTriangles, musicStudy: study.id } : sector) };
}
export {
  applyMusicStudy,
  musicStudyMetadata
};
