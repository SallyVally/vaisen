import * as THREE from "three";
function faceBasis(face) {
  const [origin, next, cornerC, last] = face.corners.map((point) => new THREE.Vector3(...point));
  const axisU = next.sub(origin);
  const axisV = last.sub(origin);
  const normal = new THREE.Vector3().crossVectors(axisU, axisV);
  const determinant = axisU.lengthSq() * axisV.lengthSq() - axisU.dot(axisV) ** 2;
  if (!Number.isFinite(determinant) || determinant < 1e-10) {
    throw new Error(`Invalid room face: ${face.name}`);
  }
  const affine = cornerC.distanceToSquared(origin.clone().add(axisU).add(axisV)) < 1e-12;
  const diagonal = cornerC.clone().sub(origin);
  if (Math.abs(normal.clone().normalize().dot(diagonal)) > 1e-5 || axisU.clone().cross(diagonal).lengthSq() < 1e-10 || diagonal.clone().cross(axisV).lengthSq() < 1e-10) {
    throw new Error(`Invalid planar room quad: ${face.name}`);
  }
  return { origin, axisU, axisV, cornerC, normal, determinant, affine };
}
function traceRoomRay(origin, direction, faces) {
  let nearest = null;
  for (const face of faces) {
    const basis = faceBasis(face);
    const denominator = basis.normal.dot(direction);
    if (Math.abs(denominator) < 1e-8) continue;
    const distance = basis.normal.dot(basis.origin.clone().sub(origin)) / denominator;
    if (distance <= 1e-6 || nearest && distance >= nearest.distance) continue;
    const hit = origin.clone().addScaledVector(direction, distance);
    if (!basis.affine) {
      const b = basis.origin.clone().add(basis.axisU);
      const d = basis.origin.clone().add(basis.axisV);
      const first = THREE.Triangle.getBarycoord(hit, basis.origin, b, basis.cornerC, new THREE.Vector3());
      if (first && Math.min(first.x, first.y, first.z) >= -1e-5) {
        nearest = { face: face.name, distance, uv: [first.y + first.z, first.z] };
        continue;
      }
      const second = THREE.Triangle.getBarycoord(hit, basis.origin, basis.cornerC, d, new THREE.Vector3());
      if (second && Math.min(second.x, second.y, second.z) >= -1e-5) {
        nearest = { face: face.name, distance, uv: [second.y, second.y + second.z] };
      }
      continue;
    }
    const offset = hit.sub(basis.origin);
    const uu = basis.axisU.lengthSq();
    const vv = basis.axisV.lengthSq();
    const uv = basis.axisU.dot(basis.axisV);
    const u = (offset.dot(basis.axisU) * vv - offset.dot(basis.axisV) * uv) / basis.determinant;
    const v = (offset.dot(basis.axisV) * uu - offset.dot(basis.axisU) * uv) / basis.determinant;
    if (u < -1e-5 || u > 1.00001 || v < -1e-5 || v > 1.00001) continue;
    nearest = { face: face.name, distance, uv: [u, v] };
  }
  return nearest;
}
function traceBoxRay(origin, direction, box) {
  if (direction.lengthSq() < 1e-18) return null;
  const minimum = new THREE.Vector3(...box.min);
  const maximum = new THREE.Vector3(...box.max);
  let entry = -Infinity;
  let exit = Infinity;
  let entryFace = -1;
  let exitFace = -1;
  for (let axis2 = 0; axis2 < 3; axis2++) {
    const low = minimum.getComponent(axis2);
    const high = maximum.getComponent(axis2);
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) throw new Error(`Invalid box: ${box.name}`);
    const ray = direction.getComponent(axis2);
    const position = origin.getComponent(axis2);
    if (Math.abs(ray) < 1e-9) {
      if (position < low || position > high) return null;
      continue;
    }
    const a = (low - position) / ray;
    const b = (high - position) / ray;
    const near = Math.min(a, b);
    const far = Math.max(a, b);
    if (near > entry) {
      entry = near;
      entryFace = axis2 * 2 + (ray < 0 ? 0 : 1);
    }
    if (far < exit) {
      exit = far;
      exitFace = axis2 * 2 + (ray > 0 ? 0 : 1);
    }
    if (entry > exit) return null;
  }
  if (exit <= 1e-6) return null;
  const distance = entry > 1e-6 ? entry : exit;
  const face = entry > 1e-6 ? entryFace : exitFace;
  const axis = Math.floor(face / 2);
  const relative = origin.clone().addScaledVector(direction, distance).sub(minimum).divide(maximum.sub(minimum));
  const uv = axis === 0 ? [relative.z, relative.y] : axis === 1 ? [relative.x, relative.z] : [relative.x, relative.y];
  return { distance, face, uv };
}
function traceSceneRay(origin, direction, faces, boxes = []) {
  const room = traceRoomRay(origin, direction, faces);
  let nearest = room ? { ...room, kind: "room" } : null;
  for (const box of boxes) {
    const hit = traceBoxRay(origin, direction, box);
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { ...hit, kind: "prop", name: box.name };
  }
  return nearest;
}
function createBakedRoom(metadata, atlas, propsAtlas = null, { physicalFirst = false, movable = false } = {}) {
  const bases = metadata.faces.map(faceBasis);
  const boxes = metadata.props ?? [];
  if (boxes.length && !propsAtlas) throw new Error("Missing furniture atlas");
  for (const box of boxes) {
    if (box.rects.length !== 6) throw new Error(`Missing box faces: ${box.name}`);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(metadata.portalCorners.flat(), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({ defines: { ROOM_FACES: bases.length, PROP_BOXES: boxes.length, LOCAL_ROOM: movable ? 1 : 0 }, uniforms: { roomWorldInverse: { value: new THREE.Matrix4() }, roomAtlas: { value: atlas }, faceOrigins: { value: bases.map((basis) => basis.origin) }, faceAxesU: { value: bases.map((basis) => basis.axisU) }, faceAxesV: { value: bases.map((basis) => basis.axisV) }, faceCornersC: { value: bases.map((basis) => basis.cornerC) }, faceRects: { value: metadata.faces.map((face) => new THREE.Vector4(...face.rect)) }, propsAtlas: { value: propsAtlas }, boxMinimums: { value: boxes.map((box) => new THREE.Vector3(...box.min)) }, boxMaximums: { value: boxes.map((box) => new THREE.Vector3(...box.max)) }, boxFaceRects: { value: boxes.flatMap((box) => box.rects.map((rect) => new THREE.Vector4(...rect))) } }, vertexShader: `
      varying vec3 vRoomPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        #if LOCAL_ROOM > 0
          vRoomPosition = position;
        #else
          vRoomPosition = worldPosition.xyz;
        #endif
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `, fragmentShader: `
      uniform sampler2D roomAtlas;
      uniform vec3 faceOrigins[ROOM_FACES];
      uniform vec3 faceAxesU[ROOM_FACES];
      uniform vec3 faceAxesV[ROOM_FACES];
      uniform vec3 faceCornersC[ROOM_FACES];
      uniform vec4 faceRects[ROOM_FACES];
      #if PROP_BOXES > 0
        uniform sampler2D propsAtlas;
        uniform vec3 boxMinimums[PROP_BOXES];
        uniform vec3 boxMaximums[PROP_BOXES];
        uniform vec4 boxFaceRects[PROP_BOXES * 6];
      #endif
      uniform mat4 roomWorldInverse;
      varying vec3 vRoomPosition;
      vec2 planeCoordinates(vec3 offset, vec3 u, vec3 v) {
        float uu = dot(u, u);
        float vv = dot(v, v);
        float uv = dot(u, v);
        return vec2(dot(offset, u) * vv - dot(offset, v) * uv,
                    dot(offset, v) * uu - dot(offset, u) * uv) / (uu * vv - uv * uv);
      }
      bool insideTriangle(vec2 coordinates) {
        return coordinates.x >= -0.00001 && coordinates.y >= -0.00001 &&
               coordinates.x + coordinates.y <= 1.00001;
      }
      void main() {
        #if LOCAL_ROOM > 0
          vec3 eye = (roomWorldInverse * vec4(cameraPosition, 1.0)).xyz;
        #else
          vec3 eye = cameraPosition;
        #endif
        vec3 ray = normalize(vRoomPosition - eye);
        vec3 origin = vRoomPosition + ray * 0.000001;
        float nearest = 1e10;
        vec2 atlasUv = vec2(0.0);
        bool found = false;
        for (int i = 0; i < ROOM_FACES; i++) {
          vec3 u = faceAxesU[i];
          vec3 v = faceAxesV[i];
          vec3 normal = cross(u, v);
          float denominator = dot(normal, ray);
          if (abs(denominator) < 0.00000001) continue;
          float distance = dot(normal, faceOrigins[i] - origin) / denominator;
          if (distance <= 0.000001 || distance >= nearest) continue;
          vec3 offset = origin + ray * distance - faceOrigins[i];
          vec3 diagonal = faceCornersC[i] - faceOrigins[i];
          vec3 warp = diagonal - u - v;
          vec2 faceUv;
          if (dot(warp, warp) > 0.000000000001) {

            vec2 first = planeCoordinates(offset, u, diagonal);
            if (insideTriangle(first)) {
              faceUv = vec2(first.x + first.y, first.y);
            } else {
              vec2 second = planeCoordinates(offset, diagonal, v);
              if (!insideTriangle(second)) continue;
              faceUv = vec2(second.x, second.x + second.y);
            }
          } else {
            faceUv = planeCoordinates(offset, u, v);
          }
          if (any(lessThan(faceUv, vec2(-0.00001))) || any(greaterThan(faceUv, vec2(1.00001)))) continue;
          nearest = distance;
          atlasUv = faceRects[i].xy + clamp(faceUv, 0.0, 1.0) * faceRects[i].zw;
          found = true;
        }
        vec3 color = found ? texture2D(roomAtlas, atlasUv).rgb : vec3(0.0);
        #if PROP_BOXES > 0
          vec3 safeRay = vec3(
            abs(ray.x) < 0.00000001 ? (ray.x < 0.0 ? -0.00000001 : 0.00000001) : ray.x,
            abs(ray.y) < 0.00000001 ? (ray.y < 0.0 ? -0.00000001 : 0.00000001) : ray.y,
            abs(ray.z) < 0.00000001 ? (ray.z < 0.0 ? -0.00000001 : 0.00000001) : ray.z
          );
          vec3 inverseRay = 1.0 / safeRay;
          for (int i = 0; i < PROP_BOXES; i++) {
            vec3 a = (boxMinimums[i] - origin) * inverseRay;
            vec3 b = (boxMaximums[i] - origin) * inverseRay;
            vec3 nearPlanes = min(a, b);
            vec3 farPlanes = max(a, b);
            float entry = max(nearPlanes.x, max(nearPlanes.y, nearPlanes.z));
            float exit = min(farPlanes.x, min(farPlanes.y, farPlanes.z));
            if (exit < max(entry, 0.0)) continue;
            float distance = entry > 0.000001 ? entry : exit;
            if (distance <= 0.000001 || distance >= nearest) continue;
            vec3 planes = entry > 0.000001 ? nearPlanes : farPlanes;
            vec3 delta = abs(planes - vec3(distance));
            int axis = delta.y < delta.x ? 1 : 0;
            if (delta.z < min(delta.x, delta.y)) axis = 2;
            vec3 relative = clamp((origin + ray * distance - boxMinimums[i]) / (boxMaximums[i] - boxMinimums[i]), 0.0, 1.0);
            vec2 faceUv = axis == 0 ? relative.zy : (axis == 1 ? relative.xz : relative.xy);
            float component = axis == 0 ? relative.x : (axis == 1 ? relative.y : relative.z);
            int face = axis * 2 + (component > 0.5 ? 0 : 1);
            vec4 rect = boxFaceRects[i * 6 + face];
            nearest = distance;
            color = texture2D(propsAtlas, rect.xy + faceUv * rect.zw).rgb;
          }
        #endif
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `, side: THREE.DoubleSide, toneMapped: false, depthFunc: physicalFirst ? THREE.LessDepth : THREE.LessEqualDepth, depthWrite: !physicalFirst, polygonOffset: physicalFirst, polygonOffsetFactor: physicalFirst ? 1 : 0, polygonOffsetUnits: physicalFirst ? 2 : 0 });
  const portal = new THREE.Mesh(geometry, material);
  portal.name = metadata.id ? `CGI_${metadata.id.toUpperCase()}_BAKED_ROOM_PORTAL` : "CGI_L02_BAKED_ROOM_PORTAL";
  portal.renderOrder = physicalFirst ? 1 : 0;
  if (movable) {
    portal.onBeforeRender = () => material.uniforms.roomWorldInverse.value.copy(portal.matrixWorld).invert();
  }
  return portal;
}
export {
  createBakedRoom,
  faceBasis,
  traceBoxRay,
  traceRoomRay,
  traceSceneRay
};
