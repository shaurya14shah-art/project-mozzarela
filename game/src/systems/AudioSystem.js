// ══════════════════════════════════════════════════════════
// Audio System — the game had none at all
//
// `howler` sat in package.json as a dependency and was never once
// imported. This game has been completely silent since it existed —
// no footsteps, no swing, no cast, no impact, no ambience, nothing.
// For a first-person game that's asking to feel "like you're really
// there," silence is the loudest thing wrong with it.
//
// Built on the raw Web Audio API, not a sample-file library — this
// project ships as a single self-contained HTML file with zero
// external assets of any kind, so every sound here is SYNTHESIZED at
// runtime (oscillators, filters, one procedurally-filled noise
// buffer), never decoded from a file. Nothing to embed, nothing to
// license, nothing to bloat the bundle.
//
// AudioContext can't be created before a user gesture (every modern
// browser blocks autoplay) — init() is called from the very first
// click on the character-creation screen, same as every other
// deferred-init system in this codebase (CharacterPreviewUI, the
// particle-burst pool).
// ══════════════════════════════════════════════════════════

import { ELEMENTS } from '../data/constants.js';

// One timbre recipe per element — oscillator TYPE and filter motion
// differ, not just pitch, so a Pioneer could tell fire from shadow
// with their eyes shut. Ring-mod-style pairs for the "wrong" elements
// (void, shadow, arcane), clean harmonic stacks for the "true" ones
// (light, water, wind).
const ELEMENT_VOICE = {
  [ELEMENTS.FIRE]:      { osc: 'sawtooth', freq: 220, detune: 0,  filt: 'highpass', filtFreq: 800,  crackle: true  },
  [ELEMENTS.LIGHTNING]: { osc: 'square',   freq: 340, detune: 0,  filt: 'highpass', filtFreq: 1200, crackle: true  },
  [ELEMENTS.LIGHT]:     { osc: 'sine',     freq: 440, detune: 0,  filt: 'lowpass',  filtFreq: 6000, harmonic: true },
  [ELEMENTS.WATER]:     { osc: 'triangle', freq: 260, detune: 0,  filt: 'lowpass',  filtFreq: 1400, wobble: true   },
  [ELEMENTS.ICE]:       { osc: 'sine',     freq: 520, detune: 6,  filt: 'bandpass', filtFreq: 2200, harmonic: true },
  [ELEMENTS.WIND]:      { osc: 'triangle', freq: 300, detune: 0,  filt: 'bandpass', filtFreq: 1800, wobble: true   },
  [ELEMENTS.EARTH]:     { osc: 'square',   freq: 90,  detune: 5,  filt: 'lowpass',  filtFreq: 300,  rumble: true   },
  [ELEMENTS.POISON]:    { osc: 'sawtooth', freq: 150, detune: 8,  filt: 'lowpass',  filtFreq: 500,  rumble: true   },
  [ELEMENTS.SHADOW]:    { osc: 'sawtooth', freq: 180, detune: 55, filt: 'lowpass',  filtFreq: 900,  dissonant: true},
  [ELEMENTS.VOID]:      { osc: 'square',   freq: 130, detune: 40, filt: 'lowpass',  filtFreq: 700,  ringmod: true  },
  [ELEMENTS.ARCANE]:    { osc: 'triangle', freq: 380, detune: 20, filt: 'bandpass', filtFreq: 1600, ringmod: true  },
  [ELEMENTS.NEUTRAL]:   { osc: 'sine',     freq: 300, detune: 0,  filt: 'lowpass',  filtFreq: 1500, harmonic: false},
};

