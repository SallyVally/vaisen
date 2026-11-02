import { TypeMotion } from "./site-type-motion.js";
const clamp = (value) => Math.max(0, Math.min(1, value));
function smoothLight(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}
class VysheLight {
  constructor() {
    this.value = 0;
    this.target = 0;
    this.manual = null;
  }
  scroll(progress) {
    if (this.manual === null) this.target = smoothLight(0.08, 0.78, progress);
  }
  select(mood) {
    if (!["morning", "evening"].includes(mood)) return false;
    this.manual = mood;
    this.target = mood === "evening" ? 1 : 0;
    return true;
  }
  tick(dt, { reduced = false } = {}) {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.value = reduced ? this.target : this.value + (this.target - this.value) * (1 - Math.exp(-elapsed * 5));
    if (Math.abs(this.target - this.value) < 6e-4) this.value = this.target;
    return this.value;
  }
  get moving() {
    return this.value !== this.target;
  }
  get layers() {
    return { warm: smoothLight(0, 0.68, this.value), room: smoothLight(0.18, 1, this.value) };
  }
}
function decodeImage(image) {
  image.loading = "eager";
  if (image.decode) return image.decode();
  if (image.complete) return image.naturalWidth ? Promise.resolve() : Promise.reject(new Error("Image unavailable"));
  return new Promise((resolve, reject) => {
    const loaded = () => {
      cleanup();
      resolve();
    }, error = () => {
      cleanup();
      reject(new Error("Image unavailable"));
    };
    const cleanup = () => {
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", error);
    };
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", error, { once: true });
  });
}
function mountVyshe(root, { reduced, view = window, doc = document, decode = decodeImage } = {}) {
  if (!root) return null;
  const sequence = root.querySelector(".vyshe-sequence"), stage = root.querySelector(".vyshe-stage");
  const project = root.querySelector(".vyshe-project"), buttons = [...root.querySelectorAll("button[data-mood]")];
  const control = root.querySelector(".mood-switch"), images = [...root.querySelectorAll(".vyshe-picture img")];
  const model = new VysheLight(), type = new TypeMotion(reduced), revealed = new Set();
  let ready = false, loading = null, disposed = false, raf = 0, last = 0;
  const inView = () => {
    const b = sequence.getBoundingClientRect();
    return b.width > 0 && b.bottom > 0 && b.top < view.innerHeight && !doc.hidden;
  };
  const progress = () => {
    const b = sequence.getBoundingClientRect();
    return clamp(-b.top / Math.max(1, b.height - stage.getBoundingClientRect().height));
  };
  function updateSelection() {
    const mood = model.target >= 0.5 ? "evening" : "morning";
    root.dataset.mood = mood;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.mood === mood));
  }
  function draw(time) {
    raf = 0;
    if (!ready || disposed || !inView()) {
      last = 0;
      return;
    }
    model.scroll(reduced?.matches ? 0 : progress());
    updateSelection();
    model.tick(last ? (time - last) / 1e3 : 1 / 60, { reduced: Boolean(reduced?.matches) });
    last = time;
    const { warm, room } = model.layers;
    project.style.setProperty("--vyshe-warm", String(warm));
    project.style.setProperty("--vyshe-evening", String(room));
    const bounds = sequence.getBoundingClientRect(), entry = reduced?.matches ? 1 : smoothLight(0.1, 0.95, (view.innerHeight - bounds.top) / view.innerHeight);
    project.style.setProperty("--vyshe-entry", String(entry));
    if (model.moving) raf = view.requestAnimationFrame(draw);
    else last = 0;
  }
  function request() {
    if (ready && inView() && !raf) raf = view.requestAnimationFrame(draw);
  }
  function stop() {
    if (raf) view.cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }
  function motion() {
    root.dataset.motion = reduced?.matches ? "reduced" : "full";
    if (reduced?.matches) type.stop();
    request();
  }
  async function prepare() {
    if (ready || loading || disposed) return;
    loading = Promise.all(images.map(decode));
    try {
      await loading;
      if (disposed) return;
      ready = true;
      motion();
      root.classList.add("is-enhanced");
      control.hidden = false;
      request();
    } catch {
      if (!disposed) {
        control.hidden = true;
        root.classList.remove("is-enhanced");
      }
    }
  }
  const select = (event) => {
    model.select(event.currentTarget.dataset.mood);
    updateSelection();
    if (reduced?.matches && ready) {
      stop();
      draw(0);
    } else request();
  };
  buttons.forEach((button) => button.addEventListener("click", select));
  const near = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      prepare();
      request();
    } else stop();
  }, { rootMargin: "400px 0px", threshold: 0 });
  near.observe(sequence);
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || revealed.has(entry.target)) continue;
      revealed.add(entry.target);
      reveal.unobserve(entry.target);
      if (reduced?.matches) continue;
      const title = entry.target === stage ? root.querySelector("#work-title") : root.querySelector("#vyshe-title");
      const text = [...title.childNodes].map((node) => node.nodeName === "BR" ? "\n" : node.textContent).join("").trim().replace(/\n\s+/g, "\n");
      type.set(title, text, { animate: true, headline: true, exit: false });
    }
  }, { threshold: 0.25 });
  reveal.observe(stage);
  reveal.observe(root.querySelector(".vyshe-details"));
  const resize = new ResizeObserver(request);
  resize.observe(sequence);
  resize.observe(stage);
  const visibility = () => {
    if (doc.hidden) stop();
    else request();
  };
  view.addEventListener("scroll", request, { passive: true });
  view.addEventListener("resize", request);
  doc.addEventListener("visibilitychange", visibility);
  reduced?.addEventListener?.("change", motion);
  return { dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    type.stop();
    near.disconnect();
    reveal.disconnect();
    resize.disconnect();
    buttons.forEach((button) => button.removeEventListener("click", select));
    view.removeEventListener("scroll", request);
    view.removeEventListener("resize", request);
    doc.removeEventListener("visibilitychange", visibility);
    reduced?.removeEventListener?.("change", motion);
  } };
}
export {
  VysheLight,
  mountVyshe,
  smoothLight
};
