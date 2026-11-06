import { assetUrl } from "./asset-paths.js";
import { createIcons, ArrowUpRight, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, Volume2, VolumeX, Play, Pause, Copy } from "lucide";
import { bindTrackPlayer, formatTrackTime } from "./site-player.js";
import { SITE_SECTORS } from "./site-scene-protocol.js";
import { DisciplineDeck } from "./site-disciplines.js";
import { MusicPreview } from "./site-music.js";
import { MusicVisualTransport } from "./site-music-motion.js";
import { TypeMotion } from "./site-type-motion.js";
import { SiteOpening } from "./site-opening.js";
import { mountPerspective } from "./site-perspective.js";
import { mountVyshe } from "./site-vyshe.js";
const icons = { ArrowUpRight, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, Volume2, VolumeX, Play, Pause, Copy };
const renderIcons = () => createIcons({ icons });
renderIcons();
const frame = document.querySelector("#studio-scene"), sceneState = document.querySelector("#scene-state");
const fallback = document.querySelector("#scene-fallback");
const hero = document.querySelector(".hero"), copy = document.querySelector(".hero-copy");
const intro = document.querySelector(".hero-intro"), story = document.querySelector("#discipline-story"), deck = new DisciplineDeck();
const audio = document.querySelector("#portfolio-audio"), wave = document.querySelector("#track-waveform");
const soundButton = document.querySelector("#preview-sound");
const systemMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const pageUrl = new URL(location.href);
const replayOpening = pageUrl.searchParams.get("intro") === "replay";
const fullMotion = replayOpening || pageUrl.searchParams.get("motion") === "full";
const reduced = fullMotion ? { matches: false } : systemMotion;
const openingKey = "vaisen-opening-seen";
let openingSeen = false;
try { openingSeen = window.localStorage.getItem(openingKey) === "1"; } catch {}
const rememberOpening = () => { try { window.localStorage.setItem(openingKey, "1"); } catch {} };
const openingEligible = replayOpening || !openingSeen && !reduced?.matches && (!location.hash || location.hash === "#top");
if (replayOpening) {
  pageUrl.searchParams.delete("intro");
  history.replaceState(history.state, "", pageUrl.pathname + pageUrl.search + pageUrl.hash);
}
const replayButton = document.querySelector("#replay-opening");
replayButton.hidden = false;
replayButton.addEventListener("click", () => {
  const url = new URL(location.href);
  url.searchParams.set("intro", "replay");
  url.hash = "";
  location.assign(url.href);
});
const sceneUrl = new URL(frame.dataset.sceneSrc, location.href);
sceneUrl.searchParams.set("intro", openingEligible ? "cinematic" : "none");
if (fullMotion) sceneUrl.searchParams.set("motion", "full");
frame.src = sceneUrl.href;
if (fullMotion) document.documentElement.dataset.uiMotion = "full";
const typeMotion = new TypeMotion(reduced);
const introCopy = [...intro.querySelectorAll("h1,h2,.hero-description")].map((node) => ({ node, text: node.textContent }));
reduced?.addEventListener?.("change", () => {
  if (reduced.matches) typeMotion.stop();
});
const preview = new MusicPreview(audio, { onState() {
  const playing = !audio.paused && !audio.ended;
  soundButton.setAttribute("aria-pressed", String(playing));
  soundButton.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  soundButton.title = playing ? "Pause music" : "Play music";
  soundButton.replaceChildren();
  const icon = document.createElement("i");
  icon.dataset.lucide = playing ? "volume-2" : "volume-x";
  icon.setAttribute("aria-hidden", "true");
  soundButton.append(icon);
  renderIcons();
  document.querySelector("#preview-status").textContent = playing ? "Music playing" : "Music paused";
} });
soundButton.addEventListener("click", () => preview.toggle());
audio.addEventListener("timeupdate", () => {
  document.querySelector("#preview-progress").style.transform = `scaleX(${Math.max(0, Math.min(1, (audio.currentTime || 0) / (audio.duration || 88.163)))})`;
});
for (const node of [document.querySelector("#track-play"), document.querySelector("#track-seek"), audio]) {
  node.addEventListener("pointerdown", () => preview.takeOver());
  node.addEventListener("keydown", (event) => {
    if (["Enter", " ", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) preview.takeOver();
  });
}
let requested = "core", ready = false, visible = true;
const send = (data) => frame.contentWindow?.postMessage(data, location.origin);
const musicMotion = new MusicVisualTransport(audio, { send: (data) => {
  if (ready) send(data);
} });
const perspective = mountPerspective(document.querySelector("#perspective"), { reduced });
const vyshe = mountVyshe(document.querySelector("#work"), { reduced });
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    perspective?.dispose();
    vyshe?.dispose();
  }
});
let layoutKey = "";
function reportLayout() {
  if (!ready || !hero.getBoundingClientRect) return;
  const bounds = hero.getBoundingClientRect(), footer = document.querySelector(".hero-bottom").getBoundingClientRect();
  const narrow = bounds.width / bounds.height <= 1.15;
  const readingArea = narrow ? intro.hidden ? document.querySelector("#story-content") : intro : copy;
  const content = readingArea.getBoundingClientRect();
  hero.style.setProperty("--scene-copy-bottom", `${Math.round(content.bottom - bounds.top)}px`);
  const layout = { header: Math.max(0, Math.round(narrow ? content.bottom - bounds.top + 16 - 124 : document.querySelector(".site-header").getBoundingClientRect().height)), footer: Math.max(narrow ? 0 : 120, Math.round(bounds.bottom - footer.top)), opaqueTop: narrow && requested !== "core" ? Math.max(0, Math.round(content.bottom - bounds.top - 128)) : 0 };
  const key = JSON.stringify(layout);
  if (key === layoutKey) return;
  layoutKey = key;
  send({ type: "vaisen-scene-layout", ...layout });
}
const layoutObserver = new ResizeObserver(reportLayout);
for (const node of [hero, copy, intro, document.querySelector("#story-content"), document.querySelector(".hero-bottom")]) layoutObserver.observe(node);
function animateIntro(animate = true) {
  introCopy.forEach(({ node, text }, index) => typeMotion.set(node, text, { animate, headline: index < 2, liquid: node.id === "hero-statement", delay: index * 110 }));
}
const opening = new SiteOpening({ root: document.querySelector("#brand-intro"), hero, copy, reduced, send, onReveal: animateIntro, onSeen: rememberOpening, eligible: openingEligible });
const fail = () => {
  opening.cancel(true);
  fallback.hidden = false;
  hero.dataset.sceneReady = "false";
  sceneState.textContent = "Scene unavailable";
};
setTimeout(() => { if (!hero.dataset.sceneReady) hero.dataset.sceneLoading = "true"; }, 1200);
const timeout = setTimeout(fail, 6e4);
function selectSector(sector) {
  if (!SITE_SECTORS.includes(sector)) return;
  opening.cancel();
  typeMotion.depart(intro.hidden ? document.querySelector("#story-content") : intro, copy);
  typeMotion.stop({ departures: false });
  requested = sector;
  deck.select(sector);
  musicMotion.select(sector === "music");
  preview.select(sector === "music");
  hero.dataset.sector = sector;
  intro.hidden = sector !== "core";
  story.hidden = sector === "core";
  document.querySelector("#hero-work-link").href = deck.story?.work ?? "#work";
  if (deck.story) renderChapter(true, { exit: false });
  else animateIntro();
  reportLayout();
  for (const button of document.querySelectorAll("[data-assembly]")) button.setAttribute("aria-pressed", String(button.dataset.assembly === sector));
  if (ready) {
    sceneState.textContent = sector === "core" ? "Returning to Core" : `Opening ${deck.story.label}`;
    send({ type: "vaisen-scene-select", sector });
    sendFocus();
  }
}
function sendFocus() {
  if (ready && deck.chapter) send({ type: "vaisen-scene-focus", sector: deck.sector, floor: deck.chapter.floor });
}
function renderChapter(animate = true, { exit = true } = {}) {
  const { chapter } = deck;
  document.querySelector("#story-discipline").textContent = `${deck.story.number} / ${deck.story.label}`;
  document.querySelector("#story-place").textContent = chapter.place;
  typeMotion.set(document.querySelector("#story-title"), chapter.title, { animate, headline: true, exit });
  typeMotion.set(document.querySelector("#story-body"), chapter.body, { animate, delay: 100, exit });
  document.querySelector("#story-body").hidden = !chapter.body;
  document.querySelector("#story-work-link").href = deck.story.work;
  document.querySelector("#story-work-label").textContent = deck.sector === "music" ? "Listen" : "View VYSHE";
  document.querySelector("#story-content").setAttribute("aria-labelledby", `story-tab-${deck.index}`);
  document.querySelector("#music-preview").hidden = deck.sector !== "music";
  for (const tab of story.querySelectorAll("[data-chapter]")) {
    const index = Number(tab.dataset.chapter), selected = index === deck.index;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.setAttribute("aria-label", deck.story.chapters[index].place);
    tab.title = deck.story.chapters[index].place;
  }
  document.querySelector("#story-prev").disabled = deck.index === 0;
  document.querySelector("#story-next").disabled = deck.index === deck.story.chapters.length - 1;
  story.setAttribute("aria-label", deck.story.label);
  reportLayout();
}
function turnChapter(index) {
  if (!deck.go(index)) return false;
  renderChapter();
  sendFocus();
  return true;
}
for (const tab of story.querySelectorAll("[data-chapter]")) tab.addEventListener("click", () => turnChapter(Number(tab.dataset.chapter)));
document.querySelector("#story-prev").addEventListener("click", () => turnChapter(deck.index - 1));
document.querySelector("#story-next").addEventListener("click", () => turnChapter(deck.index + 1));
story.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    selectSector("core");
    return;
  }
  const tab = event.target.getAttribute("role") === "tab";
  const step = event.key === "ArrowRight" || tab && event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || tab && event.key === "ArrowUp" ? -1 : 0;
  const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : step ? deck.index + step : null;
  if (index !== null) {
    event.preventDefault();
    turnChapter(index);
    if (event.target.getAttribute("role") === "tab") story.querySelector(`[data-chapter="${deck.index}"]`).focus();
  }
});
let wheelTotal = 0, lastWheel = 0, touchStart = null;
story.addEventListener("wheel", (event) => {
  if (event.ctrlKey || story.scrollHeight > story.clientHeight + 2 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const direction = Math.sign(event.deltaY);
  if (direction < 0 && deck.index === 0 || direction > 0 && deck.index === 2) return;
  event.preventDefault();
  const now = performance.now();
  if (now - lastWheel < 850) return;
  wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
  if (Math.abs(wheelTotal) > 55) {
    if (turnChapter(deck.index + Math.sign(wheelTotal))) lastWheel = now;
    wheelTotal = 0;
  }
}, { passive: false });
story.addEventListener("touchstart", (event) => {
  const point = event.touches[0];
  touchStart = { x: point.clientX, y: point.clientY };
}, { passive: true });
story.addEventListener("touchend", (event) => {
  if (!touchStart) return;
  const point = event.changedTouches[0], dx = point.clientX - touchStart.x, dy = point.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) turnChapter(deck.index + (dx < 0 ? 1 : -1));
}, { passive: true });
for (const button of document.querySelectorAll("[data-assembly]")) button.addEventListener("click", () => selectSector(button.dataset.assembly));
for (const link of document.querySelectorAll("[data-explore]")) link.addEventListener("click", () => selectSector(link.dataset.explore));
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const data = event.data;
  if (data?.type === "vaisen-scene-ready") {
    ready = true;
    clearTimeout(timeout);
    fallback.hidden = true;
    sceneState.textContent = "Core / Ready";
    hero.dataset.sceneReady = "true";
    send({ type: "vaisen-scene-motion", motion: true });
    musicMotion.publish();
    opening.sceneReady(data.intro);
    layoutKey = "";
    reportLayout();
    send({ type: "vaisen-scene-visibility", visible });
    if (requested !== "core") selectSector(requested);
  } else if (data?.type === "vaisen-scene-intro-state") opening.update(data);
  else if (data?.type === "vaisen-scene-status" && typeof data.message === "string") sceneState.textContent = data.message.slice(0, 80);
  else if (data?.type === "vaisen-scene-error") {
    clearTimeout(timeout);
    fail();
  }
});
const visibility = new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (!visible) preview.suspend();
  if (ready) send({ type: "vaisen-scene-visibility", visible });
}, { threshold: 0 });
visibility.observe(frame);
async function prepareTrack() {
  try {
    let draw = function() {
      const width = wave.clientWidth, height = wave.clientHeight, dpr = Math.min(devicePixelRatio, 2);
      wave.width = Math.max(1, Math.round(width * dpr));
      wave.height = Math.max(1, Math.round(height * dpr));
      const context = wave.getContext("2d");
      if (!context) return;
      context.scale(dpr, dpr);
      const count = metadata.waveform.length, step = width / count;
      metadata.waveform.forEach((value, index) => {
        const h = Math.max(2, Math.pow(value, 0.7) * (height - 12));
        context.fillStyle = index / count <= progress ? "#d9b477" : "#6b747b";
        context.fillRect(index * step, (height - h) / 2, Math.max(1, step * 0.48), h);
      });
    };
    const response = await fetch(assetUrl("/work/music.json"));
    if (!response.ok) throw new Error("Waveform unavailable");
    const metadata = await response.json();
    if (!Array.isArray(metadata.waveform) || metadata.waveform.length !== 180 || !metadata.waveform.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) || !Number.isFinite(metadata.duration) || metadata.duration <= 0) throw new Error("Invalid waveform");
    musicMotion.setEnvelope(metadata.waveform, metadata.duration);
    let progress = 0;
    const observer = new ResizeObserver(draw);
    observer.observe(wave);
    document.querySelector("#track-duration").textContent = formatTrackTime(metadata.duration);
    bindTrackPlayer({ audio, button: document.querySelector("#track-play"), seek: document.querySelector("#track-seek"), time: document.querySelector("#track-time"), status: document.querySelector("#track-status"), fallbackLink: document.querySelector("#track-file"), duration: metadata.duration, onState(playing) {
      const button = document.querySelector("#track-play");
      button.replaceChildren();
      const icon = document.createElement("i");
      icon.dataset.lucide = playing ? "pause" : "play";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      renderIcons();
    }, onProgress(value) {
      progress = value;
      draw();
    } });
    audio.controls = false;
    audio.hidden = true;
    document.querySelector(".custom-transport").hidden = false;
    draw();
  } catch {
    wave.hidden = true;
  }
}
prepareTrack();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    preview.suspend();
    audio.pause();
  }
});
document.querySelector("#copy-email").addEventListener("click", async () => {
  const output = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText("egorvajserman784@gmail.com");
    output.textContent = "Copied";
  } catch {
    output.textContent = "Select the email address above to copy it.";
  }
});
