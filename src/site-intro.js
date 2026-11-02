class SiteIntro {
  constructor({ hero, reduced, onReveal, schedule = (callback, delay) => setTimeout(callback, delay), cancelTimer = (id) => clearTimeout(id), maxWait = 3200, textDelay = 1150, deferReduced = false } = {}) {
    this.hero = hero;
    this.reduced = reduced;
    this.onReveal = onReveal;
    this.schedule = schedule;
    this.cancelTimer = cancelTimer;
    this.textDelay = textDelay;
    this.eligible = true;
    this.started = false;
    this.shown = false;
    hero.classList.add("scene-intro-await");
    this.fallback = this.schedule(() => {
      this.fallback = null;
      this.eligible = false;
      this.hero.classList.remove("scene-intro-await");
      this.showText(true);
    }, maxWait);
    this.revealTimer = null;
    if (reduced?.matches && !deferReduced) this.showText(false);
    else hero.classList.add("scene-intro-pending");
    this.onPreferenceChange = () => {
      if (this.reduced?.matches) this.showText(false);
    };
    reduced?.addEventListener?.("change", this.onPreferenceChange);
  }
  sceneReady() {
    if (!this.eligible || this.started) return false;
    this.started = true;
    this.eligible = false;
    this.hero.classList.remove("scene-intro-await");
    if (this.fallback !== null) this.cancelTimer(this.fallback);
    this.fallback = null;
    if (!this.shown) this.revealTimer = this.schedule(() => {
      this.revealTimer = null;
      this.showText(true);
    }, this.textDelay);
    return true;
  }
  showText(animate) {
    if (this.shown) return;
    this.shown = true;
    try {
      this.onReveal?.(Boolean(animate && !this.reduced?.matches));
    } finally {
      this.hero.classList.remove("scene-intro-pending");
    }
  }
  cancel() {
    this.eligible = false;
    if (this.fallback !== null) this.cancelTimer(this.fallback);
    if (this.revealTimer !== null) this.cancelTimer(this.revealTimer);
    this.fallback = this.revealTimer = null;
    this.hero.classList.remove("scene-intro-await");
    this.showText(false);
  }
  dispose() {
    this.cancel();
    this.reduced?.removeEventListener?.("change", this.onPreferenceChange);
  }
}
export {
  SiteIntro
};
