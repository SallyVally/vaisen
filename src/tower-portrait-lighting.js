import { Color, DirectionalLight, Group, HemisphereLight, PointLight, RectAreaLight, SpotLight } from "three";
const PORTRAIT_CARDS = [{ position: [9, 16, -7], size: [2.2, 22], color: [6, 6.3, 6.6] }, { position: [-9, 10, -5], size: [0.75, 15], color: [5.2, 5.9, 6.7] }, { position: [0, 17, -8], size: [5, 2], color: [2.5, 2.6, 2.8] }];
const PORTRAIT_LIGHTING = { environmentIntensity: 0.64, lights: [{ name: "PORTRAIT_AMBIENT", type: "hemisphere", color: 13096421, ground: 329223, intensity: 0.018 }, { name: "PORTRAIT_SCULPTING_KEY", type: "spot", color: 15068661, intensity: 5500, position: [10, 17, -9], target: [0, 7, 0], distance: 60, angle: 0.35, penumbra: 0.8, shadow: true }, { name: "PORTRAIT_REAR_KEY", type: "spot", color: 15657440, intensity: 2800, position: [-11, 18, -6], target: [0, 8, 1], distance: 60, angle: 0.38, penumbra: 0.8 }, { name: "PORTRAIT_EDGE_RIM", type: "directional", color: 13031916, intensity: 1.1, position: [-6, 12, -9], target: [0, 6, 0] }, { name: "PORTRAIT_FOUNDATION_GRAZE", type: "area", color: 15262424, intensity: 5, position: [3.6, 1.5, 6.5], target: [0, 0.1, 0], size: [5.5, 0.3] }, { name: "PORTRAIT_CORE_AREA", type: "area", color: 15920870, intensity: 5, position: [1.5, 2.8, 0], target: [-1, 2.8, 0], size: [0.6, 4.2] }, { name: "PORTRAIT_CORE_GLOW", type: "point", color: 15920870, intensity: 8, position: [1.2, 2, 0], distance: 10 }] };
function createPortraitLighting() {
  const group = new Group();
  group.name = "PORTRAIT_DRAMATIC_LIGHTING";
  for (const item of PORTRAIT_LIGHTING.lights) {
    const color = new Color(item.color);
    const light = item.type === "hemisphere" ? new HemisphereLight(color, item.ground, item.intensity) : item.type === "spot" ? new SpotLight(color, item.intensity, item.distance, item.angle, item.penumbra, 2) : item.type === "directional" ? new DirectionalLight(color, item.intensity) : item.type === "area" ? new RectAreaLight(color, item.intensity, ...item.size) : new PointLight(color, item.intensity, item.distance, 2);
    light.name = item.name;
    if (item.position) light.position.fromArray(item.position);
    group.add(light);
    if (light.target) {
      light.target.position.fromArray(item.target);
      group.add(light.target);
    } else if (item.target) light.lookAt(...item.target);
    if (item.shadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.near = 2;
      light.shadow.camera.far = 60;
      light.shadow.normalBias = 0.012;
      light.shadow.bias = -8e-5;
    }
  }
  return group;
}
export {
  PORTRAIT_CARDS,
  PORTRAIT_LIGHTING,
  createPortraitLighting
};
