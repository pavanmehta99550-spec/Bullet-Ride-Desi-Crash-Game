// Procedural Game Audio Synthesizer utilizing the Web Audio API
// No extra network assets required, zero latency, light weight, and works 100% offline.

class BikeEngine {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private pulseGain: GainNode | null = null;
  private active: boolean = false;

  constructor(ctx: AudioContext | null) {
    this.ctx = ctx;
  }

  start() {
    if (!this.ctx || this.active) return;
    this.active = true;

    try {
      // 1. Master gain for ramping
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.15); // subtle ambient volume

      // 2. Pulse modulation (LFO) for individual exhaust strokes
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sawtooth';
      this.lfo.frequency.setValueAtTime(8, this.ctx.currentTime); // 8Hz cylinder idle speed

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.4, this.ctx.currentTime); // depth of throb

      // 3. Engine cylinders (oscillators)
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(40, this.ctx.currentTime); // Deep rumbling low base frequency

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle'; // triangle adds low-mid fatness without harsh treble
      this.osc2.frequency.setValueAtTime(40.4, this.ctx.currentTime); // Slightly detuned

      // 4. Lowpass / Bandpass filter mix for throaty growl
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.setValueAtTime(5, this.ctx.currentTime);
      this.filter.frequency.setValueAtTime(150, this.ctx.currentTime);

      // Connections:
      // Modulate the amp pulse
      this.pulseGain = this.ctx.createGain();
      this.pulseGain.gain.setValueAtTime(0.6, this.ctx.currentTime);
      
      this.lfo.connect(lfoGain);
      lfoGain.connect(this.pulseGain.gain);

      // Route oscillators through pulse amp
      this.osc1.connect(this.pulseGain);
      this.osc2.connect(this.pulseGain);

      this.pulseGain.connect(this.filter);
      this.filter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Start everything
      this.lfo.start();
      this.osc1.start();
      this.osc2.start();
    } catch (e) {
      console.error('Failed to start bike engine synthesizer:', e);
    }
  }

  setMultiplier(multiplier: number) {
    if (!this.active || !this.ctx) return;
    
    const time = this.ctx.currentTime;
    
    // Smoothly scale the variables with the crash game multiplier
    // Standard growth multiplier goes from 1.0x to 100.0x or more
    const factor = Math.min(6.0, Math.max(1.0, multiplier));
    
    // Rev the engine based on throttle multiplier factor!
    const baseFreq = Math.min(180, 40 + (factor - 1.0) * 25);
    const filterFreq = Math.min(900, 150 + (factor - 1.0) * 150);
    const strokeSpeed = Math.min(30, 8 + (factor - 1.0) * 4); // RPM sound increases

    if (this.osc1) {
      this.osc1.frequency.setTargetAtTime(baseFreq, time, 0.08);
    }
    if (this.osc2) {
      this.osc2.frequency.setTargetAtTime(baseFreq * 1.015, time, 0.08);
    }
    if (this.filter) {
      this.filter.frequency.setTargetAtTime(filterFreq, time, 0.08);
    }
    if (this.lfo) {
      this.lfo.frequency.setTargetAtTime(strokeSpeed, time, 0.1);
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;

    const endCtx = this.ctx;
    const endOsc1 = this.osc1;
    const endOsc2 = this.osc2;
    const endLfo = this.lfo;
    const endMaster = this.masterGain;

    if (!endCtx || !endMaster) return;

    try {
      const time = endCtx.currentTime;
      endMaster.gain.setValueAtTime(endMaster.gain.value, time);
      // Fast fade out down to 0 to prevent audio popping
      endMaster.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

      setTimeout(() => {
        try {
          if (endOsc1) endOsc1.stop();
          if (endOsc2) endOsc2.stop();
          if (endLfo) endLfo.stop();
        } catch (err) {
          // already stopped
        }
      }, 150);
    } catch (e) {
      console.error(e);
    }

    this.osc1 = null;
    this.osc2 = null;
    this.lfo = null;
    this.filter = null;
    this.masterGain = null;
    this.pulseGain = null;
  }
}

