function introLightPosition(progress, inspection = 0) {
  const t = Math.max(0, Math.min(1, progress)), e = t * t * (3 - 2 * t);
  return [5 - 0.8 * Math.max(0, Math.min(1, inspection)) + 2 * (1 - e), 9 - 1.1 * (1 - e), 1];
}
export {
  introLightPosition
};
