const SITE_SECTORS = Object.freeze(["core", "cgi", "music", "web", "smart-light"]);
function sceneCommand(event, source, origin) {
  if (event.source !== source || event.origin !== origin) return null;
  const data = event.data;
  if (data?.type === "vaisen-scene-select" && SITE_SECTORS.includes(data.sector)) return { sector: data.sector };
  if (data?.type === "vaisen-scene-focus" && SITE_SECTORS.includes(data.sector) && data.sector !== "core" && Number.isInteger(data.floor) && data.floor >= 0 && data.floor < 3) return { focus: { sector: data.sector, floor: data.floor } };
  if (data?.type === "vaisen-scene-breakdown" && ["clay", "lighting", "final"].includes(data.stage)) return { breakdown: data.stage };
  if (data?.type === "vaisen-scene-visibility" && typeof data.visible === "boolean") return { visible: data.visible };
  if (data?.type === "vaisen-scene-motion" && typeof data.motion === "boolean") return { motion: data.motion };
  if (data?.type === "vaisen-scene-audio" && Number.isFinite(data.time) && data.time >= 0 && data.time <= 86400 && Number.isFinite(data.level) && data.level >= 0 && data.level <= 1 && typeof data.playing === "boolean") return { audio: { time: data.time, level: data.level, playing: data.playing } };
  if (data?.type === "vaisen-scene-intro" && ["start", "skip"].includes(data.action)) return { intro: data.action, introImmediate: data.immediate === true };
  if (data?.type === "vaisen-scene-layout" && [data.header, data.footer].every((value) => Number.isFinite(value) && value >= 0 && value <= 4096) && (data.opaqueTop === void 0 || Number.isFinite(data.opaqueTop) && data.opaqueTop >= 0 && data.opaqueTop <= 4096)) return { layout: { header: data.header, footer: data.footer, ...data.opaqueTop === void 0 ? {} : { opaqueTop: data.opaqueTop } } };
  return null;
}
function immersiveInsets(width, height, layout) {
  const portrait = width / height <= 1.15;
  const footer = Math.min(layout?.footer ?? 100, Math.max(0, height * 0.22 - (portrait ? 30 : 48)));
  const headerLimit = portrait ? Math.min(height * 0.64, height - footer - 30 - height * 0.22) - 124 : height * 0.24 - 16;
  return { header: Math.min(layout?.header ?? (portrait ? 174 : 88), Math.max(0, headerLimit)), footer };
}
function embeddedCamera(pose) {
  if (!pose.rect) return pose;
  const rect = { left: 0.06, right: 0.94, top: 0.06, bottom: 0.92 };
  const scale = Math.min((rect.right - rect.left) / (pose.rect.right - pose.rect.left), (rect.bottom - rect.top) / (pose.rect.bottom - pose.rect.top));
  const fov = 2 * Math.atan(Math.tan(pose.fov * Math.PI / 360) / scale) * 180 / Math.PI;
  return { ...pose, fov, shiftX: rect.left + rect.right - 1, shiftY: 1 - rect.top - rect.bottom, rect };
}
export {
  SITE_SECTORS,
  embeddedCamera,
  immersiveInsets,
  sceneCommand
};