// Low-pass filtered white noise burst + low sub drop sweep
function playCrashSound(ctx: AudioContext) {
  try {
    const time = ctx.currentTime;
    
    // Create random Noise buffer for dust/crunch
    const bufferSize = ctx.sampleRate * 0.7; // 0.7 second duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, time);
    filter.frequency.exponentialRampToValueAtTime(30, time + 0.65);
    filter.Q.setValueAtTime(2.5, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.68);

    // Deep heavy impact sweep
    const lowOsc = ctx.createOscillator();
    lowOsc.type = 'triangle';
    lowOsc.frequency.setValueAtTime(120, time);
    lowOsc.frequency.exponentialRampToValueAtTime(10, time + 0.4);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

    // Connections
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    lowOsc.connect(oscGain);
    oscGain.connect(ctx.destination);

    // Fire nodes
    noise.start(time);
    lowOsc.start(time);

    noise.stop(time + 0.7);
    lowOsc.stop(time + 0.7);
  } catch (err) {
    console.error('Failed to synthesize crash sound:', err);
  }
}

// Sweet pentatonic ring chimes + brief filtered cheering applause swell
function playCheerSound(ctx: AudioContext) {
  try {
    const time = ctx.currentTime;

    // Cheer applause synthesis using sweeping high-resonance envelope
    const bufferSize = ctx.sampleRate * 0.95;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    const crowd = ctx.createBufferSource();
    crowd.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(5.5, time);
    // Swell frequency to represent collective excitement
    bandpass.frequency.setValueAtTime(450, time);
    bandpass.frequency.linearRampToValueAtTime(1100, time + 0.25);
    bandpass.frequency.exponentialRampToValueAtTime(350, time + 0.9);

    const crowdGain = ctx.createGain();
    crowdGain.gain.setValueAtTime(0, time);
    crowdGain.gain.linearRampToValueAtTime(0.08, time + 0.18);
    crowdGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.95);

    crowd.connect(bandpass);
    bandpass.connect(crowdGain);
    crowdGain.connect(ctx.destination);
    crowd.start(time);
    crowd.stop(time + 0.95);

    // Upward clean arpeggio on cashout (E Major key for beautiful triumph)
    const notes = [329.63, 415.30, 493.88, 659.25, 830.61, 987.77, 1318.51];

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; // clean chimes
      osc.frequency.setValueAtTime(freq, time + index * 0.05);

      const gainVal = 0.08 - (index * 0.005); // slightly softer as pitch increases
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(gainVal, time + index * 0.05 + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + index * 0.05 + 0.28);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(time + index * 0.05);
      osc.stop(time + index * 0.05 + 0.35);
    });
  } catch (err) {
    console.error('Failed to synthesize cheer sound:', err);
  }
}

export class GameAudioManager {
  private ctx: AudioContext | null = null;
  private bikeEngine: BikeEngine | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('game_sound_muted');
      this.isMuted = stored === 'true';
    }
  }

  private initContext() {
    if (this.isMuted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.bikeEngine = new BikeEngine(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => console.log('Could not resume AudioContext:', err));
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('game_sound_muted', String(this.isMuted));
    
    if (this.isMuted) {
      if (this.bikeEngine) {
        this.bikeEngine.stop();
      }
    } else {
      this.initContext();
    }
    return this.isMuted;
  }

  getMutedState() {
    return this.isMuted;
  }

  playRide(multiplier: number = 1.00) {
    if (this.isMuted) return;
    this.initContext();
    if (this.bikeEngine) {
      this.bikeEngine.start();
      this.bikeEngine.setMultiplier(multiplier);
    }
  }

  updateMultiplier(multiplier: number) {
    if (this.isMuted) return;
    if (this.bikeEngine) {
      this.bikeEngine.setMultiplier(multiplier);
    }
  }

  stopRide() {
    if (this.bikeEngine) {
      this.bikeEngine.stop();
    }
  }

  playCrash() {
    if (this.isMuted) return;
    this.initContext();
    this.stopRide(); // Stop ride engine immediately
    if (this.ctx) {
      playCrashSound(this.ctx);
    }
  }

  playCashout() {
    if (this.isMuted) return;
    this.initContext();
    if (this.ctx) {
      playCheerSound(this.ctx);
    }
  }
}

export const audioManager = new GameAudioManager();
