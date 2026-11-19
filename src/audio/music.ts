// Generative ambient music that shifts with the state of the planet.
// Tone.js is loaded on the first user gesture (browsers block audio before that).

export interface Mood {
  stage: string; // barren, microbes, algae, animals
  era: string; // none, ice, warm, winter
  /** 0..1 how alive the world is (species count). */
  life: number;
  /** True for a while after a mass extinction: near silence. */
  hush: boolean;
}

const SCALES: Record<string, string[]> = {
  barren: ['C2', 'G2', 'C3', 'Eb3', 'G3', 'Bb3'],
  microbes: ['C2', 'G2', 'Bb2', 'C3', 'Eb3', 'F3', 'G3'],
  algae: ['D2', 'A2', 'D3', 'E3', 'F#3', 'A3', 'B3'],
  animals: ['D2', 'A2', 'D3', 'E3', 'F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4'],
  ice: ['A2', 'E3', 'A3', 'B3', 'D#4', 'E4', 'G#4', 'B4'],
  warm: ['F2', 'C3', 'F3', 'A3', 'C4', 'E4', 'G4', 'A4'],
  winter: ['C2', 'Db2', 'G2', 'Ab2', 'C3'],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Music {
  private tone: any = null;
  private pad: any = null;
  private bell: any = null;
  private master: any = null;
  private voice: any = null;
  private windGain: any = null;
  private surfGain: any = null;
  private rainGain: any = null;
  private rumble: any = null;
  private lavaGain: any = null;
  private pans: Record<string, any> = {};
  private civMusic = false;
  private civTimer = 0;
  private timer = 0;
  private mood: Mood = { stage: 'barren', era: 'none', life: 0, hush: false };
  private volume = 0.6;
  started = false;
  private seed = 1;

  private rand(): number {
    // small local generator: music does not need to be reproducible, only pleasant
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const Tone = await import('tone');
      this.tone = Tone;
      await Tone.start();
      this.master = new Tone.Volume(-60).toDestination();
      const reverb = new Tone.Reverb({ decay: 10, wet: 0.62 }).connect(this.master);
      const filter = new Tone.Filter(1400, 'lowpass').connect(reverb);
      this.pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 3.5, decay: 2, sustain: 0.55, release: 7 },
        volume: -14,
      }).connect(filter);
      this.pad.maxPolyphony = 10;
      this.bell = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01, modulationIndex: 6,
        envelope: { attack: 0.01, decay: 1.8, sustain: 0, release: 3 },
        modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0, release: 1 },
        volume: -26,
      }).connect(reverb);
      this.voice = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.15, sustain: 0.3, release: 0.4 }, volume: -12 }).connect(reverb);
      // three noise layers make the ambient bed
      const layer = (type: 'pink' | 'brown' | 'white', freq: number, kind: 'lowpass' | 'bandpass' | 'highpass', name = '') => {
        // each layer sits somewhere between the left ear and the right
        const pan = new Tone.Panner(0).connect(this.master);
        if (name) this.pans[name] = pan;
        const gain = new Tone.Gain(0).connect(pan);
        const filter = new Tone.Filter(freq, kind).connect(gain);
        new Tone.Noise(type).connect(filter).start();
        return gain;
      };
      this.windGain = layer('pink', 500, 'bandpass');
      this.surfGain = layer('brown', 380, 'lowpass', 'surf');
      this.rainGain = layer('white', 3200, 'highpass', 'rain');
      this.lavaGain = layer('brown', 90, 'lowpass', 'lava');
      this.rumble = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.05, decay: 1.4, sustain: 0, release: 1.2 }, volume: -8 }).connect(new Tone.Filter(160, 'lowpass').connect(reverb));
      this.applyVolume();
      this.seed = (Date.now() & 0xffff) | 1;
      this.schedule(600);
    } catch (err) {
      console.warn('music unavailable', err);
      this.started = false;
    }
  }

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.master) return;
    const db = this.volume <= 0.001 ? -80 : -30 + 30 * this.volume;
    this.master.volume.rampTo(db, 1.5);
  }

  /** Once a people makes music of its own, a simple melody in their scale joins the score. */
  setCivMusic(on: boolean, seed: number): void {
    if (on === this.civMusic || !this.tone || !this.voice) { this.civMusic = on && !!this.tone; return; }
    this.civMusic = on;
    window.clearInterval(this.civTimer);
    if (!on) return;
    const scale = ['D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'E5'];
    let s = (seed >>> 0) || 7;
    const motif = Array.from({ length: 6 }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return scale[s % scale.length]!; });
    let last = 0;
    this.civTimer = window.setInterval(() => {
      // the people's music changes with their age: slow and bare at first, then longer phrases, a second voice from
      // the Age of Presses, and quick, close-set figures once there are engines and signals
      const era = this.civEra;
      const wait = [19, 19, 18, 17, 15, 14, 13, 12, 11, 11][era] ?? 11;
      const now = performance.now();
      if (this.mood.hush || now - last < wait * 1000) return;
      last = now;
      const t = this.tone.now();
      const step = [0.5, 0.48, 0.44, 0.4, 0.34, 0.3, 0.26, 0.22, 0.18, 0.16][era] ?? 0.16;
      const notes = Math.min(12, 6 + era);
      for (let i = 0; i < notes; i++) {
        const k = scale.indexOf(motif[i % motif.length]!);
        // later ages turn the old tune around on its second pass
        const n = scale[(i >= motif.length ? scale.length - 1 - k : k)]!;
        try {
          this.voice.triggerAttackRelease(n, step * 0.85, t + i * step, 0.22);
          if (era >= 5 && i % 2 === 0) this.voice.triggerAttackRelease(scale[(k + 2) % scale.length]!, step * 0.85, t + i * step, 0.1);
        } catch { /* ignore */ }
      }
    }, 1000);
  }

  /** The highest age any nation has reached: it sets the pace and fullness of the people's music. */
  civEra = 0;

  /** A creature's call: big bodies rumble, small ones chirp. size is the size gene 0..1. */
  call(size: number): void {
    if (!this.tone || !this.voice) return;
    try {
      const f = 55 * Math.pow(2, (1 - size) * 5.2);
      const now = this.tone.now();
      this.voice.triggerAttackRelease(f, 0.12 + size * 0.5, now, 0.5);
      this.voice.triggerAttackRelease(f * (size > 0.5 ? 0.8 : 1.3), 0.1 + size * 0.4, now + 0.16 + size * 0.3, 0.4);
    } catch { /* ignore */ }
  }

  /** Volume of sound effects (ambience, calls, thunder), separate from the music. */
  sfx = 0.7;

  /** Ambient bed: wind up high, surf near the sea, rain under storms. Each 0..1. */
  ambience(wind: number, surf: number, rain: number): void {
    if (!this.windGain) return;
    this.windGain.gain.rampTo(wind * 0.16 * this.sfx, 1.2);
    this.surfGain.gain.rampTo(surf * 0.2 * this.sfx, 1.2);
    this.rainGain.gain.rampTo(rain * 0.24 * this.sfx, 1.2);
    if (this.voice) this.voice.volume.value = this.sfx <= 0.01 ? -80 : -12 + 20 * Math.log10(this.sfx);
    if (this.rumble) this.rumble.volume.value = this.sfx <= 0.01 ? -80 : -8 + 20 * Math.log10(this.sfx);
  }

  /**
   * Where the sounds come from: each pan runs from -1 (left) to 1 (right) as seen by the camera.
   * lava is how close and how much molten rock is near, 0..1.
   */
  place(surfPan: number, rainPan: number, lava: number, lavaPan: number): void {
    if (!this.windGain) return;
    try {
      this.pans.surf?.pan.rampTo(Math.max(-1, Math.min(1, surfPan)), 0.8);
      this.pans.rain?.pan.rampTo(Math.max(-1, Math.min(1, rainPan)), 0.8);
      this.pans.lava?.pan.rampTo(Math.max(-1, Math.min(1, lavaPan)), 0.8);
      this.lavaGain.gain.rampTo(lava * 0.5 * this.sfx, 1.2);
    } catch { /* ignore */ }
  }

  /** Distant thunder. */
  thunder(): void {
    if (!this.tone || !this.rumble) return;
    try { this.rumble.triggerAttackRelease(1.6 + this.rand()); } catch { /* ignore */ }
  }

  private schedule(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.phrase(), ms);
  }

  private phrase(): void {
    const m = this.mood;
    const key = m.era === 'winter' ? 'winter' : m.era === 'ice' ? 'ice' : m.era === 'warm' && m.stage === 'animals' ? 'warm' : m.stage;
    const scale = SCALES[key] ?? SCALES.barren!;
    const quiet = m.hush || m.era === 'winter';
    // a slow chord: more voices and brighter as the world fills with life
    const voices = quiet ? 1 : 2 + Math.round(m.life * 2);
    const notes = new Set<string>();
    notes.add(scale[Math.floor(this.rand() * Math.min(3, scale.length))]!);
    while (notes.size < voices) notes.add(scale[Math.floor(this.rand() * scale.length)]!);
    const length = 5 + this.rand() * 5;
    try {
      this.pad.triggerAttackRelease([...notes], length, undefined, quiet ? 0.25 : 0.5);
      // bright single notes, like light on water, when life is abundant
      if (!quiet && m.stage !== 'barren') {
        const count = Math.round(m.life * 3 + this.rand());
        for (let i = 0; i < count; i++) {
          const note = scale[Math.max(0, scale.length - 1 - Math.floor(this.rand() * 4))]!;
          this.bell.triggerAttackRelease(note, 2, this.tone.now() + 1 + this.rand() * length, 0.3 + this.rand() * 0.3);
        }
      }
    } catch { /* a dropped note is not worth interrupting anything for */ }
    this.schedule((length * (quiet ? 1.6 : 0.75) + this.rand() * 3) * 1000);
  }
}
