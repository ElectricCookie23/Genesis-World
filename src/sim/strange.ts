// Strange world systems (expansion section 9).
//
// E81 strata: events leave layers in the rock, which a people's geologists later read.
// E82 pole flips: the magnetic field reverses on a long cycle; migrants lose their way, mutation rises.
// E83 microbes: sickness is bred where animals crowd in warm wet places, and every plague traces back to a strain.
// E84 hive mind: a small, sociable animal spread across a continent can, rarely, become one mind.
// E85 trance blooms: a glowing, drugging plant that a people learns to grow and use.
// E86 light and noise: cities thin the animals of the night and the animals that live by sound.
// E87 mimic architects: after a people is gone, a nest-building animal starts copying the ruins.
// E88 the swarm: a meteor storm on a fixed cycle that a people first fears, then predicts, then prepares for.
// E89 ecological memory: worked and overgrazed land stays poor for centuries.
// E90 the pulse: one number for how the world is doing, as a heartbeat.
//
// Plain data on the simulation with its own random stream, like section 10.
import type { RNG } from './rng';
import type { Simulation } from './simulation';
import type { SimEvent } from './events';
import { G, GENE_COUNT, PG } from './genetics';

export type LayerKind = 'metal' | 'ash' | 'boundary' | 'coal' | 'plastic' | 'glass';
/** A band in the rock. `world` layers are found everywhere; the others only near where they were laid. */
export interface Layer { year: number; kind: LayerKind; what: string; eventId: number; world: boolean; cell: number; read: number }

const LAYER_TEXT: Record<LayerKind, string> = {
  metal: 'a finger-thin line rich in metals that are rare on the surface',
  ash: 'a pale band of volcanic ash',
  boundary: 'a dark clay with almost no fossils above it',
  coal: 'a black seam of pressed forest',
  plastic: 'a thin stratum of things that do not rot',
  glass: 'a layer of fused glass and soot',
};

/** How long a reversal of the field takes, and how long a scar on the land takes to halve. */
const FLIP_YEARS = 30000, SCAR_HALF_LIFE = 400;

export interface StrangeInfo {
  layers: Layer[];
  /** 1 or -1: which way the magnetic field points; and 0..1 while it is turning over. */
  poleSign: number;
  poleFlip: number;
  /** Species whose nests copy ruins. */
  mimics: number[];
  hive: { species: number; mind: number; awake: boolean; regions: number } | null;
  swarm: { period: number; next: number; stage: number; survived: number };
  blooms: number;
  /** Where the camera is: how thick the microbes are, how much of them is sickness, and the strain found there. */
  microbes: { life: number; germ: number; strain: string };
  pulse: { rate: number; health: number };
}

export class Strange {
  rng: RNG;
  private seen = 0;
  // E81
  layers: Layer[] = [];
  private nextRead = 0;
  // E82
  poleSign = 1;
  flipAt: number;
  flipEnd = -1;
  private flipEvent = -1;
  flips = 0;
  // E83
  germ: Float32Array;
  private crowd: Float32Array;
  private strain: Int32Array;
  private strainYear: Float64Array;
  private crowdTimer = 0;
  // E84
  hive: { species: number; mind: number; awake: boolean; regions: number; eventId: number } | null = null;
  // E85
  private bloomEvent: Record<number, number> = {};
  private bloomCult: Record<number, number> = {};
  // E86
  private lightLoss: Record<number, number> = {};
  private polluted: Record<string, number> = {};
  // E87
  mimics: number[] = [];
  mimicAt = 0;
  // E88
  swarmPeriod: number;
  swarmNext: number;
  private swarmLast = -1;
  private swarmSeen = 0;
  /** 0 unknown, 1 a myth, 2 predicted, 3 prepared for. */
  swarmStage = 0;
  private swarmNoted: Record<string, number> = {};
  swarmSurvived = 0;
  /** The share of a struck town's people lost in the last storm (for tests and the record). */
  lastStormLoss = 0;
  // E90
  private shock = 0;
  private peakKinds = 1;
  private peakPop = 1;
  pulseRate = 60;
  health = 1;

