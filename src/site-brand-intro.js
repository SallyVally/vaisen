class BrandIntro {
  constructor({ root, target, reduced, onReveal, schedule = (callback, delay) => setTimeout(callback, delay), cancelTimer = (id) => clearTimeout(id), minDuration = 1500, maxWait = 3e3 } = {}) {
    Object.assign(this, { root, target, reduced, onReveal, schedule, cancelTimer });
    this.animations = new Set();
    this.timers = new Set();
    this.background = [];
    this.done = false;
    this.leaving = false;
    this.revealed = false;
    this.ready = false;
    this.minimum = false;
    if (!root || !root.animate) {
      this.finish();
      return;
    }
    this.document = root.ownerDocument;
    root.hidden = false;
    this.document.documentElement.classList.add("brand-intro-active");
    for (const node of this.document.querySelectorAll(".site-header, main, .site-footer, .skip-link")) {
      this.background.push({ node, inert: node.hasAttribute("inert") });
      node.setAttribute("inert", "");
    }
    this.skipButton = root.querySelector(".brand-intro-skip");
    this.onSkip = () => this.skip();
    this.onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.skip();
      } else if (event.key === "Tab") {
        event.preventDefault();
        this.skipButton?.focus();
      }
    };
    this.skipButton?.addEventListener("click", this.onSkip);
    this.document.addEventListener("keydown", this.onKey);
    try {
      this.after(() => {
        this.minimum = true;
        if (this.ready) this.exit();
      }, reduced?.matches ? 650 : minDuration);
      this.after(() => this.exit(), reduced?.matches ? 1100 : maxWait);
      this.draw();
    } catch {
      this.finish();
    }
  }
  after(callback, delay) {
    const id = this.schedule(() => {
      this.timers.delete(id);
      callback();
    }, delay);
    this.timers.add(id);
    return id;
  }
  animate(node, frames, timing) {
    if (!node?.animate) return;
    const animation = node.animate(frames, { fill: "both", ...timing });
    this.animations.add(animation);
    animation.finished?.catch(() => {
    });
  }
  draw() {
    const find = (selector) => this.root.querySelector(selector), quiet = this.reduced?.matches;
    this.animate(find(".intro-v-outline"), quiet ? [{ opacity: 0 }, { opacity: 0.45 }] : [{ opacity: 0, strokeDasharray: "1", strokeDashoffset: "1" }, { opacity: 0.6, strokeDasharray: "1", strokeDashoffset: "0" }], { duration: quiet ? 300 : 1200, easing: "cubic-bezier(.25,.1,.25,1)" });
    for (const [index, selector] of [".intro-v-left", ".intro-v-right"].entries()) {
      this.animate(find(selector), quiet ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, clipPath: "polygon(0 0,100% 0,100% 0,0 0)", transform: `translateX(${index ? 7 : -7}px)` }, { opacity: 1, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)", transform: "translateX(0px)" }], { duration: quiet ? 320 : 1e3, delay: quiet ? 80 : 190 + index * 100, easing: "cubic-bezier(.22,1,.36,1)" });
    }
    this.animate(find(".intro-v-solid"), [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: quiet ? 300 : 1180 });
    this.animate(find(".brand-intro-name"), [{ opacity: 0, letterSpacing: quiet ? ".52em" : ".85em" }, { opacity: 0.72, letterSpacing: ".52em" }], { duration: quiet ? 250 : 800, delay: quiet ? 160 : 600, easing: "cubic-bezier(.16,1,.3,1)" });
    if (!quiet) this.animate(find(".intro-v-glint"), [{ opacity: 0, transform: "translateX(0px) rotate(-24deg)" }, { opacity: 0.85, offset: 0.35 }, { opacity: 0, transform: "translateX(160px) rotate(-24deg)" }], { duration: 950, delay: 460, easing: "ease-in-out" });
    else find(".intro-v-glint").style.opacity = "0";
  }
  sceneReady() {
    this.ready = true;
    if (this.minimum) this.exit();
  }
  reveal() {
    if (!this.revealed) {
      this.revealed = true;
      this.onReveal?.();
    }
  }
  exit() {
    if (this.done || this.leaving) return;
    this.leaving = true;
    for (const timer of this.timers) this.cancelTimer(timer);
    this.timers.clear();
    this.reveal();
    const quiet = this.reduced?.matches, symbol = this.root.querySelector(".brand-intro-symbol");
    const from = symbol.getBoundingClientRect?.(), to = this.target?.getBoundingClientRect?.();
    this.animate(this.root.querySelector(".brand-intro-backdrop"), [{ opacity: 1 }, { opacity: 0 }], { duration: quiet ? 240 : 880, easing: "cubic-bezier(.45,0,.2,1)" });
    this.animate(this.root.querySelector(".brand-intro-name"), [{ opacity: 0.72 }, { opacity: 0 }], { duration: 180 });
    this.animate(this.skipButton, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
    if (!quiet && from?.width && to?.width) {
      const x = to.left + to.width / 2 - from.left - from.width / 2;
      const y = to.top + to.height / 2 - from.top - from.height / 2;
      this.animate(symbol, [{ transform: "translate(-50%, -50%) translate(0px, 0px) scale(1)" }, { transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${to.width / from.width})` }], { duration: 940, easing: "cubic-bezier(.76,0,.24,1)" });
    } else this.animate(symbol, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    this.after(() => this.finish(), quiet ? 260 : 960);
  }
  skip() {
    this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    for (const timer of this.timers) this.cancelTimer(timer);
    this.timers.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    const hadFocus = this.document?.activeElement === this.skipButton;
    for (const { node, inert } of this.background) if (!inert) node.removeAttribute("inert");
    if (this.root) this.root.hidden = true;
    this.document?.documentElement.classList.remove("brand-intro-active");
    this.skipButton?.removeEventListener("click", this.onSkip);
    this.document?.removeEventListener("keydown", this.onKey);
    if (hadFocus) this.target?.closest("a")?.focus({ preventScroll: true });
    this.reveal();
  }
}
export {
  BrandIntro
};
