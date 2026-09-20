// Desi Royal Ludo Audio Synthesizer using Web Audio API
class LudoAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  // Clattering wooden dice roll
  public playDiceRoll() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const ctx = this.ctx;
      
      const numClicks = 6;
      for (let i = 0; i < numClicks; i++) {
        const time = ctx.currentTime + i * 0.045 + (Math.random() * 0.02);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220 + Math.random() * 300, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.035);
        
        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + 0.04);
      }
    } catch (_) {}
  }

  // Chakka (Roll of 6) brass fanfare & celebration ding
  public playChakkaSix() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
      notes.forEach((freq, idx) => {
        const time = ctx.currentTime + idx * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + 0.28);
      });
    } catch (_) {}
  }

  // Token move hop sound
  public playTokenHop() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.06);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
  }

  // Katti (Capture/Kill) punch & crash sound
  public playCaptureKatti() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const ctx = this.ctx;
      
      // Low boom
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
      
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);

      // Clashing dissonance
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(320, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
      
      gain2.gain.setValueAtTime(0.2, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.17);
    } catch (_) {}
  }

  // Home Goal / Token Entered Home
  public playHomeGoal() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const freqs = [440, 554.37, 659.25, 880];
      freqs.forEach((f, i) => {
        const time = ctx.currentTime + i * 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, time);
        gain.gain.setValueAtTime(0.22, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.35);
      });
    } catch (_) {}
  }

  // Royal Victory Fanfare
  public playVictory() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const ctx = this.ctx;
      const notes = [
        { f: 523.25, d: 0.15 }, // C5
        { f: 523.25, d: 0.15 }, // C5
        { f: 523.25, d: 0.15 }, // C5
        { f: 659.25, d: 0.35 }, // E5
        { f: 783.99, d: 0.25 }, // G5
        { f: 1046.50, d: 0.60 } // C6
      ];
      let t = ctx.currentTime;
      notes.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(n.f, t);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + n.d + 0.05);
        t += n.d * 0.95;
      });
    } catch (_) {}
  }
}

export const ludoAudio = new LudoAudioEngine();