const FOOTSTEP_SURFACE = {
  stone: { type: 'lowpass',  freq: 700 },
  wood:  { type: 'bandpass', freq: 1200 },
  sand:  { type: 'lowpass',  freq: 400 },
  grass: { type: 'bandpass', freq: 900 },
  mud:   { type: 'lowpass',  freq: 260 },   // the Sunken Mire — wet and heavy
};

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this._ready = false;
    this._ambient = null;
    this._heartbeatTimer = null;
    this._lastStepAt = 0;
  }

  init() {
    if (this._ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // no Web Audio support — the game stays silent, not broken
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Two buses under the master, so Settings can set effects and the
    // ambient bed separately (ui/PauseMenu.js).
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this._sfxVol ?? 1; this.sfx.connect(this.master);
    this.amb = this.ctx.createGain(); this.amb.gain.value = this._ambVol ?? 1; this.amb.connect(this.master);
    if (this._masterVol != null) this.master.gain.value = this._masterVol;

    // One second of white noise, generated once — every noise-based
    // effect (footsteps, impacts, wind) grabs a fresh BufferSourceNode
    // against this same buffer with a randomized start offset, rather
    // than allocating a new buffer per sound.
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this._ready = true;
  }

  // Volumes can be set before the AudioContext exists (it is created on
  // the first user gesture); they are remembered and applied on creation.
  setMasterVolume(v) {
    this._masterVol = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this._masterVol;
  }
  setSfxVolume(v) { this._sfxVol = Math.max(0, Math.min(1, v)); if (this.sfx) this.sfx.gain.value = this._sfxVol; }
  setAmbientVolume(v) { this._ambVol = Math.max(0, Math.min(1, v)); if (this.amb) this.amb.gain.value = this._ambVol; }

  // ── shared building blocks ─────────────────────────────────

  _noiseSource(loop = false) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = loop;
    return src;
  }

  /** ADSR-ish envelope on a GainNode, starting `at` seconds from now. */
  _envelope(gain, { attack = 0.005, decay = 0.08, peak = 0.3, sustain = 0.0001 }, at = 0) {
    const t0 = this.ctx.currentTime + at;
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + attack + decay);
    return t0;
  }

  // ── one-shots ───────────────────────────────────────────────

  /** Gated by the caller off animState/movement speed — never faster than every ~0.28s. */
  playFootstep(surface = 'stone') {
    if (!this._ready) return;
    const now = performance.now();
    if (now - this._lastStepAt < 220) return;
    this._lastStepAt = now;

    const src = this._noiseSource(false);
    const filt = this.ctx.createBiquadFilter();
    const cfg = FOOTSTEP_SURFACE[surface] || FOOTSTEP_SURFACE.stone;
    filt.type = cfg.type;
    filt.frequency.value = cfg.freq * (0.85 + Math.random() * 0.3);
    const gain = this.ctx.createGain();
    this._envelope(gain, { attack: 0.006, decay: 0.07, peak: 0.22 });
    src.connect(filt).connect(gain).connect(this.sfx);
    const t = this.ctx.currentTime;
    const offset = Math.random() * (this.noiseBuffer.duration - 0.12);
    src.start(t, offset, 0.1);
  }

  /** A quick downward pitch-sweep plus a whoosh — the swing itself, not the hit. */
  playSwing() {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    const g = this.ctx.createGain();
    this._envelope(g, { attack: 0.005, decay: 0.18, peak: 0.14 });
    osc.connect(g).connect(this.sfx);
    osc.start(t); osc.stop(t + 0.2);

    const src = this._noiseSource(false);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(4000, t);
    filt.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    const ng = this.ctx.createGain();
    this._envelope(ng, { attack: 0.004, decay: 0.2, peak: 0.1 });
    src.connect(filt).connect(ng).connect(this.sfx);
    src.start(t, Math.random() * (this.noiseBuffer.duration - 0.25), 0.22);
  }

  /** A percussive thock plus sub-thump — landed weight, not a swing. armored=true rings higher/metallic. */
  playImpact(armored = false) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSource(false);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = armored ? 2600 : 900;
    filt.Q.value = 8;
    const g = this.ctx.createGain();
    this._envelope(g, { attack: 0.003, decay: 0.06, peak: 0.32 });
    src.connect(filt).connect(g).connect(this.sfx);
    src.start(t, Math.random() * (this.noiseBuffer.duration - 0.1), 0.08);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 70 + Math.random() * 30;
    const sg = this.ctx.createGain();
    this._envelope(sg, { attack: 0.002, decay: 0.09, peak: 0.28 });
    sub.connect(sg).connect(this.sfx);
    sub.start(t); sub.stop(t + 0.12);

    if (armored) {
      const ring = this.ctx.createOscillator();
      ring.type = 'square';
      ring.frequency.value = 1800 + Math.random() * 400;
      const rg = this.ctx.createGain();
      this._envelope(rg, { attack: 0.002, decay: 0.12, peak: 0.06 });
      ring.connect(rg).connect(this.sfx);
      ring.start(t); ring.stop(t + 0.14);
    }
  }

  /** The cast leaving your hand — element-specific timbre, see ELEMENT_VOICE. */
  playCast(element) {
    this._elementVoice(element, { attack: 0.006, decay: 0.22, peak: 0.16, dur: 0.26 });
  }

  /** The cast landing — same voice, a little heavier and longer. */
  playSpellImpact(element) {
    this._elementVoice(element, { attack: 0.004, decay: 0.32, peak: 0.24, dur: 0.36 });
  }

  _elementVoice(element, { attack, decay, peak, dur }) {
    if (!this._ready) return;
    const v = ELEMENT_VOICE[element] || ELEMENT_VOICE[ELEMENTS.NEUTRAL];
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = v.osc;
    osc.frequency.value = v.freq;
    osc.detune.value = v.detune;

    const filt = this.ctx.createBiquadFilter();
    filt.type = v.filt;
    filt.frequency.value = v.filtFreq;

    const g = this.ctx.createGain();
    this._envelope(g, { attack, decay, peak });

    let source = osc;
    if (v.ringmod) {
      // Two oscillators, one modulating the other's amplitude — an
      // inharmonic, "otherworldly" texture for void/arcane instead of
      // a clean note.
      const mod = this.ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = v.freq * 1.6;
      const modGain = this.ctx.createGain();
      modGain.gain.value = 1;
      mod.connect(modGain.gain);
      osc.connect(filt);
      filt.connect(modGain).connect(g).connect(this.sfx);
      mod.start(t); mod.stop(t + dur);
      source = null;
    } else {
      osc.connect(filt).connect(g).connect(this.sfx);
    }
    osc.start(t); osc.stop(t + dur);

    if (v.harmonic) {
      // Fundamental + octave + fifth — clean and consonant.
      for (const ratio of [2, 1.5]) {
        const h = this.ctx.createOscillator();
        h.type = v.osc;
        h.frequency.value = v.freq * ratio;
        const hg = this.ctx.createGain();
        this._envelope(hg, { attack, decay, peak: peak * 0.35 });
        h.connect(hg).connect(this.sfx);
        h.start(t); h.stop(t + dur);
      }
    }
    if (v.dissonant) {
      // A second voice a tritone off, deliberately unresolved.
      const h = this.ctx.createOscillator();
      h.type = v.osc;
      h.frequency.value = v.freq * 1.414;
      const hg = this.ctx.createGain();
      this._envelope(hg, { attack, decay, peak: peak * 0.5 });
      h.connect(hg).connect(this.sfx);
      h.start(t); h.stop(t + dur);
    }
    if (v.crackle) {
      const src = this._noiseSource(false);
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 2500;
      const ng = this.ctx.createGain();
      this._envelope(ng, { attack: 0.002, decay: dur * 0.8, peak: peak * 0.4 });
      src.connect(nf).connect(ng).connect(this.sfx);
      src.start(t, Math.random() * (this.noiseBuffer.duration - dur - 0.05), dur);
    }
    if (v.rumble) {
      const src = this._noiseSource(false);
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 220;
      const ng = this.ctx.createGain();
      this._envelope(ng, { attack: 0.01, decay: dur, peak: peak * 0.5 });
      src.connect(nf).connect(ng).connect(this.sfx);
      src.start(t, Math.random() * (this.noiseBuffer.duration - dur - 0.05), dur);
    }
  }

  /** A low wobbly growl, pitched by the creature's rough size (scale). */
  // ── Combat clarity (systems/CombatSystem.js) ───────────────
  // Each outcome has its OWN sound, so the ear knows what happened
  // without reading anything: a block clanks, a parry rings, a broken
  // guard thuds, a landed hit ticks, a kill drops.
  _tone(type, f0, f1, dur, peak, at = 0) {
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this._envelope(g, { attack: 0.003, decay: dur, peak }, at);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  playBlock() { if (!this._ready) return; this.playImpact(true); this._tone('square', 900, 600, 0.12, 0.05); }
  playParry() {
    if (!this._ready) return;
    this._tone('triangle', 2100, 2000, 0.45, 0.12);
    this._tone('sine', 3150, 3100, 0.5, 0.06);
    this._tone('triangle', 1400, 1350, 0.35, 0.05, 0.02);
  }
  playGuardBreak() { if (!this._ready) return; this.playImpact(false); this._tone('sawtooth', 220, 70, 0.3, 0.12); }
  playHitTick() { if (!this._ready) return; this._tone('square', 1500, 1100, 0.045, 0.045); }
  playKill() { if (!this._ready) return; this._tone('triangle', 520, 180, 0.32, 0.12); this._tone('sine', 90, 50, 0.3, 0.2); }

  playEnemyHit(scale = 1) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const base = 180 / Math.max(0.5, scale);
    osc.frequency.setValueAtTime(base, t);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 500;
    const g = this.ctx.createGain();
    this._envelope(g, { attack: 0.008, decay: 0.14, peak: 0.14 });
    osc.connect(filt).connect(g).connect(this.sfx);
    osc.start(t); osc.stop(t + 0.18);
  }

  /** A bigger, longer version for something actually dying. */
  playEnemyDeath(scale = 1) {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const base = 160 / Math.max(0.5, scale);
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.4, t + 0.5);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(700, t);
    filt.frequency.exponentialRampToValueAtTime(150, t + 0.5);
    const g = this.ctx.createGain();
    this._envelope(g, { attack: 0.01, decay: 0.55, peak: 0.22 });
    osc.connect(filt).connect(g).connect(this.sfx);
    osc.start(t); osc.stop(t + 0.6);
  }

  playUIClick(kind = 'open') {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    if (kind === 'close' || kind === 'cancel') {
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.exponentialRampToValueAtTime(340, t + 0.05);
    } else {
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    }
    const g = this.ctx.createGain();
    this._envelope(g, { attack: 0.002, decay: 0.05, peak: 0.1 });
    osc.connect(g).connect(this.sfx);
    osc.start(t); osc.stop(t + 0.06);
  }

  /** A short major-ish arpeggio — the one deliberately "nice" sound in the whole game. */
  playQuestChime() {
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const root = 392; // G4
    const ratios = [1, 1.26, 1.5, 2];
    ratios.forEach((r, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = root * r;
      const g = this.ctx.createGain();
      const at = i * 0.09;
      this._envelope(g, { attack: 0.01, decay: 0.35, peak: 0.13 }, at);
      osc.connect(g).connect(this.sfx);
      osc.start(t + at); osc.stop(t + at + 0.4);
    });
  }

  // ── looping/continuous ──────────────────────────────────────

  /** Two-thump heartbeat, interval driven by how low HP actually is (0=full, 1=critical). */
  setHeartbeat(danger) {
    if (!this._ready) return;
    if (danger <= 0.05) {
      if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
      return;
    }
    const interval = Math.max(420, 1400 - danger * 1000);
    if (this._heartbeatTimer) return; // already looping — setHeartbeatRate below adjusts pace without restarting
    const beat = () => {
      const t = this.ctx.currentTime;
      for (const dt of [0, 0.14]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 55;
        const g = this.ctx.createGain();
        this._envelope(g, { attack: 0.005, decay: 0.12, peak: 0.18 }, dt);
        osc.connect(g).connect(this.sfx);
        osc.start(t + dt); osc.stop(t + dt + 0.16);
      }
    };
    beat();
    this._heartbeatTimer = setInterval(beat, interval);
    this._heartbeatInterval = interval;
  }

  /** Ambient wind/drone bed — two detuned oscillators plus filtered noise, crossfaded per path. */
  startAmbient(path = 'hell') {
    if (!this._ready || this._ambient) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(this.amb);

    const isHeaven = path === 'heaven';
    const base = isHeaven ? 220 : 110;
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine'; osc1.frequency.value = base; osc1.detune.value = -6;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine'; osc2.frequency.value = base; osc2.detune.value = 6;
    const droneFilt = this.ctx.createBiquadFilter();
    droneFilt.type = 'lowpass';
    droneFilt.frequency.value = isHeaven ? 900 : 400;
    osc1.connect(droneFilt); osc2.connect(droneFilt); droneFilt.connect(g);

    const noise = this._noiseSource(true);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = isHeaven ? 500 : 260;
    const ng = this.ctx.createGain();
    ng.gain.value = isHeaven ? 0.5 : 0.8;
    noise.connect(nf).connect(ng).connect(g);

    osc1.start(); osc2.start(); noise.start();

    const t = this.ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.05, t + 2.5);

    this._ambient = { gain: g, osc1, osc2, noise, filt: droneFilt, nf };
  }

  /** Re-tunes the running drone toward the other path instead of restarting it. */
  setAmbientPath(path) {
    if (!this._ambient) return;
    const isHeaven = path === 'heaven';
    const t = this.ctx.currentTime;
    this._ambient.filt.frequency.linearRampToValueAtTime(isHeaven ? 900 : 400, t + 3);
    this._ambient.nf.frequency.linearRampToValueAtTime(isHeaven ? 500 : 260, t + 3);
  }
}

export const audioSystem = new AudioSystem();
