// Generative ambient music that shifts with the state of the planet.
// Tone.js is loaded on the first user gesture (browsers block audio before that).

import { phrase, type Timbre, type Tradition } from '../sim/history/music';
import { ASSET_BASE, assetList } from '../render/gfx/models';

/**
 * Sound loops made for the game (the asset pass). Each takes the place of a plain noise layer, or adds a layer the
 * game did not have, once its file has been added; without the file the game sounds as it did before.
 * Not used yet: cave-drips, earthquake, fire-crackle, music-calm-pad, ocean-deep, underwater, waterfall, wind-gale.
 */
const LOOPS = {
  wind: 'audio/wind-light.ogg', gale: 'audio/wind-strong.ogg', surf: 'audio/waves-shore.ogg', rain: 'audio/rain-light.ogg',
  downpour: 'audio/rain-heavy.ogg', lava: 'audio/lava-bubbling.ogg', day: 'audio/forest-birdsong.ogg', night: 'audio/night-crickets.ogg',
  marsh: 'audio/swamp-croaks.ogg', river: 'audio/river-stream.ogg',
} as const;
const SHOTS = { thunderFar: 'audio/thunder-distant.ogg', thunderNear: 'audio/thunder-close.ogg' } as const;
/** How loud a loop plays beside the noise layer it replaces (the loops are quieter recordings than raw noise is). */
const LOOP_GAIN = 2.2;

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
  /** The gain of each sound loop that has loaded, by name; and the one-shot sounds. */
  private loops: Partial<Record<keyof typeof LOOPS, any>> = {};
  private shots: Partial<Record<keyof typeof SHOTS, any>> = {};
  /** Set false (`&noassets`) to keep to the generated noise. */
  useLoops = true;
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
      void this.loadLoops(Tone);
      this.seed = (Date.now() & 0xffff) | 1;
      this.schedule(600);
    } catch (err) {
      console.warn('music unavailable', err);
      this.started = false;
    }
  }

  /** Fetch the sound loops that have been added and start each, silent, behind its own gain. */
  private async loadLoops(Tone: any): Promise<void> {
    if (!this.useLoops) return;
    const have = await assetList();
    if (!have) return;
    for (const name of Object.keys(LOOPS) as (keyof typeof LOOPS)[]) {
      if (!have.has(LOOPS[name])) continue;
      try {
        // surf, rain and lava come from where they are; the rest is all around
        const pan = name === 'surf' ? this.pans.surf : name === 'rain' || name === 'downpour' ? this.pans.rain : name === 'lava' ? this.pans.lava : null;
        const gain = new Tone.Gain(0).connect(pan ?? this.master);
        const player = new Tone.Player({ url: ASSET_BASE + LOOPS[name], loop: true, fadeIn: 0.4, onload: () => { try { player.start(); this.loops[name] = gain; } catch { /* ignore */ } }, onerror: () => { /* the noise layer stays */ } }).connect(gain);
      } catch { /* ignore */ }
    }
    for (const name of Object.keys(SHOTS) as (keyof typeof SHOTS)[]) {
      if (!have.has(SHOTS[name])) continue;
      try {
        const gain = new Tone.Gain(0.5).connect(this.master);
        const player = new Tone.Player({ url: ASSET_BASE + SHOTS[name], onload: () => { this.shots[name] = { player, gain }; }, onerror: () => { /* the synth stays */ } }).connect(gain);
      } catch { /* ignore */ }
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
      if (this.mood.hush || this.townPlaying || now - last < wait * 1000) return;
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

  // ---- the music of one people, heard near their towns (system E27)
  private townGain: any = null;
  private townSynths = new Map<string, any>();
  private townTimer = 0;
  private town: { t: Tradition; era: number; key: string } | null = null;
  private townLevel = 0;
  private bar = 0;

  /** The instrument for a way of making sound, made the first time it is needed. */
  private synthFor(timbre: Timbre): any {
    const Tone = this.tone;
    let s = this.townSynths.get(timbre);
    if (s || !Tone) return s;
    const out = this.townGain;
    const env = (attack: number, decay: number, sustain: number, release: number) => ({ attack, decay, sustain, release });
    const voice = (type: string, e: object, cut?: number): any => { const v = new Tone.PolySynth(Tone.Synth, { oscillator: { type }, envelope: e }); return cut ? v.connect(new Tone.Filter(cut, 'lowpass').connect(out)) : v.connect(out); };
    if (timbre === 'flute') s = voice('sine', env(0.06, 0.1, 0.75, 0.3));
    else if (timbre === 'reed') s = voice('square', env(0.03, 0.1, 0.6, 0.2), 1800);
    else if (timbre === 'horn') s = voice('sawtooth', env(0.14, 0.2, 0.7, 0.5), 900);
    else if (timbre === 'bow') s = voice('sawtooth', env(0.22, 0.2, 0.8, 0.6), 1500);
    else if (timbre === 'glass') s = voice('sine', env(0.3, 0.4, 0.6, 2.4));
    else if (timbre === 'hum') s = voice('triangle', env(0.4, 0.3, 0.8, 1.2), 700);
    else if (timbre === 'pluck') s = voice('triangle', env(0.004, 0.5, 0.0, 0.5), 2600);
    else if (timbre === 'bell') s = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 8, envelope: env(0.002, 1.4, 0, 1.2), modulationEnvelope: env(0.002, 0.6, 0, 0.6) }).connect(out);
    else if (timbre === 'gong') s = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1.41, modulationIndex: 14, envelope: env(0.004, 3.2, 0, 2.5), modulationEnvelope: env(0.004, 2.0, 0, 2.0) }).connect(out);
    else if (timbre === 'drum') s = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 4, envelope: env(0.002, 0.4, 0, 0.3) }).connect(out);
    else s = new Tone.MembraneSynth({ pitchDecay: 0.006, octaves: 1.2, envelope: env(0.001, 0.14, 0, 0.1) }).connect(out);
    this.townSynths.set(timbre, s);
    return s;
  }

  /** Play one phrase of the town's music now; returns how long it lasts, in seconds. */
  private townPhrase(): number {
    const town = this.town;
    if (!town || !this.tone) return 2;
    const beat = 60 / town.t.tempo;
    const t0 = this.tone.now() + 0.08;
    const drums = new Set<number>();
    for (const n of phrase(town.t, this.bar++, town.era)) {
      const ins = town.t.instruments[n.instrument]!;
      const synth = this.synthFor(ins.timbre);
      if (!synth) continue;
      try {
        // (a drum is one skin: it cannot be struck twice in the same instant)
        if (ins.timbre === 'drum' || ins.timbre === 'log') { const k = Math.round(n.at * 8) * 16 + n.instrument; if (drums.has(k)) continue; drums.add(k); synth.triggerAttackRelease(Math.min(400, Math.max(40, n.hz)), n.beats * beat, t0 + n.at * beat + n.instrument * 0.004, n.hard * 0.8); }
        else synth.triggerAttackRelease(Math.min(4000, Math.max(40, n.hz)), n.beats * beat, t0 + n.at * beat, n.hard * 0.5);
      } catch { /* a dropped note is not worth interrupting anything for */ }
    }
    return town.t.meter * 2 * beat;
  }

  /**
   * The music of the people whose town is in view (system E27), at a loudness (0 none, 1 full) that follows how
   * close the view is; null when no town is near. It is their own scale, count and instruments, in their present age.
   */
  setTownMusic(t: Tradition | null, era = 0, level = 0): void {
    const key = t ? `${t.scale.join(',')}|${t.meter}|${t.tempo}|${t.instruments.map((i) => i.name).join(',')}` : '';
    this.townLevel = t ? Math.max(0, Math.min(1, level)) : 0;
    if (this.townGain) this.townGain.volume.rampTo(this.townLevel > 0.01 ? -22 + 14 * this.townLevel : -70, 1.2);
    if (!t) { this.town = null; return; }
    if (this.town && this.town.key === key) { this.town.era = era; return; }
    this.town = { t, era, key };
    if (!this.tone || !this.master) return;
    if (!this.townGain) this.townGain = new this.tone.Volume(-70).connect(this.master);
    this.townGain.volume.rampTo(this.townLevel > 0.01 ? -22 + 14 * this.townLevel : -70, 1.2);
    window.clearTimeout(this.townTimer);
    const loop = (): void => {
      if (!this.town) return;
      const wait = this.mood.hush || this.townLevel < 0.01 ? 2 : this.townPhrase() * (1 + (this.bar % 4 === 0 ? 0.5 : 0));
      this.townTimer = window.setTimeout(loop, wait * 1000);
    };
    loop();
  }

  /** Is a town's own music sounding? (Then the world's one borrowed melody keeps quiet.) */
  get townPlaying(): boolean { return !!this.town && this.townLevel > 0.05; }

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
    const L = this.loops, k = LOOP_GAIN * this.sfx, blend = (x: number, a: number, b: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
    // a loop that has loaded plays in place of its noise layer; a light and a heavy loop share wind and rain between them
    const hard = blend(wind, 0.35, 0.6), pour = blend(rain, 0.45, 0.9);
    this.windGain.gain.rampTo(L.wind ? 0 : wind * 0.16 * this.sfx, 1.2);
    L.wind?.gain.rampTo(wind * 0.16 * k * (L.gale ? 1 - hard : 1), 1.2);
    L.gale?.gain.rampTo(wind * 0.16 * k * hard, 1.2);
    this.surfGain.gain.rampTo(L.surf ? 0 : surf * 0.2 * this.sfx, 1.2);
    L.surf?.gain.rampTo(surf * 0.2 * k, 1.2);
    this.rainGain.gain.rampTo(L.rain ? 0 : rain * 0.24 * this.sfx, 1.2);
    L.rain?.gain.rampTo(rain * 0.24 * k * (L.downpour ? 1 - pour : 1), 1.2);
    L.downpour?.gain.rampTo(rain * 0.24 * k * pour, 1.2);
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
      this.lavaGain.gain.rampTo(this.loops.lava ? 0 : lava * 0.5 * this.sfx, 1.2);
      this.loops.lava?.gain.rampTo(lava * 0.5 * LOOP_GAIN * this.sfx, 1.2);
    } catch { /* ignore */ }
  }

  /** One beat of the planet's pulse: a low double thud. strength 0..1. */
  beat(strength: number): void {
    if (!this.tone || !this.voice || strength <= 0.02 || this.sfx <= 0.01) return;
    try {
      const now = this.tone.now(), v = 0.12 + 0.5 * strength;
      this.voice.triggerAttackRelease(46, 0.09, now, v);
      this.voice.triggerAttackRelease(41, 0.12, now + 0.16, v * 0.7);
    } catch { /* ignore */ }
  }

  /**
   * The sounds of living land close by, each 0..1: calls by day, insects by night (or the croaking of a marsh),
   * and running water where a river is. Silent unless the loops have been added.
   */
  living(day: number, night: number, marsh: number, river: number): void {
    const L = this.loops, k = LOOP_GAIN * this.sfx;
    try {
      L.day?.gain.rampTo(day * 0.14 * k, 2);
      L.night?.gain.rampTo(night * (L.marsh ? 1 - marsh : 1) * 0.12 * k, 2);
      L.marsh?.gain.rampTo(night * marsh * 0.14 * k, 2);
      L.river?.gain.rampTo(river * 0.16 * k, 1.5);
    } catch { /* ignore */ }
  }

  /** Thunder: far off, or close when `near` is set. */
  thunder(near = false): void {
    const shot = this.shots[near ? 'thunderNear' : 'thunderFar'] ?? this.shots.thunderFar;
    if (shot && this.sfx > 0.01) {
      try { shot.gain.gain.value = (0.35 + 0.3 * this.rand()) * this.sfx; shot.player.start(); return; } catch { /* fall through to the synth */ }
    }
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
