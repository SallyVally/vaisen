class MusicVisualTransport {
  constructor(audio, { send, schedule = (callback) => requestAnimationFrame(callback), cancel = (id) => cancelAnimationFrame(id) } = {}) {
    Object.assign(this, { audio, send, schedule, cancel });
    this.active = false;
    this.frame = null;
    this.last = -Infinity;
    this.waveform = [];
    this.duration = 0;
    this.onPlayback = () => {
      this.publish();
      this.wake();
    };
    this.onStop = () => {
      this.sleep();
      this.publish();
    };
    this.onSeek = () => this.publish();
    for (const name of ["play", "playing"]) audio.addEventListener(name, this.onPlayback);
    for (const name of ["pause", "ended", "error"]) audio.addEventListener(name, this.onStop);
    audio.addEventListener("seeked", this.onSeek);
    this.step = (now) => {
      this.frame = null;
      if (!this.active || this.audio.paused || this.audio.ended) return;
      if (now - this.last >= 1e3 / 12) {
        this.last = now;
        this.publish();
      }
      this.frame = this.schedule(this.step);
    };
  }
  setEnvelope(waveform, duration) {
    if (!Array.isArray(waveform) || waveform.length < 2 || !waveform.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || !Number.isFinite(duration) || duration <= 0) throw new Error("Invalid music envelope");
    this.waveform = waveform;
    this.duration = duration;
  }
  select(active) {
    if (this.active === active) return;
    this.active = active;
    this.last = -Infinity;
    if (active) {
      this.publish();
      this.wake();
    } else {
      this.sleep();
      this.publish(true);
    }
  }
  publish(stopped = false) {
    if (!this.active && !stopped) return;
    const playing = !stopped && !this.audio.paused && !this.audio.ended;
    const time = Math.min(86400, Math.max(0, Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0));
    let level = 0;
    if (playing && this.waveform.length) {
      const sample = Math.min(this.waveform.length - 1, time / this.duration * (this.waveform.length - 1));
      const i = Math.floor(sample), fraction = sample - i;
      level = this.waveform[i] + ((this.waveform[i + 1] ?? this.waveform[i]) - this.waveform[i]) * fraction;
      level = Math.min(1, Math.pow(level * 1.7, 0.75));
    }
    this.send?.({ type: "vaisen-scene-audio", time, level, playing });
  }
  wake() {
    if (this.active && !this.audio.paused && !this.audio.ended && this.frame === null) this.frame = this.schedule(this.step);
  }
  sleep() {
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
  }
  dispose() {
    this.sleep();
    for (const name of ["play", "playing"]) this.audio.removeEventListener(name, this.onPlayback);
    for (const name of ["pause", "ended", "error"]) this.audio.removeEventListener(name, this.onStop);
    this.audio.removeEventListener("seeked", this.onSeek);
  }
}
export {
  MusicVisualTransport
};
