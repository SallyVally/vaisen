import { PerspectiveDrag, canGrabPerspective } from "./site-perspective-drag.js";
function mountPerspective(root, { reduced, view = window, doc = document, load = () => import("./brand-perspective.js") } = {}) {
  if (!root) return null;
  const host = root.querySelector(".perspective-render");
  const grip = root.querySelector(".perspective-grip"), instruction = root.querySelector(".perspective-instruction");
  const drag = new PerspectiveDrag();
  let available = false, captured = null, angleReadout = null;
  let renderer = null, pending = null, disposed = false, failed = false, raf = 0, lastTime = 0, current = null, drawing = false;
  const measure = () => root.getBoundingClientRect();
  const inView = () => {
    const b = measure();
    return b.width > 0 && b.bottom > 0 && b.top < view.innerHeight && !doc.hidden;
  };
  const progress = () => Math.max(0, Math.min(1, -measure().top / Math.max(1, root.offsetHeight - view.innerHeight)));
  const stop = () => {
    if (raf) view.cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
  };
  function releaseCapture() {
    const id = captured;
    captured = null;
    if (id !== null && grip?.hasPointerCapture?.(id)) {
      try {
        grip.releasePointerCapture(id);
      } catch {
      }
    }
  }
  function finish({ reset = false } = {}) {
    if (reset) drag.reset();
    else drag.release();
    releaseCapture();
    root.classList.remove("is-grabbing");
  }
  function updateGrip(enabled) {
    available = Boolean(enabled && grip);
    if (grip) {
      grip.hidden = !available;
      grip.tabIndex = available ? 0 : -1;
    }
    if (!available && drag.held) finish();
    if (instruction) {
      const text = available ? drag.held ? "Release to align the mark." : "Drag sideways. Release to align." : "Scroll to find the angle.";
      if (instruction.textContent !== text) instruction.textContent = text;
    }
  }
  function draw(time) {
    raf = 0;
    drawing = true;
    try {
      if (disposed || !renderer || !inView()) {
        finish({ reset: true });
        updateGrip(false);
        lastTime = 0;
        return;
      }
      const target = reduced?.matches ? 0.64 : progress();
      const dt = lastTime ? Math.max(0, (time - lastTime) / 1e3) : 1 / 60;
      current = current === null || reduced?.matches ? target : current + (target - current) * (1 - Math.exp(-dt * 16));
      lastTime = time;
      if (Math.abs(target - current) < 1e-4) current = target;
      updateGrip(canGrabPerspective(current, Boolean(reduced?.matches)) && canGrabPerspective(target, Boolean(reduced?.matches)));
      const yaw = drag.tick(dt, { reduced: Boolean(reduced?.matches) });
      renderer.draw(current, { reduced: Boolean(reduced?.matches), yaw });
      const degrees = Math.round(yaw * 180 / Math.PI);
      if (grip && degrees !== angleReadout) {
        angleReadout = degrees;
        grip.setAttribute("aria-valuenow", String(degrees));
        grip.setAttribute("aria-valuetext", degrees === 0 ? "Aligned" : `${Math.abs(degrees)} degrees ${degrees < 0 ? "left" : "right"}`);
      }
      root.style.setProperty("--perspective-progress", String(current));
      root.classList.add("is-rendered");
      if (current !== target || drag.moving) raf = view.requestAnimationFrame(draw);
      else lastTime = 0;
    } finally {
      drawing = false;
    }
  }
  function request() {
    if (!disposed && renderer && inView() && !raf && !drawing) raf = view.requestAnimationFrame(draw);
  }
  function setMotion() {
    finish({ reset: true });
    root.dataset.motion = reduced?.matches ? "reduced" : "full";
    current = null;
    request();
  }
  async function prepare() {
    if (renderer || pending || disposed || failed || !host || measure().width < 1) return;
    pending = load();
    try {
      const module = await pending;
      if (disposed) return;
      renderer = module.createPerspectiveRenderer(host);
      root.classList.add("is-live");
      setMotion();
      request();
    } catch {
      failed = true;
      root.classList.remove("is-live", "is-rendered");
    } finally {
      pending = null;
    }
  }
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      prepare();
      request();
    } else {
      finish({ reset: true });
      updateGrip(false);
      stop();
    }
  }, { rootMargin: "300px 0px", threshold: 0 });
  observer.observe(root);
  const resize = new ResizeObserver(() => request());
  resize.observe(host);
  const visibility = () => {
    if (doc.hidden) {
      finish({ reset: true });
      updateGrip(false);
      stop();
    } else request();
  };
  view.addEventListener("scroll", request, { passive: true });
  view.addEventListener("resize", request);
  doc.addEventListener("visibilitychange", visibility);
  reduced?.addEventListener?.("change", setMotion);
  const contextLost = (event) => {
    event.preventDefault();
    finish({ reset: true });
    updateGrip(false);
    stop();
    failed = true;
    renderer?.dispose();
    renderer = null;
    root.classList.remove("is-live", "is-rendered");
  };
  host.addEventListener("webglcontextlost", contextLost, true);
  const capture = (id) => {
    try {
      grip?.setPointerCapture?.(id);
      captured = id;
    } catch {
    }
  };
  const down = (event) => {
    if (!available || event.isPrimary === false || event.button !== 0 || !drag.begin(event.pointerId, event.clientX, event.clientY, grip.getBoundingClientRect().width)) return;
    if (event.pointerType !== "touch") {
      event.preventDefault();
      grip.focus?.({ preventScroll: true });
      capture(event.pointerId);
    }
    root.classList.add("is-grabbing");
    request();
  };
  const move = (event) => {
    const result = drag.move(event.pointerId, event.clientX, event.clientY);
    if (result === "drag") {
      if (captured !== event.pointerId) capture(event.pointerId);
      event.preventDefault();
      request();
    } else if (result === "vertical") {
      finish();
      request();
    }
  };
  const up = (event) => {
    if (drag.pointer?.id === event.pointerId) {
      finish();
      request();
    }
  };
  const lost = (event) => {
    if (captured === event.pointerId) {
      captured = null;
      finish();
      request();
    }
  };
  const keydown = (event) => {
    if (!available || !["ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      drag.key(event.key === "ArrowLeft" ? -1 : 1);
      root.classList.add("is-grabbing");
    } else finish();
    request();
  };
  const keyup = (event) => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key) && drag.keyHeld) {
      event.preventDefault();
      finish();
      request();
    }
  };
  const blur = () => {
    finish();
    request();
  };
  grip?.addEventListener("pointerdown", down);
  grip?.addEventListener("lostpointercapture", lost);
  grip?.addEventListener("keydown", keydown);
  grip?.addEventListener("keyup", keyup);
  grip?.addEventListener("blur", blur);
  view.addEventListener("pointermove", move, { passive: false });
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  view.addEventListener("blur", blur);
  return { dispose() {
    if (disposed) return;
    disposed = true;
    finish({ reset: true });
    updateGrip(false);
    stop();
    observer.disconnect();
    resize.disconnect();
    view.removeEventListener("scroll", request);
    view.removeEventListener("resize", request);
    doc.removeEventListener("visibilitychange", visibility);
    reduced?.removeEventListener?.("change", setMotion);
    host.removeEventListener("webglcontextlost", contextLost, true);
    renderer?.dispose();
    grip?.removeEventListener("pointerdown", down);
    grip?.removeEventListener("lostpointercapture", lost);
    grip?.removeEventListener("keydown", keydown);
    grip?.removeEventListener("keyup", keyup);
    grip?.removeEventListener("blur", blur);
    view.removeEventListener("pointermove", move);
    view.removeEventListener("pointerup", up);
    view.removeEventListener("pointercancel", up);
    view.removeEventListener("blur", blur);
    root.classList.remove("is-live", "is-rendered");
  } };
}
export {
  mountPerspective
};
