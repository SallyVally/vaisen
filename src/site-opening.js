class SiteOpening {
  constructor({ root, hero, copy, reduced, send, onReveal, eligible = true }) {
    Object.assign(this, { root, hero, copy, reduced, send, onReveal });
    this.done = false;
    this.ready = false;
    this.shown = false;
    this.eligible = eligible;
    this.document = root.ownerDocument;
    this.skipButton = root.querySelector(".opening-skip");
    this.controls = hero.querySelector(".hero-bottom");
    this.onSkip = () => this.cancel();
    this.onKey = (event) => {
      if (event.key === "Escape" && !this.done) {
        event.preventDefault();
        this.cancel();
      }
    };
    this.onScroll = () => {
      if (window.scrollY > 4) this.cancel(true);
    };
    this.onWheel = () => this.cancel(true);
    this.onNavigation = (event) => {
      if (event.target.closest?.('a[href^="#"]')) this.cancel(true);
    };
    this.onPreference = () => {
      if (reduced.matches) this.cancel(true);
    };
    this.onResize = () => this.document.documentElement.style.setProperty("--film-bottom", `${Math.max(0, window.innerHeight - hero.getBoundingClientRect().bottom)}px`);
    window.addEventListener("resize", this.onResize);
    this.skipButton.addEventListener("click", this.onSkip);
    this.document.addEventListener("keydown", this.onKey);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("wheel", this.onWheel, { passive: true });
    this.document.addEventListener("click", this.onNavigation);
    reduced?.addEventListener?.("change", this.onPreference);
    if (eligible) {
      root.hidden = false;
      copy.inert = true;
      this.controls.inert = true;
      this.document.documentElement.classList.add("film-active", "film-loading");
      this.document.documentElement.style.setProperty("--film-bottom", `${Math.max(0, window.innerHeight - hero.getBoundingClientRect().bottom)}px`);
      this.timer = setTimeout(() => this.cancel(true), 6e4);
    } else this.finish(false);
    this.document.documentElement.classList.remove("film-boot");
  }
  sceneReady(available) {
    this.ready = true;
    if (this.done || !this.eligible || !available) {
      this.send({ type: "vaisen-scene-intro", action: "skip", immediate: true });
      this.finish(false);
      return;
    }
    clearTimeout(this.timer);
    this.document.documentElement.classList.remove("film-loading");
    this.send({ type: "vaisen-scene-intro", action: "start" });
  }
  update(state) {
    if (this.done || !this.ready || typeof state.active !== "boolean" || !["progress", "opening", "reveal", "ui"].every((key) => Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1)) return;
    const style = this.document.documentElement.style;
    style.setProperty("--film-opening", state.opening);
    style.setProperty("--film-reveal", state.reveal);
    style.setProperty("--film-ui", state.ui);
    if (state.reveal > 0) this.revealText(true);
    if (!state.active) this.finish(true);
  }
  revealText(animate) {
    if (this.shown) return;
    this.shown = true;
    this.copy.inert = false;
    this.controls.inert = false;
    this.onReveal(Boolean(animate && !this.reduced?.matches));
  }
  cancel(immediate = false) {
    if (this.done) return;
    this.eligible = false;
    if (this.ready) this.send({ type: "vaisen-scene-intro", action: "skip", immediate });
    this.finish(false);
  }
  finish(animate) {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.timer);
    this.revealText(animate);
    this.root.hidden = true;
    this.document.documentElement.classList.remove("film-active", "film-loading", "film-boot");
    for (const name of ["--film-opening", "--film-reveal", "--film-ui", "--film-bottom"]) this.document.documentElement.style.removeProperty(name);
    window.removeEventListener("resize", this.onResize);
    this.skipButton.removeEventListener("click", this.onSkip);
    this.document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("wheel", this.onWheel);
    this.document.removeEventListener("click", this.onNavigation);
    this.reduced?.removeEventListener?.("change", this.onPreference);
    if (this.document.activeElement === this.skipButton) this.document.querySelector(".site-header .brand")?.focus({ preventScroll: true });
  }
}
export {
  SiteOpening
};