  constructor(rng: RNG, regions: number) {
    this.rng = rng;
    this.germ = new Float32Array(regions);
    this.crowd = new Float32Array(regions);
    this.strain = new Int32Array(regions).fill(-1);
    this.strainYear = new Float64Array(regions).fill(-1e12);
    this.flipAt = rng.range(6e6, 28e6);
    this.swarmPeriod = Math.round(rng.range(1800, 4200));
    this.swarmNext = this.swarmPeriod * rng.range(0.3, 1);
  }

  step(sim: Simulation, dt: number): void {
    const events = sim.events.events;
    let shook = 0;
    for (; this.seen < events.length; this.seen++) {
      const e = events[this.seen]!;
      this.lay(sim, e);
      // E90: what jolts the world
      if (e.type === 'impact' || e.type === 'mass-extinction' || e.type === 'nuclear-war' || e.type === 'super-eruption' || e.type === 'gamma-burst' || e.type === 'snowball' || e.type === 'rogue-planet' || e.type === 'seas-boil') shook += 1;
      else if (e.type === 'ice-age' || e.type === 'plague' || e.type === 'war' || e.type === 'pole-flip' || e.type === 'swarm') shook += 0.25;
    }
    this.readRocks(sim);
    this.magnet(sim);
    this.microbes(sim, dt);
    this.hiveMind(sim, dt);
    this.blooms(sim);
    this.pollution(sim, dt);
    this.mimicry(sim);
    this.swarm(sim, dt);
    this.scars(sim, dt);
    this.pulse(sim, dt, shook);
  }

  // ------------------------------------------------------------------ E81 strata

  private lay(sim: Simulation, e: SimEvent): void {
    let kind: LayerKind | null = null, world = true;
    if (e.type === 'impact') { kind = 'metal'; world = Number(e.data?.size ?? 0) >= 0.45; }
    else if (e.type === 'super-eruption') kind = 'ash';
    else if (e.type === 'mass-extinction') kind = 'boundary';
    else if (e.type === 'industry') kind = 'plastic';
    else if (e.type === 'nuclear-war') kind = 'glass';
    else if (e.type === 'milestone' && e.data?.key === 'first-forest') kind = 'coal';
    if (!kind) return;
    this.layers.push({ year: e.simYear, kind, what: LAYER_TEXT[kind], eventId: e.id, world, cell: e.cellId, read: -1 });
    // the rock keeps everything, but the list is for looking at: the newest and the world-wide ones are kept
    if (this.layers.length > 160) { const drop = this.layers.findIndex((l) => !l.world); this.layers.splice(drop >= 0 ? drop : 0, 1); }
    void sim;
  }

  /** A people with the tools to date rock finds the layers one by one, oldest first. */
  private readRocks(sim: Simulation): void {
    if (sim.civ.living === 0 || sim.civ.maxTech < 0.75 || sim.simYear < this.nextRead) return;
    const layer = this.layers.find((l) => l.world && l.read < 0);
    if (!layer) return;
    const cause = sim.events.events[layer.eventId];
    const ago = sim.simYear - layer.year;
    const ev = sim.emit({
      type: 'strata-read', title: `A line in the rock`,
      description: `In cliffs and cuttings all over the world the same thing turns up at the same depth: ${layer.what}. Those who study rock work out that it was laid down ${ago > 2e6 ? `${(Math.round(ago / 1e5) / 10).toLocaleString('en-US')} million` : Math.round(ago).toLocaleString('en-US')} years ago, all at once. ${cause ? `They do not have a name for what did it. The record does: ${cause.title}.` : ''}`,
      causes: [layer.eventId], importance: 1, data: { layer: this.layers.indexOf(layer) },
    });
    layer.read = ev.id;
    this.nextRead = sim.simYear + this.rng.range(150, 900);
  }

  // ------------------------------------------------------------------ E82 pole flips

