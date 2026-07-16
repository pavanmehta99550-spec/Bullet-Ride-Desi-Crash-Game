// Procedural Game Audio Synthesizer utilizing the Web Audio API
// No extra network assets required, zero latency, light weight, and works 100% offline.

class BikeEngine {
  private ctx: AudioContext | null = null;
  private parentMasterGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private harmonicOsc: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private pulseGain: GainNode | null = null;
  private active: boolean = false;

  constructor(ctx: AudioContext | null, parentMasterGain: GainNode | null = null) {
    this.ctx = ctx;
    this.parentMasterGain = parentMasterGain;
  }

  start() {
    if (!this.ctx || this.active) return;
    this.active = true;

    try {
      // 1. Master gain for ramping
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      // Boost subtle ambient volume to 0.18 for better audibility
      this.masterGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.1);

      // 2. Pulse modulation (LFO) for individual exhaust strokes
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sawtooth';
      this.lfo.frequency.setValueAtTime(12, this.ctx.currentTime); // Cylinder idle speed 12Hz

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.4, this.ctx.currentTime); // depth of throb

      // 3. Engine cylinders (oscillators)
      // Raised default base frequency to 80Hz so it is easily audible on laptop & mobile phone speakers
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(80, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'sawtooth';
      this.osc2.frequency.setValueAtTime(80.8, this.ctx.currentTime); // Detuned growl

      // Harmonic high-rev exhaust scream (sine/triangle)
      this.harmonicOsc = this.ctx.createOscillator();
      this.harmonicOsc.type = 'triangle';
      this.harmonicOsc.frequency.setValueAtTime(160.5, this.ctx.currentTime);

      // 4. Lowpass filter with throat growl resonance
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.setValueAtTime(6, this.ctx.currentTime);
      this.filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      // Connections:
      // Modulate the amp pulse
      this.pulseGain = this.ctx.createGain();
      this.pulseGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      
      this.lfo.connect(lfoGain);
      lfoGain.connect(this.pulseGain.gain);

      // Route oscillators through pulse amp
      this.osc1.connect(this.pulseGain);
      this.osc2.connect(this.pulseGain);
      this.harmonicOsc.connect(this.pulseGain);

      this.pulseGain.connect(this.filter);
      this.filter.connect(this.masterGain);
      if (this.parentMasterGain) {
        this.masterGain.connect(this.parentMasterGain);
      } else {
        this.masterGain.connect(this.ctx.destination);
      }

      // Start everything
      this.lfo.start();
      this.osc1.start();
      this.osc2.start();
      this.harmonicOsc.start();
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
    
    // Rev the engine and shift pitches up beautifully for throttle sound effect
    const baseFreq = Math.min(280, 80 + (factor - 1.0) * 35);
    const filterFreq = Math.min(1300, 320 + (factor - 1.0) * 180);
    const strokeSpeed = Math.min(42, 12 + (factor - 1.0) * 5); // Exhaust strokes accelerate

    if (this.osc1) {
      this.osc1.frequency.setTargetAtTime(baseFreq, time, 0.08);
    }
    if (this.osc2) {
      this.osc2.frequency.setTargetAtTime(baseFreq * 1.015, time, 0.08);
    }
    if (this.harmonicOsc) {
      this.harmonicOsc.frequency.setTargetAtTime(baseFreq * 2.02, time, 0.08);
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
    const endHarmonic = this.harmonicOsc;
    const endLfo = this.lfo;
    const endMaster = this.masterGain;

    if (!endCtx || !endMaster) return;

    try {
      const time = endCtx.currentTime;
      endMaster.gain.setValueAtTime(endMaster.gain.value, time);
      // Fast fade out down to 0 to prevent audio popping or clicks
      endMaster.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

      setTimeout(() => {
        try {
          if (endOsc1) endOsc1.stop();
          if (endOsc2) endOsc2.stop();
          if (endHarmonic) endHarmonic.stop();
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
    this.harmonicOsc = null;
    this.lfo = null;
    this.filter = null;
    this.masterGain = null;
    this.pulseGain = null;
  }
}

// Lowpass/Bandpass filtered white noise burst + sweet explosion drop
function playCrashSound(ctx: AudioContext, masterGain: GainNode | null = null) {
  try {
    const time = ctx.currentTime;
    
    // Create random Noise buffer for crash crunch
    const bufferSize = ctx.sampleRate * 0.8; // 0.8 second duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(360, time);
    filter.frequency.exponentialRampToValueAtTime(45, time + 0.7);
    filter.Q.setValueAtTime(2.0, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45, time); // elevated loudness
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.75);

    // Deep heavy impact sweep (raised pitch slightly for clarity on small speakers)
    const lowOsc = ctx.createOscillator();
    lowOsc.type = 'sawtooth';
    lowOsc.frequency.setValueAtTime(140, time);
    lowOsc.frequency.exponentialRampToValueAtTime(40, time + 0.5);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);

    // Connections
    noise.connect(filter);
    filter.connect(noiseGain);
    if (masterGain) {
      noiseGain.connect(masterGain);
    } else {
      noiseGain.connect(ctx.destination);
    }

    lowOsc.connect(oscGain);
    if (masterGain) {
      oscGain.connect(masterGain);
    } else {
      oscGain.connect(ctx.destination);
    }

    // Fire nodes
    noise.start(time);
    lowOsc.start(time);

    noise.stop(time + 0.82);
    lowOsc.stop(time + 0.82);
  } catch (err) {
    console.error('Failed to synthesize crash sound:', err);
  }
}

// Sweet pentatonic ring chimes + brief filtered cheering applause swell
function playCheerSound(ctx: AudioContext, masterGain: GainNode | null = null) {
  try {
    const time = ctx.currentTime;

    // Cheer applause synthesis using sweeping high-resonance filter
    const bufferSize = ctx.sampleRate * 1.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    const crowd = ctx.createBufferSource();
    crowd.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(5.0, time);
    bandpass.frequency.setValueAtTime(500, time);
    bandpass.frequency.linearRampToValueAtTime(1200, time + 0.2);
    bandpass.frequency.exponentialRampToValueAtTime(400, time + 0.9);

    const crowdGain = ctx.createGain();
    crowdGain.gain.setValueAtTime(0, time);
    crowdGain.gain.linearRampToValueAtTime(0.12, time + 0.15); // Clear cheer applause volume
    crowdGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.98);

    crowd.connect(bandpass);
    bandpass.connect(crowdGain);
    if (masterGain) {
      crowdGain.connect(masterGain);
    } else {
      crowdGain.connect(ctx.destination);
    }
    crowd.start(time);
    crowd.stop(time + 1.0);

    // Upward clean arpeggio on cashout (E Major key for beautiful triumph)
    const notes = [329.63, 415.30, 493.88, 659.25, 830.61, 987.77, 1318.51];

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; // clean retro chimes
      osc.frequency.setValueAtTime(freq, time + index * 0.05);

      const gainVal = 0.12 - (index * 0.006); // sweet volume taper
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(gainVal, time + index * 0.05 + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + index * 0.05 + 0.32);

      osc.connect(gainNode);
      if (masterGain) {
        gainNode.connect(masterGain);
      } else {
        gainNode.connect(ctx.destination);
      }

      osc.start(time + index * 0.05);
      osc.stop(time + index * 0.05 + 0.4);
    });
  } catch (err) {
    console.error('Failed to synthesize cheer sound:', err);
  }
}

