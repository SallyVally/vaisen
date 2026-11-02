function mobileViewport(width, height, coarsePointer = false) {
  return width < 740 || coarsePointer && Math.min(width, height) < 740 && Math.max(width, height) <= 1100;
}
export {
  mobileViewport
};
