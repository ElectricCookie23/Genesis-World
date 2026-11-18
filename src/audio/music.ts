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
