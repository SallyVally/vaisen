function formatTrackTime(value) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function bindTrackPlayer({ audio, button, seek, time, status, duration, fallbackLink, onState = () => {
}, onProgress = () => {
} }) {
  let seeking = false;
  const length = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
  seek.max = String(duration);
  function progress() {
    const total = length(), current = Math.min(total, Math.max(0, audio.currentTime || 0));
    if (!seeking) seek.value = String(current);
    time.textContent = `${formatTrackTime(current)} / ${formatTrackTime(total)}`;
    onProgress(total ? current / total : 0);
  }
  function state() {
    const playing = !audio.paused && !audio.ended;
    button.setAttribute("aria-label", playing ? "Pause music" : "Play music");
    button.title = playing ? "Pause" : "Play";
    button.setAttribute("aria-pressed", String(playing));
    onState(playing);
  }
  const toggle = async () => {
    if (!audio.paused && !audio.ended) {
      audio.pause();
      return;
    }
    status.textContent = "";
    if (fallbackLink) fallbackLink.hidden = true;
    if (audio.ended) audio.currentTime = 0;
    try {
      await audio.play();
    } catch (error2) {
      if (error2?.name !== "AbortError") {
        status.textContent = "Playback unavailable. Open the audio file directly below.";
        if (fallbackLink) fallbackLink.hidden = false;
      }
      state();
    }
  };
  const scrub = () => {
    const value = Number(seek.value);
    if (Number.isFinite(value)) audio.currentTime = Math.max(0, Math.min(length(), value));
    progress();
  };
  const down = () => {
    seeking = true;
  }, up = () => {
    seeking = false;
    progress();
  };
  const error = () => {
    status.textContent = "Audio could not load. Open the original file below.";
    if (fallbackLink) fallbackLink.hidden = false;
    state();
  };
  const events = [[button, "click", toggle], [seek, "input", scrub], [seek, "pointerdown", down], [seek, "pointerup", up], [seek, "pointercancel", up], [seek, "blur", up], [audio, "timeupdate", progress], [audio, "loadedmetadata", progress], [audio, "play", state], [audio, "pause", state], [audio, "ended", state], [audio, "error", error]];
  for (const [element, type, handler] of events) element.addEventListener(type, handler);
  progress();
  state();
  return () => {
    audio.pause();
    for (const [element, type, handler] of events) element.removeEventListener(type, handler);
  };
}
export {
  bindTrackPlayer,
  formatTrackTime
};