export class GameAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bikeEngine: BikeEngine | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('game_sound_muted');
      this.isMuted = stored === 'true';

      // Create standard browser interaction listener to instantly unlock / resume AudioContext
      const unlock = () => {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            this.ctx = new AudioCtx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);
            this.bikeEngine = new BikeEngine(this.ctx, this.masterGain);
          }
        }

        if (this.ctx) {
          if (this.ctx.state === 'suspended') {
            this.ctx.resume()
              .then(() => {
                if (this.ctx && this.ctx.state === 'running') {
                  cleanup();
                }
              })
              .catch(err => console.log('AudioContext resume failed:', err));
          } else if (this.ctx.state === 'running') {
            cleanup();
          }
        }
      };

      const cleanup = () => {
        window.removeEventListener('click', unlock, { capture: true });
        window.removeEventListener('touchstart', unlock, { capture: true });
        window.removeEventListener('keydown', unlock, { capture: true });
      };

      window.addEventListener('click', unlock, { capture: true, passive: true });
      window.addEventListener('touchstart', unlock, { capture: true, passive: true });
      window.addEventListener('keydown', unlock, { capture: true, passive: true });
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.bikeEngine = new BikeEngine(this.ctx, this.masterGain);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => console.log('Could not resume AudioContext:', err));
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('game_sound_muted', String(this.isMuted));
    
    // Ensure context is initialized so we can set masterGain volume
    this.initContext();

    if (this.ctx && this.masterGain) {
      const targetVolume = this.isMuted ? 0 : 1;
      this.masterGain.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
    }
    
    if (this.isMuted) {
      if (this.bikeEngine) {
        this.bikeEngine.stop();
      }
    } else {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
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
      playCrashSound(this.ctx, this.masterGain);
    }
  }

  playCashout() {
    if (this.isMuted) return;
    this.initContext();
    if (this.ctx) {
      playCheerSound(this.ctx, this.masterGain);
    }
  }
}

export const audioManager = new GameAudioManager();
