import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { displayPbrMaterial } from "./tower-materials.js";
const UP = new Vector3(0, 1, 0);
function createTowerActuators(materials) {
  const group = new Group();
  group.name = "MECHANICAL_TELESCOPIC_SUPPORTS";
  const tube = new CylinderGeometry(1, 1, 1, 10);
  const pin = new CylinderGeometry(1, 1, 1, 8);
  const block = new BoxGeometry(1, 1, 1);
  const shaft = displayPbrMaterial(new MeshStandardMaterial({ name: "VAISEN / Hydraulic shaft", color: 9213598, metalness: 1, roughness: 0.22 }));
  const struts = [];
  function part(parent, name, geometry, material, scale) {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.fromArray(scale);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function strut(assembly, anchor, mount, length, radius) {
    const root = new Group();
    root.name = `${assembly.toUpperCase()}_TELESCOPE_${struts.length + 1}`;
    root.visible = false;
    group.add(root);
    const sleeve = part(root, "CYLINDER_BARREL", tube, materials.casing, [radius, length, radius]);
    sleeve.position.y = length / 2;
    const middle = part(root, "CYLINDER_MIDDLE", tube, shaft, [radius * 0.74, length, radius * 0.74]);
    const rod = part(root, "CYLINDER_ROD", tube, shaft, [radius * 0.48, length, radius * 0.48]);
    const mounts = [0, 1].map(() => {
      const clevis = part(root, "PIVOT_CLEVIS", block, materials.casing, [radius * 3, radius * 2.2, radius * 2.6]);
      const axle = part(root, "PIVOT_PIN", pin, shaft, [radius * 0.55, radius * 3.6, radius * 0.55]);
      axle.rotation.z = Math.PI / 2;
      return { clevis, axle };
    });
    struts.push({ root, assembly, anchor: new Vector3(...anchor), mount: new Vector3(...mount), length, middle, rod, mounts });
  }
  for (const x of [-0.64, 0.64]) strut("body", [x, 0.12, -0.35], [x, 0.22, 1.4], 1.8, 0.125);
  for (const z of [4.1, 5.66]) strut("module", [0.35, 0.12, z - 1.58], [0.35, 0.18, z], 1.56, 0.095);
  return { group, struts, apply(pose) {
    for (const s of struts) {
      const offset = pose[s.assembly === "body" ? "bodyOffset" : "moduleOffset"];
      const delta = s.mount.clone().add(offset).sub(s.anchor);
      const distance = delta.length();
      s.root.visible = offset.length() > 0.03 && distance >= s.length;
      s.root.position.copy(s.anchor);
      s.root.quaternion.setFromUnitVectors(UP, delta.normalize());
      s.middle.position.y = distance / 2;
      s.rod.position.y = distance - s.length / 2;
      for (const [i, mount] of s.mounts.entries()) {
        mount.clevis.position.y = mount.axle.position.y = i * distance;
      }
    }
    group.updateMatrixWorld(true);
  }, dispose() {
    tube.dispose();
    pin.dispose();
    block.dispose();
    shaft.dispose();
  } };
}
export {
  createTowerActuators
};
