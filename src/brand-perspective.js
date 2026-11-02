import * as THREE from "three";
import { perspectivePieces, projectMarkPoint, perspectivePose, MARK_SCALE } from "./brand-perspective-layout.js";
function createPerspectiveRenderer(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(527117, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new THREE.Scene();
  room.background = new THREE.Color(0.025, 0.032, 0.04);
  const panels = [];
  for (const [w, h, x, y, z, colour, strength, roll] of [[10, 1.4, -1.5, 1.2, 7, 15331829, 5.5, -0.58], [2.2, 8, 5, 2, 4, 10336206, 2.5, 0], [5, 3, -5, 4, -2, 16111527, 4, 0], [8, 1.4, 0, -1.8, 7, 14608366, 2.5, 0.2]]) {
    const geometry = new THREE.PlaneGeometry(w, h), material = new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(strength), side: THREE.DoubleSide });
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    panel.rotateZ(roll);
    room.add(panel);
    panels.push(panel);
  }
  const environment = pmrem.fromScene(room, 0.015);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.15;
  panels.forEach((panel) => {
    panel.geometry.dispose();
    panel.material.dispose();
  });
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(13230580, 1512207, 0.4));
  const key = new THREE.DirectionalLight(16247769, 2);
  key.position.set(-4, 6, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(12180467, 2.5);
  rim.position.set(5, 1, -3);
  scene.add(rim);
  const materials = [new THREE.MeshStandardMaterial({ color: 12107972, metalness: 0.98, roughness: 0.19 }), new THREE.MeshStandardMaterial({ color: 7964044, metalness: 0.96, roughness: 0.24 }), new THREE.MeshStandardMaterial({ color: 11836533, metalness: 0.97, roughness: 0.2 })];
  const geometries = [];
  for (const piece of perspectivePieces()) {
    const shape = new THREE.Shape();
    piece.polygon.forEach(([x, y], i) => shape[i ? "lineTo" : "moveTo"]((x - 50) * MARK_SCALE, (50 - y) * MARK_SCALE));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: piece.thickness, steps: 1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 8e-3, bevelSegments: 2, curveSegments: 1 });
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const svgPoint = [positions.getX(i) / MARK_SCALE + 50, 50 - positions.getY(i) / MARK_SCALE];
      positions.setXYZ(i, ...projectMarkPoint(svgPoint, piece.depth + positions.getZ(i) - piece.thickness));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const edge = piece.band === 3 && piece.side === 1 ? materials[2] : materials[1];
    scene.add(new THREE.Mesh(geometry, [materials[0], edge]));
  }
  const floorGeometry = new THREE.PlaneGeometry(24, 24), floorMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}", fragmentShader: "varying vec2 vUv;void main(){float pool=exp(-length((vUv-.5)*vec2(5.,6.))*3.);gl_FragColor=vec4(.16,.18,.19,pool*.36);}" });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.15;
  scene.add(floor);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  let disposed = false, width = 0, height = 0;
  return { draw(progress, { reduced = false, yaw = 0 } = {}) {
    if (disposed) return;
    const bounds = host.getBoundingClientRect(), w = Math.round(bounds.width), h = Math.round(bounds.height);
    if (w < 1 || h < 1) return;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 740 ? 1.5 : 1.8, Math.sqrt(19e5 / (w * h))));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36 / 2)) * Math.max(1, 0.94 / camera.aspect)));
      camera.updateProjectionMatrix();
    }
    const pose = perspectivePose(progress, { reduced, yaw });
    camera.position.fromArray(pose.position);
    camera.lookAt(...pose.target);
    renderer.render(scene, camera);
  }, dispose() {
    if (disposed) return;
    disposed = true;
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    floorGeometry.dispose();
    floorMaterial.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  } };
}
export {
  createPerspectiveRenderer
};
