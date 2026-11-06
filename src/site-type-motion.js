let filterId = 0;
const SVG = "http://www.w3.org/2000/svg";
class TypeMotion {
  constructor(reduced) {
    this.reduced = reduced;
    this.active = new Map();
    this.layers = new Map();
    this.departures = new Set();
    this.effects = new Map();
  }
  cancel(node) {
    for (const animation of this.active.get(node) ?? []) animation.cancel();
    this.active.delete(node);
    this.layers.get(node)?.remove();
    this.layers.delete(node);
    this.effects.get(node)?.();
    this.effects.delete(node);
  }
  refract(node, visual, duration, delay) {
    const document = node.ownerDocument, id = `type-refraction-${++filterId}`;
    const svg = document.createElementNS(SVG, "svg"), defs = document.createElementNS(SVG, "defs");
    const filter = document.createElementNS(SVG, "filter"), noise = document.createElementNS(SVG, "feTurbulence");
    const displacement = document.createElementNS(SVG, "feDisplacementMap"), settle = document.createElementNS(SVG, "animate");
    svg.classList.add("type-filter");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    for (const [key, value] of Object.entries({ id, x: "-15%", y: "-30%", width: "130%", height: "160%", colorInterpolationFilters: "sRGB" })) filter.setAttribute(key, value);
    for (const [key, value] of Object.entries({ type: "fractalNoise", baseFrequency: ".012 .16", numOctaves: "1", seed: "7", result: "grain" })) noise.setAttribute(key, value);
    for (const [key, value] of Object.entries({ in: "SourceGraphic", in2: "grain", scale: "0", xChannelSelector: "R", yChannelSelector: "G" })) displacement.setAttribute(key, value);
    for (const [key, value] of Object.entries({ attributeName: "scale", values: "22;5;0", keyTimes: "0;.46;1", dur: `${duration}ms`, begin: "indefinite", fill: "freeze", calcMode: "spline", keySplines: ".16 1 .3 1;.16 1 .3 1" })) settle.setAttribute(key, value);
    displacement.append(settle);
    filter.append(noise, displacement);
    defs.append(filter);
    svg.append(defs);
    visual.append(svg);
    visual.style.filter = `url(#${id})`;
    if (settle.beginElementAt) settle.beginElementAt(delay / 1e3);
    else if (settle.beginElement) settle.beginElement();
    const cleanup = () => {
      visual.style.filter = "";
      visual.classList.remove("type-arriving");
      svg.remove();
    };
    this.effects.set(node, cleanup);
  }
  set(node, value, { animate = true, headline = false, liquid = false, delay = 0, exit = true } = {}) {
    const previous = node.querySelector(".type-visual");
    const outgoing = animate && exit && previous && previous.textContent !== value ? previous.cloneNode(true) : null;
    if (outgoing) {
      outgoing.style.filter = "";
      outgoing.classList.remove("type-arriving");
      for (const svg of outgoing.querySelectorAll(".type-filter")) svg.remove();
    }
    this.cancel(node);
    node.replaceChildren();
    const readable = node.ownerDocument.createElement("span"), visual = node.ownerDocument.createElement("span");
    readable.className = "sr-only";
    readable.textContent = value;
    visual.className = "type-visual";
    visual.setAttribute("aria-hidden", "true");
    node.append(readable, visual);
    node.classList.add("type-host");
    const words = [];
    for (const [index, text] of value.split("\n").entries()) {
      if (index) visual.append(node.ownerDocument.createElement("br"));
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          visual.append(node.ownerDocument.createTextNode(part));
          continue;
        }
        const clip = node.ownerDocument.createElement("span"), word = node.ownerDocument.createElement("span");
        clip.className = "type-clip";
        clip.setAttribute("aria-hidden", "true");
        word.className = "type-word";
        word.textContent = part;
        word.dataset.ink = part;
        clip.append(word);
        visual.append(clip);
        words.push(word);
      }
    }
    if (!animate) return;
    const animations = [];
    const reduced = this.reduced?.matches;
    const liquidHeadline = headline && liquid && !reduced;
    if (outgoing && outgoing.animate) {
      outgoing.classList.add("type-outgoing");
      node.append(outgoing);
      this.layers.set(node, outgoing);
      const fade = outgoing.animate([{ opacity: 1, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)", transform: "translateX(0px)" }, { opacity: 0, clipPath: reduced ? "polygon(0 0,100% 0,100% 100%,0 100%)" : "polygon(0 0,0 0,0 100%,0 100%)", transform: reduced ? "none" : "translateX(-10px)" }], { duration: reduced ? 140 : 250, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
      animations.push(fade);
      fade.finished?.then(() => {
        outgoing.remove();
        if (this.layers.get(node) === outgoing) this.layers.delete(node);
      }).catch(() => {
      });
    }
    const handoff = outgoing || this.departures.size ? reduced ? 50 : 120 : 0;
    visual.classList.add("type-arriving");
    visual.classList.toggle("type-headline", headline && !reduced && !liquidHeadline);
    visual.classList.toggle("type-liquid", liquidHeadline);
    if (headline && !reduced && visual.animate) this.refract(node, visual, 900, delay + handoff);
    for (const [index, word] of words.entries()) {
      if (!word.animate) continue;
      const wordDelay = (reduced ? Math.min(delay, 50) : delay) + handoff + Math.min(index * (headline ? 42 : 8), headline ? 250 : 100);
      word.style.setProperty("--ink-delay", `${wordDelay}ms`);
      const frames = reduced ? [{ opacity: 0, clipPath: "polygon(0 0,0 0,0 100%,0 100%)" }, { opacity: 1, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" }] : headline ? [{ opacity: 0, clipPath: "polygon(0 0,0 0,-30% 100%,0 100%)", transform: "translate3d(12px,0,0) skewX(-9deg) scaleX(1.08)" }, { opacity: 1, offset: 0.45 }, { opacity: 1, clipPath: "polygon(0 0,130% 0,100% 100%,0 100%)", transform: "translate3d(0,0,0) skewX(0deg) scaleX(1)" }] : [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0px)" }];
      const duration = reduced ? 280 : liquidHeadline ? 1520 : headline ? 1000 : 440;
      const animation = word.animate(frames, { duration, delay: wordDelay, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
      animations.push(animation);
      animation.finished?.then(() => {
        if (this.active.get(node) === animations && animations.every((item) => item.playState === "finished")) {
          this.active.delete(node);
          this.effects.get(node)?.();
          this.effects.delete(node);
          visual.classList.remove("type-arriving");
        }
      }).catch(() => {
      });
    }
    if (animations.length) this.active.set(node, animations);
  }
  depart(source, parent) {
    for (const entry2 of this.departures) {
      entry2.animation.cancel();
      entry2.layer.remove();
    }
    this.departures.clear();
    if (!source || source.hidden) return;
    const layer = source.cloneNode(true);
    if (typeof getComputedStyle === "function") {
      const original = [source, ...source.querySelectorAll("*")], copies = [layer, ...layer.querySelectorAll("*")];
      original.forEach((element, i) => {
        const style = getComputedStyle(element);
        for (const key of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "margin", "padding", "opacity", "transform", "filter", "whiteSpace"]) copies[i].style[key] = style[key];
        copies[i].style.animation = "none";
        copies[i].style.transition = "none";
      });
    }
    layer.removeAttribute("id");
    for (const child of layer.querySelectorAll("[id]")) child.removeAttribute("id");
    for (const svg of layer.querySelectorAll(".type-filter")) svg.remove();
    for (const visual of layer.querySelectorAll(".type-visual")) {
      visual.style.filter = "";
      visual.classList.remove("type-arriving");
    }
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("inert", "");
    layer.classList.add("copy-departure");
    const bounds = source.getBoundingClientRect?.(), container = parent.getBoundingClientRect?.();
    if (bounds && container) {
      layer.style.left = `${bounds.left - container.left}px`;
      layer.style.top = `${bounds.top - container.top}px`;
      layer.style.width = `${bounds.width}px`;
    }
    parent.append(layer);
    if (!layer.animate) {
      layer.remove();
      return;
    }
    const reduced = this.reduced?.matches;
    const animation = layer.animate([{ opacity: 1, clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" }, { opacity: 0, clipPath: reduced ? "polygon(0 0,100% 0,100% 100%,0 100%)" : "polygon(0 0,0 0,0 100%,0 100%)" }], { duration: reduced ? 160 : 290, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
    const entry = { layer, animation };
    this.departures.add(entry);
    animation.finished?.then(() => {
      layer.remove();
      this.departures.delete(entry);
    }).catch(() => {
    });
  }
  stop({ departures = true } = {}) {
    for (const node of [...this.active.keys()]) this.cancel(node);
    if (departures) {
      for (const entry of this.departures) {
        entry.animation.cancel();
        entry.layer.remove();
      }
      this.departures.clear();
    }
  }
}
export {
  TypeMotion
};
