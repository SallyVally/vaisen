import { createBakedRoom, traceBoxRay, traceRoomRay } from "./l02-room-projection.js";
function traceCylinderRay(origin, direction, cylinder) {
  const [x0, y0, z0] = cylinder.min, [x1, y1, z1] = cylinder.max;
  const radius = (x1 - x0) / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (!(radius > 0 && y1 > y0) || Math.abs(x1 - x0 - z1 + z0) > 1e-6) throw new Error("Invalid vertical music cylinder");
  const ox = origin.x - cx, oz = origin.z - cz, a = direction.x ** 2 + direction.z ** 2;
  let nearest = null;
  function candidate(distance, face) {
    if (distance <= 1e-6 || !Number.isFinite(distance) || nearest && distance >= nearest.distance) return;
    const point = origin.clone().addScaledVector(direction, distance), dx = point.x - cx, dz = point.z - cz;
    if (face === 0 && (point.y < y0 - 1e-8 || point.y > y1 + 1e-8)) return;
    if (face !== 0 && dx * dx + dz * dz > radius * radius + 1e-9) return;
    nearest = { distance, face, uv: face === 0 ? [Math.atan2(dz, dx) / (2 * Math.PI) + 0.5, (point.y - y0) / (y1 - y0)] : [dx / (2 * radius) + 0.5, dz / (2 * radius) + 0.5] };
  }
  if (a > 1e-14) {
    const b = 2 * (ox * direction.x + oz * direction.z), discriminant = b * b - 4 * a * (ox * ox + oz * oz - radius * radius);
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      candidate((-b - root) / (2 * a), 0);
      candidate((-b + root) / (2 * a), 0);
    }
  }
  if (Math.abs(direction.y) > 1e-10) {
    candidate((y1 - origin.y) / direction.y, 2);
    candidate((y0 - origin.y) / direction.y, 3);
  }
  return nearest;
}
function traceMusicRay(origin, direction, room) {
  const wall = traceRoomRay(origin, direction, room.faces);
  let nearest = wall ? { ...wall, kind: "room" } : null;
  for (const prop of room.props ?? []) {
    const hit = prop.shape === "cylinder-y" ? traceCylinderRay(origin, direction, prop) : traceBoxRay(origin, direction, prop);
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { ...hit, kind: "prop", name: prop.name };
  }
  return nearest;
}
const cylinderFunction = `
  bool musicCylinder(vec3 origin, vec3 ray, vec3 low, vec3 high, out float distance, out int face, out vec2 uv) {
    vec2 center=(low.xz+high.xz)*0.5;
    float radius=(high.x-low.x)*0.5;
    vec2 offset=origin.xz-center;
    float a=dot(ray.xz,ray.xz);
    float b=2.0*dot(offset,ray.xz);
    float c=dot(offset,offset)-radius*radius;
    distance=1e10;face=0;uv=vec2(0.0);
    if(a>0.00000000000001){
      float disc=b*b-4.0*a*c;
      if(disc>=0.0){
        float root=sqrt(disc);
        for(int side=0;side<2;side++){
          float t=(-b+(side==0?-root:root))/(2.0*a);
          float y=origin.y+t*ray.y;
          if(t>0.000001&&t<distance&&y>=low.y&&y<=high.y){
            vec2 point=offset+t*ray.xz;
            distance=t;face=0;uv=vec2(atan(point.y,point.x)/6.28318530718+0.5,(y-low.y)/(high.y-low.y));
          }
        }
      }
    }
    if(abs(ray.y)>0.0000000001){
      for(int cap=0;cap<2;cap++){
        float t=((cap==0?high.y:low.y)-origin.y)/ray.y;
        vec2 point=offset+t*ray.xz;
        if(t>0.000001&&t<distance&&dot(point,point)<=radius*radius){
          distance=t;face=cap==0?2:3;uv=point/(2.0*radius)+0.5;
        }
      }
    }
    return distance<1e9;
  }
`;
function replaceHook(shader, hook, replacement) {
  if (!shader.includes(hook)) throw new Error("Music projection shader hook changed");
  return shader.replace(hook, replacement);
}
function createMusicRoom(room, atlas, propsAtlas, options = {}) {
  const portal = createBakedRoom(room, atlas, propsAtlas, options);
  portal.name = `MUSIC_${room.id.toUpperCase()}_BAKED_ROOM_PORTAL`;
  portal.material.name = `MUSIC_${room.id.toUpperCase()}_Interior`;
  if (!room.props?.some((prop) => prop.shape === "cylinder-y")) return portal;
  const material = portal.material;
  material.uniforms.musicCylinderFlags = { value: new Float32Array(room.props.map((prop) => prop.shape === "cylinder-y" ? 1 : 0)) };
  let shader = replaceHook(material.fragmentShader, "uniform vec3 boxMinimums[PROP_BOXES];", "uniform vec3 boxMinimums[PROP_BOXES];\n        uniform float musicCylinderFlags[PROP_BOXES];");
  shader = replaceHook(shader, "void main() {", cylinderFunction + "\nvoid main() {");
  shader = replaceHook(shader, "vec3 a = (boxMinimums[i] - origin) * inverseRay;", `
    if(musicCylinderFlags[i]>0.5){
      float distance;int face;vec2 faceUv;
      if(musicCylinder(origin,ray,boxMinimums[i],boxMaximums[i],distance,face,faceUv)&&distance<nearest){
        vec4 rect=boxFaceRects[i*6+face];nearest=distance;
        color=texture2D(propsAtlas,rect.xy+clamp(faceUv,0.0,1.0)*rect.zw).rgb;
      }
      continue;
    }
    vec3 a = (boxMinimums[i] - origin) * inverseRay;`);
  material.fragmentShader = shader;
  return portal;
}
export {
  createMusicRoom,
  traceCylinderRay,
  traceMusicRay
};
