class MusicPreview {
  constructor(audio, { schedule = (callback) => requestAnimationFrame(callback), cancel = (id) => cancelAnimationFrame(id), onState = () => {
  } } = {}) {
    this.audio = audio;
    this.schedule = schedule;
    this.cancel = cancel;
    this.onState = onState;
    this.normalVolume = Number.isFinite(audio.volume) ? audio.volume : 1;
    this.active = false;
    this.owned = false;
    this.muted = false;
    this.generation = 0;
    this.fade = null;
    for (const event of ["play", "pause", "ended", "error"]) audio.addEventListener(event, () => this.onState());
  }
  cancelFade() {
    if (this.fade !== null) this.cancel(this.fade);
    this.fade = null;
  }
  select(active) {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      if (!this.muted) this.start();
    } else this.stop();
  }
  start() {
    this.cancelFade();
    const generation = ++this.generation;
    this.owned = true;
    this.audio.volume = 0.12;
    if (this.audio.ended) this.audio.currentTime = 0;
    try {
      Promise.resolve(this.audio.play()).then(() => {
        if (generation === this.generation) this.onState();
      }).catch(() => {
        if (generation === this.generation) {
          this.owned = false;
          this.audio.volume = this.normalVolume;
          this.onState();
        }
      });
    } catch {
      this.owned = false;
      this.audio.volume = this.normalVolume;
      this.onState();
    }
    this.onState();
  }
  stop(immediate = false) {
    if (!this.owned) return;
    ++this.generation;
    this.owned = false;
    this.cancelFade();
    const finish = () => {
      this.fade = null;
      this.audio.pause();
      this.audio.volume = this.normalVolume;
      this.onState();
    };
    if (immediate || this.audio.paused) {
      finish();
      return;
    }
    const volume = this.audio.volume;
    let started = null;
    const step = (time) => {
      started ??= time;
      const t = Math.min(1, (time - started) / 450);
      this.audio.volume = volume * (1 - t) ** 2;
      if (t < 1) this.fade = this.schedule(step);
      else finish();
    };
    this.fade = this.schedule(step);
  }
  toggle() {
    if (!this.audio.paused && !this.audio.ended) {
      this.muted = true;
      this.owned = true;
      this.stop(true);
    } else {
      this.muted = false;
      this.start();
    }
  }
  takeOver() {
    ++this.generation;
    this.cancelFade();
    this.owned = false;
    this.muted = true;
    this.audio.volume = this.normalVolume;
  }
  suspend() {
    this.stop(true);
  }
}
export {
  MusicPreview
};
