const MOBILE_FOG_GLSL = `
float vaisenGaussian(vec3 ray,float distance,vec3 center,vec3 radius){
  vec3 d=(eye-center)/radius,r=ray/radius;
  float a=max(dot(r,r),.00001),b=dot(d,r),c=dot(d,d);
  float nearest=-b/a,sigma=inversesqrt(a);
  float visible=smoothstep(-2.0*sigma,2.0*sigma,distance-nearest)-smoothstep(-2.0*sigma,2.0*sigma,-nearest);
  return 1.772454*sigma*exp(-max(0.0,c-b*b/a))*max(0.0,visible);
}
float vaisenHeightIntegral(vec3 ray,float first,float last){
  if(abs(ray.y)<.00001)return exp(-max(0.0,eye.y+ray.y*(first+last)*.5+.25)*.85)*(last-first);
  float crossing=abs(ray.y)>.00001?clamp((-.25-eye.y)/ray.y,first,last):first;
  float below=ray.y>0.0?crossing-first:last-crossing;
  if(abs(ray.y)<.00001)below=eye.y<-.25?last-first:0.0;
  float highFirst=ray.y>0.0?crossing:first,highLast=ray.y>0.0?last:crossing;
  float h0=max(0.0,eye.y+ray.y*highFirst+.25),h1=max(0.0,eye.y+ray.y*highLast+.25);
  float delta=(h1-h0)*.85;
  float ratio=abs(delta)<.01?1.0-delta*.5+delta*delta/6.0:(1.0-exp(-delta))/delta;
  float high=exp(-h0*.85)*(highLast-highFirst)*ratio;
  return max(0.0,below+high);
}
float vaisenMobileDepth(vec3 ray,float distance){
  float safeY=abs(ray.y)<.00001?(ray.y<0.0?-.00001:.00001):ray.y;
  float a=(-.6-eye.y)/safeY,b=(9.0-eye.y)/safeY;
  float first=max(0.0,min(a,b)),last=min(distance,max(a,b));
  float depth=0.0;
  if(last>first){
    float nearTower=clamp(-dot(eye.xz,ray.xz)/max(dot(ray.xz,ray.xz),.001),first,last);
    vec3 p=eye+ray*nearTower;
    float broad=texture2D(flowMap,p.xz*.024+flowDrift.xy).r;
    float detail=texture2D(flowMap,p.xz*.072-flowDrift.yx).a;
    float textureWeight=smoothstep(.30,.68,broad*.7+detail*.3);
    float radial=1.0-smoothstep(8.0,26.0,length(p.xz));
    depth=vaisenHeightIntegral(ray,first,last)*textureWeight*.105*mix(1.0,.52*radial,cinematic);
    depth+=vaisenGaussian(ray,distance,vec3(-3.0,3.0,-5.0),vec3(6.0,6.0,8.0))*.008*mix(1.0,.10,cinematic);
  }
  for(int i=0;i<4;i++){
    if(steam[i].w>0.0)depth+=vaisenGaussian(ray,distance,steam[i].xyz,vec3(2.55,.75,3.0))*steam[i].w*.30*mix(1.0,.55,cinematic);
  }
  if(releaseMist.w>0.0)depth+=vaisenGaussian(ray,distance,releaseMist.xyz,vec3(.38,.63,.67))*releaseMist.w*.5;
  return depth*strength;
}
`;
function mobileFogShader(source) {
  const first = source.indexOf("float safeY = abs(ray.y)"), last = source.indexOf("float opacity = 1.0 - exp(-opticalDepth);", first);
  const main = "void main() {";
  if (first < 0 || last < 0 || !source.includes(main)) throw new Error("Mobile fog shader contract changed");
  return (source.slice(0, first) + "float opticalDepth=vaisenMobileDepth(ray,endDistance);\n        " + source.slice(last)).replace(main, MOBILE_FOG_GLSL + "\n" + main);
}
function heightFogIntegral(eyeY, rayY, first, last) {
  if (last <= first) return 0;
  if (Math.abs(rayY) < 1e-5) return Math.exp(-Math.max(0, eyeY + rayY * (first + last) * 0.5 + 0.25) * 0.85) * (last - first);
  const crossing = Math.abs(rayY) > 1e-5 ? Math.max(first, Math.min(last, (-0.25 - eyeY) / rayY)) : first;
  const below = Math.abs(rayY) < 1e-5 ? eyeY < -0.25 ? last - first : 0 : rayY > 0 ? crossing - first : last - crossing;
  const highFirst = rayY > 0 ? crossing : first, highLast = rayY > 0 ? last : crossing;
  const h0 = Math.max(0, eyeY + rayY * highFirst + 0.25), h1 = Math.max(0, eyeY + rayY * highLast + 0.25);
  const delta = (h1 - h0) * 0.85, ratio = Math.abs(delta) < 0.01 ? 1 - delta * 0.5 + delta * delta / 6 : (1 - Math.exp(-delta)) / delta;
  const high = Math.exp(-h0 * 0.85) * (highLast - highFirst) * ratio;
  return Math.max(0, below + high);
}
export {
  MOBILE_FOG_GLSL,
  heightFogIntegral,
  mobileFogShader
};
