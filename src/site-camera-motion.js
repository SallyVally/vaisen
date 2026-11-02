class SiteCameraMotion {
  constructor(response = 0.18) {
    this.response = response;
    this.pose = null;
    this.target = null;
  }
  set(pose, immediate = false) {
    this.target = pose;
    if (!this.pose || immediate) {
      this.pose = { ...pose, position: pose.position.clone(), target: pose.target.clone() };
      return true;
    }
    return false;
  }
  tick(dt) {
    if (!this.pose || !this.target || dt <= 0) return false;
    const current = this.pose, goal = this.target;
    const remaining = Math.max(current.position.distanceTo(goal.position), current.target.distanceTo(goal.target), Math.abs(current.fov - goal.fov), Math.abs(current.shiftX - goal.shiftX), Math.abs(current.shiftY - goal.shiftY));
    if (remaining < 1e-4) {
      if (remaining === 0) return false;
      this.set(goal, true);
      return true;
    }
    const amount = 1 - Math.exp(-Math.min(dt, 0.5) / this.response);
    current.position.lerp(goal.position, amount);
    current.target.lerp(goal.target, amount);
    for (const key of ["fov", "shiftX", "shiftY"]) current[key] += (goal[key] - current[key]) * amount;
    return true;
  }
}
export {
  SiteCameraMotion
};
