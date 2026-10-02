/* Farm music module. Audio starts only after a user action. */
(() => {
  "use strict";

  class FarmAudio {
    constructor(onStateChange = () => {}) {
      this.onStateChange = onStateChange;
      this.context = null;
      this.gain = null;
      this.timer = null;
      this.enabled = false;
      this.volume = 0.25;
      this.needsResume = false;
    }

    isPlaying() {
      return this.enabled && this.context?.state === "running";
    }

    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value) || 0));

      if (this.context && this.gain) {
        this.gain.gain.setTargetAtTime(
          this.enabled ? this.volume : 0,
          this.context.currentTime,
          0.05
        );
      }

      this.notify();
    }

    async start() {
      this.enabled = true;

      try {
        this.createContext();
        await this.context.resume();

        if (this.context.state !== "running") {
          throw new Error("Audio did not start.");
        }

        this.gain.gain.setTargetAtTime(
          this.volume,
          this.context.currentTime,
          0.08
        );

        if (!this.timer) {
          this.schedulePhrase();
        }

        this.needsResume = false;
        this.notify();
        return true;
      } catch {
        this.needsResume = true;
        this.notify();
        return false;
      }
    }

    stop() {
      this.enabled = false;
      this.needsResume = false;
      clearTimeout(this.timer);
      this.timer = null;

      const oldContext = this.context;
      this.context = null;
      this.gain = null;

      if (oldContext) {
        oldContext.close().catch(() => {});
      }

      this.notify();
    }

    createContext() {
      if (this.context && this.context.state !== "closed") {
        return;
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;

      if (!AudioContext) {
        throw new Error("Web Audio is unavailable.");
      }

      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
    }

    schedulePhrase() {
      if (!this.context || !this.enabled) {
        return;
      }

      const start = this.context.currentTime + 0.05;
      const phraseLength = 10.8;

      this.playChord(start, 196.0, [0, 7, 12], 2.6, 0.052);
      this.playBell(start + 0.72, 293.66, 0.031);
      this.playBell(start + 1.9, 392.0, 0.025);

      this.playChord(start + 2.7, 174.61, [0, 7, 12], 2.6, 0.048);
      this.playBell(start + 3.45, 261.63, 0.028);
      this.playBell(start + 4.75, 220.0, 0.024);

      this.playChord(start + 5.4, 146.83, [0, 7, 12], 2.6, 0.048);
      this.playBell(start + 6.25, 220.0, 0.027);
      this.playBell(start + 7.55, 293.66, 0.022);

      this.playChord(start + 8.1, 164.81, [0, 7, 12], 2.6, 0.048);
      this.playBell(start + 8.95, 246.94, 0.026);
      this.playBell(start + 10.05, 196.0, 0.023);

      this.timer = setTimeout(() => {
        this.timer = null;
        this.schedulePhrase();
      }, phraseLength * 1000 - 250);
    }

    playChord(start, root, semitones, duration, totalVolume) {
      for (const semitone of semitones) {
        this.playTone(
          start,
          root * Math.pow(2, semitone / 12),
          duration,
          totalVolume / semitones.length,
          "triangle",
          0.02,
          0.9
        );
      }
    }

    playBell(start, frequency, volume) {
      this.playTone(start, frequency, 1.35, volume, "sine", 0.01, 0.46);
      this.playTone(
        start + 0.012,
        frequency * 2,
        0.88,
        volume * 0.2,
        "sine",
        0.01,
        0.34
      );
    }

    playTone(start, frequency, duration, volume, type, attack, release) {
      if (!this.context || !this.gain) {
        return;
      }

      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume),
        start + attack
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + Math.max(attack + 0.05, duration * release)
      );

      oscillator.connect(gain);
      gain.connect(this.gain);

      oscillator.start(start);
      oscillator.stop(start + duration);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }

    notify() {
      this.onStateChange({
        enabled: this.enabled,
        playing: this.isPlaying(),
        needsResume: this.needsResume,
        volume: this.volume,
      });
    }
  }

  globalThis.FarmAudio = FarmAudio;
})();