  /** 0 while the field is steady, rising to 1 across a reversal. */
  flipProgress(year: number): number {
    return this.flipEnd < 0 ? 0 : Math.max(0, Math.min(1, 1 - (this.flipEnd - year) / FLIP_YEARS));
  }

  /** Start a reversal now (it otherwise comes on its own long cycle). */
  flip(sim: Simulation): SimEvent {
    const cr = sim.creatures;
    const ev = sim.emit({
      type: 'pole-flip', title: 'The magnetic field falters',
      description: 'The lights that belong at the poles are seen from the tropics, and they wander. The field that wraps the world is turning itself over, and while it does, more of what the star throws off reaches the ground.',
      causes: this.flipEvent >= 0 ? [this.flipEvent] : [], importance: 2,
    });
    this.flipEvent = ev.id; this.flipEnd = sim.simYear + FLIP_YEARS; this.flips++;
    cr.mutationBoost = Math.max(cr.mutationBoost, 2.5);
    // animals that travel by the field lose their way
    const lost = cr.species.filter((s) => s.extinctYear < 0 && s.name && s.ref[G.Migration]! > 0.5 && s.pop > 500).sort((a, b) => b.ref[G.Migration]! - a.ref[G.Migration]!).slice(0, 4);
    for (const s of lost) {
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c] || cr.sp[c] !== s.id) continue;
        const gone = cr.count[c]! * 0.22;
        cr.count[c] = cr.count[c]! - gone; s.lossDisaster += gone; s.disasterEvent = ev.id;
      }
      sim.emit({ type: 'migration-lost', cellId: sim.regions.centre[s.home]!, title: `${s.name} loses its way`, description: `${s.name} has always found its breeding grounds by a sense no one could see. This year the herds set out in the wrong direction, and many never arrive.`, causes: [ev.id, s.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [s.id] });
    }
    if (sim.civ.living > 0 && sim.civ.maxTech >= 0.3 && sim.civ.maxTech < 0.95) {
      sim.emit({ type: 'navigation-lost', title: 'The needle lies', description: 'Ships that steer by the lodestone are found far from where they meant to be, or not found. The pilots go back to the stars and the coast.', causes: [ev.id], importance: 1 });
    }
    return ev;
  }

  private magnet(sim: Simulation): void {
    if (this.flipEnd >= 0 && sim.simYear >= this.flipEnd) {
      this.flipEnd = -1; this.poleSign = -this.poleSign;
      sim.emit({ type: 'pole-settled', title: 'The field settles', description: 'The wandering lights go back to the ends of the world, though not to the ends they came from. North is south now.', causes: [this.flipEvent], importance: 0 });
    }
    if (this.flipEnd < 0 && sim.simYear >= this.flipAt) { this.flipAt = sim.simYear + this.rng.range(8e6, 40e6); this.flip(sim); }
  }

  // ------------------------------------------------------------------ E83 the microbe layer

  /** The strain a sickness in this region comes from: the one already bred there, or a new one. Every plague has one. */
  strainFor(sim: Simulation, region: number): number {
    if (this.strain[region]! >= 0 && sim.simYear - this.strainYear[region]! < 200000) return this.strain[region]!;
    const wet = sim.regions.moisture[region]! > 0.5, warm = sim.regions.landTemp[region]! > 18;
    const ev = sim.emit({
      type: 'strain', cellId: sim.regions.centre[region]!, title: 'Something new in the water',
      description: `In ${wet ? 'the standing water' : 'the dust and dung'} of a ${warm ? 'warm' : 'cool'}, crowded country, among countless kinds of life too small to see, one learns to live inside the animals that drink there.`,
      importance: 0, data: { region, germ: Math.round(this.germ[region]! * 100) / 100 },
    });
    this.strain[region] = ev.id; this.strainYear[region] = sim.simYear;
    return ev.id;
  }

  private microbes(sim: Simulation, dt: number): void {
    const reg = sim.regions, cr = sim.creatures;
    // how crowded each region is, counted now and then
    if (--this.crowdTimer <= 0) {
      this.crowdTimer = 8;
      this.crowd.fill(0);
      let top = 1;
      for (let c = 0; c < cr.high; c++) if (cr.alive[c]) { const r = cr.region[c]!; this.crowd[r] = this.crowd[r]! + cr.count[c]!; if (this.crowd[r]! > top) top = this.crowd[r]!; }
      for (let r = 0; r < reg.count; r++) this.crowd[r] = Math.sqrt(this.crowd[r]! / top);
    }
    // sickness breeds where many animals share warm, wet ground, and dies back where they do not
    const k = 1 - Math.exp(-dt / 40000);
    for (let r = 0; r < reg.count; r++) {
      const warmWet = Math.max(0, Math.min(1, (reg.landTemp[r]! - 4) / 20)) * (0.3 + 0.7 * Math.min(1, reg.moisture[r]!));
      this.germ[r] = this.germ[r]! + (this.crowd[r]! * warmWet - this.germ[r]!) * k;
    }
    // now and then the worst-bred place gives the world a plague of its own making
    if (sim.stage === 'animals' && this.rng.chance(Math.min(0.2, dt / 2.5e6))) {
      let worst = -1, w = 0.35;
      for (let r = 0; r < reg.count; r++) if (this.germ[r]! > w) { w = this.germ[r]!; worst = r; }
      if (worst >= 0) { sim.plague(worst, false); this.germ[worst] = this.germ[worst]! * 0.3; }
    }
  }

  // ------------------------------------------------------------------ E84 the continental hive mind

  hiveMind(sim: Simulation, dt: number): void {
    const cr = sim.creatures;
    if (this.hive) {
      const s = cr.species[this.hive.species];
      if (!s || s.extinctYear >= 0) {
        if (this.hive.awake) sim.emit({ type: 'hive-end', title: 'The great mind goes dark', description: 'The lights stop answering one another. What thought with a continent for a body is only animals again, and then not even that.', causes: [this.hive.eventId], importance: 2 });
        this.hive = null;
        return;
      }
      this.hive.regions = s.regions;
      if (this.hive.awake) return;
      // a mind is slow to gather: it needs the whole continent, and a very long time
      const span = Math.min(1, s.regions / Math.max(8, sim.regions.count * 0.08));
      this.hive.mind = Math.min(1, this.hive.mind + (dt / 60e6) * span * (0.4 + s.ref[G.Sociality]!));
      if (s.ref[G.Sociality]! < 0.7 || s.regions < 5) this.hive.mind *= Math.exp(-dt / 5e6);
      if (this.hive.mind >= 1) {
        this.hive.awake = true;
        const ev = sim.emit({
          type: 'hive-mind', cellId: sim.regions.centre[s.home]!, title: 'A continent thinks',
          description: `The colonies of ${s.name} have been one colony for a long time. Now, on clear nights, light runs through them in slow waves from coast to coast, and the waves answer one another. There are no cities and there is no speech. Something is thinking all the same.`,
          causes: [this.hive.eventId, s.eventId].filter((x) => x >= 0), importance: 3, speciesIds: [s.id],
        });
        this.hive.eventId = ev.id;
      }
      return;
    }
    // a small animal that lives in great colonies over a wide country
    let best = -1, score = 0;
    for (const s of cr.species) {
      if (s.extinctYear >= 0 || !s.name || s.ref[G.Sociality]! < 0.8 || s.ref[G.Size]! > 0.32 || s.ref[G.Water]! > 0.5 || s.regions < 6) continue;
      const sc = s.regions * s.ref[G.Sociality]!;
      if (sc > score) { score = sc; best = s.id; }
    }
    if (best < 0) return;
    const s = cr.species[best]!;
    const ev = sim.emit({ type: 'hive', cellId: sim.regions.centre[s.home]!, title: `The colonies of ${s.name} join`, description: `Where two nests of ${s.name} meet they no longer fight. Tunnel is joined to tunnel across whole countries, and what one nest learns the next one acts on.`, causes: s.eventId >= 0 ? [s.eventId] : [], importance: 1, speciesIds: [s.id] });
    this.hive = { species: best, mind: 0, awake: false, regions: s.regions, eventId: ev.id };
  }

  // ------------------------------------------------------------------ E85 trance blooms

  blooms(sim: Simulation): void {
    const pl = sim.plants;
    for (const p of pl.species) {
      if (p.extinctYear >= 0 || !p.established || p.aquatic || this.bloomEvent[p.id] !== undefined) continue;
      if (p.genes[PG.Glow]! > 0.4 && p.genes[PG.Toxicity]! > 0.25 && p.genes[PG.Toxicity]! < 0.75 && p.cover > 1.5) {
        this.bloomEvent[p.id] = sim.emit({
          type: 'trance-bloom', title: `${p.name} flowers`,
          description: `Where ${p.name} grows thick, its flowers glow at dusk and the air is sweet with something that is not quite a poison. Animals that feed there grow calm, forget to flee, and gather in slow circles until the season ends.`,
          causes: p.eventId >= 0 ? [p.eventId] : [], importance: 1, data: { plant: p.id },
        }).id;
      }
    }
    // a people that lives among them learns what the flowers do, and puts them to use
    for (const st of sim.civ.settlements) {
      if (st.ruined >= 0 || st.tech < 0.15 || this.bloomCult[st.id] !== undefined) continue;
      const plant = pl.dominant[st.region]!;
      const bloom = plant >= 0 ? this.bloomEvent[plant] : undefined;
      if (bloom === undefined) continue;
      const name = pl.species[plant]!.name;
      this.bloomCult[st.id] = sim.emit({
        type: 'bloom-use', cellId: st.cell, title: `The flower fields of ${st.name}`,
        description: `At ${st.name} they have watched what ${name} does to the animals that graze it, and tried it carefully on themselves. A little quiets pain and brings sleep; more is dangerous. They tend whole fields of it now, keep the knowledge of the dose, and gather for a festival when it opens.`,
        causes: [bloom, st.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [st.species], data: { plant },
      }).id;
    }
  }

  get bloomCount(): number { return Object.keys(this.bloomEvent).length; }

  // ------------------------------------------------------------------ E86 light and noise

  /** Thin the animals that a town's light or noise drives off. `sources`: region, light 0..1, noise 0..1, and the town's event. */
  pollute(sim: Simulation, dt: number, sources: { region: number; light: number; noise: number; eventId: number }[]): void {
    if (!sources.length) return;
    const cr = sim.creatures, grid = sim.regions.grid;
    const light = new Map<number, [number, number]>(), noise = new Map<number, [number, number]>();
    for (const s of sources) {
      const put = (m: Map<number, [number, number]>, r: number, v: number) => { const cur = m.get(r); if (!cur || cur[0] < v) m.set(r, [v, s.eventId]); };
      if (s.light > 0) { put(light, s.region, s.light); for (let j = 0; j < grid.ncount[s.region]!; j++) put(light, grid.neighbors[s.region * 6 + j]!, s.light * 0.5); }
      if (s.noise > 0) { put(noise, s.region, s.noise); for (let j = 0; j < grid.ncount[s.region]!; j++) put(noise, grid.neighbors[s.region * 6 + j]!, s.noise * 0.4); }
    }
    const span = Math.min(1, dt / 300);
    for (let c = 0; c < cr.high; c++) {
      if (!cr.alive[c]) continue;
      const r = cr.region[c]!, g = c * GENE_COUNT;
      const l = light.get(r), n = noise.get(r);
      // the night's animals and those that carry their own light lose the dark; those that live by sound lose the quiet
      const byLight = l && (cr.genome[g + G.Nocturnal]! > 0.55 || cr.genome[g + G.Glow]! > 0.4) ? l[0] * 0.12 : 0;
      const byNoise = n && (cr.genome[g + G.Echo]! > 0.5 || cr.genome[g + G.Hearing]! > 0.65) ? n[0] * 0.1 : 0;
      const kill = (byLight + byNoise) * span;
      if (kill <= 0) continue;
      const s = cr.species[cr.sp[c]!]!;
      const gone = cr.count[c]! * kill;
      cr.count[c] = cr.count[c]! - gone; s.lossDisaster += gone;
      const key = `${byLight >= byNoise ? 'light' : 'noise'}:${s.id}`;
      this.lightLoss[s.id] = (this.lightLoss[s.id] ?? 0) + gone;
      // told once per species, when the loss is a real share of it
      if (this.polluted[key] === undefined && s.name && this.lightLoss[s.id]! > Math.max(50, s.pop * 0.1)) {
        const why = byLight >= byNoise;
        this.polluted[key] = sim.emit({
          type: why ? 'light-pollution' : 'noise-pollution', cellId: sim.regions.centre[r]!, title: why ? `${s.name} is losing the dark` : `${s.name} is driven off by noise`,
          description: why
            ? `Around the cities the night is never black now. ${s.name}, which hunts, hides and finds its mates in darkness, is gone from every country the glow reaches.`
            : `${s.name} finds its way and its food by sound. Near the works of the cities it can hear nothing else, and it has left.`,
          causes: [(why ? l! : n!)[1], s.eventId].filter((x) => x >= 0), importance: 1, speciesIds: [s.id],
        }).id;
      }
    }
  }

  private pollution(sim: Simulation, dt: number): void {
    if (sim.civ.living === 0) return;
    const sources: { region: number; light: number; noise: number; eventId: number }[] = [];
    for (const st of sim.civ.settlements) {
      if (st.ruined >= 0 || st.tech < 0.6) continue;
      const size = Math.min(1, Math.log10(1 + st.pop) / 3);
      sources.push({ region: st.region, light: size * Math.min(1, (st.tech - 0.5) * 1.6), noise: st.tech >= 0.9 ? size : 0, eventId: st.eventId });
    }
    this.pollute(sim, dt, sources);
  }

  // ------------------------------------------------------------------ E87 mimic architects

  mimicry(sim: Simulation): void {
    if (this.mimics.length >= 3 || sim.simYear < this.mimicAt) return;
    this.mimicAt = sim.simYear + 20000;
    const ruins = sim.civ.settlements.filter((st) => st.ruined >= 0 && st.tech >= 0.4 && sim.simYear - st.ruined > 500);
    if (!ruins.length) return;
    const occupied = new Set(sim.civ.settlements.filter((st) => st.ruined < 0).map((st) => st.region));
    const cr = sim.creatures;
    for (const ruin of ruins.slice(-40)) {
      if (occupied.has(ruin.region) || !this.rng.chance(0.15)) continue;
      // a nest-builder that lives where the ruin stands
      let best = -1, score = 0.9;
      for (let c = 0; c < cr.high; c++) {
        if (!cr.alive[c] || cr.region[c] !== ruin.region) continue;
        const s = cr.species[cr.sp[c]!]!, g = s.ref;
        if (!s.name || this.mimics.includes(s.id) || g[G.Water]! > 0.5 || sim.civ.sapient.includes(s.id)) continue;
        const builder = g[G.Care]! + g[G.Sociality]! * 0.6 + g[G.Curiosity]! * 0.4;
        if (builder > score) { score = builder; best = s.id; }
      }
      if (best < 0) continue;
      const s = cr.species[best]!;
      this.mimics.push(best);
      sim.emit({
        type: 'mimic', cellId: ruin.cell, title: `${s.name} builds towers`,
        description: `Among the fallen walls of ${ruin.name}, ${s.name} has stopped building the low mounds its kind always built. Its nests now rise in narrow stacks with a hole near the top, like the ruins around them. No one taught it. The young raised in them build the same.`,
        causes: [ruin.eventId, s.eventId].filter((x) => x >= 0), importance: 2, speciesIds: [s.id],
      });
      return;
    }
  }

  // ------------------------------------------------------------------ E88 the swarm

  private swarm(sim: Simulation, dt: number): void {
    // over ages the storms average out: they are only told one by one when time runs slowly enough to live through them
    if (dt > this.swarmPeriod / 3) { if (sim.simYear >= this.swarmNext) this.swarmNext = sim.simYear + this.swarmPeriod * this.rng.range(0.2, 1); return; }
    const civ = sim.civ;
    const once = (key: string, make: () => SimEvent): number => { if (this.swarmNoted[key] === undefined) this.swarmNoted[key] = make().id; return this.swarmNoted[key]!; };
    if (civ.living === 0 && this.swarmStage > 0) { this.swarmStage = 0; this.swarmSeen = 0; this.swarmNoted = {}; }
    // those who have worked out the year make ready as it comes round
    if (this.swarmStage === 2 && civ.maxTech >= 0.8 && this.swarmNext - sim.simYear < 40) {
      this.swarmStage = 3;
      const ev = sim.emit({ type: 'swarm-prepared', title: 'Ready for the swarm', description: 'The tables say the falling stars come back within a generation. Stores are laid in under stone roofs, the herds are brought down from the high pastures, and every town digs.', causes: [this.swarmNoted['predicted'] ?? -1].filter((x) => x >= 0), importance: 2 });
      this.swarmNoted['prepared'] = ev.id;
    }
    if (sim.simYear < this.swarmNext) return;
    this.swarmNext += this.swarmPeriod;
    const ready = this.swarmStage === 3;
    const storm = sim.emit({
      type: 'swarm', title: 'The swarm returns',
      description: `For nine nights the sky is full of fire, as it was ${this.swarmPeriod.toLocaleString('en-US')} years ago and will be again. Most of it burns out overhead. Some of it does not.`,
      causes: this.swarmLast >= 0 ? [this.swarmLast] : [], importance: civ.living > 0 ? 2 : 0, data: { period: this.swarmPeriod },
    });
    this.swarmLast = storm.id;
    // it falls on a few countries
    const reg = sim.regions, hit: number[] = [];
    for (let k = 0; k < 60 && hit.length < 4; k++) { const r = this.rng.int(reg.count); if (reg.land[r]! > 0.3 && !hit.includes(r)) hit.push(r); }
    // ... and, where there are towns, on some of them
    const towns = civ.settlements.filter((st) => st.ruined < 0);
    for (let k = 0; k < 3 && towns.length; k++) { const r = towns[this.rng.int(towns.length)]!.region; if (!hit.includes(r)) hit.push(r); }
    sim.creatures.disaster({ regions: hit, kill: hit.map(() => 0.22), eventId: storm.id });
    const share = ready ? 0.05 : 0.3;
    let struck = 0;
    for (const st of towns) if (hit.includes(st.region)) { st.pop *= 1 - share; struck++; }
    this.lastStormLoss = struck ? share : 0;
    if (civ.living === 0) return;
    this.swarmSeen++;
    if (ready) {
      this.swarmSurvived++;
      sim.emit({ type: 'swarm-survived', title: 'The swarm passes over', description: 'The fire came on the nights the tables said it would. Roofs burned, and fields. Almost no one died. A people has met something older than itself and was ready for it.', causes: [storm.id, this.swarmNoted['prepared'] ?? -1, this.swarmNoted['predicted'] ?? -1].filter((x) => x >= 0), importance: 3 });
      this.swarmStage = 2;
      delete this.swarmNoted['prepared'];
    } else if (this.swarmStage === 0 && this.swarmSeen >= 2) {
      this.swarmStage = 1;
      once('myth', () => sim.emit({ type: 'swarm-myth', title: 'The nights of fire become a story', description: 'The oldest tale anyone knows is about the time the sky burned, and the grandmothers say it has burned before, and will again.', causes: [storm.id], importance: 1 }));
    } else if (this.swarmStage === 1 && this.swarmSeen >= 3 && civ.maxTech >= 0.55) {
      this.swarmStage = 2;
      once('predicted', () => sim.emit({ type: 'swarm-predicted', title: 'The swarm is given a date', description: `Someone has gone through every chronicle that mentions fire in the sky and laid the years side by side. They are ${this.swarmPeriod.toLocaleString('en-US')} years apart, each time. It is not chance. It is a clock, and the next year can be named.`, causes: [storm.id, this.swarmNoted['myth'] ?? -1].filter((x) => x >= 0), importance: 2 }));
    }
  }

  // ------------------------------------------------------------------ E89 ecological memory

  private scars(sim: Simulation, dt: number): void {
    const scar = sim.plants.scar, pl = sim.plants;
    const heal = Math.pow(0.5, dt / SCAR_HALF_LIFE);
    // Wear is added first and then the whole of it heals for the length of the step, so a step of thousands of years
    // leaves nothing behind: scars belong to slow time. (Added after healing, every overgrazed region kept a
    // permanent scar through all of prehistory, which thinned its forests for no reason a player could see.)
    for (let r = 0; r < scar.length; r++) {
      let s = scar[r]!;
      // land grazed to the root wears out
      if (pl.grazeLand[r]! > 0.95) s = Math.min(1, s + Math.min(0.3, dt / 3000));
      s *= heal;
      scar[r] = s < 1e-4 ? 0 : s;
    }
    // fields worked for generations wear out too, faster the more mouths they feed
    for (const st of sim.civ.settlements) {
      if (st.ruined >= 0 || !st.farms) continue;
      const wear = Math.min(0.5, (dt / 2500) * (0.3 + Math.min(1, Math.log10(1 + st.pop) / 3)));
      scar[st.region] = Math.min(0.9, (scar[st.region]! + wear * (dt > 2000 ? heal : 1)));
    }
  }

  // ------------------------------------------------------------------ E90 the planet's pulse

  private pulse(sim: Simulation, dt: number, shook: number): void {
    const cr = sim.creatures;
    // a jolt fades over a few hundred years of slow time, or one step of fast time
    this.shock = Math.min(3, this.shock * Math.exp(-dt / 600) + shook);
    let pop = 0;
    for (const s of cr.species) if (s.extinctYear < 0) pop += s.pop;
    this.peakKinds = Math.max(this.peakKinds * Math.exp(-dt / 40e6), cr.livingSpecies, 1);
    this.peakPop = Math.max(this.peakPop * Math.exp(-dt / 40e6), pop, 1);
    const alive = sim.stage === 'barren' ? 1 : 0.5 * (cr.livingSpecies / this.peakKinds) + 0.5 * Math.sqrt(pop / this.peakPop);
    const climate = 1 - Math.min(1, Math.abs(sim.climate.meanTemp - sim.baseTemp) / 14);
    const calm = 1 - Math.min(1, this.shock / 1.5);
    this.health = Math.max(0, Math.min(1, (sim.stage === 'animals' ? 0.4 * alive : 0.4) + 0.25 * climate + 0.35 * calm));
    this.pulseRate = Math.round(48 + (1 - this.health) * 92);
  }

  info(sim: Simulation, focusRegion: number): StrangeInfo {
    const strainEv = this.strain[focusRegion]! >= 0 ? sim.events.events[this.strain[focusRegion]!] : undefined;
    return {
      layers: this.layers.slice(-60), poleSign: this.poleSign, poleFlip: this.flipProgress(sim.simYear), mimics: this.mimics,
      hive: this.hive ? { species: this.hive.species, mind: this.hive.mind, awake: this.hive.awake, regions: this.hive.regions } : null,
      swarm: { period: this.swarmPeriod, next: this.swarmNext, stage: this.swarmStage, survived: this.swarmSurvived },
      blooms: this.bloomCount,
      microbes: { life: this.crowd[focusRegion] ?? 0, germ: this.germ[focusRegion] ?? 0, strain: strainEv ? strainEv.title : '' },
      pulse: { rate: this.pulseRate, health: this.health },
    };
  }
}
