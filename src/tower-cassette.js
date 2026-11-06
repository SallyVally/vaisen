import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
function createCassetteShell(sector, material) {
  const sourceFloor = sector.rooms[0].faces.find((face) => face.name.endsWith("FLOOR")).corners;
  const sourceCeiling = sector.rooms.at(-1).faces.find((face) => face.name.endsWith("CEILING")).corners;
  const middle = (sourceFloor[0][2] + sourceFloor[1][2]) / 2;
  const sign = sector.outward[0];
  const back = (sign > 0 ? Math.min : Math.max)(...sourceFloor.map((p) => p[0]));
  const outer = (points, yOffset) => points.map(([x, y, z]) => [x === back ? x - sign * 0.02 : x, y + yOffset, z + Math.sign(z - middle) * 0.02]);
  const floor = outer(sourceFloor, -0.02);
  const ceiling = outer(sourceCeiling, 0.02);
  const quads = [floor, ceiling, [floor[2], ceiling[1], ceiling[0], floor[3]], [floor[0], ceiling[3], ceiling[0], floor[3]], [floor[1], ceiling[2], ceiling[1], floor[2]]];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(quads.flat(2), 3));
  geometry.setIndex(quads.flatMap((_, i) => [0, 1, 2, 0, 2, 3].map((index) => index + i * 4)));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.name = "CGI_CASSETTE_OUTER_SHELL";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function createSectorGlass(sector, material) {
  const geometry = new BufferGeometry();
  const clearance = 0.012;
  const points = sector.glassCorners.flatMap(([x, y, z]) => [x + sector.outward[0] * clearance, y, z]);
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.name = `${sector.id}_GLASS`;
  mesh.renderOrder = 3;
  return mesh;
}
function createRoomRearCovers(sector, material) {
  const group = new Group();
  group.name = `${sector.id}_PHYSICAL_REAR_COVERS`;
  for (const room of sector.rooms) {
    const geometry = new BufferGeometry();
    const points = room.portalCorners.map(([x, y, z]) => [x - sector.outward[0] * 0.04, y, z]);
    geometry.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const cover = new Mesh(geometry, material);
    cover.castShadow = true;
    group.add(cover);
  }
  return group;
}
export {
  createCassetteShell,
  createRoomRearCovers,
  createSectorGlass
};
