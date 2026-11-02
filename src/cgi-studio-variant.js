const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function applyCgiStudio(sector, studio, completion) {
  const original = sector.rooms.find((room) => room.id === "l02");
  if (studio.version !== 1 || studio.baseFrontUrl !== sector.frontUrl || !original || !equal(original.portalCorners, studio.room.portalCorners) || !equal(original.faces.map((face) => face.corners), studio.room.faces.map((face) => face.corners))) {
    throw new Error("L02 studio does not match the source room");
  }
  if (studio.room.props.length > 20) throw new Error("L02 studio exceeds the bounded shader prop budget");
  const result = { ...sector, frontUrl: studio.frontUrl, frontTriangles: studio.frontTriangles, referenceUrl: studio.referenceUrl ?? sector.referenceUrl, rooms: sector.rooms.map((room) => room.id === "l02" ? studio.room : room), studio };
  if (!completion) return result;
  if (completion.version !== 2 || completion.baseFrontUrl !== sector.frontUrl || completion.rooms.length !== 2 || !equal(completion.rooms.map((room) => room.id).sort(), ["l01", "l03"])) {
    throw new Error("CGI completion does not match the source sector");
  }
  for (const room of completion.rooms) {
    const source = sector.rooms.find((item) => item.id === room.id);
    if (!equal(source.portalCorners, room.portalCorners) || !equal(source.faces.map((face) => face.corners), room.faces.map((face) => face.corners)) || room.props.length > 20) throw new Error(`Invalid completed CGI room: ${room.id}`);
  }
  return { ...result, frontUrl: completion.frontUrl, frontTriangles: completion.frontTriangles, referenceUrl: completion.referenceUrl, completion, rooms: result.rooms.map((room) => completion.rooms.find((item) => item.id === room.id) ?? room) };
}
function applyTowerStudio(metadata, studio, completion) {
  const original = metadata.sectors.find((sector) => sector.id === "cgi");
  if (!original) throw new Error("Missing CGI sector");
  return { ...metadata, previewRooms: original.rooms.map((room) => completion?.previewAtlasUrl ? { ...room, atlasUrl: completion.previewAtlasUrl } : room), sectors: metadata.sectors.map((sector) => sector.id === "cgi" ? applyCgiStudio(sector, studio, completion) : sector) };
}
export {
  applyCgiStudio,
  applyTowerStudio
};
