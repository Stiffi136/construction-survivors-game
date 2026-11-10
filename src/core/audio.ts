/** Small WebAudio synthesis (no audio files): noise + envelope. */
export class AudioFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.6;
  private readonly last: Record<string, number> = {};
  private pickStep = 0;
  private pickT = 0;

  /** Create only after a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private gate(name: string, minMs: number): boolean {
    const now = performance.now();
    if (now - (this.last[name] ?? 0) < minMs) return false;
    this.last[name] = now;
    return this.volume > 0 && !!this.ctx;
  }

  private burst(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(c.currentTime, Math.random() * 0.5);
    src.stop(c.currentTime + dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'square', slide = 0, delay = 0): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    const t0 = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  hit(): void {
    if (!this.gate('hit', 55)) return;
    this.burst(0.05, 2400, 900, 0.1);
  }
  kill(): void {
    if (!this.gate('kill', 60)) return;
    this.burst(0.09, 1400, 300, 0.14);
  }
  pickup(): void {
    if (!this.gate('pickup', 30)) return;
    const now = performance.now();
    this.pickStep = now - this.pickT < 250 ? Math.min(this.pickStep + 1, 12) : 0;
    this.pickT = now;
    this.tone(520 + this.pickStep * 55, 0.07, 0.07, 'square');
  }
  levelup(): void {
    if (!this.gate('levelup', 300)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 0.1, 'square', 0, i * 0.08));
  }
  explosion(): void {
    if (!this.gate('explosion', 90)) return;
    this.burst(0.45, 1200, 70, 0.35);
    this.tone(90, 0.3, 0.2, 'sawtooth', -50);
  }
  hurt(): void {
    if (!this.gate('hurt', 120)) return;
    this.tone(140, 0.18, 0.18, 'sawtooth', -60);
    this.burst(0.1, 900, 200, 0.12);
  }
  boss(): void {
    if (!this.gate('boss', 500)) return;
    this.tone(70, 0.8, 0.25, 'sawtooth', -20);
    this.tone(105, 0.8, 0.15, 'square', -30, 0.05);
  }
  ui(): void {
    if (!this.gate('ui', 40)) return;
    this.tone(660, 0.05, 0.06, 'square');
  }
}
